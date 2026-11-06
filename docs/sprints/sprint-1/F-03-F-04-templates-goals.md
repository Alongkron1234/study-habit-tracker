# Contract: F-03 แม่แบบกิจกรรม + F-04 การตั้งเป้าหมาย

**Sprint:** 1 | **Issue:** #3 | **Branch:** `feature/templates-goals`
**อ้างอิง SRS:** FR-04, FR-05, FR-06, FR-07, BR-02, BR-04, BR-05, BR-07, BR-08, BR-09
**เวอร์ชัน:** 1.0 (ร่าง) | **วันที่:** 2026-11-07
**ผู้ทำ:** @Alongkron1234 | **ผู้ review:** @atiwit

---

## 1. Feature SDS

### พฤติกรรมและ Workflow

**F-03:** PM สร้างแม่แบบ (ชื่อ, ช่วงค่า entry ต่ำสุด–สูงสุดเป็นนาที) และดูรายการแม่แบบที่ตนสร้าง; Participant ดูรายการแม่แบบที่ใช้ได้ (ยังไม่ถูก archive) แต่สร้างไม่ได้
**F-04:** Participant เลือกแม่แบบมาตั้งเป้าหมาย (ยอดรวมนาที, วันเริ่ม, วันสิ้นสุด) ดูรายการเป้าหมายของตน และดูเป้าหมายรายตัว (ใช้เป็นฐานให้ F-05/F-06 และ UI)

ใช้ middleware จาก F-02 ทุก endpoint: `requireAuth` → `requireRole(...)` → (`ownedBy` สำหรับเป้าหมายรายตัว)

### กฎและการตัดสินใจ (ขอให้ reviewer ยืนยัน)

| # | การตัดสินใจ | เหตุผล |
|---|---|---|
| S-1 | หน่วยคงที่ `minutes`; ถ้า request ส่ง `unit` มาและไม่ใช่ `minutes` → 400 | BR-09 |
| S-2 | ช่วงค่าแม่แบบ: `min_value`, `max_value` เป็นจำนวนเต็ม 1–960 และ `max_value >= min_value`; ค่าไม่ครบ/ไม่ใช่จำนวนเต็ม (รวมทศนิยม, string) → 400 | BR-02 |
| S-3 | ชื่อแม่แบบ trim แล้วยาว 1–100 ตัวอักษร | สอดคล้องคอลัมน์ `VARCHAR(100)` |
| S-4 | Participant เห็นเฉพาะแม่แบบที่ `is_archived = false`; PM เห็นของตนทั้งหมด (รวม archived) | FR-05, FR-06 (archive ทำจริงใน Sprint 2) |
| S-5 | เป้าหมาย: `target_minutes` จำนวนเต็ม > 0; `start_date` และ `end_date` รูปแบบ `YYYY-MM-DD` ที่เป็นวันที่จริง; `end_date >= start_date`; `start_date >= วันนี้` (ปฏิทิน Asia/Bangkok); ระยะเวลานับรวมสองวันปลาย **ไม่เกิน 365 วัน** | BR-04 |
| S-6 | แม่แบบที่ไม่มีอยู่หรือ archived แล้ว → **404** `Not Found` | ไม่ให้ตั้งเป้าหมายกับแม่แบบที่ปิดแล้ว |
| S-7 | สถานะเป้าหมายคำนวณจากวันที่: `active` ถึง `end_date` (รวมวันนั้น) หลังจากนั้น `ended` ก่อนสร้างเป้าหมายใหม่ ระบบปรับแถว `active` ที่ `end_date < วันนี้` ของผู้ใช้นั้นเป็น `ended` ก่อน แล้วจึงตรวจซ้ำ | BR-05; partial unique index ตรวจจากคอลัมน์ `status` จึงต้องปรับให้ตรงกับวันที่ก่อนเสมอ |
| S-8 | มีเป้าหมาย active ในแม่แบบเดียวกันอยู่แล้ว → **409** `{"error":"Conflict"}`; ถ้ามีสอง request พร้อมกัน partial unique index `uq_goals_active` (error 23505) ต้องแปลงเป็น 409 เหมือนกัน ไม่ใช่ 500 | BR-05 |
| S-9 | PM เรียก endpoint ของ Participant → 403; Participant เรียก endpoint ของ PM → 403; เป้าหมายของคนอื่น → 404 | BR-07, BR-08, S-5 ของ F-02 |
| S-10 | response ของ validation 400 ใช้ `{"error":"Bad Request","fields":{"<ชื่อฟิลด์>":"<ข้อความคงที่>"}}` ข้อความมาจากรายการคงที่ใน §2 ไม่ใช้ `err.message` ของ library | ผู้ใช้ต้องรู้ว่าผิดข้อไหน (SRS) โดยไม่ละเมิด NFR-06 |
| S-11 | ค่า `DATE` จากฐานข้อมูลคืนเป็นสตริง `YYYY-MM-DD` (ตั้ง type parser ของ `pg`) และ "วันนี้" หาจากเขตเวลา Asia/Bangkok ในฟังก์ชันเดียว (`src/lib/dates.js`) | กันวันเลื่อนจากเขตเวลา (A-02) |

