# Contract: F-10 แก้ไขเป้าหมาย

**Sprint:** 2 | **Issue:** #43 | **Branch:** `feature/f10-edit-goal`
**อ้างอิง SRS:** FR-12, BR-03, BR-04, BR-05, BR-06, BR-08, NFR-01, NFR-06
**เวอร์ชัน:** 1.1 | **วันที่แก้ล่าสุด:** 2026-11-28
**ผู้ทำ:** Alongkron1234 | **ผู้ review:** atiwit

---

## 1. Feature SDS

### พฤติกรรมและ Workflow

Participant แก้ยอดเป้าหมาย (`target_minutes`) หรือวันสิ้นสุด (`end_date`) ของเป้าหมายตนเองที่ยัง active ได้ (FR-12) entry ที่บันทึกไว้แล้วต้องคงอยู่ครบและไม่เปลี่ยนค่า ส่วนความคืบหน้า (BR-06) คำนวณใหม่จากยอดเป้าหมายใหม่ทันที เพราะคำนวณจากข้อมูลปัจจุบัน

ระบบตรวจตามลำดับนี้: (1) login แล้ว, (2) เป็น Participant, (3) เป็นเจ้าของ goal, (4) goal ยัง active (S-1), (5) ค่าใหม่ถูกต้อง (S-4 ถึง S-8)

ใช้ middleware จาก F-02 แบบเดียวกับ F-04/F-05: `requireAuth` → `requireRole('participant')` → `ownedBy(goalOwner)`

Workflow ฝั่ง UI (ดู §2 UI):
1. Participant เปิดหน้ารายละเอียด goal ของตนเอง (goal ที่ active จะมีปุ่ม "แก้ไขเป้าหมาย")
2. กดปุ่ม → ฟอร์มแสดงยอดเป้าหมายและวันสิ้นสุดปัจจุบัน → แก้ แล้วกด "บันทึก" → `PATCH`
3. สำเร็จ: ปิดฟอร์ม แสดงค่าใหม่และรีเฟรช progress / ผิดพลาด: แสดงข้อความใต้ช่องที่ผิด

### กฎและการตัดสินใจ (ขอให้ reviewer ยืนยัน)

