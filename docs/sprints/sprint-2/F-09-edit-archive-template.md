# Contract: F-09 แก้ไข/เก็บถาวร (archive) แม่แบบ

**Sprint:** 2 | **Issue:** #<เลข issue> | **Branch:** `feature/f09-edit-archive-template`
**อ้างอิง SRS:** FR-11, BR-02, BR-07, BR-08, BR-09, NFR-01, NFR-06
**เวอร์ชัน:** 1.1 (ร่าง) | **วันที่แก้ล่าสุด:** 2026-11-28
**ผู้ทำ:** Alongkron1234 | **ผู้ review:** atiwit

---

## 1. Feature SDS

### พฤติกรรมและ Workflow

PM แก้ไขชื่อและช่วงค่า entry (ต่ำสุด–สูงสุด) ของแม่แบบที่ตนสร้าง หรือเก็บถาวร (archive) แม่แบบนั้น (FR-11) แม่แบบที่ archive แล้วไม่ถูกใช้เริ่มเป้าหมายใหม่ได้ (กฎนี้ F-04 บังคับอยู่แล้วที่ `POST /api/goals` → 404 contract นี้เป็นฝ่ายทำให้แม่แบบเข้าสถานะ archived ได้จริงและทดสอบผลต่อ feature อื่น)

ระบบตรวจตามลำดับนี้: (1) login แล้ว, (2) เป็น PM, (3) เป็นเจ้าของแม่แบบ, (4) แม่แบบยังไม่ archived (เฉพาะการแก้), (5) ค่าใหม่ถูกต้อง (เฉพาะการแก้)

ใช้ middleware จาก F-02: `requireAuth` → `requireRole('pm')` → `ownedBy(templateOwner)` (ตรวจ `created_by`)

Workflow ฝั่ง UI (ดู §2 UI):
1. PM เปิดหน้าแม่แบบ (`/templates`) ซึ่งแสดงรายการแม่แบบของตน
2. แม่แบบที่ยังไม่ archived มีปุ่ม "แก้ไข" และ "เก็บถาวร"; แม่แบบที่ archived แสดงป้าย "เก็บถาวรแล้ว" และไม่มีปุ่ม
3. แก้: กด "แก้ไข" → ช่องชื่อ/ต่ำสุด/สูงสุดเป็น input → "บันทึก" → `PATCH` / เก็บถาวร: กด "เก็บถาวร" → กล่องยืนยัน → `POST .../archive`

### กฎและการตัดสินใจ (ขอให้ reviewer ยืนยัน)

