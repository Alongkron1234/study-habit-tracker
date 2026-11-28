# Contract: F-11 แก้ไข/ลบ entry

**Sprint:** 2 | **Issue:** #40 | **Branch:** `feature/f11-edit-delete-entry`
**อ้างอิง SRS:** FR-13, BR-01, BR-02, BR-03, BR-05, BR-06, BR-08, NFR-01, NFR-06
**เวอร์ชัน:** 1.2 | **วันที่แก้ล่าสุด:** 2026-11-28
**ผู้ทำ:** Alongkron1234 | **ผู้ review:** atiwit

---

## 1. Feature SDS

### พฤติกรรมและ Workflow

Participant แก้จำนวนนาที หรือลบ entry ของตนเองได้ภายในช่วงเวลาที่อนุญาต (FR-13) ทั้งการแก้และการลบมีผลกับความคืบหน้าของเป้าหมายทันที เพราะ BR-06 คำนวณจากข้อมูลปัจจุบัน

ระบบตรวจตามลำดับนี้: (1) login แล้ว, (2) เป็น Participant, (3) เป็นเจ้าของ goal, (4) entry อยู่ใน goal ตาม URL จริง, (5) entry ยังอยู่ในช่วงที่แก้ได้ (S-1), (6) ค่าใหม่ถูกต้อง (ตรวจเฉพาะการแก้)

ใช้ middleware จาก F-02 แบบเดียวกับ F-05: `requireAuth` → `requireRole('participant')` → `ownedBy(goalOwner)`

Workflow ฝั่ง UI (ดู §2 UI):
1. Participant เปิดหน้ารายละเอียด goal ของตนเอง ซึ่งแสดงรายการ entry
2. แถว entry ที่อยู่ในช่วงแก้ได้ (S-1) จะมีปุ่ม "แก้ไข" และ "ลบ" ส่วนแถวที่อยู่นอกช่วงจะไม่มีปุ่ม
3. แก้: กด "แก้ไข" → ช่อง minutes กลายเป็น input → กด "บันทึก" → `PATCH` → สำเร็จแล้วอัปเดตแถวและ progress / ผิดพลาดแล้วแสดงข้อความใต้ช่อง
4. ลบ: กด "ลบ" → กล่องยืนยัน → `DELETE` → สำเร็จแล้วเอาแถวออกและอัปเดต progress

### กฎและการตัดสินใจ (ขอให้ reviewer ยืนยัน)

