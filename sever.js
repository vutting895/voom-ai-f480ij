// voom AI Agent Workspace - V2 Production Server
// Full-Stack: Express + Gemini + Supabase pgvector + File RAG + LINE
// Author: Voom V2 Upgrade Pack

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ===== CONFIG =====
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

if (!GEMINI_API_KEY) {
  console.warn("⚠️  GEMINI_API_KEY is missing! Set it in .env");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
const chatModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Supabase client - fallback to in-memory if not configured
let supabase = null;
let useMemoryFallback = false;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log("✅ Supabase connected");
} else {
  useMemoryFallback = true;
  console.log("⚠️  Supabase not configured - using in-memory fallback");
}

// In-memory fallback stores
const memoryStore = []; // {id, content, embedding, created_at}
const documentStore = []; // {id, filename, chunks: [{content, embedding}]}

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = [".pdf", ".txt", ".md", ".json", ".csv"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext) || file.mimetype.startsWith("text/")) cb(null, true);
    else cb(new Error("Unsupported file type"));
  }
});

// ===== EMBEDDING UTILS =====
async function getEmbedding(text) {
  try {
    const clean = text.slice(0, 8000); // Gemini limit
    const result = await embeddingModel.embedContent(clean);
    return result.embedding.values;
  } catch (e) {
    console.error("Embedding error:", e.message);
    return null;
  }
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-8);
}

function chunkText(text, chunkSize = 800, overlap = 100) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize - overlap) {
    chunks.push(text.slice(i, i + chunkSize));
    if (i + chunkSize >= text.length) break;
  }
  return chunks;
}

// ===== MEMORY SYSTEM =====
async function addMemory(content) {
  const embedding = await getEmbedding(content);
  const id = crypto.randomUUID();
  const item = { id, content, embedding, created_at: new Date().toISOString() };

  if (useMemoryFallback) {
    memoryStore.push(item);
    return item;
  }
  const { data, error } = await supabase.from("voom_memories").insert({
    id, content, embedding, created_at: item.created_at
  }).select().single();
  if (error) throw error;
  return data;
}

