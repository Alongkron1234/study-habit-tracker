# Contract: F-05 การบันทึกกิจกรรมรายวัน + F-06 การคำนวณความคืบหน้า

**Sprint:** 1 | **Issue:** #4 | **Branch:** `feature/entry-progress`
**อ้างอิง SRS:** FR-08, FR-09, FR-10, BR-01, BR-02, BR-03, BR-05, BR-06, BR-08, BR-09, NFR-05
**เวอร์ชัน:** 1.0 (ร่าง) | **วันที่:** 2026-11-08
**ผู้ทำ:** @atiwit | **ผู้ review:** @Alongkron1234

---

## 1. Feature SDS

### พฤติกรรมและ Workflow

**F-05:** Participant บันทึกจำนวนนาทีที่ศึกษาในแต่ละวัน ภายใต้เป้าหมายที่ตนสร้างไว้  
ระบบตรวจสอบ: (1) เจ้าของ goal, (2) goal ยัง active, (3) `minutes` อยู่ในช่วงที่ template กำหนด, (4) `entry_date` ถูกต้องตาม BR-03, (5) ไม่ซ้ำวันในเป้าหมายเดียวกัน

**F-06:** Participant ดูความคืบหน้าของเป้าหมาย (ยอดรวมนาที, เป้าหมาย, เปอร์เซ็นต์) และดูประวัติ entry ทั้งหมดเรียงตามวันที่ล่าสุดก่อน

ใช้ middleware จาก F-02 ทุก endpoint: `requireAuth` → `requireRole('participant')` → `ownedBy(goalOwner)`

### กฎและการตัดสินใจ (ขอให้ reviewer ยืนยัน)

| # | การตัดสินใจ | เหตุผล |
|---|---|---|
| S-1 | บันทึก entry ใน goal ที่ `end_date < วันนี้` หรือ `status = 'ended'` → **409** `{"error":"Conflict"}` | BR-05 (entry side) |
| S-2 | "วันนี้" ในทุก endpoint ใช้ `todayBangkok()` จาก `src/lib/dates.js` | A-02, S-11 ของ F-03/F-04 |
| S-3 | `minutes` ต้องเป็นจำนวนเต็ม อยู่ในช่วง `[template.min_value, template.max_value]` ไม่ใช่แค่ [1, 960] | BR-02 |
| S-4 | Duplicate entry (goal เดียวกัน, วันเดียวกัน) → **409** `{"error":"Conflict"}` (error 23505 จาก DB → HTTP 409) | BR-01, NFR-05 |
| S-5 | `percent` แสดงสูงสุด 100.0 (capped) แต่ `total_minutes` แสดงค่าจริงเกินก็ได้; `percent` ปัดเป็น 1 ทศนิยม | BR-06 |
| S-6 | Response ไม่มีฟิลด์ `goal_id`, `user_id`, `created_at`, `updated_at`; entry ส่งเฉพาะ `id, entry_date, minutes` | NFR-06, BR-08 |
| S-7 | PM เรียก endpoint entry/progress → **403**; Participant เรียก entry ของ goal คนอื่น → **404** | BR-08 |
| S-8 | History `/entries` เรียง `entry_date DESC` | FR-10 |
| S-9 | `entry_date` ที่ไม่ถูกรูปแบบ / ไม่มีจริง / อนาคต / เกิน 7 วัน / นอกช่วง goal → **400** พร้อม `fields` | BR-03 |
| S-10 | ข้อความใน `fields` เป็นค่าคงที่ ไม่ใช้ err.message ของ library | S-10 ของ F-03/F-04 |
| S-11 | บันทึกวันสุดท้ายของ goal (`entry_date = end_date = วันนี้`) → **201** ยังถือเป็น active | BR-05 (end_date รวมวันนั้น) |

### Dependencies

