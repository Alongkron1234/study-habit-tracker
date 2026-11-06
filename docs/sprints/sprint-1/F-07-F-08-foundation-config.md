# Contract: F-07 การเก็บข้อมูลถาวรและ seed + F-08 การตั้งค่าเครื่องและ config

**Sprint:** 1 | **Issue:** #1 | **Branch:** `feature/foundation-persistence`
**อ้างอิง SRS:** NFR-04, NFR-05, NFR-07, NFR-08
**เวอร์ชัน:** 1.0 | **วันที่ commit:** 2026-11-06

---

## 1. Feature SDS

### พฤติกรรมและ Workflow

F-07 ทำหน้าที่เป็นชั้น data layer ของระบบทั้งหมด ไม่มี HTTP endpoint ของตัวเอง
F-08 ทำหน้าที่ให้ผู้พัฒนาหรือ reviewer ตั้งระบบให้พร้อมทดสอบได้

**F-07 Workflow:**
1. `npm run migrate` → อ่านไฟล์ใน `src/db/migrations/*.sql` ตามลำดับ → ตั้ง schema และ constraint
2. `npm run seed` → upsert ข้อมูลตัวอย่าง (idempotent)
3. แอปเชื่อมต่อ DB ผ่าน `Pool` ที่ใช้ร่วมกัน ข้อมูลยังอยู่หลังรีสตาร์ต process

**F-08 Workflow:**
1. ผู้ใช้ clone repo
2. ทำตามขั้นตอนใน `README.md`
3. รัน migrate + seed + `npm run dev` ได้ภายใน 15 นาทีบนเครื่องสะอาด

### Schema

| ตาราง | คอลัมน์หลัก | Constraint สำคัญ |
|---|---|---|
| `users` | id, username, email, password_hash, role | UNIQUE(username), UNIQUE(email), role IN ('pm','participant') |
| `activity_templates` | id, created_by→users, name, unit, min_value, max_value, is_archived | min_value≥0, max_value>min_value |
| `goals` | id, user_id→users, template_id→templates, target_minutes, start_date, end_date, status | target_minutes>0, end_date≥start_date, PARTIAL UNIQUE INDEX: (user_id, template_id) WHERE status='active' |
| `habit_entries` | id, goal_id→goals, user_id→users, entry_date, minutes | **UNIQUE(goal_id, entry_date)** — BR-01/NFR-05 |
| `session` | sid, sess, expire | (ใช้โดย connect-pg-simple) |
| `schema_migrations` | filename, applied_at | (tracking ไฟล์ migration ที่ apply แล้ว) |

### Dependencies
- F-07 ไม่ขึ้นกับ Feature อื่น
- F-08 ขึ้นกับ F-07 (README ใช้ migrate และ seed)
- Feature อื่นทั้งหมดในระบบขึ้นกับ F-07

### Business Rules ที่เกี่ยวข้อง
- **BR-01:** 1 entry ต่อวัน ต่อ goal → บังคับด้วย `UNIQUE(goal_id, entry_date)` ที่ DB
- **BR-02:** ช่วงค่า entry → `CHECK(min_value >= 0)` และ `CHECK(max_value > min_value)` ในตาราง templates
- **BR-04:** เงื่อนไขเป้าหมาย → `CHECK(end_date >= start_date)` และ `CHECK(target_minutes > 0)`
- **BR-05:** 1 active goal ต่อ user ต่อ template → Partial Unique Index

### Failure / Boundary
- ถ้า `DATABASE_URL` ไม่ถูกต้อง: migrate จะ fail ทันที พร้อมแสดง error ที่ชัดเจน
- ถ้า migrate รันซ้ำ: ข้ามไฟล์ที่ apply แล้ว (idempotent)
- ถ้า seed รันซ้ำ: ใช้ `ON CONFLICT DO UPDATE/NOTHING` (idempotent)

---

## 2. สเปก Data Layer