async function searchMemories(query, limit = 5) {
  const queryEmbedding = await getEmbedding(query);
  if (!queryEmbedding) return [];

  if (useMemoryFallback) {
    return memoryStore
      .map(m => ({ ...m, similarity: cosineSimilarity(queryEmbedding, m.embedding) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .filter(m => m.similarity > 0.5);
  }

  // Use Supabase RPC if you created match_memories function, else fallback to JS
  try {
    const { data, error } = await supabase.rpc("match_memories", {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: limit
    });
    if (!error && data) return data;
  } catch {}

  // JS fallback
  const { data } = await supabase.from("voom_memories").select("*").limit(1000);
  if (!data) return [];
  return data
    .map(m => ({ ...m, similarity: cosineSimilarity(queryEmbedding, m.embedding) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .filter(m => m.similarity > 0.5);
}

async function listMemories() {
  if (useMemoryFallback) return memoryStore;
  const { data } = await supabase.from("voom_memories").select("*").order("created_at", { ascending: false });
  return data || [];
}

async function deleteMemory(id) {
  if (useMemoryFallback) {
    const idx = memoryStore.findIndex(m => m.id === id);
    if (idx !== -1) memoryStore.splice(idx, 1);
    return true;
  }
  await supabase.from("voom_memories").delete().eq("id", id);
  return true;
}

// ===== DOCUMENT RAG =====
async function addDocument(filename, text) {
  const chunks = chunkText(text);
  const id = crypto.randomUUID();
  const embeddedChunks = [];

  for (const chunk of chunks) {
    const embedding = await getEmbedding(chunk);
    embeddedChunks.push({ content: chunk, embedding });
  }

  const doc = {
    id,
    filename,
    content: text.slice(0, 5000),
    chunks: embeddedChunks,
    created_at: new Date().toISOString()
  };

  if (useMemoryFallback) {
    documentStore.push(doc);
    return doc;
  }

  // Save to supabase
  await supabase.from("voom_documents").insert({
    id, filename, content: doc.content, created_at: doc.created_at
  });

  for (const ch of embeddedChunks) {
    await supabase.from("voom_document_chunks").insert({
      id: crypto.randomUUID(),
      document_id: id,
      content: ch.content,
      embedding: ch.embedding
    });
  }
  return doc;
}

async function searchDocuments(query, limit = 4) {
  const queryEmbedding = await getEmbedding(query);
  if (!queryEmbedding) return [];

  if (useMemoryFallback) {
    const allChunks = documentStore.flatMap(d => d.chunks.map(c => ({ ...c, filename: d.filename })));
    return allChunks
      .map(c => ({ ...c, similarity: cosineSimilarity(queryEmbedding, c.embedding) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .filter(c => c.similarity > 0.55);
  }

  try {
    const { data } = await supabase.rpc("match_document_chunks", {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: limit
    });
    if (data) return data;
  } catch {}

  const { data } = await supabase.from("voom_document_chunks").select("*").limit(1000);
  if (!data) return [];
  return data
    .map(c => ({ ...c, similarity: cosineSimilarity(queryEmbedding, c.embedding) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

// ===== AGENT CORE =====
async function runAgent({ message, persona = "Normal", temperature = 0.7, maxSteps = 5, history = [], customEndpoint }) {
  // 1. Detect memory commands (จดจำ: / ลืม:)
  if (message.startsWith("จดจำ:")) {
    const content = message.replace("จดจำ:", "").trim();
    const saved = await addMemory(content);
    return { response: `✅ จดจำแล้ว: "${content}"`, toolUsed: "memory_save", data: saved };
  }
  if (message.startsWith("ลืม:")) {
    const query = message.replace("ลืม:", "").trim();
    const matches = await searchMemories(query, 1);
    if (matches.length) {
      await deleteMemory(matches[0].id);
      return { response: `🗑️ ลืมเรื่อง "${matches[0].content}" แล้ว`, toolUsed: "memory_delete" };
    }
    return { response: `ไม่พบความจำที่ตรงกับ "${query}"` };
  }

  // 2. Retrieve context
  const memories = await searchMemories(message, 5);
  const docs = await searchDocuments(message, 4);

  // 3. Custom webhook tool (if configured)
  let externalData = "";
  if (customEndpoint) {
    try {
      const res = await fetch(customEndpoint, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      externalData = `\n[External API Data from ${customEndpoint}]: ${JSON.stringify(data).slice(0, 2000)}`;
    } catch (e) {
      externalData = `\n[External API Error]: ${e.message}`;
    }
  }

  // 4. Build prompt
  const personaPrompts = {
    Normal: "คุณคือ Voom AI เป็นมิตร อบอุ่น สุภาพ ตอบเป็นภาษาเดียวกับผู้ใช้",
    "Professor Voom": "คุณคือ Professor Voom นักวิชาการ เคร่งขรึม อธิบายลึกซึ้ง มีโครงสร้าง ชอบยกตัวอย่าง",
    "Coder Voom": "คุณคือ Coder Voom แฮกเกอร์ เขียนโค้ดสะอาด กระชับ เน้น technical best practices",
    "Business Advisor": "คุณคือที่ปรึกษาธุรกิจ เน้นกลยุทธ์ แผนงานระยะยาว ROI และ execution"
  };

  const systemPrompt = `
${personaPrompts[persona] || personaPrompts.Normal}

ความทรงจำที่เกี่ยวข้อง:
${memories.map(m => `- ${m.content} (similarity: ${(m.similarity || 0).toFixed(2)})`).join("\n") || "ไม่มี"}

เอกสารที่เกี่ยวข้อง:
${docs.map(d => `- จากไฟล์ ${d.filename || 'unknown'}: ${d.content.slice(0, 400)}`).join("\n") || "ไม่มี"}

${externalData}

กฎ:
- ใช้ความจำและเอกสารมาตอบถ้าเกี่ยวข้อง
- ถ้าไม่มีข้อมูลที่เกี่ยวข้อง ให้ตอบจากความรู้ทั่วไป
- ตอบเป็นภาษาไทยถ้าผู้ใช้ถามไทย
- กระชับแต่ครบถ้วน
`;

  const chatHistory = history.map(h => `${h.role}: ${h.content}`).join("\n");
  const fullPrompt = `${systemPrompt}\n\nHistory:\n${chatHistory}\n\nUser: ${message}\nAssistant:`;

  try {
    const result = await chatModel.generateContent({
      contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
      generationConfig: { temperature: parseFloat(temperature) || 0.7 }
    });
    const response = result.response.text();
    return { response, memories, docs };
  } catch (e) {
    console.error("Gemini error:", e);
    return { response: `ขออภัย เกิดข้อผิดพลาด: ${e.message}`, error: true };
  }
}

// ===== ROUTES =====

// Serve frontend
app.get("/", (req, res) => {
  const htmlPath = path.join(__dirname, "voom-ai.html");
  if (fs.existsSync(htmlPath)) res.sendFile(htmlPath);
  else res.send("voom-ai.html not found - please place frontend file");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", version: "2.0", db: useMemoryFallback ? "memory" : "supabase", time: new Date().toISOString() });
});

// Chat API - main endpoint
app.post("/api/chat", async (req, res) => {
  const { message, persona, temperature, maxSteps, history, customEndpoint } = req.body;
  if (!message) return res.status(400).json({ error: "message required" });

  const result = await runAgent({ message, persona, temperature, maxSteps, history, customEndpoint });
  res.json(result);
});

// Memory APIs
app.get("/api/memory", async (req, res) => {
  const data = await listMemories();
  res.json(data);
});

app.post("/api/memory", async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: "content required" });
  const saved = await addMemory(content);
  res.json(saved);
});

app.delete("/api/memory/:id", async (req, res) => {
  await deleteMemory(req.params.id);
  res.json({ success: true });
});

// Document APIs
app.get("/api/documents", async (req, res) => {
  if (useMemoryFallback) return res.json(documentStore.map(d => ({ id: d.id, filename: d.filename, created_at: d.created_at })));
  const { data } = await supabase.from("voom_documents").select("id, filename, created_at").order("created_at", { ascending: false });
  res.json(data || []);
});

app.delete("/api/documents/:id", async (req, res) => {
  if (useMemoryFallback) {
    const idx = documentStore.findIndex(d => d.id === req.params.id);
    if (idx !== -1) documentStore.splice(idx, 1);
  } else {
    await supabase.from("voom_documents").delete().eq("id", req.params.id);
    await supabase.from("voom_document_chunks").delete().eq("document_id", req.params.id);
  }
  res.json({ success: true });
});

app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });
    let text = "";

    if (req.file.mimetype === "application/pdf") {
      // Dynamic import to avoid crash if not installed
      try {
        const pdfParse = (await import("pdf-parse")).default;
        const pdfData = await pdfParse(req.file.buffer);
        text = pdfData.text;
      } catch {
        text = req.file.buffer.toString("utf-8").slice(0, 20000);
      }
    } else {
      text = req.file.buffer.toString("utf-8");
    }

    if (!text.trim()) return res.status(400).json({ error: "Could not extract text" });

    const doc = await addDocument(req.file.originalname, text);
    res.json({ success: true, document: { id: doc.id, filename: doc.filename, chunks: doc.chunks?.length || 0 } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// LINE Webhook
app.post("/webhook/line", express.raw({ type: "*/*" }), async (req, res) => {
  try {
    // Verify signature if secret is set
    if (LINE_CHANNEL_SECRET) {
      const signature = req.headers["x-line-signature"];
      const body = req.body instanceof Buffer ? req.body.toString() : JSON.stringify(req.body);
      const hash = crypto.createHmac("SHA256", LINE_CHANNEL_SECRET).update(body).digest("base64");
      if (hash !== signature) return res.status(401).send("Invalid signature");
    }

    const body = JSON.parse(req.body instanceof Buffer ? req.body.toString() : req.body);
    const events = body.events || [];

    for (const event of events) {
      if (event.type === "message" && event.message.type === "text") {
        const userMessage = event.message.text;
        const replyToken = event.replyToken;

        const result = await runAgent({ message: userMessage, persona: "Normal" });

        // Reply to LINE
        if (LINE_CHANNEL_ACCESS_TOKEN) {
          await fetch("https://api.line.me/v2/bot/message/reply", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
            },
            body: JSON.stringify({
              replyToken,
              messages: [{ type: "text", text: result.response.slice(0, 4900) }]
            })
          });
        }
      }
    }
    res.json({ success: true });
  } catch (e) {
    console.error("LINE webhook error:", e);
    res.status(500).json({ error: e.message });
  }
});

// Start
app.listen(PORT, () => {
  console.log(`🚀 Voom AI V2 running on http://localhost:${PORT}`);
  console.log(`   DB: ${useMemoryFallback ? "In-Memory (set SUPABASE_URL to use persistent)" : "Supabase pgvector"}`);
  console.log(`   LINE: ${LINE_CHANNEL_ACCESS_TOKEN ? "Enabled" : "Disabled (set LINE tokens)"}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
});