| # | การตัดสินใจ | เหตุผล |
|---|---|---|
| S-1 | **ช่วงที่แก้หรือลบได้ ("ช่วงเวลาที่อนุญาต" ของ FR-13):** `entry_date >= วันนี้ − 7 วัน` **และ** goal ต้องยัง active (`end_date >= วันนี้`) | ใช้หน้าต่าง 7 วันเดียวกับ BR-03 (D-03) เพื่อไม่ให้เขียนประวัติเก่าใหม่ทั้งหมด และสอดคล้องกับ BR-05 ที่ goal ที่จบแล้วไม่รับการเปลี่ยนแปลง |
| S-2 | entry อยู่นอกช่วง S-1 หรือ goal จบแล้ว → **409** `{"error":"Conflict"}` | ใช้ข้อความเดียวกับกรณี goal จบแล้วของ F-05 (S-1 ของ F-05) |
| S-3 | **แก้ได้เฉพาะ `minutes`** ส่วน `entry_date` แก้ไม่ได้ (ถ้าจะเปลี่ยนวัน ให้ลบแล้วบันทึกใหม่) | ไม่ต้องตรวจวันที่ซ้ำ และไม่มีทางทำให้เกิด entry ซ้ำวัน (BR-01) |
| S-4 | ถ้า body มี field อื่นนอกจาก `minutes` (เช่น `entry_date`, `goal_id`) → **400** `fields.<ชื่อ field>` = `"not editable"` | กัน mass-assignment (BR-08, NFR-06) |
| S-5 | `minutes` ตรวจแบบเดียวกับ F-05 S-3 ในสองขั้น: (ก) ต้องเป็นจำนวนเต็มชนิด number (ไม่ใช่ string, null, ทศนิยม และต้องมี field) ถ้าไม่ผ่าน → `"integer required"`; (ข) ต้องอยู่ในช่วง `[template.min_value, template.max_value]` ถ้าไม่ผ่าน → `"out of template range"` ค่า 0 และค่าติดลบผ่านขั้น (ก) แต่ไม่ผ่านขั้น (ข) จึงได้ `"out of template range"` | BR-02 |
| S-6 | `entryId` ที่ไม่ใช่จำนวนเต็มบวก, ไม่มี entry นั้น หรือ entry อยู่ใน goal อื่น → **404** | ป้องกันการเดา id ข้าม goal (BR-08) |
| S-7 | PM เรียก endpoint ใหม่ → **403**; Participant เรียกใน goal ของคนอื่น → **404** | BR-08 (แบบเดียวกับ F-05 S-7) |
| S-8 | แก้สำเร็จ → **200** `{ "entry": { id, entry_date, minutes } }` และอัปเดต `updated_at` ใน DB; ลบสำเร็จ → **204** ไม่มี body | NFR-06: ไม่ส่ง `goal_id, user_id, created_at, updated_at` |
| S-9 | ลบแล้วบันทึก entry วันเดิมใหม่ได้ (ลบจริง ไม่ใช่ soft delete) | ไม่ขัดขวาง BR-01 และไม่ทิ้งแถวค้างไว้ |
| S-10 | "วันนี้" ใช้ `todayBangkok()` จาก `src/lib/dates.js` ส่วนเทสต์ใช้ `todayBkk()` จาก `helpers/fixtures.js` ซึ่งต้องคืนค่าเดียวกัน (Asia/Bangkok, `YYYY-MM-DD`) | แบบเดียวกับ F-05 S-2 |
| S-11 | ข้อความใน `fields` เป็นค่าคงที่ ไม่ใช้ `err.message` ของ library | แบบเดียวกับ F-05 S-10 |
| S-12 | ลำดับการตอบเมื่อผิดหลายข้อ: 401 → 403 → 404 → 409 (S-2) → 400 (ตรวจค่า) | ให้ผลที่ทำนายได้ และไม่เปิดเผยข้อมูลของ entry ที่ไม่ใช่ของตน |
| S-13 | เมื่อได้ 400 ให้รายงาน **ทุก field ที่ผิดพร้อมกัน** ใน `fields` เช่น `minutes` ผิดและมี `entry_date` เกินมา → มีทั้ง `fields.minutes` และ `fields.entry_date` | client แก้ได้ในรอบเดียว |
| S-14 | UI แสดงปุ่มแก้/ลบเฉพาะแถวที่ผ่าน S-1 แต่ backend ยังตรวจ S-1 เองเสมอ (UI ไม่ใช่การป้องกัน) | BR-08, NFR-01 |

### Dependencies

F-05 (`routes/entries.js`, ตรรกะตรวจ minutes ใน `validateEntry`), F-06 (ใช้ progress ตรวจผลหลังแก้/ลบ และแสดงใน UI), F-02 (middleware), หน้ารายละเอียด goal ที่มีอยู่แล้ว (สำหรับ UI)

### นอกขอบเขต

แก้ `entry_date` (S-3), ประวัติการแก้ไข/undo, soft delete, streak (F-13)

---

## 2. สเปก API / Data / UI

### API (JSON ทั้งหมด)

| Method + Path | สิทธิ์ | Request body | สำเร็จ | ล้มเหลว |
|---|---|---|---|---|
| `PATCH /api/goals/:id/entries/:entryId` | Participant (เจ้าของ goal) | `{ "minutes": integer }` | **200** `{ "entry": { id, entry_date, minutes } }` | 400, 401, 403, 404, 409 |
| `DELETE /api/goals/:id/entries/:entryId` | Participant (เจ้าของ goal) | – | **204** (ไม่มี body) | 401, 403, 404, 409 |

รูปแบบ body ของ error (ใช้รูปแบบเดียวกับ F-05 ถ้า F-05 ใช้ต่างจากนี้ ให้ยึดตาม F-05 แล้วแก้ตารางนี้ใน v1.2):

| Status | Body |
|---|---|
| 400 | `{ "error": "Bad Request", "fields": { "<field>": "<ข้อความคงที่>" } }` |
| 401 | `{ "error": "Unauthorized" }` |
| 403 | `{ "error": "Forbidden" }` |
| 404 | `{ "error": "Not Found" }` |
| 409 | `{ "error": "Conflict" }` |

