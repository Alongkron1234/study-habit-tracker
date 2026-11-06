# Contract: F-01 การยืนยันตัวตน + F-02 การควบคุมสิทธิ์และ error ที่ปลอดภัย

**Sprint:** 1 | **Issue:** #2 | **Branch:** `feature/auth-rbac`
**อ้างอิง SRS:** FR-01, FR-02, FR-03, BR-07, BR-08, NFR-01, NFR-02, NFR-03, NFR-06
**เวอร์ชัน:** 1.0 (ร่าง) | **วันที่:** 2026-11-06
**ผู้ทำ:** @Alongkron1234 | **ผู้ review:** @atiwit

---

## 1. Feature SDS

### พฤติกรรมและ Workflow

F-01 ให้ผู้ใช้ที่มีบัญชีจาก seed เข้าสู่ระบบ ตรวจตัวตนปัจจุบัน และออกจากระบบ โดยใช้ **session ฝั่งเซิร์ฟเวอร์** (express-session + ตาราง `session` ใน Postgres จาก F-07) ส่ง session id ผ่าน cookie
F-02 เป็นความรับผิดชอบข้ามระบบ: middleware ตรวจ session, ตรวจ role, ตรวจความเป็นเจ้าของข้อมูล และ error handler ที่ไม่เปิดเผยข้อมูลภายใน feature อื่น (F-03 ถึง F-06) ต้องใช้ middleware เหล่านี้

**Login:** ผู้ใช้ส่ง username + password → ค้นผู้ใช้ → เทียบรหัสผ่านด้วย bcrypt → สร้าง session ใหม่ (regenerate id) เก็บ `{id, username, role}` → ตอบ 200
**Logout:** ทำลาย session ในฐานข้อมูลและลบ cookie → session เดิมใช้ไม่ได้อีก
**Me:** อ่านตัวตนจาก session → ตอบ `{id, username, role}`

### กฎและการตัดสินใจ (ขอให้ reviewer ยืนยัน)

| # | การตัดสินใจ | เหตุผล |
|---|---|---|
| S-1 | login ล้มเหลวทุกกรณี (ไม่พบ username / รหัสผ่านผิด) ตอบ **401 ข้อความเดียวกันทุกตัวอักษร** | FR-01 ห้ามบอกว่าผิดที่ username หรือ password (ป้องกัน enumeration) |
| S-2 | ไม่พบ username ให้ยังเรียก `bcrypt.compare` กับ hash หลอก | ลดความต่างของเวลาตอบ ระหว่างกรณี username ถูกกับผิด |
| S-3 | อายุ session คงที่ **8 ชม. นับจาก login** (`rolling: false`) ค่ามาจาก `SESSION_TTL_HOURS` | NFR-03 |
| S-4 | login สำเร็จต้อง `regenerate` session id ใหม่เสมอ | กัน session fixation |
| S-5 | role ไม่พอ → **403**; ทรัพยากรเป็นของ Participant คนอื่น → **404** | BR-08: ไม่ยืนยันว่าข้อมูลของคนอื่นมีอยู่ (issue ระบุ 403/404) |
| S-6 | logout ต้องมี session (ไม่มี → 401 เหมือน endpoint ที่ป้องกันทั้งหมด) | ความสม่ำเสมอ ตรวจด้วยตารางเดียว (NFR-01) |
| S-7 | error 4xx/5xx ใช้ข้อความ **คงที่ตามสถานะ** ไม่ใช้ `err.message` ของ library | `express.json` ส่งข้อความ parse error ภายในออกมา (NFR-06) |

### Dependencies
- F-07 (ตาราง `users`, `session`, seed, pool) — merge แล้วใน `sprint-1-staging`
- F-02 ขึ้นกับ F-01 (ต้องมี session ก่อนตรวจสิทธิ์)
- F-03 ถึง F-06 ขึ้นกับ F-02

### นอกขอบเขต
สมัครสมาชิก, กู้รหัสผ่าน, ล็อกบัญชีหลังใส่รหัสผิดซ้ำ (rate limiting), CSRF token (ใช้ `SameSite=Lax` แทน), เปลี่ยนรหัสผ่าน, หลาย role ต่อบัญชี (ตาม SRS §4)

---

## 2. สเปก API / Data / UI

### API (ทั้งหมดเป็น JSON, prefix `/api/auth`)