| # | การตัดสินใจ | เหตุผล |
|---|---|---|
| S-1 | PM แก้/archive ได้เฉพาะแม่แบบที่ **ตนสร้าง** (`created_by`) แม่แบบของ PM คนอื่น, ไม่มีอยู่ หรือ id ไม่ใช่จำนวนเต็มบวก → **404**; Participant → **403** | BR-07; สอดคล้องกับรายการแม่แบบของ PM ที่แสดงเฉพาะของตน (F-03 S-4) และไม่ยืนยันว่ามีแม่แบบของคนอื่น |
| S-2 | API สองตัว: `PATCH /api/templates/:id` (แก้ชื่อ/ช่วงค่า) และ `POST /api/templates/:id/archive` (archive) การ **un-archive ไม่อยู่ในขอบเขต** (ส่ง `is_archived` ใน PATCH → "not editable") | FR-11 ระบุแค่ "แก้ไขหรือเก็บถาวร"; แยก action ให้ชัดและกัน archive/un-archive หลุดผ่านการแก้ไขทั่วไป |
| S-3 | แก้ได้เฉพาะ `name`, `min_value`, `max_value` (ส่งได้บางตัวหรือทั้งหมด) `unit` ที่ส่งมาเป็น `"minutes"` ยอมรับและไม่ทำอะไร ส่งค่าอื่น → 400 `fields.unit` = `"must be minutes"`; field อื่นทุกตัว (`id`, `created_by`, `is_archived`, `created_at`, ...) → 400 `"not editable"` | BR-09 (หน่วยคงที่), กัน mass-assignment (BR-07, NFR-06) |
| S-4 | ตรวจค่าที่ส่งมาด้วยกฎเดียวกับตอนสร้าง (F-03 S-2, S-3): `name` trim แล้วยาว 1–100; `min_value`, `max_value` จำนวนเต็ม 1–960 ชนิด number; ข้อความ `fields` ใช้ชุดเดียวกับ F-03 แล้วตรวจข้ามกันหลังรวมกับค่าปัจจุบัน: ถ้า `max_value` < `min_value` และส่ง `max_value` มา → `fields.max_value` = `"must be >= min_value"`; ถ้าส่งเฉพาะ `min_value` แล้วสูงกว่า `max_value` ปัจจุบัน → `fields.min_value` = `"must be <= max_value"` | BR-02; แยกข้อความตามฝั่งที่ client ส่ง เพื่อไม่ให้ชี้ field ที่ client ไม่ได้แตะ |
| S-5 | ถ้าไม่ส่ง `name`, `min_value`, `max_value` สักตัว (body ว่าง หรือมีแต่ `unit`) → **400** `fields.body` = `"name, min_value or max_value required"` | ไม่ให้ PATCH ที่ไม่ทำอะไรได้ 200 |
| S-6 | แม่แบบที่ archived แล้วเป็น **อ่านอย่างเดียว**: `PATCH` → **409** `{"error":"Conflict"}`; `POST .../archive` ซ้ำ → **200** ตอบแม่แบบเดิม ไม่เปลี่ยน `updated_at` (idempotent) | ปิดแล้วไม่แก้ต่อ (แบบเดียวกับ F-10 S-1 ที่ goal จบแล้วแก้ไม่ได้); archive ซ้ำไม่ใช่ความผิดพลาดของผู้ใช้ |
| S-7 | **ผลของการแก้ช่วงค่า:** มีผลกับ entry ที่ "บันทึกใหม่หรือแก้ไข" หลังจากนั้นเท่านั้น (F-05 และ F-11 ตรวจกับช่วงค่าปัจจุบัน ณ ตอนเรียก) entry ที่มีอยู่แล้ว **ไม่ถูกแก้ ลบ หรือปฏิเสธ** และยังนับใน progress ตามเดิม ระบบ **ไม่ตรวจและไม่แจ้ง PM ว่ามี entry อยู่นอกช่วงใหม่หรือไม่** | PM อ่านข้อมูลของ Participant ไม่ได้ (BR-08) การให้แก้ไม่ได้เพราะมี entry หรือบอกจำนวน entry จะเปิดเผยข้อมูลของ Participant ทางอ้อม |
| S-8 | **ผลของ archive:** (ก) เริ่มเป้าหมายใหม่ด้วยแม่แบบนี้ไม่ได้ (F-04 S-6 → 404); (ข) เป้าหมายที่ active อยู่แล้วทำงานต่อได้ตามปกติ บันทึกและแก้/ลบ entry ได้ และ progress ถูกต้อง; (ค) `GET /api/templates` ของ Participant ไม่แสดงแม่แบบนี้ (F-03 S-4); (ง) `GET /api/templates` ของ PM ยังแสดงพร้อม `is_archived: true` | FR-11; ไม่ทำลายเป้าหมายที่กำลังทำอยู่ |
| S-9 | แก้/archive สำเร็จ → **200** `{ "template": { id, name, unit, min_value, max_value, is_archived } }` รูปแบบเดียวกับ F-03 (ไม่ส่ง `created_by`, `created_at`, `updated_at`); ตั้ง `updated_at = now()` เอง (ไม่มี trigger); `name` ที่บันทึกเป็นค่าหลัง trim | NFR-06; แบบเดียวกับ F-03 |
| S-10 | ข้อความใน `fields` เป็นค่าคงที่ ไม่ใช้ `err.message` ของ library; เมื่อได้ 400 รายงาน **ทุก field ที่ผิดพร้อมกัน** | แบบเดียวกับ F-05 S-10 และ F-11 S-13 |
| S-11 | ลำดับการตอบเมื่อผิดหลายข้อ: 401 → 403 → 404 → 409 (S-6) → 400 | ให้ผลที่ทำนายได้ และไม่เปิดเผยแม่แบบของ PM คนอื่น |
| S-12 | UI แสดงปุ่มแก้/เก็บถาวรเฉพาะแม่แบบที่ยังไม่ archived แต่ backend ตรวจสิทธิ์และสถานะเองเสมอ (UI ไม่ใช่การป้องกัน) | BR-07, NFR-01 |
| S-13 | หน้ารายละเอียด goal ของ Participant หาแม่แบบจากรายการ `GET /api/templates` ซึ่งไม่รวมแม่แบบที่ archived (S-8 ค) ดังนั้น goal ที่ใช้แม่แบบ archived จะไม่แสดงชื่อ/ช่วงของแม่แบบ (หัวหน้าจะเป็น `Goal #<id>` แทนชื่อแม่แบบ) แต่หน้าต้องโหลดและใช้งานได้ตามปกติ (โค้ดปัจจุบันรองรับอยู่แล้วเมื่อ `template` เป็น null) **ไม่แก้ API ของ F-03/F-04** | ยอมรับในระดับ Sprint 2 เพื่อไม่ขยายขอบเขต; ทดสอบใน TEST-F09-10 |