| # | การตัดสินใจ | เหตุผล |
|---|---|---|
| S-1 | แก้ได้เฉพาะ goal ที่ **active** (`end_date >= วันนี้`) goal ที่จบแล้ว → **409** `{"error":"Conflict"}` | BR-05: goal ที่ ended ไม่รับการเปลี่ยนแปลง และกันการ "ชุบชีวิต" goal ที่จบแล้ว ซึ่งอาจชน `uq_goals_active` (1 active ต่อ template) และทำให้ `status` ที่เก็บใน DB ไม่ตรงกับสถานะที่คำนวณ (F-04 S-7) |
| S-2 | แก้ได้เฉพาะ `target_minutes` และ `end_date` (ส่งได้อย่างใดอย่างหนึ่งหรือทั้งสอง) field อื่นทุกตัว เช่น `template_id`, `start_date`, `status`, `user_id`, `id` → **400** `fields.<ชื่อ field>` = `"not editable"` | FR-12 ระบุแค่สองอย่างนี้; ไม่เปลี่ยน `start_date` จึงไม่มี entry ตกนอกช่วงด้านต้น; ไม่เปลี่ยน template จึงไม่ชน BR-05 (กัน mass-assignment, BR-08, NFR-06) |
| S-3 | ถ้าไม่ส่ง `target_minutes` และ `end_date` เลย (body ว่าง หรือมีแต่ field ที่แก้ไม่ได้) → **400** `fields.body` = `"target_minutes or end_date required"` | ไม่ให้ PATCH ที่ไม่ทำอะไรได้ 200 |
| S-4 | `target_minutes` ต้องเป็นจำนวนเต็มบวก (ชนิด number ไม่ใช่ string/null/ทศนิยม) ไม่ผ่าน → `"positive integer"`; และต้อง **ไม่เกิน 350400** (= 960 นาที × 365 วัน ยอดสูงสุดที่ทำได้จริง) เกิน → `"must not exceed 350400"` **ไม่บังคับ** ให้มากกว่าผลรวมนาทีที่บันทึกแล้ว | BR-04; ลดยอดต่ำกว่าที่ทำไปแล้วได้ BR-06 รองรับ (แสดง % สูงสุด 100 แต่ยอดรวมจริงยังเต็ม); เพดานกันค่าที่เกินช่วงของคอลัมน์ `INTEGER` (เช่น 3000000000) ซึ่งทำให้ Postgres error และได้ 500 แทน 400 |
| S-5 | `end_date` ต้องเป็นวันที่จริงรูปแบบ `YYYY-MM-DD` ไม่ผ่าน → `"date YYYY-MM-DD"`; ก่อน `start_date` → `"must not be before start_date"`; ระยะเวลาจาก `start_date` ถึง `end_date` (นับรวมสองวัน) เกิน 365 วัน → `"duration must not exceed 365 days"` | BR-04; ข้อความเดียวกับ `validateGoal` ของ F-04 |
| S-6 | `end_date` ต้องไม่ก่อนวันนี้ (วันนี้ผ่าน) ไม่ผ่าน → `"must not be in the past"` | ตั้งวันที่ผ่านมาแล้วจะทำให้ goal จบทันที ซึ่งขัดกับ S-1 (ถ้าต้องการให้จบ ให้ตั้งเป็นวันนี้) และเพราะ entry ทุกแถวมีวันที่ไม่เกินวันนี้ (BR-03) กฎนี้จึงรับประกันด้วยว่า entry เดิมยังอยู่ในช่วงเป้าหมาย ไม่ต้องตรวจเทียบ entry ล่าสุดแยกต่างหาก |
| S-7 | ลำดับการตรวจ `end_date` ใน field เดียว: รูปแบบ (S-5) → ก่อน `start_date` (S-5) → ระยะเวลาเกิน 365 วัน (S-5) → ก่อนวันนี้ (S-6) และรายงาน **ข้อความแรกที่ไม่ผ่านเพียงข้อความเดียว** ต่อ field | `fields.<ชื่อ>` เป็นสตริงเดียวต่อ field; ทำให้ผลทำนายได้ |
| S-8 | เมื่อได้ 400 ให้รายงาน **ทุก field ที่ผิดพร้อมกัน** ใน `fields` | client แก้ได้ในรอบเดียว (แบบเดียวกับ F-11 S-13) |
| S-9 | ส่งทั้งสอง field พร้อมกันให้สำเร็จทั้งคู่หรือไม่เปลี่ยนเลย (อัปเดตด้วยคำสั่ง SQL เดียว) คำสั่ง `UPDATE` ต้องมีเงื่อนไข `WHERE id = $1 AND user_id = $2 AND end_date >= $today` ด้วย ถ้าไม่มีแถวถูกอัปเดต → 409 | ไม่ให้ได้ค่าที่แก้ครึ่งเดียว; กัน race กรณี goal จบพอดีตอนเที่ยงคืนระหว่างที่ตรวจ S-1 กับตอนบันทึก |
| S-10 | แก้สำเร็จ → **200** `{ "goal": { id, template_id, target_minutes, start_date, end_date, status } }` รูปแบบเดียวกับ `GET /api/goals/:id` (F-04) โดย `status` คำนวณจากวันที่ (F-04 S-7) ไม่แก้คอลัมน์ `status` ใน DB; ตั้ง `updated_at = now()` เอง (ไม่มี trigger); entry ของ goal ไม่ถูกแตะ | NFR-06: ไม่ส่ง `user_id`, `created_at`, `updated_at`; ความคืบหน้าเปลี่ยนตามเพราะ BR-06 คำนวณสด |
| S-11 | PM เรียก endpoint → **403**; Participant เรียกกับ goal ของคนอื่น หรือ id ที่ไม่ใช่จำนวนเต็มบวก/ไม่มีอยู่ → **404** | BR-08 (แบบเดียวกับ F-05 S-7) |
| S-12 | "วันนี้" ใช้ `todayBangkok()` จาก `src/lib/dates.js` ส่วนเทสต์ใช้ `todayBkk()` จาก `helpers/fixtures.js` ซึ่งต้องคืนค่าเดียวกัน (Asia/Bangkok, `YYYY-MM-DD`) | แบบเดียวกับ F-05 S-2 |
| S-13 | ข้อความใน `fields` เป็นค่าคงที่ ไม่ใช้ `err.message` ของ library | แบบเดียวกับ F-05 S-10 |
| S-14 | ลำดับการตอบเมื่อผิดหลายข้อ: 401 → 403 → 404 → 409 (S-1) → 400 | ให้ผลที่ทำนายได้ และไม่เปิดเผยข้อมูลของ goal ที่ไม่ใช่ของตน |
| S-15 | UI แสดงปุ่ม "แก้ไขเป้าหมาย" เฉพาะ goal ที่ active แต่ backend ยังตรวจ S-1 เองเสมอ (UI ไม่ใช่การป้องกัน) | BR-08, NFR-01 |

