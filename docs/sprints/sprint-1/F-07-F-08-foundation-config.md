# Contract: F-07 การเก็บข้อมูลถาวรและ seed + F-08 การตั้งค่าเครื่องและ config

**Sprint:** 1 | **Issue:** #1 | **Branch:** `feature/foundation-persistence`
**อ้างอิง SRS:** NFR-04, NFR-05, NFR-06, NFR-07, NFR-08, BR-01, BR-02, BR-04, BR-05, BR-08, D-07
**เวอร์ชัน:** 1.2 | **วันที่:** 2026-11-06

---

## 1. Feature SDS

### พฤติกรรมและ Workflow

F-07 ทำหน้าที่เป็นชั้น data layer ของระบบทั้งหมด ไม่มี HTTP endpoint ของตัวเอง
F-08 ทำหน้าที่ให้ผู้พัฒนาหรือ reviewer ตั้งระบบให้พร้อมทดสอบได้

**F-07 Workflow:**
1. `npm run migrate` → อ่านไฟล์ใน `src/db/migrations/*.sql` ตามลำดับ → ตั้ง schema และ constraint
2. `npm run seed` → upsert ข้อมูลตัวอย่าง (idempotent — รันซ้ำได้โดยไม่สร้างแถวซ้ำซ้อน)
3. แอปเชื่อมต่อ DB ผ่าน `Pool` ที่ใช้ร่วมกัน ข้อมูลยังอยู่หลังรีสตาร์ต process

**F-08 Workflow:**
1. ผู้ใช้ clone repo
2. ทำตามขั้นตอนใน `README.md`
3. รัน migrate + seed + `npm run dev` ได้ภายใน 15 นาทีบนเครื่องสะอาด

### Schema และ Constraints

| ตาราง | คอลัมน์หลัก | Constraint สำคัญ | หมายเหตุ / กฎที่สอดคล้อง |
|---|---|---|---|
| `users` | id, username, email, password_hash, role | UNIQUE(username), UNIQUE(email), role IN ('pm','participant') | NFR-02 (hash), NFR-08 (no secret) |
| `activity_templates` | id, created_by→users, name, unit, min_value, max_value, is_archived | min_value ≥ 1, max_value ≤ 960, max_value ≥ min_value | BR-02 (เพดาน 960 นาที, ต่ำสุด 1), BR-09 (หน่วยนาที) |
| `goals` | id, user_id→users, template_id→templates, target_minutes, start_date, end_date, status | target_minutes > 0, end_date ≥ start_date, status IN ('active','ended') | BR-04 (เงื่อนไขเป้าหมาย), BR-05 |
| *partial index* | `uq_goals_active` on (user_id, template_id) WHERE status='active' | UNIQUE | BR-05 (1 active goal ต่อแม่แบบ, อนุญาตหลาย ended goals) |
| `habit_entries` | id, goal_id→goals, entry_date, minutes | minutes BETWEEN 1 AND 960, **UNIQUE(goal_id, entry_date)** | BR-01 / NFR-05 (1 entry ต่อวัน), BR-02 / D-07 (ไม่รับ 0 นาที), BR-08 (ไม่เก็บ user_id ซ้ำเพื่อคง 3NF และป้องกัน ownership mismatch, ไม่อนุญาตลบ goal ถ้ามี entries โดยไม่มี cascade เพื่อรักษาประวัติ) |
| `session` | sid, sess, expire | PRIMARY KEY(sid) | NFR-01, NFR-03 (connect-pg-simple) |
| `schema_migrations` | filename, applied_at | PRIMARY KEY(filename) | Idempotent migration tracking |

### Dependencies
- F-07 ไม่ขึ้นกับ Feature อื่น
- F-08 ขึ้นกับ F-07 (README ใช้ migrate และ seed)
- Feature อื่นทั้งหมดในระบบขึ้นกับ F-07

