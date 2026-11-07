# คำประกาศการใช้ AI

ตามสเปก CPE 334 หัวข้อ 8.4 ระบุเครื่องมือและงานที่ AI ช่วย ไม่แนบ transcript
อัปเดตล่าสุด: 2026-11-07 (Deliverable 1)

## วิธีที่ทีมใช้ AI

- ให้ AI ทำงานบน **Issue ที่มีขอบเขตชัดเจน** โดยส่ง contract (Feature SDS, AC, STS, DoD) หรือเอกสารที่เกี่ยวข้องให้ก่อน
- ลำดับเดียวกับงานที่ไม่ใช้ AI: contract commit แยกก่อน → เทสต์ที่ fail (บันทึกหลักฐาน red) → โค้ดจนผ่าน (บันทึกหลักฐาน green)
- ตรวจ output หน้าเว็บอะไรต่างๆเอง อ่านโค้ด/เอกสาร รันเทสต์ด้วยตัวเอง ก่อน commit หรือ push
- ทุก PR เข้า sprint-1-staging ให้เพื่อนอีกคน review และ approve ก่อน merge
- มีผลรันเทสต์ที่ผูกกับ commit และ review ใน PR จริงๆไม่ได้ใช้แค่ AI ในการเช็คโค้ดเฉยๆ

## Alongkorn Kaewprom 67070501050, GitHub: Alongkron1234

model: Sonnet5.5 , effort: medium

| เครื่องมือ | งานที่ AI ช่วย | สิ่งที่ตรวจ/แก้ก่อนรับ |
|---|---|---|
| Claude (แชท) | ร่าง SRS v0.2, feature inventory, traceability, แผน 3 sprint (Part A, B, D) | อ่านและตกลง decision ร่วมกันกับเพื่อน แก้ตามความเหมาะสมของทีม |
| Claude Code | Issue #2 / PR #7: contract, เทสต์, โค้ด และหลักฐาน red/green ของ F-01 (auth) และ F-02 (สิทธิ์, error ปลอดภัย) | รันเทสต์เอง (red: 29 fail → green: 44/44 ผ่าน); แก้ตาม review ของ atiwit (log เฉพาะ error 5xx, ปรับคอมเมนต์) |
| Claude Code | Issue #3 / PR #9: contract, เทสต์, โค้ด และหลักฐานของ F-03 (แม่แบบ) และ F-04 (เป้าหมาย) | รันเทสต์เอง (red: 90 fail, 46 pass → green: 136/136 ผ่าน); ตัดสินใจกฎใน contract (S-1 ถึง S-11) ร่วมกับ AI; atiwit review |
| Claude Code | Part C (System-Level SDS), อัปเดตสถานะใน README/SDS/traceability/plan, ร่างตาราง contributions และไฟล์นี้ | อ่านเทียบกับโค้ดจริง; ลองทำตาม README บนเครื่องสะอาดและพบว่าคำสั่ง DROP DATABASE ใช้ไม่ได้ จึงแก้; เลือก stack (React + Vite) เองพร้อมเหตุผลใน §1.2 |
| Claude Code | ช่วย review PR ของเพื่อน (#5, #10, #11): อ่านโค้ด รันเทสต์ ชี้ประเด็น ร่างคอมเมนต์ และทดสอบ UI กับ backend จริง | รันเทสต์และกดทดสอบเอง ตัดสินใจเองว่าจะ approve หรือขอแก้ และพิมพ์คอมเมนต์บน GitHub เอง |

## Atiwit Thongngoen 67070501048, GitHub: atiwit

model: Claude 3.7 Sonnet / Claude 3.5 Sonnet / Gemini 2.5 Flash, เครื่องมือ: Antigravity (Coding Assistant)

| เครื่องมือ | งานที่ AI ช่วย | สิ่งที่ตรวจ/แก้ก่อนรับ |
|---|---|---|
| Antigravity (Claude Sonnet 3.5) | Issue #1 / PR #5: วางโครงฐานข้อมูล Initial schema, Migration script, Docker/PostgreSQL config, และ Seed data (F-07, F-08) | ตรวจสอบ SQL constraint (`uq_habit_entries_goal_date`, `uq_goals_active`), ตรวจ type parser และทดสอบรัน seed ให้ idempotent |
| Antigravity (Claude Sonnet / Gemini) | Issue #4 / PR #10: Contract, เทสต์ TDD, โค้ด Backend และหลักฐาน red/green ของ F-05 (บันทึกรายวัน) และ F-06 (ความคืบหน้าและประวัติ) | ตรวจสอบการแปลง PostgreSQL error 23505 เป็น HTTP 409, ตรวจสูตรคำนวณเปอร์เซ็นต์ capped 100%, ตรวจการนับวันย้อนหลัง 7 วันเทียบ `todayBangkok()`, รันเทสต์ 171/171 ผ่านจริงก่อน commit |
| Antigravity (Claude Sonnet / Gemini) | Issue #6 / PR #11: Contract, โครงสร้าง React + Vite SPA, API Client กลาง, AuthContext, ProtectedRoute, และหน้าจอครบ Journey (Templates, Goals, Entries, Progress) | ตรวจสอบการไม่เก็บ Token ใน LocalStorage (ใช้ HTTP-only session cookie), แก้ไขแยก 401 ออกจาก network error, ตัดฟิลด์ email ที่ไม่มีจริงออก, แก้ Bug redirect ข้าม role (TEST-UI-09), รัน Vitest 12/12 ผ่านครบ |
| Antigravity (แชท) | อัปเดต Traceability Matrix, ตรวจสอบ Definition of Done ของ Sprint 1, และร่างเอกสารคำประกาศการใช้ AI | ตรวจสอบความสอดคล้องระหว่าง Git commit hash กับเลข AC/TEST ในเอกสารจริงทุกจุด |