ไม่มี SQL, stack trace หรือข้อความของ library ใน body ทุกกรณี

ข้อความใน `fields` (ค่าคงที่):
- `minutes: "integer required"` — ไม่ใช่ number, เป็น string, ทศนิยม, null หรือไม่มี field
- `minutes: "out of template range"` — เป็นจำนวนเต็มแต่อยู่นอกช่วง [template.min_value, template.max_value] (รวม 0 และค่าติดลบ)
- `<field อื่น>: "not editable"` — ส่ง field ที่ไม่อนุญาต (S-4)

### UI

| ส่วน | รายละเอียด |
|---|---|
| ตำแหน่ง | รายการ entry ในหน้ารายละเอียด goal ของ Participant |
| ปุ่ม | "แก้ไข" และ "ลบ" แสดงเฉพาะแถวที่ `entry_date >= วันนี้ − 7` และ goal active (S-14) |
| แก้ไข | ช่อง minutes เป็น input ตัวเลข มีปุ่ม "บันทึก" / "ยกเลิก"; สำเร็จแล้วแสดงค่าใหม่และรีเฟรช progress; ได้ 400 แล้วแสดงข้อความจาก `fields.minutes` ใต้ช่อง; ได้ 409 แล้วแสดง "entry นี้แก้ไขไม่ได้แล้ว" และรีเฟรชรายการ |
| ลบ | กล่องยืนยัน "ลบ entry วันที่ <วันที่> (<n> นาที)?"; สำเร็จแล้วเอาแถวออกและรีเฟรช progress; ได้ 409 แล้วแสดงข้อความเดียวกับด้านบน |

### ผลต่อโครงสร้างโค้ด

| ชั้น | เปลี่ยน? | รายละเอียด |
|---|---|---|
| ฐานข้อมูล | **ไม่เปลี่ยน schema** | ใช้ `habit_entries` เดิม (มี `updated_at` อยู่แล้ว) และ constraint `uq_habit_entries_goal_date` เดิม |
| API | เปลี่ยน | เพิ่ม 2 route ใน `routes/entries.js` |
| Logic | เปลี่ยน | เพิ่ม `validateEntryUpdate(body, template)` ใน `src/lib/validate.js` และตรวจ "แก้ได้ไหม" ตาม S-1 |
| UI | เปลี่ยน | เพิ่มปุ่มแก้/ลบและ flow ตามตาราง UI ในหน้ารายละเอียด goal |

---

## 3. Acceptance Criteria

| ID | เงื่อนไข (ผลที่สังเกตได้) | Requirement |
|---|---|---|
| **AC-F11-01** | Participant แก้ `minutes` ของ entry ตนเองที่อยู่ในช่วงแก้ได้ ด้วยค่าที่ถูกต้อง → 200; response มี `id, entry_date, minutes` (ค่าใหม่) และไม่มี `goal_id/user_id/created_at/updated_at`; DB เก็บค่าใหม่, `entry_date` ไม่เปลี่ยน และ `updated_at` ใหม่กว่าค่าก่อนแก้ | FR-13, NFR-06 |
| **AC-F11-02** | หลังแก้ `GET /api/goals/:id/progress` คืน `total_minutes` และ `percent` ตามค่าใหม่; หลังลบ ยอดรวมลดลงตามค่าของ entry ที่ลบ และ entry นั้นไม่อยู่ใน `GET .../entries` | FR-13, BR-06 |
| **AC-F11-03** | `minutes` ไม่ใช่จำนวนเต็ม (ทศนิยม, string, null, ไม่มี field) → 400 `fields.minutes = "integer required"`; จำนวนเต็มนอกช่วง template (รวม 0 และค่าติดลบ) → 400 `fields.minutes = "out of template range"`; ค่าขอบ (min, max ของ template) → 200; ทุกกรณีที่ได้ 400 ค่าใน DB ไม่เปลี่ยน | BR-02 |
| **AC-F11-04** | ส่ง `entry_date` หรือ field อื่นนอกจาก `minutes` → 400 `fields.<ชื่อ> = "not editable"` และ DB ไม่เปลี่ยน; ถ้าผิดหลาย field จะรายงานครบทุก field (S-13) | BR-01, BR-08, NFR-06 |
| **AC-F11-05** | entry ที่ `entry_date` เก่ากว่า 7 วัน (`วันนี้ − 8` หรือก่อนหน้า) ใน goal ที่ยัง active แก้และลบไม่ได้ → 409; entry วันที่ `วันนี้ − 7` (ขอบ) แก้ได้ → 200 และลบได้ → 204; DB ไม่เปลี่ยนเมื่อได้ 409 | FR-13, BR-03 |
| **AC-F11-06** | goal ที่จบแล้ว (`end_date < วันนี้`) → แก้และลบ entry ไม่ได้ แม้ entry จะอยู่ในหน้าต่าง 7 วัน → 409; DB ไม่เปลี่ยน | BR-05 |
| **AC-F11-07** | ลบ entry สำเร็จ → 204 ไม่มี body; แถวหายจาก DB; บันทึก entry ใหม่ในวันเดิมได้ (201) | FR-13, BR-01 |
| **AC-F11-08** | PM เรียก PATCH/DELETE → 403; Participant B เรียกกับ entry ของ A → 404 และ entry ของ A ไม่เปลี่ยน; `entryId` ผิดรูปแบบ / ไม่มีอยู่ / อยู่ใน goal อื่น → 404; ไม่ login → 401 | BR-08, NFR-01 |
| **AC-F11-09** | ใน UI Participant แก้ minutes และลบ entry ที่อยู่ในช่วงได้ โดยค่าและ progress บนหน้าจออัปเดตตาม และหลัง reload ค่ายังเป็นค่าใหม่; แถวที่อยู่นอกช่วงไม่มีปุ่มแก้/ลบ; ค่าที่ผิดแสดงข้อความ error ใต้ช่อง | FR-13 |

