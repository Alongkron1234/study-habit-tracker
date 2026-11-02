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
| Sprint 1 | ยังไม่เริ่ม |

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

## การติดตั้งและรัน (ต้องกรอกเมื่อเลือก stack แล้ว)

> ส่วนนี้ต้องทำตามได้จริงบนเครื่องที่สะอาดภายใน 15 นาที (NFR-07)

1. ความต้องการของระบบ: <เช่น Node.js เวอร์ชัน ..., PostgreSQL เวอร์ชัน ...>
2. ติดตั้ง dependency: `<คำสั่ง>`
3. ตั้งค่า environment: คัดลอก `.env.example` เป็น `.env` แล้วกรอกค่า (ห้าม commit `.env`)
4. สร้างฐานข้อมูลและ migration: `<คำสั่ง>`
5. ใส่ข้อมูลตั้งต้น (seed): `<คำสั่ง>`
6. รันแอป: `<คำสั่ง>`
7. รันเทสต์: `<คำสั่ง>`

### บัญชีทดสอบ (ข้อมูลสังเคราะห์)

ระบุ username ของบัญชี seed ที่นี่ รหัสผ่านให้ส่งผ่านช่องทางส่วนตัวของวิชาหรือกำหนดจาก seed script ห้ามใส่รหัสผ่านจริงใน Git

## ขั้นตอนการ release

ดูรายละเอียดที่ `docs/workflow.md` สรุป: Issue → branch จาก `sprint-N-staging` → PR → เพื่อน review → รวมใน staging → release PR เข้า `main` → tag