| Method + Path | สิทธิ์ | Request | สำเร็จ | ล้มเหลว |
|---|---|---|---|---|
| `POST /api/auth/login` | สาธารณะ | `{ "username": string, "password": string }` | **200** `{ "user": { "id", "username", "role" } }` + `Set-Cookie` (HttpOnly, SameSite=Lax, Max-Age = 8 ชม.) | **400** `{"error":"Bad Request"}` ถ้าขาด/ว่าง/ไม่ใช่ string · **401** `{"error":"Invalid username or password"}` |
| `POST /api/auth/logout` | ต้อง login | ไม่มี body | **204** ไม่มี body, ลบ cookie, ลบแถวใน `session` | **401** `{"error":"Unauthorized"}` |
| `GET /api/auth/me` | ต้อง login | – | **200** `{ "user": { "id", "username", "role" } }` | **401** `{"error":"Unauthorized"}` |

response ต้อง **ไม่มี** `password_hash`, `email` หรือฟิลด์อื่นนอกจาก `id, username, role`

### Middleware (F-02) — `backend/src/middleware/auth.js`

| ชื่อ | พฤติกรรม |
|---|---|
| `requireAuth` | ไม่มี `req.session.user` → **401** `{"error":"Unauthorized"}` |
| `requireRole(...roles)` | role ของผู้ใช้ไม่อยู่ใน `roles` → **403** `{"error":"Forbidden"}` (ต้องใช้หลัง `requireAuth`) |
| `ownedBy(loader)` | `loader(req)` คืนเจ้าของทรัพยากร ถ้าไม่ตรงกับ `req.session.user.id` → **404** `{"error":"Not Found"}` |

### รูปแบบ error ที่ปลอดภัย (NFR-06) — `backend/src/middleware/errors.js`

ทุก error ตอบ `{ "error": <ข้อความคงที่> }` เท่านั้น:

| สถานะ | ข้อความ |
|---|---|
| 400 | `Bad Request` |
| 401 | `Unauthorized` (login ผิด: `Invalid username or password`) |
| 403 | `Forbidden` |
| 404 | `Not Found` (รวม route ที่ไม่มีอยู่) |
| 5xx | `Internal Server Error` |

ห้ามมี stack trace, ข้อความ SQL/pg, path ไฟล์ หรือ `err.message` ดิบ ใน response รายละเอียดจริง log ฝั่งเซิร์ฟเวอร์เท่านั้น

### ผลต่อโครงสร้างโค้ด (ชั้นที่เปลี่ยน)

| ชั้น | เปลี่ยน? | รายละเอียด |
|---|---|---|
| ฐานข้อมูล | **ไม่เปลี่ยน** | ใช้ `users`, `session` เดิม ไม่มี migration ใหม่ |
| API | เปลี่ยน | เพิ่ม `routes/auth.js`, `middleware/auth.js`, `middleware/errors.js` |
| โครงสร้างแอป | เปลี่ยน | แยก `src/app.js` (สร้างแอป ไม่ listen) ออกจาก `src/index.js` เพื่อให้ supertest ใช้แอปเดียวกับของจริง |
| UI | **ไม่เปลี่ยนใน contract นี้** | หน้า login อยู่ใน Part C (System SDS) และงาน UI แยก |

### Environment variables ที่ใช้ (มีอยู่แล้วใน `.env.example`)
`SESSION_SECRET` (บังคับ), `SESSION_TTL_HOURS` (ค่าเริ่มต้น 8), `NODE_ENV` (`production` → cookie `Secure`)

---

## 3. Acceptance Criteria