### Dependencies

F-03 (`routes/templates.js`, `validateTemplate`, S-4 การมองเห็นแม่แบบ), F-04 (S-6: แม่แบบ archived เริ่มเป้าหมายใหม่ไม่ได้), F-05 และ F-11 (ตรวจ entry กับช่วงค่าปัจจุบัน), F-02 (middleware), หน้าแม่แบบของ PM ที่มีอยู่แล้ว (สำหรับ UI)

### นอกขอบเขต

un-archive, ลบแม่แบบ, เปลี่ยนหน่วย (BR-09), แจ้ง PM จำนวนเป้าหมายที่ใช้แม่แบบ (BR-08), แก้ API ของ F-03/F-04 เพื่อแสดงแม่แบบ archived ให้ Participant (S-13)

---

## 2. สเปก API / Data / UI

### API (JSON ทั้งหมด)

| Method + Path | สิทธิ์ | Request body | สำเร็จ | ล้มเหลว |
|---|---|---|---|---|
| `PATCH /api/templates/:id` | PM (ผู้สร้างแม่แบบ) | `{ "name"?, "min_value"?, "max_value"?, "unit"? }` อย่างน้อยหนึ่งใน `name`/`min_value`/`max_value` | **200** `{ "template": {id, name, unit, min_value, max_value, is_archived} }` | 400, 401, 403, 404, 409 (archived) |
| `POST /api/templates/:id/archive` | PM (ผู้สร้างแม่แบบ) | – | **200** `{ "template": { ... , is_archived: true } }` (ซ้ำก็ 200) | 401, 403, 404 |

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
- `name: "required, 1-100 characters"`
- `min_value: "integer 1-960"` และ `max_value: "integer 1-960"`
- `max_value: "must be >= min_value"` และ `min_value: "must be <= max_value"` (ตรวจข้ามกัน S-4)
- `unit: "must be minutes"`
- `<field อื่น>: "not editable"`
- `body: "name, min_value or max_value required"`

### UI

| ส่วน | รายละเอียด |
|---|---|
| ตำแหน่ง | รายการแม่แบบในหน้า `/templates` (เฉพาะ PM) หน้านี้มีป้าย Active/Archived ต่อแม่แบบอยู่แล้ว |
| ภาษา | ข้อความบนหน้าจอใช้ภาษาเดียวกับหน้าปัจจุบัน (อังกฤษ) ข้อความภาษาไทยในตารางนี้เป็นความหมายที่ต้องการ |
| แม่แบบที่ยังไม่ archived | ปุ่ม "แก้ไข" และ "เก็บถาวร" |
| แก้ไข | ชื่อ, ค่าต่ำสุด, ค่าสูงสุดเป็น input เริ่มด้วยค่าปัจจุบัน; ปุ่ม "บันทึก"/"ยกเลิก"; สำเร็จแล้วแสดงค่าใหม่; 400 แสดงข้อความของ `fields.<ชื่อ>` ใต้ช่องนั้น **ผ่าน `friendlyFields()` ใน `frontend/src/lib/messages.js`** แบบเดียวกับฟอร์มสร้างแม่แบบ (ไม่แสดงข้อความดิบของ API); 409 แสดง "แม่แบบนี้เก็บถาวรแล้ว แก้ไขไม่ได้" แล้วรีเฟรชรายการ |
| ข้อความที่ผู้ใช้เห็น | มีอยู่แล้วใน `messages.js`: `required, 1-100 characters`, `integer 1-960`, `must be >= min_value`, `must be minutes`; **เพิ่ม** `must be <= max_value` → "Min minutes must be at most the max minutes." (UI ส่งเฉพาะ name/min/max จึงไม่ต้องแปล `not editable` และ `body`) |
| เก็บถาวร | กล่องยืนยัน "เก็บถาวรแม่แบบ <ชื่อ>? ผู้ใช้จะเริ่มเป้าหมายใหม่ด้วยแม่แบบนี้ไม่ได้"; สำเร็จแล้วแถวแสดงป้าย "เก็บถาวรแล้ว" และไม่มีปุ่ม |