### ผลต่อ feature อื่น (ตรวจแล้ว ไม่ต้องแก้ contract อื่น)

- **F-05:** หลังขยาย `end_date` บันทึก entry ใหม่ได้ถึงวันสิ้นสุดใหม่ (แต่ยังห้ามวันอนาคตตาม BR-03) หลังย่น ก็บันทึกได้ถึงวันสิ้นสุดใหม่เท่านั้น
- **F-06:** ความคืบหน้าใช้ `target_minutes` ใหม่ทันที
- **F-11:** กฎ "แก้/ลบ entry ได้เมื่อ goal ยัง active" ใช้ `end_date` ปัจจุบัน จึงตามค่าใหม่โดยอัตโนมัติ ไม่ต้องแก้ contract F-11

### Dependencies

F-04 (`routes/goals.js`, `validateGoal`, สถานะที่คำนวณ), F-05/F-06 (entry และ progress สำหรับตรวจผลหลังแก้), F-02 (middleware), หน้ารายละเอียด goal ที่มีอยู่แล้ว (สำหรับ UI)

### นอกขอบเขต

แก้ `start_date` หรือ template, เปิด goal ที่จบแล้วกลับมาใหม่, ประวัติการแก้ไข/undo, ลบ goal

---

## 2. สเปก API / Data / UI

### API (JSON ทั้งหมด)

| Method + Path | สิทธิ์ | Request body | สำเร็จ | ล้มเหลว |
|---|---|---|---|---|
| `PATCH /api/goals/:id` | Participant (เจ้าของ goal) | `{ "target_minutes"?: integer, "end_date"?: "YYYY-MM-DD" }` อย่างน้อยหนึ่งตัว | **200** `{ "goal": { id, template_id, target_minutes, start_date, end_date, status } }` | 400, 401, 403, 404, 409 |

รูปแบบ body ของ error (เหมือน F-05/F-11):

| Status | Body |
|---|---|
| 400 | `{ "error": "Bad Request", "fields": { "<field>": "<ข้อความคงที่>" } }` |
| 401 | `{ "error": "Unauthorized" }` |
| 403 | `{ "error": "Forbidden" }` |
| 404 | `{ "error": "Not Found" }` |
| 409 | `{ "error": "Conflict" }` |

ไม่มี SQL, stack trace หรือข้อความของ library ใน body ทุกกรณี

ข้อความใน `fields` (ค่าคงที่):
- `target_minutes: "positive integer"` — ไม่ใช่จำนวนเต็มบวก / string / null / ทศนิยม
- `target_minutes: "must not exceed 350400"` — เกินเพดาน (S-4)
- `end_date: "date YYYY-MM-DD"` — ไม่ใช่วันที่จริงรูปแบบนี้
- `end_date: "must not be before start_date"`
- `end_date: "duration must not exceed 365 days"`
- `end_date: "must not be in the past"`
- `<field อื่น>: "not editable"`
- `body: "target_minutes or end_date required"`