---

## 4. Software Test Specification

ไฟล์เทสต์: `backend/tests/entry-edit.test.js` (integration), เพิ่มเคสใน `backend/tests/validate.test.js` (unit ของ `validateEntryUpdate`) และเพิ่ม endpoint ใน `backend/tests/rbac.test.js`

สภาพแวดล้อม: ใช้ `helpers/test-env.js` (ตั้งค่า env) และ `helpers/fixtures.js` (`createUser()`, `loginAs()`, `todayBkk()`, `addDays()`); คำนวณวันที่จาก `todayBkk()` + `addDays()` ไม่ hard-code; entry เก่าและการตั้ง `start_date`/`end_date` ของ goal ทำผ่าน SQL โดยตรง; **ทุก test ใช้ข้อมูลที่ setup ใหม่ของตัวเอง ไม่พึ่งผลของ test อื่น**

เว้นแต่ precondition จะระบุไว้เป็นอย่างอื่น goal มาจาก template ที่ `min_value=10, max_value=120` และ goal active (`start_date ≤ วันนี้ − 10`, `end_date ≥ วันนี้ + 7`)

| ID Test | AC | Level | Precondition | Input / Action | Expected |
|---|---|---|---|---|---|
| **TEST-F11-01** | AC-F11-01 | API integration | Participant, entry วันนี้ minutes=30; จำค่า `updated_at` เดิมไว้ | `PATCH` `{minutes: 45}` | 200; `entry.minutes = 45`, `entry.entry_date` เดิม, ไม่มี `goal_id/user_id/created_at/updated_at`; DB `minutes = 45` และ `updated_at` > ค่าเดิม |
| **TEST-F11-02a** | AC-F11-02 | API integration | goal target=200; entries 60 (เมื่อวาน) และ 90 (วันนี้) | `PATCH` entry 60 เป็น 80 แล้ว `GET progress` | `total_minutes=170`, `percent=85` (ตัวเลข JSON) |
| **TEST-F11-02b** | AC-F11-02 | API integration | setup ใหม่: goal target=200; entries 60 (เมื่อวาน) และ 90 (วันนี้) | `DELETE` entry 90 แล้ว `GET progress` และ `GET entries` | `total_minutes=60`, `percent=30` (ตัวเลข JSON); รายการ entries ไม่มี entry ที่ลบ |
| **TEST-F11-03a** | AC-F11-03 | API integration | Participant, entry วันนี้ minutes=30 | `minutes` = 1.5, "60", null, ไม่มี field | ทุกกรณี 400 `fields.minutes = "integer required"`; DB = 30 |
| **TEST-F11-03b** | AC-F11-03 | API integration | Participant, entry วันนี้ minutes=30 | `minutes` = 0, -5, 9, 121 | ทุกกรณี 400 `fields.minutes = "out of template range"`; DB = 30 |
| **TEST-F11-03c** | AC-F11-03 | API integration | Participant, entry วันนี้ minutes=30 | `minutes` = 10 แล้ว 120 | ทั้งคู่ 200; DB = 120 |
| **TEST-F11-04a** | AC-F11-04 | API integration | Participant, entry วันนี้ minutes=30 | `PATCH` `{minutes: 40, entry_date: "<เมื่อวาน>"}` และ `{minutes: 40, goal_id: 999}` | 400 มี `fields.entry_date` / `fields.goal_id` = "not editable"; DB เดิม (minutes=30, entry_date เดิม) |
| **TEST-F11-04b** | AC-F11-04 | API integration | เหมือน 04a | `PATCH` `{minutes: 1.5, entry_date: "<เมื่อวาน>"}` | 400 มีทั้ง `fields.minutes` และ `fields.entry_date`; DB เดิม |
| **TEST-F11-05a** | AC-F11-05 | API integration | goal active (`start_date = วันนี้ − 10`, `end_date ≥ วันนี้`); entry วันที่ `วันนี้ − 8` สร้างผ่าน SQL | `PATCH` `{minutes: 50}` และ `DELETE` | ทั้งคู่ 409 `{"error":"Conflict"}`; DB เดิม |
| **TEST-F11-05b** | AC-F11-05 | API integration | goal เหมือน 05a; entry วันที่ `วันนี้ − 7` สร้างผ่าน SQL | `PATCH` `{minutes: 50}` แล้ว `DELETE` | PATCH 200; DELETE 204 |
| **TEST-F11-06** | AC-F11-06 | API integration | goal ที่ `end_date` = เมื่อวาน (ตั้งผ่าน SQL) มี entry เมื่อวาน (อยู่ในหน้าต่าง 7 วัน) | `PATCH` `{minutes: 50}` และ `DELETE` | ทั้งคู่ 409; DB เดิม |
| **TEST-F11-07** | AC-F11-07 | API integration | entry วันนี้ | `DELETE` แล้ว `POST /api/goals/:id/entries` วันเดิม | DELETE 204 ไม่มี body, แถวหายจาก DB; POST 201 |
| **TEST-F11-08a** | AC-F11-08 | API integration | PM login | `PATCH` และ `DELETE` | 403 ทั้งคู่ |
| **TEST-F11-08b** | AC-F11-08 | API integration | Participant B, entry ของ A | `PATCH` และ `DELETE` | 404 ทั้งคู่; entry ของ A ไม่เปลี่ยนและยังอยู่ |
| **TEST-F11-08c** | AC-F11-08 | API integration | Participant A มี goalX และ goalY | `PATCH /goals/<goalX>/entries/<entryใน goalY>`; `entryId` = "abc", 0, -1, 999999 | 404 ทุกกรณี; entry ใน goalY ไม่เปลี่ยน |
| **TEST-F11-08d** | AC-F11-08 | API integration | ไม่ login | `PATCH` และ `DELETE` | 401 (เพิ่ม `['patch','/api/goals/1/entries/1']` และ `['delete','/api/goals/1/entries/1']` ใน `PROTECTED_ENDPOINTS` ของ `rbac.test.js`) |
| **TEST-F11-09** | AC-F11-03, AC-F11-04 | Unit | – | `validateEntryUpdate` กับ -1, 0, 1, 9, 10, 120, 121, 1.5, "60", null, ไม่มี field, field เกิน, field เกิน + minutes ผิด | ข้อความตรงตาม S-4, S-5, S-13 |
| **TEST-F11-10** | AC-F11-09 | UI (manual demo พร้อม screenshot; ใช้ E2E ถ้าโปรเจกต์มี) | Participant, goal active มี entry วันนี้ (30) และ `วันนี้ − 8` | แก้ entry วันนี้เป็น 45 → reload; ใส่ 5 → บันทึก; ลบ entry วันนี้ | ค่า 45 และ progress อัปเดตและยังอยู่หลัง reload; ใส่ 5 แล้วแสดง "out of template range"; ลบแล้วแถวหายและ progress ลด; แถว `วันนี้ − 8` ไม่มีปุ่ม |