### ผลต่อโครงสร้างโค้ด

| ชั้น | เปลี่ยน? | รายละเอียด |
|---|---|---|
| ฐานข้อมูล | **ไม่เปลี่ยน schema** | ใช้ `activity_templates` เดิม (มี `is_archived`, `updated_at`) |
| API | เปลี่ยน | เพิ่ม 2 route ใน `routes/templates.js` และ loader ตรวจ `created_by` สำหรับ `ownedBy` |
| Logic | เปลี่ยน | เพิ่ม `validateTemplateUpdate(body, current)` ใน `src/lib/validate.js` (ฟังก์ชันบริสุทธิ์) ใช้ร่วมกฎของ `validateTemplate` |
| UI | เปลี่ยน | เพิ่มปุ่มแก้ไข/เก็บถาวรและป้ายในหน้า `TemplatesPage`; เพิ่มข้อความใหม่ใน `frontend/src/lib/messages.js` |

---

## 3. Acceptance Criteria

| ID | เงื่อนไข (ผลที่สังเกตได้) | Requirement |
|---|---|---|
| **AC-F09-01** | PM แก้ `name`/`min_value`/`max_value` (บางตัวหรือทั้งหมด) ของแม่แบบตนที่ยังไม่ archived ด้วยค่าที่ถูกต้อง → 200; response มี `id, name, unit, min_value, max_value, is_archived` ไม่มี `created_by/created_at/updated_at`; `name` ถูก trim; ค่าที่ไม่ได้ส่งไม่เปลี่ยน; `unit` ยังเป็น `minutes`; DB เก็บค่าใหม่และ `updated_at` ใหม่กว่าเดิม | FR-11, BR-09, NFR-06 |
| **AC-F09-02** | ค่าไม่ถูกต้อง → 400 `fields.<ชื่อ>` ตามข้อความใน §2: ชื่อว่าง/เกิน 100/ไม่ใช่ string, min/max ไม่ใช่จำนวนเต็ม 1–960 (0, 961, ทศนิยม, string, null), `max_value` < `min_value`, `min_value` สูงกว่า `max_value` ปัจจุบัน, `unit` ที่ไม่ใช่ `minutes`; ค่าขอบ (1 และ 960, min = max) → 200; DB ไม่เปลี่ยนเมื่อได้ 400 | BR-02, BR-09 |
| **AC-F09-03** | ส่ง field ที่แก้ไม่ได้ (`is_archived`, `created_by`, `id`) → 400 "not editable"; body ว่างหรือมีแต่ `unit` → 400 `fields.body`; ผิดหลาย field รายงานครบ; DB ไม่เปลี่ยน | BR-07, NFR-06 |
| **AC-F09-04** | `POST .../archive` → 200 และ `is_archived = true` ใน DB; เรียกซ้ำ → 200 และ `updated_at` ไม่เปลี่ยน; `PATCH` แม่แบบที่ archived → 409 และ DB ไม่เปลี่ยน; archive แล้วทำให้กลับเป็น active ไม่ได้ (ส่ง `is_archived: false` → 400 "not editable") | FR-11 |
| **AC-F09-05** | หลัง archive: Participant ไม่เห็นแม่แบบใน `GET /api/templates` แต่ PM เห็นพร้อม `is_archived: true`; `POST /api/goals` ด้วยแม่แบบนั้น → 404; เป้าหมาย active ที่ใช้แม่แบบนั้นอยู่แล้วยังบันทึก entry ได้ (201) และ `GET .../progress` ถูกต้อง | FR-11, BR-05 |
| **AC-F09-06** | หลังแก้ช่วงค่า: entry ที่มีอยู่แล้วคงอยู่ ค่าไม่เปลี่ยน และยังนับใน progress; entry ที่บันทึกใหม่ (POST) ถูกตรวจกับช่วงใหม่ — ค่าที่อยู่นอกช่วงใหม่ → 400 "out of template range", ค่าในช่วงใหม่ → 201 | FR-11, BR-02 |
| **AC-F09-07** | Participant เรียกทั้งสอง endpoint → 403; PM คนอื่นเรียกกับแม่แบบที่ไม่ใช่ของตน → 404 และแม่แบบไม่เปลี่ยน; id ผิดรูปแบบ/ไม่มีอยู่ → 404; ไม่ login → 401 | BR-07, NFR-01 |
| **AC-F09-08** | ใน UI PM แก้ชื่อ/ช่วงค่า และเก็บถาวรแม่แบบได้ ค่าบนหน้าจอและหลัง reload ตรงกัน; ค่าผิดแสดงข้อความที่แปลแล้ว (ตาม §2 UI) ใต้ช่อง; แม่แบบ archived แสดงป้ายและไม่มีปุ่ม; หน้ารายละเอียด goal ของ Participant ที่ใช้แม่แบบ archived โหลดและบันทึก entry ได้ | FR-11 |