### UI

| ส่วน | รายละเอียด |
|---|---|
| ตำแหน่ง | การ์ดข้อมูลเป้าหมายในหน้ารายละเอียด goal ของ Participant |
| ภาษา | ข้อความบนหน้าจอใช้ภาษาเดียวกับหน้าปัจจุบัน (อังกฤษ) ข้อความภาษาไทยในตารางนี้เป็นความหมายที่ต้องการ |
| ปุ่ม | "แก้ไขเป้าหมาย" แสดงเฉพาะ goal ที่ active (S-15) |
| ฟอร์ม | ช่องตัวเลข "ยอดเป้าหมาย (นาที)" และช่องวันที่ "วันสิ้นสุด" เริ่มต้นด้วยค่าปัจจุบัน; ปุ่ม "บันทึก" / "ยกเลิก" |
| สำเร็จ | ปิดฟอร์ม แสดงค่าใหม่ และรีเฟรช progress |
| ผิดพลาด | 400: แสดงข้อความของ `fields.<ชื่อ>` ใต้ช่องนั้น **ผ่าน `friendlyFields()` ใน `frontend/src/lib/messages.js`** แบบเดียวกับหน้าอื่น (ไม่แสดงข้อความดิบของ API); 409: แสดง "เป้าหมายนี้จบแล้ว แก้ไขไม่ได้" แล้วรีเฟรชหน้า |
| ข้อความที่ผู้ใช้เห็น | `positive integer` → "Enter a whole number greater than 0." (มีอยู่แล้ว); เพิ่มใน `messages.js`: `must not exceed 350400` → "A goal can be at most 350400 minutes." และ `end_date` + `must not be in the past` → "The end date cannot be in the past." **ข้อควรระวัง:** ปัจจุบัน `FRIENDLY` map ด้วยข้อความอย่างเดียว และ `must not be in the past` แปลเป็น "The start date cannot be in the past." ทุก field ต้องเพิ่มการ map ตาม field (เช่น `FRIENDLY_BY_FIELD['end_date']`) ก่อน fallback ไป `FRIENDLY` โดยไม่เปลี่ยนผลของ `start_date` ใน F-04 |

### ผลต่อโครงสร้างโค้ด

| ชั้น | เปลี่ยน? | รายละเอียด |
|---|---|---|
| ฐานข้อมูล | **ไม่เปลี่ยน schema** | ใช้ตาราง `goals` เดิม (มี `updated_at`) |
| API | เปลี่ยน | เพิ่ม route `PATCH /:id` ใน `routes/goals.js` |
| Logic | เปลี่ยน | เพิ่ม `validateGoalUpdate(body, goal, today)` ใน `src/lib/validate.js` (ฟังก์ชันบริสุทธิ์) |
| UI | เปลี่ยน | เพิ่มปุ่มและฟอร์มแก้ไขในหน้ารายละเอียด goal; เพิ่มข้อความและการ map ตาม field ใน `frontend/src/lib/messages.js` |

---

## 3. Acceptance Criteria