F-07 (ตาราง `habit_entries`, `goals`, `activity_templates`), F-01/F-02 (session, middleware, error handler), F-04 (goal เป็นฐานของ entry)  
F-05/F-06 เป็น prerequisite ของ UI-01 (issue #6)

### นอกขอบเขต

แก้ไข/ลบ entry (F-11, Sprint 2), streak (F-13, Sprint 3), สรุปและกรอง (F-14, Sprint 3), หน้าจอ UI ของ F-05/F-06 (อยู่ใน UI-01 issue #6)

---

## 2. สเปก API / Data / UI

### API (JSON ทั้งหมด)

| Method + Path | สิทธิ์ | Request body | สำเร็จ | ล้มเหลว |
|---|---|---|---|---|
| `POST /api/goals/:id/entries` | Participant (เจ้าของ goal) | `{ "entry_date": "YYYY-MM-DD", "minutes": integer }` | **201** `{ "entry": { id, entry_date, minutes } }` | 400 (validation + fields), 401, 403, 404 (goal ไม่มี/ของคนอื่น), 409 (ซ้ำวัน หรือ goal ended) |
| `GET /api/goals/:id/progress` | Participant (เจ้าของ goal) | – | **200** `{ "progress": { total_minutes, target_minutes, percent } }` | 401, 403, 404 |
| `GET /api/goals/:id/entries` | Participant (เจ้าของ goal) | – | **200** `{ "entries": [ {id, entry_date, minutes}, ... ] }` เรียง `entry_date DESC` | 401, 403, 404 |

- response ไม่มีฟิลด์ `goal_id`, `user_id`, `created_at`, `updated_at`, `password_hash`
- ข้อความใน `fields` (คงที่):
  - `entry_date: "date YYYY-MM-DD"` — รูปแบบผิด/วันที่ไม่มีจริง
  - `entry_date: "must not be in the future"` — วันที่อนาคต
  - `entry_date: "must be within last 7 days"` — เกิน 7 วันที่ผ่านมา
  - `entry_date: "must be within goal period"` — นอกช่วง [start_date, end_date] ของ goal
  - `minutes: "integer required"` — ไม่ใช่จำนวนเต็ม / ไม่ใช่ตัวเลข / ทศนิยม
  - `minutes: "out of template range"` — นอกช่วง [template.min_value, template.max_value]
- 409 ตอบ `{"error":"Conflict"}` (มีอยู่แล้วใน `errors.js` CLIENT_MESSAGES)

### ผลต่อโครงสร้างโค้ด

| ชั้น | เปลี่ยน? | รายละเอียด |
|---|---|---|
| ฐานข้อมูล | **ไม่เปลี่ยน schema** | ใช้ตาราง `habit_entries` และ constraint `uq_habit_entries_goal_date` เดิม |
| API | เปลี่ยน | เพิ่ม `routes/entries.js`; mount ใน `app.js` ที่ `/api/goals` |
| Logic | เปลี่ยน | เพิ่มฟังก์ชัน `validateEntry(body, goal, template, today)` ใน `src/lib/validate.js` |
| DB client | **ไม่เปลี่ยน** | DATE type parser ตั้งไว้แล้วใน `db.js` |
| UI | ไม่เปลี่ยนใน contract นี้ | อยู่ใน UI-01 (issue #6) |

---

## 3. Acceptance Criteria

| ID | เงื่อนไข (ผลที่สังเกตได้) | Requirement |
|---|---|---|
| **AC-F05-01** | Participant บันทึก entry ด้วยข้อมูลถูกต้อง → 201; `id, entry_date, minutes` อยู่ใน response; แถวอยู่ใน DB; response ไม่มี `goal_id/user_id/created_at/updated_at` | FR-08 |
| **AC-F05-02** | บันทึกซ้ำวันเดียวกันใน goal เดียวกัน → 409 `{"error":"Conflict"}`; ส่ง 5 request พร้อมกัน → สำเร็จ 1 ที่เหลือ 409 ไม่มี 500; DB มีแถวเดียว | BR-01, NFR-05 |
| **AC-F05-03** | `minutes` ไม่ใช่จำนวนเต็ม (ทศนิยม, string, ≤0, null, ขาด) → 400 `fields.minutes`; `minutes` นอกช่วง template → 400 `fields.minutes` | BR-02 |
| **AC-F05-04** | `entry_date` อนาคต → 400; เกิน 7 วัน → 400; นอกช่วง goal → 400; รูปแบบผิด/ไม่มีจริง → 400; ทุกกรณีมี `fields.entry_date` | BR-03 |
| **AC-F05-05** | บันทึกใน goal ที่ `end_date` ผ่านไปแล้ว (ended) → 409; บันทึก `entry_date = end_date = วันนี้` → 201 | BR-05 |
| **AC-F05-06** | PM เรียก `POST /api/goals/:id/entries` → 403; Participant เรียก endpoint ภายใต้ goal ของคนอื่น → 404 | BR-08 |
| **AC-F06-01** | `GET /api/goals/:id/progress` คืน `total_minutes` (ยอดรวมจริง), `target_minutes` (จาก goal), `percent` (1 ทศนิยม capped ที่ 100.0) | FR-09, BR-06 |
| **AC-F06-02** | `GET /api/goals/:id/entries` คืนรายการ entry เรียง `entry_date DESC`; เห็นเฉพาะ entry ของ goal ตนเอง | FR-10, BR-08 |
| **AC-F06-03** | PM เรียก `GET progress/entries` → 403; Participant เรียก endpoint ของ goal คนอื่น → 404 | BR-08 |

---

## 4. Software Test Specification

ไฟล์เทสต์: `backend/tests/entries.test.js` (integration), `backend/src/lib/validate.js` (unit ตรวจผ่าน existing `validate.test.js`)  
Level: API integration (supertest + Postgres จริง)  
สภาพแวดล้อม: ใช้ `helpers/test-env.js`; ผู้ใช้ทดสอบสร้างเองผ่าน `createUser()`; `entry_date` คำนวณจาก `todayBkk()` + `addDays()` ไม่ hard-code

| ID Test | AC | Precondition | Action | Expected |
|---|---|---|---|---|
| **TEST-F05-01** | AC-F05-01 | Participant login, มี active goal | `POST /api/goals/:id/entries` ด้วย entry_date = วันนี้, minutes อยู่ในช่วง template | 201; body มี `entry.id, entry.entry_date, entry.minutes`; ไม่มี `goal_id/user_id/created_at/updated_at`; query DB พบแถว |
| **TEST-F05-02a** | AC-F05-02 | เหมือนข้างบน, มี entry วันนี้แล้ว | `POST` ซ้ำวันเดิม | 409 `{"error":"Conflict"}`; DB ยังมีแถวเดียว |
| **TEST-F05-02b** | AC-F05-02 | ไม่มี entry | ส่ง 5 request พร้อมกัน (Promise.all) | สำเร็จ 1 (201); 409 ที่เหลือ 4; DB มีแถวเดียว; ไม่มี status 500 |
| **TEST-F05-03a** | AC-F05-03 | Participant, active goal | `minutes` = 1.5 (ทศนิยม), "60" (string), null, ขาด field | ทุกกรณี 400 มี `fields.minutes` |
| **TEST-F05-03b** | AC-F05-03 | template min=10, max=120 | `minutes` = 9 (< min), 121 (> max), 10 (ขอบล่าง), 120 (ขอบบน) | 9, 121 → 400 `fields.minutes`; 10, 120 → 201 |
| **TEST-F05-04a** | AC-F05-04 | Participant, active goal | `entry_date` = พรุ่งนี้ (อนาคต) | 400 `fields.entry_date` |
| **TEST-F05-04b** | AC-F05-04 | เหมือนข้างบน | `entry_date` = วันนี้ − 8 วัน (เกิน 7 วัน) | 400 `fields.entry_date` |
| **TEST-F05-04c** | AC-F05-04 | goal ที่ start_date = วันนี้ − 2 วัน | `entry_date` = วันนี้ − 3 วัน (ก่อน start_date) | 400 `fields.entry_date` |
| **TEST-F05-04d** | AC-F05-04 | เหมือนข้างบน | `entry_date` = "2026-02-30" (ไม่มีจริง), "not-a-date" | ทั้งคู่ 400 `fields.entry_date` |
| **TEST-F05-04e** | AC-F05-04 | เหมือนข้างบน | `entry_date` = วันนี้ (ขอบ) | 201 |
| **TEST-F05-04f** | AC-F05-04 | เหมือนข้างบน | `entry_date` = วันนี้ − 7 วัน (ขอบล่าง 7 วัน) | 201 (ถ้าอยู่ใน goal period) |
| **TEST-F05-05a** | AC-F05-05 | goal ที่ end_date = เมื่อวาน (ตั้งผ่าน SQL) | `POST /entries` | 409 `{"error":"Conflict"}` |
| **TEST-F05-05b** | AC-F05-05 | goal ที่ start_date = วันนี้, end_date = วันนี้ | `POST /entries` entry_date = วันนี้, minutes ถูกต้อง | 201 |
| **TEST-F05-06a** | AC-F05-06 | PM login | `POST /api/goals/:id/entries` | 403 |
| **TEST-F05-06b** | AC-F05-06 | Participant B ที่ไม่ใช่เจ้าของ goal | `POST /api/goals/:id/entries` (goal ของ A) | 404 |
| **TEST-F06-01a** | AC-F06-01 | Participant มี 2 entries: 60 min, 90 min; target_minutes = 200 | `GET /api/goals/:id/progress` | 200 `{ total_minutes:150, target_minutes:200, percent:75.0 }` |
| **TEST-F06-01b** | AC-F06-01 | total_minutes > target_minutes (เกินเป้า) | `GET progress` | percent = 100.0 (capped); total_minutes = ค่าจริง |
| **TEST-F06-01c** | AC-F06-01 | ไม่มี entry | `GET progress` | total_minutes = 0, percent = 0.0 |
| **TEST-F06-02** | AC-F06-02 | มี 3 entries วันต่างกัน | `GET /api/goals/:id/entries` | 200 `{ entries: [...] }` เรียง entry_date DESC; ไม่มี `goal_id/user_id` |
| **TEST-F06-03a** | AC-F06-03 | PM login | `GET /api/goals/:id/progress` และ `GET /api/goals/:id/entries` | 403 ทั้งคู่ |
| **TEST-F06-03b** | AC-F06-03 | Participant B | endpoint ของ goal A | 404 ทั้งคู่ |
| **TEST-F05-07** | NFR-01 | ไม่ login | `POST /entries`, `GET /progress`, `GET /entries` | 401 (เพิ่มใน PROTECTED_ENDPOINTS ของ rbac.test.js) |

---

## 5. Definition of Done และหลักฐาน

- [ ] contract นี้ commit ก่อนโค้ดและเทสต์ (commit แยก)
- [ ] เทสต์ทุกข้อใน §4 เขียนก่อนโค้ดและบันทึกผลรัน **fail** พร้อม commit — ผลรัน `evidence/F-05-F-06-red-run.txt`
- [ ] โค้ดครบตาม §2 และ `npm test` ผ่านทุกเทสต์ — ผลรัน `evidence/F-05-F-06-green-run.txt`
- [ ] เทสต์ของ F-07, F-01, F-02, F-03, F-04 ยังผ่าน (regression) และ endpoint ใหม่อยู่ใน `PROTECTED_ENDPOINTS`
- [ ] response ไม่มี `goal_id`, `user_id`, secret; ไม่มี SQL/stack ใน error
- [ ] `docs/traceability.md` อัปเดตแถว FR-08–10, BR-01, BR-02 (entry), BR-03, BR-05 (entry), BR-06, BR-08 (entry/progress), BR-09 (entry), NFR-05 ด้วยเลข AC/TEST และ commit SHA
- [ ] PR เข้า `sprint-1-staging` ผ่าน review จาก @Alongkron1234

---

## 6. ประวัติการเปลี่ยนแปลง Contract

| วันที่ | การเปลี่ยนแปลง | เหตุผล |
|---|---|---|
| 2026-11-08 | สร้าง v1.0 (ร่าง) | ก่อนเริ่ม implement |