---

## 4. Software Test Specification

ไฟล์เทสต์: `backend/tests/template-edit.test.js` (integration), เพิ่มเคสใน `backend/tests/validate.test.js` (unit ของ `validateTemplateUpdate`) และเพิ่ม endpoint ใน `backend/tests/rbac.test.js`

สภาพแวดล้อม: ใช้ `helpers/test-env.js` (ตั้งค่า env) และ `helpers/fixtures.js` (`createUser()`, `loginAs()`, `todayBkk()`, `addDays()`); goal และ entry สร้างผ่าน SQL โดยตรง; **ทุก test ใช้ข้อมูลที่ setup ใหม่ของตัวเอง ไม่พึ่งผลของ test อื่น**

เว้นแต่ precondition จะระบุไว้เป็นอย่างอื่น: PM A เป็นผู้สร้างแม่แบบ `name="Reading"`, `min_value=10`, `max_value=120`, ยังไม่ archived; มี PM B, Participant P สำหรับกรณีสิทธิ์; test ที่ต้องมี goal ใช้ goal active ของ P (`start_date = วันนี้ − 10`, `end_date = วันนี้ + 20`)

| ID Test | AC | Level | Precondition | Input / Action | Expected |
|---|---|---|---|---|---|
| **TEST-F09-01** | AC-F09-01 | API integration | แม่แบบปกติ; ตั้ง `updated_at` ย้อนหลังผ่าน SQL | `PATCH` `{name: "  Deep Reading  ", min_value: 15, max_value: 90}` | 200; `template` = `{id, name: "Deep Reading", unit: "minutes", min_value: 15, max_value: 90, is_archived: false}` ไม่มี `created_by/created_at/updated_at`; DB ตรงกันและ `updated_at` ใหม่กว่าเดิม |
| **TEST-F09-02** | AC-F09-01 | API integration | แม่แบบปกติ | (a) `{name: "New"}` (b) `{min_value: 20}` (c) `{max_value: 100}` (d) `{min_value: 30, unit: "minutes"}` | ทุกกรณี 200; เฉพาะ field ที่ส่งเปลี่ยน ที่เหลือเดิม; `unit` ยัง "minutes" |
| **TEST-F09-03a** | AC-F09-02 | API integration | แม่แบบปกติ | `name` = "", "   ", 101 ตัวอักษร, 123, null | ทุกกรณี 400 `fields.name = "required, 1-100 characters"`; DB เดิม |
| **TEST-F09-03b** | AC-F09-02 | API integration | แม่แบบปกติ | `min_value` และ `max_value` แต่ละตัว = 0, 961, 1.5, "10", null | ทุกกรณี 400 `fields.<ชื่อ> = "integer 1-960"`; DB เดิม |
| **TEST-F09-03c** | AC-F09-02 | API integration | แม่แบบปกติ (10–120) | `{min_value: 1, max_value: 960}` แล้ว `{min_value: 50, max_value: 50}` | ทั้งคู่ 200 |
| **TEST-F09-03d** | AC-F09-02 | API integration | แม่แบบปกติ (10–120) | `{max_value: 5}`; `{min_value: 200}`; `{min_value: 80, max_value: 70}` | แรก 400 `fields.max_value = "must be >= min_value"`; สอง 400 `fields.min_value = "must be <= max_value"`; สาม 400 `fields.max_value = "must be >= min_value"`; DB เดิมทุกกรณี |
| **TEST-F09-03e** | AC-F09-02 | API integration | แม่แบบปกติ | `{name: "X", unit: "hours"}` | 400 `fields.unit = "must be minutes"`; DB เดิม (ชื่อไม่เปลี่ยน) |
| **TEST-F09-04a** | AC-F09-03 | API integration | แม่แบบปกติ | `{name: "X", is_archived: true}`, `{name: "X", created_by: 999}`, `{name: "X", id: 999}` | ทุกกรณี 400 `fields.<ชื่อ> = "not editable"`; DB เดิม |
| **TEST-F09-04b** | AC-F09-03 | API integration | แม่แบบปกติ | `{}`, `{unit: "minutes"}`; และ `{min_value: 1.5, is_archived: false}` | สองแรก 400 `fields.body = "name, min_value or max_value required"`; ที่สาม 400 มีทั้ง `fields.min_value` และ `fields.is_archived`; DB เดิม |
| **TEST-F09-05a** | AC-F09-04 | API integration | แม่แบบปกติ; ตั้ง `updated_at` ย้อนหลัง | `POST .../archive` | 200 `template.is_archived = true`; DB `is_archived = true`, `updated_at` ใหม่กว่าเดิม |
| **TEST-F09-05b** | AC-F09-04 | API integration | แม่แบบที่ archive แล้ว (ผ่าน API); จำ `updated_at` | `POST .../archive` ซ้ำ | 200 `is_archived = true`; `updated_at` ใน DB ไม่เปลี่ยน |
| **TEST-F09-05c** | AC-F09-04 | API integration | แม่แบบที่ archive แล้ว | `PATCH` `{name: "X"}` | 409 `{"error":"Conflict"}`; DB เดิม |
| **TEST-F09-06a** | AC-F09-05 | API integration | แม่แบบปกติ + แม่แบบอื่นที่ยังไม่ archived ของ PM A; archive แม่แบบแรก | Participant P `GET /api/templates`; PM A `GET /api/templates` | P เห็นเฉพาะแม่แบบที่ไม่ archived; PM A เห็นทั้งสอง และแม่แบบแรกมี `is_archived: true` |
| **TEST-F09-06b** | AC-F09-05 | API integration | แม่แบบที่ archive แล้ว | P `POST /api/goals` ด้วย `template_id` นั้น (start วันนี้, end วันนี้ + 10) | 404 `{"error":"Not Found"}`; ไม่มี goal ใหม่ใน DB |
| **TEST-F09-06c** | AC-F09-05 | API integration | goal active ของ P ที่ใช้แม่แบบ (positive control: บันทึก entry ได้ก่อน archive); แล้ว archive แม่แบบ | P `POST` entry วันนี้ minutes 30 ใน goal เดิม; `GET progress` | 201; progress `total_minutes = 30` |
| **TEST-F09-07** | AC-F09-06 | API integration | goal active ของ P มี entry วันที่ วันนี้ − 1 minutes 30 (ในช่วง 10–120) | PM A `PATCH` `{min_value: 40}`; P `POST` entry วันนี้ minutes 30 และ minutes 50; `GET entries` และ `GET progress` | `POST` 30 → 400 `fields.minutes = "out of template range"`; `POST` 50 → 201; entry เดิม (30) ยังอยู่และค่าเดิม; `total_minutes = 80` |
| **TEST-F09-08a** | AC-F09-07 | API integration | Participant P login | `PATCH` และ `POST .../archive` | 403 ทั้งคู่; แม่แบบไม่เปลี่ยน |
| **TEST-F09-08b** | AC-F09-07 | API integration | PM B login; แม่แบบของ PM A (positive control: PM A แก้ชื่อได้ 200 ก่อน) | PM B `PATCH` และ `POST .../archive` | 404 ทั้งคู่; แม่แบบของ A ไม่เปลี่ยนจากค่าที่ A แก้ และ `is_archived = false` |
| **TEST-F09-08c** | AC-F09-07 | API integration | PM A login (positive control ว่า route มี) | `PATCH /api/templates/<id>` และ `POST .../archive` ด้วย id = "abc", 0, -1, 999999 | 404 ทุกกรณี |
| **TEST-F09-08d** | AC-F09-07 | API integration | ไม่ login | `PATCH /api/templates/1` และ `POST /api/templates/1/archive` | 401 (เพิ่ม `['patch','/api/templates/1']` และ `['post','/api/templates/1/archive']` ใน `PROTECTED_ENDPOINTS` ของ `rbac.test.js`) |
| **TEST-F09-09** | AC-F09-02, AC-F09-03 | Unit | – | `validateTemplateUpdate(body, {name, min_value: 10, max_value: 120})` กับ name ว่าง/ยาว/ไม่ใช่ string; min/max = 0, 1, 960, 961, 1.5, "10", null; `{max_value: 5}`, `{min_value: 200}`, `{min_value: 80, max_value: 70}`, `{min_value: 50, max_value: 50}`; `unit` = "minutes"/"hours"; field เกิน; body ว่าง/มีแต่ `unit`; ผิดหลาย field | ข้อความและ field ตรงตาม S-3, S-4, S-5, S-10 |
| **TEST-F09-11** | AC-F09-08 | Frontend unit (vitest) | – | `friendlyFields({min_value: "must be <= max_value"})` และ `friendlyFields({max_value: "must be >= min_value"})` | "Min minutes must be at most the max minutes."; "Max minutes must be at least the min minutes." |
| **TEST-F09-10** | AC-F09-08 | UI (manual demo พร้อม screenshot; ใช้ E2E ถ้าโปรเจกต์มี) | PM มีแม่แบบ 1 อัน, Participant มี goal active ที่ใช้แม่แบบนั้น | PM แก้ชื่อและช่วงค่า → reload; ใส่ต่ำสุดมากกว่าสูงสุด → บันทึก; เก็บถาวร; จากนั้นเข้าเป็น Participant เปิดหน้ารายละเอียด goal นั้นและบันทึก entry | ค่าใหม่คงอยู่หลัง reload; ต่ำสุดมากกว่าสูงสุดแสดง "Max minutes must be at least the min minutes." ใต้ช่องสูงสุด (ฟอร์มส่งทั้ง min และ max จึงได้ `fields.max_value` ตาม S-4); แม่แบบ archived แสดงป้ายและไม่มีปุ่ม; หน้า goal โหลดและบันทึก entry ได้ |