---

## 5. Definition of Done และหลักฐาน

- [ ] contract นี้ commit ก่อนโค้ดและเทสต์ (commit แยก) — v1.2 `00ed536` (v1.0 และ v1.1 เป็นร่างที่ยังไม่ถูก commit)
- [ ] เทสต์ทุกข้อใน §4 (ยกเว้น TEST-F11-10) เขียนก่อนโค้ด และบันทึกผลรันที่ **fail** พร้อม commit — backend `d9f7871`, ผลรัน `evidence/F-11-red-run.txt` (38 failed / 179 passed; 179 เดิมผ่านครบ); UI `edc2103`, ผลรัน `evidence/F-11-ui-red-run.txt` (8 failed / 1 passed)
- [ ] โค้ดครบตาม §2 (API, Logic, UI) และ `npm test` ผ่านทุกเทสต์ — backend (API, Logic) `7410808` 217 passed / 0 failed / 0 skipped, ผลรัน `evidence/F-11-green-run.txt`; UI `173a82a` frontend 26 passed / 0 failed / 0 skipped, ผลรัน `evidence/F-11-ui-green-run.txt`
- [ ] TEST-F11-10 รันบน candidate แล้ว พร้อม screenshot ที่ระบุ version — `evidence/F-11-ui-*.png`
- [ ] **ทั้ง test suite** ยังผ่าน (regression ของ F-01 ถึง F-07 และ feature อื่นใน Sprint 2 โดยเฉพาะ BR-01, BR-02, BR-03, BR-08) และ endpoint ใหม่อยู่ใน `PROTECTED_ENDPOINTS`
- [ ] response ไม่มี `goal_id`, `user_id` หรือ secret; error ไม่มี SQL/stack
- [ ] `docs/traceability.md` อัปเดตแถว FR-13 ด้วย AC/TEST, ผลรัน และ commit SHA
- [ ] PR เข้า `sprint-2-staging` ผ่าน review จากเพื่อน — PR #<เลข>
- [ ] merge เข้า `main` อยู่ใน release Sprint 2 (tag `<tag>`) และปิด Issue #40 แล้ว