### Dependencies
F-07 (ตาราง `activity_templates`, `goals`), F-01/F-02 (session, middleware, error handler) — merge แล้วใน `sprint-1-staging`
F-05, F-06 และ UI-01 ขึ้นกับ F-04

### นอกขอบเขต
แก้ไข/archive แม่แบบ (F-09), แก้ไขเป้าหมาย (F-10), บันทึกรายวันและความคืบหน้า (F-05, F-06), หน้าจอ (UI-01)

---

## 2. สเปก API / Data / UI

### API (JSON ทั้งหมด)

| Method + Path | สิทธิ์ | Request | สำเร็จ | ล้มเหลว |
|---|---|---|---|---|
| `POST /api/templates` | PM | `{ "name", "min_value", "max_value", "unit"? }` | **201** `{ "template": {id, name, unit, min_value, max_value, is_archived} }` | 400 (validation), 401, 403 |
| `GET /api/templates` | PM / Participant | – | **200** `{ "templates": [ ... ] }` PM: ของตน; Participant: ที่ไม่ archived เรียงตาม `id` | 401 |
| `POST /api/goals` | Participant | `{ "template_id", "target_minutes", "start_date", "end_date" }` | **201** `{ "goal": {id, template_id, target_minutes, start_date, end_date, status} }` | 400, 401, 403, 404 (แม่แบบ), 409 (ซ้ำ) |
| `GET /api/goals` | Participant | – | **200** `{ "goals": [ ... ] }` เฉพาะของผู้ใช้ เรียงใหม่ก่อน | 401, 403 |
| `GET /api/goals/:id` | Participant (เจ้าของ) | – | **200** `{ "goal": { ... } }` | 401, 403, 404 (ไม่มี/ของคนอื่น/id ไม่ใช่จำนวนเต็ม) |

- response ไม่มีฟิลด์ `created_by`, `user_id`, `created_at`, `updated_at`
- ข้อความใน `fields` (คงที่): `name: "required, 1-100 characters"`, `min_value`/`max_value: "integer 1-960"`, `max_value: "must be >= min_value"`, `unit: "must be minutes"`, `target_minutes: "positive integer"`, `start_date`/`end_date: "date YYYY-MM-DD"`, `start_date: "must not be in the past"`, `end_date: "must not be before start_date"`, `end_date: "duration must not exceed 365 days"`
- 409 ตอบ `{"error":"Conflict"}` (เพิ่มในตารางข้อความของ `errors.js`)

### ผลต่อโครงสร้างโค้ด

