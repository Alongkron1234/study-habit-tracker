# Study Habit Tracker

โปรเจกต์กลุ่มวิชา CPE 334 (ภาคเรียน 1/2026) — ธีม 8: Habit and Activity Tracking System
ระบบบันทึกนิสัยการอ่านหนังสือรายวัน (นาทีต่อวัน) สำหรับ Participant และให้ Program Manager กำหนดแม่แบบกิจกรรม

**ทีม:** <นายอติวิชญ์ ถุงเงิน> , <นายอลงกรณ์ แก้วพรหม 67070501050>

## สถานะ

| รายการ | สถานะ |
|---|---|
| SRS v0.2 | ร่างแล้ว (`docs/srs.md`) |
| Feature inventory + traceability | ร่างแล้ว |
| แผน 3 sprint | ร่างแล้ว |
| System-Level SDS | v0.2 ตรงกับโค้ดบน staging (ส่วนที่ยังเป็นแผน เช่น Docker/GCP ระบุไว้ในเอกสาร) |
| Sprint 1 | feature ครบ (F-01 ถึง F-08 และ UI-01) merge เข้า `sprint-1-staging` แล้ว เทสต์ผ่าน (backend 171, frontend 12); เหลือ release PR เข้า `main` และติด tag |

## เอกสาร

| เอกสาร | ตำแหน่ง |
|---|---|
| SRS | `docs/srs.md` |
| Feature inventory | `docs/features.md` |
| Traceability | `docs/traceability.md` |
| System-Level SDS | `docs/system-sds.md` |
| แผน 3 sprint | `docs/sprints/plan.md` |
| Contract ของ Sprint 1 | `docs/sprints/sprint-1/` |
| หลักฐาน Lab 5–7 | `docs/labs/` |
| ขั้นตอนทำงานของทีม | `docs/workflow.md` |
| การมีส่วนร่วมของทีม | `docs/contributions.md` |
| การใช้ AI | `docs/ai-use-declaration.md` |

## การติดตั้งและรัน (NFR-07: ทำตามได้ภายใน 15 นาทีบนเครื่องสะอาด)

### ความต้องการของระบบ

| รายการ | เวอร์ชันขั้นต่ำ |
|---|---|
| Node.js | 20 LTS ขึ้นไป |
| npm | 10 ขึ้นไป (มาพร้อม Node.js 20) |
| PostgreSQL | 14 ขึ้นไป |

> ** หมายเหตุสำคัญสำหรับการทดสอบ/อัปเดต:**  
> มีการปรับปรุงโครงสร้างใน `001_initial_schema.sql` ให้ตรงตาม SRS ล่าสุดก่อนขึ้น release หากคุณเคยรัน migration ด้วยเวอร์ชันก่อนหน้า จะต้อง **Drop และสร้างฐานข้อมูลใหม่** ก่อนรัน migration เพื่อป้องกัน schema mismatch (เช่น คอลัมน์ `user_id` ใน `habit_entries` ที่ถูกนำออก):
> `DROP DATABASE` รันรวมกับคำสั่งอื่นในหนึ่ง `-c` ไม่ได้ (ฐานข้อมูลถูกรันใน transaction เดียว) จึงต้องแยกเป็นสองคำสั่ง
> ```bash
> psql -U postgres -c "DROP DATABASE study_habit;"
> psql -U postgres -c "CREATE DATABASE study_habit;"
> ```

### ขั้นตอนการติดตั้ง

```bash
# 1. Clone repository
git clone https://github.com/Alongkron1234/study-habit-tracker.git
cd <โฟลเดอร์ที่ clone>/study-habit-tracker/backend

# 2. ติดตั้ง dependency
npm install

# 3. ตั้งค่า environment
#    สร้างไฟล์ .env ในโฟลเดอร์ backend (ห้าม commit ไฟล์ .env เด็ดขาด — NFR-08)
cp ../.env.example .env
# แก้ไขค่าใน .env ให้ตรงกับเครื่องของคุณ โดยเฉพาะ DATABASE_URL และ SESSION_SECRET

# 4. สร้างฐานข้อมูล (ทำครั้งเดียวใน psql)
#    CREATE DATABASE study_habit;

# 5. รัน Database Migration
npm run migrate

# 6. ใส่ข้อมูลตัวอย่าง (seed)
npm run seed

# 7. รันแอป Backend (development mode) — เปิดไว้ใน terminal นี้
npm run dev

# 8. ทดสอบว่าแอปทำงาน
curl http://localhost:3000/health
# ควรได้: {"status":"ok","db":"connected"}

# 9. เปิด terminal ใหม่ แล้วติดตั้งและรัน Frontend (Vite React SPA)
cd <โฟลเดอร์ที่ clone>/study-habit-tracker/frontend
npm install
npm run dev
# เปิดเบราว์เซอร์ที่ http://localhost:5173 (จะ proxy /api ไปยัง backend port 3000)
```

### ลอง login (F-01)

หลัง `npm run seed` แล้ว ลอง login ด้วยบัญชีใน "บัญชีทดสอบ" ด้านล่าง (รหัสผ่านรับจากช่องทางส่วนตัวของวิชา ไม่ใส่ใน Git):

```bash
# login แล้วเก็บ cookie ไว้ในไฟล์ cookies.txt
curl -i -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"participant_bob","password":"<รหัสผ่านของบัญชีนี้>"}'

# ดูผู้ใช้ปัจจุบัน
curl -b cookies.txt http://localhost:3000/api/auth/me

# logout (ได้ 204 แล้วเรียก /me อีกครั้งจะได้ 401)
curl -i -b cookies.txt -X POST http://localhost:3000/api/auth/logout
```

### รันเทสต์

```bash
# 1. ตั้งค่า test database (ทำครั้งเดียว) — รันจากโฟลเดอร์ backend
cd <โฟลเดอร์ที่ clone>/study-habit-tracker/backend
cp .env.test.example .env.test
# แก้ TEST_DATABASE_URL ใน .env.test ให้ชี้ไปยัง study_habit_test
# สร้าง DB: CREATE DATABASE study_habit_test;

# 2. รัน migration ใน test DB:
DATABASE_URL=<TEST_DATABASE_URL> npm run migrate

# 3. รันเทสต์ทั้งหมด
# Backend (Jest) — ต้องอยู่ในโฟลเดอร์ backend
npm test

# Frontend (Vitest)
cd ../frontend && npm install && npm test
```

### บัญชีทดสอบ (ข้อมูลสังเคราะห์)

บัญชีด้านล่างสร้างโดย seed script **เพื่อใช้ demo/test เท่านั้น** ห้ามใช้ในระบบจริง
รหัสผ่าน plaintext ส่งผ่านช่องทางส่วนตัวของวิชา (ห้ามใส่ใน Git — NFR-08)

| Username | Role | หมายเหตุ |
|---|---|---|
| `pm_alice` | Program Manager | สร้างแม่แบบกิจกรรม |
| `participant_bob` | Participant | มีเป้าหมายและ entry ตัวอย่างย้อนหลัง 3 วัน |
| `participant_carol` | Participant | มีเป้าหมายและ entry ตัวอย่างย้อนหลัง 3 วัน (ทดสอบ isolation) |

## ขั้นตอนการ release

ดูรายละเอียดที่ `docs/workflow.md` สรุป: Issue → branch จาก `sprint-N-staging` → PR → เพื่อน review → รวมใน staging → release PR เข้า `main` → tag
