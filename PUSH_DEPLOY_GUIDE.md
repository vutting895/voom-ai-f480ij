# Push + Deploy คู่มือ Voom AI V2

## 1. Push ขึ้น GitHub
รันในโฟลเดอร์โปรเจกต์:

```bash
chmod +x deploy.sh
./deploy.sh
```

หรือ manual:
```bash
git add .
git commit -m "feat: V2"
git push origin main
```

Git จะถาม username/password:
- username: vutting895
- password: ใช้ GitHub Personal Access Token (PAT) ไม่ใช่รหัสผ่าน
  สร้างที่ https://github.com/settings/tokens/new
  เลือก repo scope

## 2. Deploy ขึ้น Vercel

### วิธี A: ผ่านเว็บ (แนะนำ)
1. เข้า https://vercel.com/new
2. Login ด้วย GitHub
3. Import `Voom-agen-ai`
4. Project Settings > Environment Variables เพิ่ม:
   - GEMINI_API_KEY = จาก https://aistudio.google.com/app/apikey
   - SUPABASE_URL = https://xxx.supabase.co (ถ้ามี)
   - SUPABASE_SERVICE_KEY = service_role key (ถ้ามี)
   - LINE_CHANNEL_SECRET = (ถ้าจะใช้ LINE)
   - LINE_CHANNEL_ACCESS_TOKEN = (ถ้าจะใช้ LINE)
5. กด Deploy
6. ได้ลิงก์ https://voom-agen-ai.vercel.app

### วิธี B: CLI
```bash
npm i -g vercel
vercel login
vercel --prod
# ทำตามขั้นตอน ใส่ env vars ตอนถาม
```

### วิธี C: ต่อ Supabase ก่อน Deploy
1. สร้างโปรเจกต์ที่ supabase.com
2. SQL Editor > วาง supabase-schema.sql > Run
3. เอา URL + service_role key มาใส่ใน Vercel Env Vars
4. Redeploy

## 3. เช็คหลัง Deploy
- https://your-app.vercel.app/health ต้องขึ้น {"status":"ok"}
- https://your-app.vercel.app/ ต้องเห็นหน้าแชท V2

## 4. ต่อ LINE (optional)
หลัง deploy ได้ URL แล้ว:
1. ไป https://developers.line.biz
2. สร้าง Channel > Messaging API
3. Webhook URL ใส่: https://your-app.vercel.app/webhook/line
4. เอา Channel Secret + Access Token มาใส่ใน Vercel Env Vars
5. Redeploy