| ID | เงื่อนไข (ผลที่สังเกตได้) | Requirement |
|---|---|---|
| **AC-F10-01** | Participant แก้ `target_minutes` ของ goal ตนเองที่ active ด้วยค่าที่ถูกต้อง → 200; response มี `id, template_id, target_minutes (ค่าใหม่), start_date, end_date, status` และไม่มี `user_id/created_at/updated_at`; DB เก็บค่าใหม่และ `updated_at` ใหม่กว่าเดิม; `start_date`, `end_date` ไม่เปลี่ยน | FR-12, NFR-06 |
| **AC-F10-02** | แก้ `end_date` อย่างเดียว (ขยายและย่นในขอบเขตที่อนุญาต รวมค่าขอบ) → 200 และ `target_minutes` ไม่เปลี่ยน; ส่งทั้งสอง field พร้อมกัน → 200 ทั้งคู่เปลี่ยน; ถ้า field ใดผิด ไม่มี field ใดเปลี่ยนใน DB | FR-12, BR-04 |
| **AC-F10-03** | entry ทั้งหมดของ goal คงอยู่ครบ ค่าไม่เปลี่ยนหลังแก้ goal และ `GET .../progress` ใช้ยอดเป้าหมายใหม่ (`total_minutes` เท่าเดิม, `percent` ตามเป้าใหม่); ลดเป้าต่ำกว่ายอดรวม → `percent = 100`, `total_minutes` เต็ม | FR-12, BR-06 |
| **AC-F10-04** | `target_minutes` ไม่ใช่จำนวนเต็มบวก (0, ติดลบ, ทศนิยม, string, null) → 400 `fields.target_minutes = "positive integer"`; เกิน 350400 (รวมค่าที่เกินช่วง `INTEGER`) → 400 `"must not exceed 350400"` ไม่ใช่ 500; 350400 พอดี → 200; DB ไม่เปลี่ยนเมื่อได้ 400 | BR-04 |
| **AC-F10-05** | `end_date` ไม่ถูกต้อง: รูปแบบผิด, ก่อน `start_date`, ระยะเวลาเกิน 365 วัน, ก่อนวันนี้ → 400 `fields.end_date` ด้วยข้อความตาม §2 (ข้อความแรกที่ไม่ผ่านตาม S-7); ค่าขอบ (`end_date` = วันนี้ แม้มี entry วันนี้, ระยะเวลา 365 วันพอดี) → 200 และ entry เดิมยังอยู่ในช่วง; DB ไม่เปลี่ยนเมื่อได้ 400 | BR-03, BR-04 |
| **AC-F10-06** | ส่ง field ที่แก้ไม่ได้ (`template_id`, `start_date`, `status`, `user_id`, `id`) → 400 `fields.<ชื่อ> = "not editable"`; body ไม่มีทั้ง `target_minutes` และ `end_date` → 400 `fields.body`; ผิดหลาย field จะรายงานครบ (S-8); DB ไม่เปลี่ยน | BR-08, NFR-06 |
| **AC-F10-07** | goal ที่จบแล้ว (`end_date < วันนี้`) แก้ไม่ได้ → 409 แม้ค่าที่ส่งถูกต้อง; goal ที่ `end_date` = วันนี้ ยังแก้ได้ → 200; DB ไม่เปลี่ยนเมื่อได้ 409 | BR-05 |
| **AC-F10-08** | PM เรียก PATCH → 403; Participant B เรียกกับ goal ของ A → 404 และ goal ของ A ไม่เปลี่ยน; id ผิดรูปแบบ/ไม่มีอยู่ → 404; ไม่ login → 401 | BR-08, NFR-01 |
| **AC-F10-09** | ใน UI Participant แก้ยอดเป้าหมายและวันสิ้นสุดของ goal ที่ active ได้ ค่าและ progress บนหน้าจออัปเดตตามและยังคงอยู่หลัง reload; goal ที่จบแล้วไม่มีปุ่มแก้ไข; ค่าที่ผิดแสดงข้อความที่แปลแล้ว (ตาม §2 UI) ใต้ช่อง; ข้อความของ `start_date` ในหน้าสร้าง goal (F-04) ไม่เปลี่ยน | FR-12 |

---

## 4. Software Test Specification

ไฟล์เทสต์: `backend/tests/goal-edit.test.js` (integration), เพิ่มเคสใน `backend/tests/validate.test.js` (unit ของ `validateGoalUpdate`) และเพิ่ม endpoint ใน `backend/tests/rbac.test.js`