| ID | เงื่อนไข (ผลที่สังเกตได้) | Requirement |
|---|---|---|
| **AC-F01-01** | login ด้วย username/password ถูกต้อง → 200 ได้ `{id, username, role}` และ cookie แบบ HttpOnly โดย response ไม่มี `password_hash` | FR-01 |
| **AC-F01-02** | login ผิด → 401 และ **body เหมือนกันทุกตัวอักษร** ระหว่างกรณี "รหัสผ่านผิด" กับ "ไม่มี username นี้"; ขาด/ว่าง field → 400 | FR-01 |
| **AC-F01-03** | `GET /me` ด้วย session ที่ถูกต้อง → 200 ได้ตัวตนและ role ของผู้ใช้นั้น | FR-03 |
| **AC-F01-04** | logout → 204; ใช้ cookie เดิมเรียก `/me` ได้ 401; แถวของ session นั้นถูกลบจากตาราง `session` | FR-02, NFR-03 |
| **AC-F01-05** | session ที่ `expire` เลยเวลาแล้ว → 401; cookie ที่ออกตอน login มีอายุ 8 ชม. (28800 วินาที) | NFR-03 |
| **AC-F01-06** | รหัสผ่านในฐานข้อมูลเป็น bcrypt hash: ≠ รหัสผ่านจริง, ขึ้นต้น `$2`, และ `bcrypt.compare` ผ่าน | NFR-02 |
| **AC-F01-07** | login สำเร็จขณะถือ cookie เดิมอยู่ → ได้ session id **ใหม่** ที่ไม่ซ้ำเดิม | NFR-03 (กัน fixation) |
| **AC-F02-01** | ทุก endpoint ที่ป้องกัน ตอบ 401 เมื่อไม่มี cookie หรือ cookie ที่ไม่ถูกต้อง โดย body ไม่มีข้อมูลส่วนตัว | NFR-01 |
| **AC-F02-02** | Participant เรียก endpoint เฉพาะ PM → 403; PM เรียก endpoint เฉพาะ Participant → 403; PM เรียก endpoint ของ PM → 200 | BR-07, BR-08 |
| **AC-F02-03** | Participant เจ้าของทรัพยากร → 200; Participant คนอื่น → 404; PM → 403 | BR-08 |
| **AC-F02-04** | error ที่ไม่คาดคิด → 500 `{"error":"Internal Server Error"}` ไม่มี stack/SQL/message ภายใน; JSON พัง → 400 ข้อความคงที่; route ไม่มี → 404 ข้อความคงที่ | NFR-06 |

---

## 4. Software Test Specification

ไฟล์เทสต์: `backend/tests/auth.test.js` (F-01) และ `backend/tests/rbac.test.js` (F-02)
Level ทั้งหมดเป็น **API integration** (supertest + Postgres จริง) ยกเว้นที่ระบุ
สภาพแวดล้อม: ตั้ง `DATABASE_URL = TEST_DATABASE_URL` และ `SESSION_SECRET` ก่อน `require` แอป; ผู้ใช้ทดสอบสร้างเองในเทสต์ (prefix `test_auth_`, `test_rbac_`) รหัสผ่านทดสอบเป็นค่าสังเคราะห์ในไฟล์เทสต์ และลบทั้งผู้ใช้และแถว `session` หลังจบ

| ID Test | AC | Precondition | Action | Expected |
|---|---|---|---|---|
| **TEST-F01-01** | AC-F01-01 | มี Participant ที่รู้รหัสผ่าน | `POST /login` ถูกต้อง | 200; `user` มีแค่ `id,username,role`; `Set-Cookie` มี `HttpOnly` |
| **TEST-F01-02a** | AC-F01-02 | มีผู้ใช้ | login รหัสผ่านผิด | 401 `{"error":"Invalid username or password"}` |
| **TEST-F01-02b** | AC-F01-02 | – | login ด้วย username ที่ไม่มี | 401 และ body เท่ากับของ 02a ทุกตัวอักษร |
| **TEST-F01-02c** | AC-F01-02 | – | login ไม่ส่ง password / ส่งค่าว่าง / ส่งตัวเลข | 400 `{"error":"Bad Request"}` |
| **TEST-F01-03** | AC-F01-03 | login แล้ว | `GET /me` พร้อม cookie | 200 ตรงกับผู้ใช้ที่ login (id, username, role) |
| **TEST-F01-04a** | AC-F01-04 | login แล้ว | `POST /logout` แล้ว `GET /me` ด้วย cookie เดิม | logout 204; `/me` 401 |
| **TEST-F01-04b** | AC-F01-04 | login แล้ว จดค่า sid | logout แล้ว query ตาราง `session` | ไม่มีแถวของ sid นั้น |
| **TEST-F01-05a** | AC-F01-05 | login แล้ว | `UPDATE session SET expire = now() - interval '1 minute'` แล้ว `GET /me` | 401 |
| **TEST-F01-05b** | AC-F01-05 | – | login แล้วอ่าน `Set-Cookie` | `Max-Age`/`Expires` ≈ 28800 วินาที (คลาดไม่เกิน 5 วินาที) |
| **TEST-F01-06** | AC-F01-06 | ผู้ใช้ที่สร้างผ่านโค้ดของระบบ | อ่าน `users.password_hash` | ≠ รหัสผ่านจริง, ขึ้นต้น `$2`, `bcrypt.compare` เป็น true (Integration/DB) |
| **TEST-F01-07** | AC-F01-07 | login ครั้งแรกได้ cookie A | login ซ้ำพร้อม cookie A | cookie ที่ได้ใหม่ค่าต่างจาก A |
| **TEST-F02-01a** | AC-F02-01 | – | เรียกทุก endpoint ในรายการ "ที่ป้องกัน" โดยไม่มี cookie | ทุกตัว 401 และ body = `{"error":"Unauthorized"}` |
| **TEST-F02-01b** | AC-F02-01 | – | เรียกทุก endpoint ในรายการเดียวกันด้วย cookie ปลอม | ทุกตัว 401 |
| **TEST-F02-02a** | AC-F02-02 | route ทดสอบ `requireRole('pm')` | Participant เรียก | 403 `{"error":"Forbidden"}` |
| **TEST-F02-02b** | AC-F02-02 | route ทดสอบ `requireRole('participant')` | PM เรียก | 403 |
| **TEST-F02-02c** | AC-F02-02 | route `requireRole('pm')` | PM เรียก | 200 |
| **TEST-F02-03a** | AC-F02-03 | ทรัพยากรทดสอบเป็นของ Participant A | A เรียก | 200 |
| **TEST-F02-03b** | AC-F02-03 | ทรัพยากรของ A | Participant B เรียก | 404 `{"error":"Not Found"}` |
| **TEST-F02-03c** | AC-F02-03 | ทรัพยากรของ A | PM เรียก | 403 |
| **TEST-F02-04a** | AC-F02-04 | route ทดสอบที่ throw `Error('SELECT * FROM users failed ... secret')` | เรียก route | 500 `{"error":"Internal Server Error"}` และ body ไม่มีคำว่า `SELECT`, `secret`, `stack`, `at ` |
| **TEST-F02-04b** | AC-F02-04 | – | `POST /login` ด้วย body JSON ที่พัง | 400 `{"error":"Bad Request"}` (ไม่มีข้อความ parse ของ library) |
| **TEST-F02-04c** | AC-F02-04 | – | เรียก path ที่ไม่มีอยู่ | 404 `{"error":"Not Found"}` |

