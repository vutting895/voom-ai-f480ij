
# Voom AI - Bugfix Report V2

## บั๊กที่พบในเวอร์ชันเดิม (จาก README + โครงสร้าง)
1. Memory หายตอน restart - ใช้ in-memory array ไม่มี persistence
2. ไม่มี embedding search จริง - ค้นหาแบบ string match
3. ไม่มี file upload validation - เสี่ยง crash เมื่ออัปโหลดไฟล์ใหญ่
4. ไม่มี CORS - frontend เรียก API จากโดเมนอื่นไม่ได้
5. ไม่มี error handling สำหรับ Gemini API - ถ้า quota หมด server จะ crash
6. LINE webhook ไม่มี signature verification
7. ไม่มี health check endpoint
8. voom-ai.html เดิมไม่มีการเชื่อมต่อ API จริง (mock data)

## วิธีแก้ใน V2
- เพิ่ม Supabase pgvector + fallback in-memory
- ใช้ text-embedding-004 จริง + cosine similarity
- เพิ่ม multer 10MB limit + file type filter
- เพิ่ม cors() middleware
- try/catch รอบทุก Gemini call + return error message
- เพิ่ม crypto HMAC verification สำหรับ LINE
- เพิ่ม /health endpoint
- Frontend V2 เรียก /api/memory, /api/documents, /api/upload, /api/chat จริง

## วิธีรัน
npm install
cp .env.v2.example .env
# ใส่ GEMINI_API_KEY
npm run dev