### Business Rules & NFRs ที่เกี่ยวข้อง
- **BR-01 / NFR-05:** 1 entry ต่อวัน ต่อ goal → บังคับด้วย `UNIQUE(goal_id, entry_date)` ที่ DB เพื่อรับประกันการส่งพร้อมกัน (concurrency)
- **BR-02 / D-07:** ช่วงค่า entry → `CHECK(min_value >= 1 AND min_value <= 960)` และ `CHECK(minutes >= 1 AND minutes <= 960)` ไม่อนุญาตค่า 0 นาที
- **BR-03:** ช่วงวันที่ entry ต้องอยู่ในช่วงเป้าหมาย → Seed data เริ่ม goal ย้อนหลัง 7 วันเพื่อรองรับตัวอย่าง
- **BR-04:** เงื่อนไขเป้าหมาย → `CHECK(end_date >= start_date)` และ `CHECK(target_minutes > 0)`
- **BR-05:** 1 active goal ต่อ user ต่อ template → บังคับด้วย Partial Unique Index `uq_goals_active`
- **BR-08:** ความเป็นเจ้าของข้อมูล → ไม่เก็บ `user_id` ซ้ำใน `habit_entries` อ้างอิงผ่าน `goals.user_id` เสมอ และไม่ใส่ `ON DELETE CASCADE` เพื่อป้องกันประวัติสูญหาย
- **NFR-06:** Error handler ปลอดภัย → 500 error ตอบ JSON กลางๆ เสมอ ไม่เปิดเผย stack trace หรือ db message

---

## 2. สเปก Data Layer

**Driver:** `pg` (node-postgres)
**Migration runner:** `backend/src/db/migrate.js` (รันผ่าน `npm run migrate`)
**Seed runner:** `backend/src/db/seeds/seed.js` (รันผ่าน `npm run seed`)

---

## 3. Acceptance Criteria

| ID | เงื่อนไข | วิธีตรวจ | ระดับ |
|---|---|---|---|
| **AC-F07-01** | ข้อมูลที่เขียนลง DB ยังอยู่ครบหลัง pool reconnect (จำลอง restart) | Integration test: เขียน → ปิด pool เก่า → เปิด pool ใหม่ → ตรวจข้อมูล | Integration |
| **AC-F07-02** | DB constraint ปฏิเสธการ insert ซ้ำ `(goal_id, entry_date)` ด้วย error code '23505' | Integration test: insert ครั้งที่ 2 ต้องโยน unique violation (23505) | Integration |
| **AC-F07-03** | รัน seed แล้วได้ผู้ใช้ 3 คน + template + goal + entries อย่าง idempotent | Automated test: รัน seed 2 ครั้งแล้วตรวจ row count เท่าเดิม | Integration |
| **AC-F08-01** | Clone → ติดตั้ง → migrate → seed → start สำเร็จภายใน 15 นาที (NFR-07) | Peer review: ให้เพื่อนทำตาม README บนเครื่องสะอาด | Manual/Review |
| **AC-F08-02** | ไม่มี secret หรือ password จริงใน Git (NFR-08) | `git log -p` scan + `.gitignore` review | Code Review |

---

## 4. Software Test Specification

| ID Test | AC ที่ครอบคลุม | Level | Precondition | Action | Expected |
|---|---|---|---|---|---|
| **TEST-F07-01** | AC-F07-01 | Integration | DB ที่ apply migration แล้ว | Insert user ใน pool A → `poolA.end()` → query ใน pool B | rows.length === 1 และค่าตรง (พิสูจน์ restart) |
| **TEST-F07-02a** | AC-F07-02 | Integration | มี goal อยู่ | Insert habit_entry ครั้งแรก | สำเร็จ มี id |
| **TEST-F07-02b** | AC-F07-02 | Integration | มี goal + entry วันเดิมแล้ว | Insert habit_entry วันเดิมซ้ำ | reject — `err.code === '23505'` |
| **TEST-F07-02c** | AC-F07-02 | Integration | มี goal | Insert habit_entry 2 วันต่างกัน | ทั้งคู่สำเร็จ, count === 2 |
| **TEST-F07-03** | AC-F07-03 | Integration | DB เปล่า | รัน `seed(pool)` 2 รอบติดต่อกัน | row count ของทุกตารางเท่าเดิม ไม่เพิ่ม |
| **TEST-F07-04a** | BR-02 / D-07 | Integration | มี goal | Insert entry minutes = 0 | reject — `err.code === '23514'` |
| **TEST-F07-04b** | BR-02 | Integration | มี goal | Insert entry minutes = 1 (min) | สำเร็จ |
| **TEST-F07-04c** | BR-02 | Integration | มี goal | Insert entry minutes = 960 (max) | สำเร็จ |
| **TEST-F07-04d** | BR-02 | Integration | มี goal | Insert entry minutes = 961 | reject — `err.code === '23514'` |
| **TEST-F07-05a** | BR-05 | Integration | มี template | Insert 2 ended goals สำหรับ user คนเดิม | สำเร็จทั้งคู่ |
| **TEST-F07-05b** | BR-05 | Integration | มี 1 active goal | Insert active goal ซ้ำสำหรับ template เดิม | reject — `err.code === '23505'` |