---

## 5. Definition of Done และหลักฐาน

- [ ] contract นี้ commit ก่อนโค้ดและเทสต์ (commit แยก) — `<sha>`
- [ ] เทสต์ทุกข้อใน §4 (ยกเว้น TEST-F09-10 แต่รวม TEST-F09-11) เขียนก่อนโค้ด และบันทึกผลรันที่ **fail** พร้อม commit — `<sha>`, ผลรัน `evidence/F-09-red-run.txt`
- [ ] โค้ดครบตาม §2 (API, Logic, UI) และ `npm test` ผ่านทุกเทสต์ — `<sha>`, ผลรัน `evidence/F-09-green-run.txt` (ระบุจำนวน passed/failed/skipped)
- [ ] TEST-F09-10 รันบน candidate แล้ว พร้อม screenshot ที่ระบุ version — `evidence/F-09-ui-*.png`
- [ ] **ทั้ง test suite** ยังผ่าน (regression ของ F-01 ถึง F-07 และ feature อื่นใน Sprint 2 โดยเฉพาะ BR-02, BR-05, BR-07, BR-08) และ endpoint ใหม่อยู่ใน `PROTECTED_ENDPOINTS`
- [ ] response ไม่มี `created_by` หรือ secret; error ไม่มี SQL/stack
- [ ] `docs/traceability.md` อัปเดตแถว FR-11 ด้วย AC/TEST, ผลรัน และ commit SHA
- [ ] PR เข้า `sprint-2-staging` ผ่าน review จากเพื่อน — PR #<เลข>
- [ ] merge เข้า `main` อยู่ใน release Sprint 2 (tag `<tag>`) และปิด Issue #<เลข> แล้ว

---

## 6. ประวัติการเปลี่ยนแปลง Contract

| วันที่ | เวอร์ชัน | การเปลี่ยนแปลง | เหตุผล |
|---|---|---|---|
| 2026-11-28 | 1.0 | สร้างร่าง | ก่อนเริ่ม implement |
| 2026-11-28 | 1.1 | §2 UI แสดง error ผ่าน `friendlyFields()` และเพิ่มข้อความ `must be <= max_value` ใน `messages.js`; TEST-F09-10 คาดข้อความที่แปลแล้ว; เพิ่ม TEST-F09-11 | review: UI จริงแปลข้อความ API ผ่าน `messages.js` ก่อนแสดง |