**ORM/Driver:** `pg` (node-postgres) — ไม่ใช้ ORM เพื่อให้ constraint SQL อยู่ที่ DB จริง

**Migration runner:** custom `src/db/migrate.js` — ใช้ `schema_migrations` ตาราง tracking

**Environment variables (จาก `.env.example`):**

| ตัวแปร | ประโยชน์ | ค่าตัวอย่าง |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pw@localhost:5432/study_habit` |
| `SESSION_SECRET` | HMAC key สำหรับ session | `change-me-to-random-string` |
| `SESSION_TTL_HOURS` | อายุ session (NFR-03) | `8` |
| `APP_PORT` | port ของ Express | `3000` |

---

## 3. Acceptance Criteria

| ID | เงื่อนไข | วิธีตรวจ | ระดับ |
|---|---|---|---|
| **AC-F07-01** | ข้อมูลที่เขียนลง DB ยังอยู่ครบหลัง pool reconnect (จำลอง restart) | Integration test: เขียน → release client → อ่านด้วย client ใหม่ | Integration |
| **AC-F07-02** | DB constraint ปฏิเสธการ insert ซ้ำ `(goal_id, entry_date)` | Integration test: insert ครั้งที่ 2 ต้องโยน unique violation | Integration |
| **AC-F07-03** | รัน seed แล้วได้ผู้ใช้ 3 คน + template + goal + entries | Manual: ตรวจ row count หลัง seed | Manual |
| **AC-F08-01** | Clone → ติดตั้ง → migrate → seed → start สำเร็จภายใน 15 นาที (NFR-07) | Peer review: ให้เพื่อนทำตาม README บนเครื่องสะอาด | Manual/Review |
| **AC-F08-02** | ไม่มี secret หรือ password จริงใน Git (NFR-08) | `git log -p` scan + `.gitignore` review | Code Review |

---

## 4. Software Test Specification

| ID Test | AC ที่ครอบคลุม | Level | Precondition | Action | Expected |
|---|---|---|---|---|---|
| **TEST-F07-01** | AC-F07-01 | Integration | DB ที่ apply migration แล้ว | Insert user ด้วย client A → release → query ด้วย client B | rows.length === 1 และค่าตรง |
| **TEST-F07-02a** | AC-F07-02 | Integration | มี goal อยู่ | Insert habit_entry ครั้งแรก | สำเร็จ มี id |
| **TEST-F07-02b** | AC-F07-02 | Integration | มี goal + entry วันเดิมแล้ว | Insert habit_entry วันเดิมซ้ำ | reject — unique violation |
| **TEST-F07-02c** | AC-F07-02 | Integration | มี goal | Insert habit_entry 2 วันต่างกัน | ทั้งคู่สำเร็จ, count === 2 |

ไฟล์เทสต์: [`../../tests/persistence.test.js`](../../tests/persistence.test.js)

---

## 5. Definition of Done และหลักฐาน

- [x] ไฟล์ SQL migration 2 ไฟล์ commit ก่อนโค้ดแอป
- [x] `migrate.js` รันได้และ idempotent
- [x] `seed.js` รันได้และ idempotent (ON CONFLICT)
- [x] ไม่มี `.env` หรือ secret ใน commit (ตรวจจาก `.gitignore`)
- [x] `README.md` มีขั้นตอน Setup ครบ
- [ ] เพื่อนทำตาม README บนเครื่องสะอาดแล้วแจ้งว่าผ่าน (AC-F08-01) — รอ PR Review
- [ ] `npm test` pass ทุก test case — รอสร้าง test DB และรัน
- [ ] PR เข้า `sprint-1-staging` ผ่าน review จาก @atiwit

---

## 6. ประวัติการเปลี่ยนแปลง Contract

| วันที่ | การเปลี่ยนแปลง | เหตุผล |
|---|---|---|
| 2026-11-06 | สร้าง v1.0 | ก่อนเริ่ม implement |

