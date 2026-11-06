# Study Habit Tracker

โปรเจกต์กลุ่มวิชา CPE 334 (ภาคเรียน 1/2026) — ธีม 8: Habit and Activity Tracking System
ระบบบันทึกนิสัยการอ่านหนังสือรายวัน (นาทีต่อวัน) สำหรับ Participant และให้ Program Manager กำหนดแม่แบบกิจกรรม

**ทีม:** <ชื่อ-รหัสนักศึกษาคนที่ 1>, <ชื่อ-รหัสนักศึกษาคนที่ 2>

## สถานะ

| รายการ | สถานะ |
|---|---|
| SRS v0.2 | ร่างแล้ว (`docs/srs.md`) |
| Feature inventory + traceability | ร่างแล้ว |
| แผน 3 sprint | ร่างแล้ว |
| System-Level SDS | ยังไม่เริ่ม |
| Sprint 1 | 🔄 กำลังดำเนินการ (feature/foundation-persistence) |

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
| PostgreSQL | 15 ขึ้นไป |

### ขั้นตอนการติดตั้ง

```bash
# 1. Clone repository
git clone https://github.com/Alongkron1234/study-habit-tracker.git
cd study-habit-tracker/backend

# 2. ติดตั้ง dependency
npm install

# 3. ตั้งค่า environment
cp ../.env.example ../.env
# แก้ไขค่าใน .env ให้ตรงกับเครื่องของคุณ โดยเฉพาะ DATABASE_URL
# ห้าม commit ไฟล์ .env เด็ดขาด (NFR-08)

# 4. สร้างฐานข้อมูล (ทำครั้งเดียว)
#    เปิด psql แล้วรัน:
#    CREATE DATABASE study_habit;

# 5. รัน Database Migration
node src/db/migrate.js

# 6. ใส่ข้อมูลตัวอย่าง (seed)
node src/db/seeds/seed.js

# 7. รันแอป (development mode)
npm run dev

# 8. ทดสอบว่าแอปทำงาน
curl http://localhost:3000/health
# ควรได้: {"status":"ok","db":"connected"}
```

### รันเทสต์

```bash
# ตั้งค่า test database (ทำครั้งเดียว)
cp .env.test.example .env.test
# แก้ TEST_DATABASE_URL ใน .env.test ให้ชี้ไปยัง study_habit_test
# สร้าง DB: CREATE DATABASE study_habit_test;
# รัน migration ใน test DB:
NODE_ENV=test DATABASE_URL=<TEST_DATABASE_URL> node src/db/migrate.js

# รันเทสต์ทั้งหมด
npm test
```

### บัญชีทดสอบ (ข้อมูลสังเคราะห์)

บัญชีด้านล่างสร้างโดย seed script **เพื่อใช้ demo/test เท่านั้น** ห้ามใช้ในระบบจริง
รหัสผ่าน plaintext ส่งผ่านช่องทางส่วนตัวของวิชา (ห้ามใส่ใน Git — NFR-08)

| Username | Role | หมายเหตุ |
|---|---|---|
| `pm_alice` | Program Manager | สร้างแม่แบบกิจกรรม |
| `participant_bob` | Participant | มีเป้าหมายและ entry ตัวอย่าง |
| `participant_carol` | Participant | มีเป้าหมายและ entry ตัวอย่าง (ทดสอบ ownership isolation) |

## ขั้นตอนการ release

ดูรายละเอียดที่ `docs/workflow.md` สรุป: Issue → branch จาก `sprint-N-staging` → PR → เพื่อน review → รวมใน staging → release PR เข้า `main` → tag