สภาพแวดล้อม: ใช้ `helpers/test-env.js` (ตั้งค่า env) และ `helpers/fixtures.js` (`createUser()`, `loginAs()`, `todayBkk()`, `addDays()`); คำนวณวันที่จาก `todayBkk()` + `addDays()` ไม่ hard-code; goal และ entry เก่าสร้างผ่าน SQL โดยตรง; **ทุก test ใช้ข้อมูลที่ setup ใหม่ของตัวเอง ไม่พึ่งผลของ test อื่น**

เว้นแต่ precondition จะระบุไว้เป็นอย่างอื่น goal มาจาก template ที่ `min_value=10, max_value=120` เป็นของ Participant A, `target_minutes=600`, `start_date = วันนี้ − 10`, `end_date = วันนี้ + 20` (active)

| ID Test | AC | Level | Precondition | Input / Action | Expected |
|---|---|---|---|---|---|
| **TEST-F10-01** | AC-F10-01 | API integration | goal ปกติ; จำ `updated_at` เดิมไว้ (ตั้งย้อนหลังผ่าน SQL) | `PATCH` `{target_minutes: 900}` | 200; `goal.target_minutes = 900`, `start_date`/`end_date` เดิม, `status = "active"`, ไม่มี `user_id/created_at/updated_at`; DB `target_minutes = 900` และ `updated_at` ใหม่กว่าเดิม |
| **TEST-F10-02a** | AC-F10-02 | API integration | goal ปกติ | `PATCH` `{end_date: วันนี้ + 40}` แล้ว `{end_date: วันนี้ + 5}` | ทั้งคู่ 200; `end_date` ตามที่ส่ง; `target_minutes` = 600 |
| **TEST-F10-02b** | AC-F10-02 | API integration | goal ปกติ | `PATCH` `{target_minutes: 700, end_date: วันนี้ + 30}` | 200; ทั้งสองค่าเปลี่ยนใน DB |
| **TEST-F10-02c** | AC-F10-02 | API integration | goal ปกติ | `PATCH` `{target_minutes: 700, end_date: "ไม่ใช่วันที่"}` | 400 `fields.end_date`; DB: `target_minutes` ยัง 600 (ไม่เปลี่ยนครึ่งเดียว) |
| **TEST-F10-03a** | AC-F10-03 | API integration | goal target=200; entries 60 (วันนี้ − 2) และ 90 (วันนี้) | `PATCH` `{target_minutes: 300}` แล้ว `GET progress` และ `GET entries` | `total_minutes=150`, `percent=50`; entries ยัง 2 แถว ค่า 60 และ 90 |
| **TEST-F10-03b** | AC-F10-03 | API integration | เหมือน 03a | `PATCH` `{target_minutes: 100}` แล้ว `GET progress` | `total_minutes=150`, `percent=100` (ไม่เกิน 100) |
| **TEST-F10-04** | AC-F10-04 | API integration | goal ปกติ | (a) `target_minutes` = 0, -5, 1.5, "100", null (b) 350401 และ 3000000000 (c) 350400 | (a) 400 `fields.target_minutes = "positive integer"` (b) 400 `fields.target_minutes = "must not exceed 350400"` (ไม่ใช่ 500); DB = 600 ทั้ง (a) และ (b) (c) 200 |
| **TEST-F10-05a** | AC-F10-05 | API integration | goal ปกติ | `end_date` = "2026-13-45", "abc", 20261130 | ทุกกรณี 400 `fields.end_date = "date YYYY-MM-DD"`; DB เดิม |
| **TEST-F10-05b** | AC-F10-05 | API integration | goal ปกติ | `end_date` = `start_date − 1`; `end_date` = `start_date + 365` (ระยะเวลา 366 วัน) | แรก 400 `fields.end_date = "must not be before start_date"` (ข้อความแรกตาม S-7 แม้ผลก็อยู่ในอดีตด้วย); หลัง 400 `fields.end_date = "duration must not exceed 365 days"`; DB เดิม |
| **TEST-F10-05c** | AC-F10-05 | API integration | goal ปกติ ไม่มี entry | `end_date` = วันนี้ − 1 | 400 `fields.end_date = "must not be in the past"`; DB เดิม |
| **TEST-F10-05d** | AC-F10-05 | API integration | goal ปกติ; entries วันที่ วันนี้ − 1 และ วันนี้ | `PATCH` `{end_date: วันนี้}` (ย่นสุดที่อนุญาต) แล้ว `GET entries` และ `GET progress` | 200; entries ยัง 2 แถว ค่าเดิม; `total_minutes` เท่าเดิม |
| **TEST-F10-05e** | AC-F10-05 | API integration | goal ที่ `start_date = วันนี้ − 10` | `end_date` = `start_date + 364` (ระยะเวลา 365 วันพอดี) | 200 |
| **TEST-F10-06a** | AC-F10-06 | API integration | goal ปกติ | `{target_minutes: 700, template_id: 999}`, `{target_minutes: 700, start_date: "<วันอื่น>"}`, `{status: "ended"}` | 400 มี `fields.template_id` / `fields.start_date` / `fields.status` = "not editable" (กรณีที่สามมี `fields.body` ด้วย); DB เดิม |
| **TEST-F10-06b** | AC-F10-06 | API integration | goal ปกติ | `{}` และ `{target_minutes: 1.5, start_date: "2026-01-01"}` | แรก 400 `fields.body`; หลัง 400 มีทั้ง `fields.target_minutes` และ `fields.start_date` (S-8) |
| **TEST-F10-07a** | AC-F10-07 | API integration | goal ที่ `end_date = วันนี้ − 1` (SQL) | `PATCH` `{target_minutes: 700}` และ `{end_date: วันนี้ + 10}` | ทั้งคู่ 409 `{"error":"Conflict"}`; DB เดิม |
| **TEST-F10-07b** | AC-F10-07 | API integration | goal ที่ `end_date = วันนี้` | `PATCH` `{target_minutes: 700}` | 200 |
| **TEST-F10-07c** | AC-F10-07 | Unit/integration ของ route | จำลองให้ goal จบระหว่างตรวจกับบันทึก: ตั้ง `end_date = วันนี้ − 1` ผ่าน SQL หลังโหลด goal (หรือเรียก query update โดยตรงด้วย `today` ที่เลยวันสิ้นสุด) | `UPDATE` ตาม S-9 | ไม่มีแถวถูกอัปเดต → 409; DB เดิม |
| **TEST-F10-08a** | AC-F10-08 | API integration | PM login | `PATCH` | 403; goal ไม่เปลี่ยน |
| **TEST-F10-08b** | AC-F10-08 | API integration | Participant B, goal ของ A (มี positive control ว่า A แก้ได้ก่อน) | `PATCH` โดย B | 404; goal ของ A ไม่เปลี่ยนจากค่าที่ A แก้ |
| **TEST-F10-08c** | AC-F10-08 | API integration | Participant A (มี positive control) | `PATCH /api/goals/<id>` โดย id = "abc", 0, -1, 999999 | 404 ทุกกรณี |
| **TEST-F10-08d** | AC-F10-08 | API integration | ไม่ login | `PATCH /api/goals/1` | 401 (เพิ่ม `['patch','/api/goals/1']` ใน `PROTECTED_ENDPOINTS` ของ `rbac.test.js`) |
| **TEST-F10-09** | AC-F10-04, AC-F10-05, AC-F10-06 | Unit | – | `validateGoalUpdate` กับ target 0/1/1.5/"1"/null/350400/350401; end_date รูปแบบผิด, ก่อน start, ระยะเวลา 365 และ 366 วัน, ก่อนวันนี้, = วันนี้ และกรณีผิดหลายข้อใน end_date (ตรวจว่าได้ข้อความแรกตาม S-7); field เกิน; body ว่าง; ผิดหลาย field | ข้อความตรงตาม S-2 ถึง S-8 |
| **TEST-F10-10** | AC-F10-09 | UI (manual demo พร้อม screenshot; ใช้ E2E ถ้าโปรเจกต์มี) | Participant, goal active มี entry | แก้ยอดเป้าหมายเป็นค่าใหม่ → reload; ใส่ 0 → บันทึก; ตั้งวันสิ้นสุดเป็นวันที่ผ่านมาแล้ว → บันทึก; เปิด goal ที่จบแล้ว | ค่าใหม่และ progress อัปเดตและคงอยู่หลัง reload; 0 แสดง "Enter a whole number greater than 0." ใต้ช่อง; วันสิ้นสุดในอดีตแสดง "The end date cannot be in the past." (ไม่ใช่ "start date"); goal ที่จบแล้วไม่มีปุ่มแก้ไข |
| **TEST-F10-11** | AC-F10-09 | Frontend unit (vitest) | – | `friendlyFields({end_date: "must not be in the past"})`, `friendlyFields({start_date: "must not be in the past"})`, `friendlyFields({target_minutes: "must not exceed 350400"})` | "The end date cannot be in the past."; "The start date cannot be in the past." (เดิม); "A goal can be at most 350400 minutes." |

