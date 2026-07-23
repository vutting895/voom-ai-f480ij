#!/bin/bash
set -e
echo "🚀 Voom AI V2 - Push & Deploy Script"

# Check git
if [ ! -d .git ]; then
  echo "📦 Init git..."
  git init
  git remote add origin https://github.com/vutting895/Voom-agen-ai.git
fi

echo "📝 Adding files..."
git add server.js voom-ai.html package.json .env.example supabase-schema.sql vercel.json .gitignore README.md BUGFIX_REPORT.md

echo "💾 Commit..."
git commit -m "feat: Voom AI V2 - Supabase pgvector + File RAG + LINE + Fixed bugs

- Persistent memory with Supabase pgvector + in-memory fallback
- File upload RAG (PDF/TXT/MD/JSON/CSV) with Gemini embedding
- New frontend with drag-drop upload, memory search, RAG badges
- Fixed CORS, error handling, health check
- Ready for Vercel deployment" || echo "Nothing to commit or already committed"

echo "⬆️ Pushing to GitHub..."
git branch -M main
git push -u origin main

echo ""
echo "✅ Pushed to GitHub Done!"
echo ""
echo "🌐 Deploy to Vercel - เลือก 1 วิธี:"
echo "วิธีที่ 1: Vercel Dashboard (ง่ายสุด)"
echo "  1. ไป https://vercel.com/new"
echo "  2. Import Repo: vutting895/Voom-agen-ai"
echo "  3. ใส่ Environment Variables:"
echo "     GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY"
echo "  4. Deploy"
echo ""
echo "วิธีที่ 2: Vercel CLI"
echo "  npm i -g vercel"
echo "  vercel --prod"
echo ""