---

## 6. ประวัติการเปลี่ยนแปลง Contract

| วันที่ | เวอร์ชัน | การเปลี่ยนแปลง | เหตุผล |
|---|---|---|---|
| 2026-11-27 | 1.0 | สร้างร่าง | ก่อนเริ่ม implement |
| 2026-11-27 | 1.1 | (1) แก้ PR target เป็น `sprint-2-staging`; (2) นำ UI เข้ามาในขอบเขต (S-14, §2 UI, AC-F11-09, TEST-F11-10) แทน "งานแยก UI-01 ถ้าเวลาพอ"; (3) เพิ่ม NFR-01 ในหัวเอกสาร และนำ BR-09 ออกเพราะไม่มีกฎ/AC อ้างถึง; (4) แยกข้อความของ 0 และค่าติดลบเป็น "out of template range" (S-5) และเพิ่มเทสต์ API ของกรณีนี้ (TEST-F11-03b); (5) เพิ่มการตรวจ `updated_at` ใน AC-F11-01/TEST-F11-01; (6) เพิ่มคอลัมน์ Level ใน STS; (7) ระบุ precondition ของ goal ใน TEST-F11-05a/05b และให้ TEST-F11-02b setup ใหม่; (8) กำหนดรูปแบบ body ของ error; (9) เพิ่ม S-13 รายงาน error หลาย field พร้อมกัน (TEST-F11-04b); (10) ระบุความสัมพันธ์ของ `todayBangkok()` กับ `todayBkk()`; (11) DoD: regression ทั้ง suite, release tag และปิด Issue | ผล review ก่อน implement ให้ AC ↔ test ครบ, traceability ตรงกับ Deliverable 2 ข้อ 3.2 และ 3.4 และ FR-13 ใช้งานได้จริงในระบบ |
| 2026-11-28 | 1.2 | (1) แก้ที่มาของ helper ในเทสต์: `todayBkk()`, `addDays()`, `createUser()` อยู่ใน `helpers/fixtures.js` ไม่ใช่ `test-env.js` (S-10, §4); (2) TEST-F11-02a/02b เขียน `percent` เป็นตัวเลข JSON (85, 30) แทน 85.0, 30.0; (3) DoD ข้อแรกอ้าง SHA ของ v1.2 เพราะ v1.0/v1.1 ยังไม่เคย commit | ตรวจกับโค้ดใน repo ก่อน commit ครั้งแรก |