---

## 5. Definition of Done และหลักฐาน

- [ ] contract นี้ commit ก่อนโค้ดและเทสต์ (commit แยก) — `<sha>`
- [ ] เทสต์ทุกข้อใน §4 (ยกเว้น TEST-F10-10 แต่รวม TEST-F10-11) เขียนก่อนโค้ด และบันทึกผลรันที่ **fail** พร้อม commit — `<sha>`, ผลรัน `evidence/F-10-red-run.txt`
- [ ] โค้ดครบตาม §2 (API, Logic, UI) และ `npm test` ผ่านทุกเทสต์ — `<sha>`, ผลรัน `evidence/F-10-green-run.txt` (ระบุจำนวน passed/failed/skipped)
- [ ] TEST-F10-10 รันบน candidate แล้ว พร้อม screenshot ที่ระบุ version — `evidence/F-10-ui-*.png`
- [ ] **ทั้ง test suite** ยังผ่าน (regression ของ F-01 ถึง F-07 และ feature อื่นใน Sprint 2 โดยเฉพาะ BR-03, BR-04, BR-05, BR-06, BR-08) และ endpoint ใหม่อยู่ใน `PROTECTED_ENDPOINTS`
- [ ] response ไม่มี `user_id` หรือ secret; error ไม่มี SQL/stack
- [ ] `docs/traceability.md` อัปเดตแถว FR-12 ด้วย AC/TEST, ผลรัน และ commit SHA
- [ ] PR เข้า `sprint-2-staging` ผ่าน review จากเพื่อน — PR #<เลข>
- [ ] merge เข้า `main` อยู่ใน release Sprint 2 (tag `<tag>`) และปิด Issue #<เลข> แล้ว

---

## 6. ประวัติการเปลี่ยนแปลง Contract

| วันที่ | เวอร์ชัน | การเปลี่ยนแปลง | เหตุผล |
|---|---|---|---|
| 2026-11-28 | 1.0 | สร้างร่าง | ก่อนเริ่ม implement |
| 2026-11-28 | 1.1 | S-4 เพิ่มเพดาน 350400 + TEST-F10-04(b,c); S-9 ให้ `UPDATE` มีเงื่อนไข active + TEST-F10-07c; §2 UI ใช้ `friendlyFields()`, เพิ่มข้อความใหม่และการ map ตาม field ใน `messages.js`, หมายเหตุภาษา; TEST-F10-10 คาดข้อความที่แปลแล้ว; เพิ่ม TEST-F10-11 | review: ค่าเกินช่วง `INTEGER` ได้ 500, race ตอนเที่ยงคืน, UI จริงแสดงข้อความผ่าน `messages.js` และ `must not be in the past` ถูกแปลเป็น "start date" ทุก field |