**รายการ endpoint ที่ป้องกัน** (ใช้ใน TEST-F02-01): เริ่มจาก `GET /api/auth/me`, `POST /api/auth/logout` เมื่อ F-03 ถึง F-06 เพิ่ม endpoint ต้องเพิ่มเข้ารายการนี้ในไฟล์เทสต์ทุกครั้ง (เป็น regression ตาม traceability)

**หมายเหตุขอบเขตของเทสต์ F-02:** middleware ยังไม่มี endpoint ธุรกิจจริงให้ใช้ จึงทดสอบกับ route ทดสอบที่ประกาศในไฟล์เทสต์เท่านั้น การตรวจ BR-07/BR-08 กับ endpoint จริง (แม่แบบ เป้าหมาย entry) เป็นหน้าที่ของ contract F-03 ถึง F-06

---

## 5. Definition of Done และหลักฐาน

- [ ] contract นี้ commit ก่อนโค้ดและเทสต์ (commit แยก)
- [ ] เทสต์ทุกข้อใน §4 เขียนก่อนโค้ดและบันทึกผลรัน **fail** พร้อม commit (หลักฐาน TDD)
- [ ] โค้ดครบตาม §2 และ `npm test` ผ่านทุกเทสต์ พร้อมแนบ output และ commit ที่ทดสอบ
- [ ] เทสต์ของ F-07 (11 ข้อ) ยังผ่านเหมือนเดิม (regression)
- [ ] ไม่มี `password_hash` / secret ใน response หรือ log ตรวจจากเทสต์ TEST-F01-01 และอ่านโค้ด
- [ ] README เพิ่มวิธีลอง login ด้วยบัญชี seed (ไม่ใส่รหัสผ่านจริงใน Git)
- [ ] `docs/traceability.md` อัปเดตสถานะแถว FR-01–03, BR-07, BR-08, NFR-01–03, NFR-06 ด้วยเลข AC/TEST
- [ ] PR เข้า `sprint-1-staging` ผ่าน review จาก @atiwit (ผู้เขียนไม่อนุมัติเอง)

---

## 6. ประวัติการเปลี่ยนแปลง Contract

| วันที่ | การเปลี่ยนแปลง | เหตุผล |
|---|---|---|
| 2026-11-06 | สร้าง v1.0 (ร่าง) | ก่อนเริ่ม implement |