| ชั้น | เปลี่ยน? | รายละเอียด |
|---|---|---|
| ฐานข้อมูล | **ไม่เปลี่ยน schema** | ใช้ตารางและ constraint เดิม ไม่มี migration ใหม่ |
| API | เปลี่ยน | เพิ่ม `routes/templates.js`, `routes/goals.js`; mount ใน `app.js`; เพิ่มข้อความ 409 ใน `errors.js` |
| Logic | เปลี่ยน | `src/lib/dates.js` (วันนี้แบบ Bangkok, ตรวจวันที่, จำนวนวัน), `src/lib/validate.js` (ฟังก์ชันบริสุทธิ์ ทดสอบเป็น unit) |
| DB client | เปลี่ยนเล็กน้อย | ตั้ง type parser ให้ `DATE` เป็นสตริง (S-11) |
| UI | ไม่เปลี่ยนใน contract นี้ | อยู่ใน UI-01 (issue #6) |

---

## 3. Acceptance Criteria

| ID | เงื่อนไข (ผลที่สังเกตได้) | Requirement |
|---|---|---|
| **AC-F03-01** | PM สร้างแม่แบบด้วยชื่อและช่วงค่าที่ถูกต้อง → 201 ได้แม่แบบที่มีหน่วย `minutes` และอยู่ในฐานข้อมูล | FR-04, BR-09 |
| **AC-F03-02** | Participant สร้างแม่แบบ → 403 และไม่มีแถวถูกสร้าง | BR-07 |
| **AC-F03-03** | ช่วงค่าไม่ถูกต้อง (ต่ำกว่า 1, สูงกว่า 960, max < min, ทศนิยม, ไม่ใช่ตัวเลข, ชื่อว่าง/ยาวเกิน, unit ไม่ใช่ minutes) → 400 พร้อม `fields` และไม่มีแถวถูกสร้าง | BR-02, BR-09 |
| **AC-F03-04** | PM ดูรายการได้เฉพาะแม่แบบที่ตนสร้าง | FR-05 |
| **AC-F03-05** | Participant ดูรายการแม่แบบที่ไม่ถูก archive ได้ และไม่เห็นแม่แบบที่ archive | FR-06 |
| **AC-F04-01** | Participant สร้างเป้าหมายจากแม่แบบด้วยข้อมูลถูกต้อง → 201 สถานะ `active` เจ้าของคือผู้ใช้นั้น | FR-07 |
| **AC-F04-02** | ข้อมูลเป้าหมายไม่ถูกต้อง → 400 พร้อม `fields`: ยอด ≤ 0 หรือไม่ใช่จำนวนเต็ม, วันที่ผิดรูปแบบ/ไม่มีจริง, สิ้นสุดก่อนเริ่ม, เริ่มก่อนวันนี้, ระยะเวลา > 365 วัน (ขอบ: 365 วันผ่าน, 366 ไม่ผ่าน; วันเริ่ม = วันนี้ผ่าน) | BR-04 |
| **AC-F04-03** | สร้างเป้าหมายที่สอง active ในแม่แบบเดียวกัน → 409 (รวมกรณีส่งพร้อมกัน เหลือ 1 แถว); แม่แบบอื่นสร้างได้; เป้าหมายเดิมที่สิ้นสุดแล้ว (`end_date` ผ่าน) ไม่ขวางการสร้างใหม่ | BR-05 |
| **AC-F04-04** | แม่แบบที่ไม่มี หรือ archived → 404 | S-6 |
| **AC-F04-05** | PM เรียก `POST/GET /api/goals` → 403 | BR-08 |
| **AC-F04-06** | Participant ดูรายการเป้าหมายได้เฉพาะของตน; `GET /api/goals/:id` ของคนอื่น → 404, ของตน → 200 | BR-08 |
| **AC-F04-07** | เป้าหมายที่ `end_date` ผ่านแล้วแสดงสถานะ `ended`; เป้าหมายที่ `end_date` = วันนี้ยัง `active` | BR-05 |

---

## 4. Software Test Specification

ไฟล์เทสต์: `backend/tests/templates.test.js`, `backend/tests/goals.test.js`, `backend/tests/validate.test.js` (unit)
Level: API integration (supertest + Postgres จริง) ยกเว้น `validate.test.js` เป็น unit
สภาพแวดล้อม: ใช้ `helpers/test-env.js`; ผู้ใช้ทดสอบสร้างเอง (bcrypt hash) และล็อกอินผ่าน `/api/auth/login` จริง; วันที่ในเทสต์คำนวณจาก "วันนี้ (Bangkok)" ไม่ hard-code

| ID Test | AC | Precondition | Action | Expected |
|---|---|---|---|---|
| **TEST-F03-01** | AC-F03-01 | PM login | `POST /templates` ชื่อ + min 10 + max 120 | 201; `unit='minutes'`; query DB พบแถว `created_by` = PM |
| **TEST-F03-02** | AC-F03-02 | Participant login | `POST /templates` | 403 `Forbidden`; จำนวนแถวแม่แบบไม่เพิ่ม |
| **TEST-F03-03a** | AC-F03-03 | PM | min = 0 / max = 961 / min = 1,max = 960 | 0 และ 961 → 400 ระบุ `fields`; 1–960 → 201 |
| **TEST-F03-03b** | AC-F03-03 | PM | max < min; min = 10.5; min = "10"; ขาดฟิลด์ | ทุกตัว 400 |
| **TEST-F03-03c** | AC-F03-03 | PM | ชื่อว่าง/ช่องว่างล้วน/101 ตัวอักษร; `unit:"hours"` | 400; ชื่อ 100 ตัวอักษร → 201 |
| **TEST-F03-04** | AC-F03-04 | PM สองคน แต่ละคนมีแม่แบบ | PM1 `GET /templates` | เห็นเฉพาะของ PM1 |
| **TEST-F03-05** | AC-F03-05 | มีแม่แบบปกติ 1, archived 1 (ตั้งผ่าน SQL) | Participant `GET /templates` | เห็นเฉพาะที่ไม่ archived |
| **TEST-F03-06** | AC-F03-01..05 | ไม่ login | `POST/GET /templates` | 401 (และเพิ่ม endpoint ใน `PROTECTED_ENDPOINTS` ของ rbac.test.js) |
| **TEST-F04-01** | AC-F04-01 | Participant, แม่แบบ | `POST /goals` ถูกต้อง | 201; `status='active'`; แถว `user_id` = ผู้ใช้; response ไม่มี `user_id` |
| **TEST-F04-02a** | AC-F04-02 | Participant | `target_minutes` = 0, -5, 1.5, "100" | ทุกตัว 400 `fields.target_minutes`; 1 → 201 |
| **TEST-F04-02b** | AC-F04-02 | Participant | วันที่: `2026-02-30`, `"x"`, ขาด | 400 `fields` ที่เกี่ยวข้อง |
| **TEST-F04-02c** | AC-F04-02 | Participant | end = start − 1 วัน; end = start | ก่อน → 400; เท่ากัน → 201 |
| **TEST-F04-02d** | AC-F04-02 | Participant | start = เมื่อวาน; start = วันนี้ | เมื่อวาน → 400; วันนี้ → 201 |
| **TEST-F04-02e** | AC-F04-02 | Participant | ระยะ 366 วัน; 365 วัน (นับรวมปลาย) | 366 → 400; 365 → 201 |
| **TEST-F04-03a** | AC-F04-03 | Participant มี active goal ใน T1 | สร้างอีกอันใน T1 | 409 `{"error":"Conflict"}`; จำนวน goal ไม่เพิ่ม |
| **TEST-F04-03b** | AC-F04-03 | เหมือนข้างบน | สร้างใน T2 | 201 |
| **TEST-F04-03c** | AC-F04-03 | ผู้ใช้ไม่มี goal ใน T1 | ส่ง `POST /goals` 5 คำขอพร้อมกัน | สำเร็จ 1 (201) ที่เหลือ 409 ไม่มี 500; DB มี active 1 แถว |
| **TEST-F04-03d** | AC-F04-03 | goal ใน T1 ที่ `end_date` เมื่อวาน (ตั้งผ่าน SQL, status ยัง active) | สร้าง goal ใหม่ใน T1 | 201; แถวเก่าถูกปรับเป็น `ended` |
| **TEST-F04-03e** | AC-F04-03 | Participant สองคน | ทั้งคู่สร้าง goal ใน T1 | ทั้งคู่ 201 (ข้อจำกัดเป็นรายผู้ใช้) |
| **TEST-F04-04** | AC-F04-04 | – | `template_id` ที่ไม่มี; แม่แบบ archived; ไม่ใช่ตัวเลข | 404 (ไม่ใช่ตัวเลข → 400) |
| **TEST-F04-05** | AC-F04-05 | PM login | `POST /goals`, `GET /goals` | 403 ทั้งคู่ |
| **TEST-F04-06a** | AC-F04-06 | Participant A มี goal, B มี goal | A `GET /goals` | เห็นเฉพาะของ A |
| **TEST-F04-06b** | AC-F04-06 | goal ของ A | A / B / PM `GET /goals/:id` | 200 / 404 / 403; id ไม่ใช่จำนวนเต็ม → 404 |
| **TEST-F04-07** | AC-F04-07 | goal `end_date` เมื่อวาน; goal `end_date` วันนี้ | `GET /goals` | อันแรก `ended`; อันหลัง `active` |
| **TEST-F04-08** | AC-F04-01..06 | ไม่ login | `POST/GET /goals`, `GET /goals/1` | 401 (เพิ่มใน `PROTECTED_ENDPOINTS`) |
| **TEST-F03-U1** | AC-F03-03, AC-F04-02 | – | unit: `validateTemplate`, `validateGoal`, `daysInclusive`, `todayBangkok` ที่ขอบเขตค่า/เที่ยงคืน Bangkok | ตรงตาม S-2, S-5, S-11 |

---

## 5. Definition of Done และหลักฐาน

- [x] contract นี้ commit ก่อนโค้ดและเทสต์ (commit แยก) — `bdcdc5a`
- [x] เทสต์ทุกข้อใน §4 เขียนก่อนโค้ดและบันทึกผลรัน **fail** พร้อม commit — เทสต์ `b26be93`, ผลรัน `evidence/F-03-F-04-red-run.txt` (90 fail / 46 pass)
- [x] โค้ดครบตาม §2 และ `npm test` ผ่านทุกเทสต์ — โค้ด `b081a81`, ผลรัน `evidence/F-03-F-04-green-run.txt` (136/136)
- [x] เทสต์ของ F-07, F-01, F-02 ยังผ่าน (รวมอยู่ใน 136/136) (regression) และ endpoint ใหม่อยู่ใน `PROTECTED_ENDPOINTS`
- [x] response ไม่มี `user_id`, `created_by`, secret; ไม่มี SQL/stack ใน error
- [x] `docs/traceability.md` อัปเดตแถว FR-04–07, BR-02 (ส่วนแม่แบบ), BR-04, BR-05, BR-07, BR-08, BR-09 ด้วยเลข AC/TEST
- [ ] `docs/system-sds.md` §4.2 ปรับสถานะ endpoint (ไฟล์อยู่ใน PR #8 ที่ยังไม่ merge จึงทำหลัง PR #8 merge เข้า staging)
- [ ] PR เข้า `sprint-1-staging` ผ่าน review จาก @atiwit (ผู้เขียนไม่อนุมัติเอง)

---

## 6. ประวัติการเปลี่ยนแปลง Contract

| วันที่ | การเปลี่ยนแปลง | เหตุผล |
|---|---|---|
| 2026-11-07 | สร้าง v1.0 (ร่าง) | ก่อนเริ่ม implement |