ไฟล์เทสต์: [`../../tests/persistence.test.js`](../../tests/persistence.test.js)

---

## 5. Definition of Done และหลักฐาน

- [x] ไฟล์ SQL migration commit ก่อนโค้ดแอป
- [x] `migrate.js` รันได้และ idempotent
- [x] `seed.js` รันได้และ idempotent (check existing rows + ON CONFLICT UPDATE)
- [x] Schema ตรงกับ SRS ครบถ้วน (BR-02, BR-05, D-07, 3NF สำหรับ habit_entries)
- [x] ถอด `ON DELETE CASCADE` ออกจาก `habit_entries.goal_id` เพื่อรักษาประวัติการบันทึก
- [x] ไม่มี `.env` หรือ secret ใน commit (ตรวจจาก `.gitignore`)
- [x] Error handler ไม่เปิดเผยรายละเอียดข้อผิดพลาดภายใน (NFR-06)
- [x] `README.md` มีขั้นตอน Setup ครบตรงกับการทำงานจริงของโค้ด พร้อมคำเตือนเรื่อง drop DB หากเคย migrate รุ่นเก่า (NFR-07)
- [ ] `npm test` ผ่านทุก test cases พร้อมแนบผลรันใน PR (หลักฐาน TDD)
- [ ] เพื่อนร่วมทีมทำตาม README บนเครื่องสะอาดสำเร็จภายใน 15 นาที (AC-F08-01)
- [ ] PR เข้า `sprint-1-staging` ผ่าน review จาก @atiwit

---

## 6. ประวัติการเปลี่ยนแปลง Contract

| วันที่ | การเปลี่ยนแปลง | เหตุผล |
|---|---|---|
| 2026-11-06 | สร้าง v1.0 | ก่อนเริ่ม implement |
| 2026-11-06 | ปรับปรุง v1.1 | แก้ไขตาม Peer Review รอบ 1: เอา UNIQUE NULLS NOT DISTINCT ออก, ลบ user_id ซ้ำใน habit_entries (3NF/BR-08), ปรับ minutes (1..960 ตาม D-07), ปรับ error handler NFR-06 |
| 2026-11-06 | ปรับปรุง v1.2 | แก้ไขตาม Peer Review รอบ 2:<br>1. คืนค่า DoD 2 รายการที่ยังรอผลรันจริง (`npm test pass` และ `เพื่อนทำตาม README`)<br>2. ถอด `ON DELETE CASCADE` ออกจาก `habit_entries.goal_id` เพื่อป้องกันประวัติสูญหายเงียบๆ<br>3. ปรับปรุง Test Spec ให้ใช้รหัส `TEST-F07-0x` ตรงกันทั้งหมด, ระบุการเช็ค error code `'23505'` และ `'23514'`<br>4. เพิ่ม `TEST-F07-03` สำหรับตรวจสอบ seed idempotency อัตโนมัติ<br>5. ปรับปรุง TEST-F07-01 ให้ shutdown pool A แล้วต่อ pool B ใหม่ เพื่อพิสูจน์ restart อย่างแท้จริง |
