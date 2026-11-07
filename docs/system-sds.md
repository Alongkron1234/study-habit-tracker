# System-Level SDS (Part C)

**ผลิตภัณฑ์:** Study Habit Tracker | **เวอร์ชัน:** 0.2 (ร่าง) | **อ้างอิง:** SRS v0.2, `features.md`, `traceability.md`
**วันที่:** 2026-11-07

เอกสารนี้อธิบายการออกแบบระดับทั้งระบบ รายละเอียดของแต่ละ feature (endpoint, AC, test) อยู่ใน contract ของ feature นั้นที่ `docs/sprints/sprint-N/`
ส่วนที่ระบุว่า **"ทำแล้ว"** ตรงกับโค้ดบน `sprint-1-staging` ส่วนที่ระบุว่า **"แผน"** ยังไม่ได้ implement และจะยืนยันใน contract ของ feature นั้น

## 1. สถาปัตยกรรมและ stack

### 1.1 Stack ที่เลือก

| ชั้น | เทคโนโลยี | สถานะ |
|---|---|---|
| Frontend | React + Vite (SPA), React Router | ทำแล้ว (UI-01, PR #11) |
| Backend / API | Node.js 20+, Express 4 | ทำแล้ว |
| ฐานข้อมูล | PostgreSQL (ทดสอบบน 16, README ระบุขั้นต่ำ 14) ผ่านไลบรารี `pg` ไม่ใช้ ORM | ทำแล้ว |
| Session | `express-session` เก็บใน Postgres ผ่าน `connect-pg-simple` | ทำแล้ว |
| รหัสผ่าน | `bcrypt` (10 rounds) | ทำแล้ว |
| ทดสอบ | Jest + supertest (unit, API/DB integration); E2E สำหรับ journey หลักเลือกเครื่องมือใน contract ของ UI | Jest (backend) และ Vitest + React Testing Library (frontend) ทำแล้ว; เทสต์ journey ของ UI ใช้ mock API ยังไม่มี E2E อัตโนมัติ |
| Container / Deploy | Docker, GCP (ดู §7) | แผน (Lab 5) |

สเปกวิชา §5.1 ให้เลือก stack เองและให้อธิบายเหตุผลที่นี่ (ไม่ต้องตรงกับ Lab 1–4)

### 1.2 เหตุผลและตัวเลือกที่พิจารณา

| การตัดสินใจ | เลือก | ตัวเลือกที่พิจารณา | เหตุผล |
|---|---|---|---|
| Frontend | React + Vite SPA | Next.js | มี backend Express แยกอยู่แล้ว Next.js จะเพิ่ม server/SSR อีกชั้นที่ไม่ได้ใช้ (ทุกหน้าอยู่หลัง login ไม่ต้องการ SEO) Vite build เป็นไฟล์ static ให้ Express เสิร์ฟได้ ได้ container เดียว และใช้ proxy `/api` ทำให้ cookie session ทำงาน origin เดียวกันไม่ต้องตั้ง CORS |
| Backend | Express (JavaScript) | NestJS, FastAPI | ภาษาเดียวกับ frontend ทีมเล็ก เวลาจำกัด โครงเล็กพอให้เห็นการบังคับกฎทุกจุด |
| ฐานข้อมูล | PostgreSQL | SQLite, MySQL | ต้องการ constraint ที่ฐานข้อมูลบังคับเอง: partial unique index (1 active goal ต่อแม่แบบ), UNIQUE(goal_id, entry_date), CHECK (A-04, NFR-05) และมีบริการจัดการบน GCP (Cloud SQL) |
| การเข้าถึงข้อมูล | SQL ตรงผ่าน `pg` | ORM (Prisma, Sequelize) | constraint และ migration เป็น SQL ที่เห็นและทดสอบได้ตรงๆ ข้อเสียคือเขียนคำสั่งเอง |
| Session | session ฝั่งเซิร์ฟเวอร์ใน Postgres | JWT | logout ต้องเพิกถอนทันที (FR-02, NFR-03) session ในฐานข้อมูลลบได้ทันที และใช้ได้ดีกับ container ที่ไม่เก็บสถานะ |

### 1.3 ภาพรวมและหน้าที่ของแต่ละชั้น

```
 เบราว์เซอร์                       Express (Node.js)                      PostgreSQL
┌──────────────┐  /api (JSON)  ┌───────────────────────────┐  SQL (pg)  ┌──────────────┐
│ React SPA    │ ────────────▶ │ session → middleware      │ ─────────▶ │ users        │
│ (Vite)       │  cookie       │  (requireAuth/Role/Owned) │            │ templates    │
│ - หน้าจอ     │ ◀──────────── │ → routes → SQL            │ ◀───────── │ goals        │
│ - เรียก API  │   JSON        │ → error handler           │            │ entries      │
└──────────────┘               └───────────────────────────┘            │ session      │
  dev: Vite proxy /api → :3000   ไฟล์ static ของ SPA เสิร์ฟจาก Express    └──────────────┘
  prod: ไฟล์ static เสิร์ฟจาก Express (container เดียว)
```

| ชั้น | หน้าที่ | ไม่ทำ |
|---|---|---|
| UI | แสดงผล เก็บข้อมูลจากผู้ใช้ ตรวจรูปแบบเบื้องต้นเพื่อความสะดวก เรียก API | ไม่ตัดสินสิทธิ์ ไม่เป็นที่เชื่อถือของกฎธุรกิจ (การซ่อนปุ่มไม่ใช่ authorization) |
| API (Express) | ตรวจ session/role/ความเป็นเจ้าของ ตรวจข้อมูลและกฎธุรกิจ คำนวณความคืบหน้า แปลง error เป็นรูปแบบปลอดภัย | ไม่เก็บสถานะใน memory (ใช้ฐานข้อมูล) |
| ฐานข้อมูล | เก็บข้อมูลถาวร บังคับ constraint ที่เป็นหลักประกันสุดท้าย (ซ้ำ, ช่วงค่า, 1 active goal) | ไม่มี logic ธุรกิจนอกเหนือจาก constraint |

โครงโค้ด (ทำแล้วทั้งหมด):

```
backend/src/  app.js (createApp) · index.js (listen) · db/ (pool, migrate, migrations/, seeds/)
              middleware/ (auth.js, errors.js) · routes/ (auth, templates, goals, entries)
backend/tests/  persistence · auth · rbac · templates · goals · entries · validate (+ helpers/)
frontend/       src/ (api/ context/ components/ pages/ config/ tests/) · vite.config.js (proxy /api)
docs/           เอกสารทั้งหมด · docs/sprints/sprint-N/ contract และ evidence
```

### 1.4 กฎทางธุรกิจถูกบังคับที่ชั้นไหน

หลักการ: **ชั้น API ตรวจและให้ข้อความที่ชัดเจน, ฐานข้อมูลเป็นหลักประกันสุดท้ายเมื่อทำได้** (A-04)

| กฎ | API (app) | ฐานข้อมูล | สถานะ |
|---|---|---|---|
| BR-01 1 entry ต่อวัน (รวม NFR-05 คำขอพร้อมกัน) | ตรวจก่อนบันทึก และแปลง error 23505 เป็น 409/400 | `UNIQUE(goal_id, entry_date)` | DB และ API ทำแล้ว (F-05, PR #10) |
| BR-02 ช่วงค่า entry | ตรวจจำนวนเต็ม อยู่ในช่วงของแม่แบบ | CHECK minutes 1–960, template min ≥ 1 และ max ≤ 960 | DB และ API ทำแล้ว (F-03, F-05) |
| BR-03 ช่วงวันที่ของ entry | ตรวจในช่วงเป้าหมาย ไม่อนาคต ย้อนหลังไม่เกิน 7 วัน | ไม่มี (ขึ้นกับวันปัจจุบัน) | ทำแล้ว (F-05, PR #10) |
| BR-04 เงื่อนไขเป้าหมาย | ยอดเป็นจำนวนเต็มบวก วันเริ่มไม่ก่อนวันนี้ ระยะไม่เกิน 365 วัน | CHECK target_minutes > 0, end_date ≥ start_date | DB และ API ทำแล้ว (F-04, PR #9) |
| BR-05 สถานะเป้าหมาย / 1 active ต่อแม่แบบ | คำนวณ ended จากวันที่ ปฏิเสธ entry หลังสิ้นสุด | partial unique index `uq_goals_active` | DB และ API ทำแล้ว (F-04, F-05) |
| BR-06 ความคืบหน้า | คำนวณตอนอ่าน (ไม่เก็บซ้ำ) ปัด 1 ตำแหน่ง แสดงสูงสุด 100% | – | ทำแล้ว (F-06, PR #10) |
| BR-07 เฉพาะ PM จัดการแม่แบบ | `requireRole('pm')` | – | middleware ทำแล้ว, ใช้จริงใน F-03 |
| BR-08 ข้อมูลเป็นของเจ้าของ | `requireRole('participant')` + `ownedBy` / query กรองตามผู้ใช้ | entry ไม่เก็บ `user_id` ซ้ำ ผูกผ่าน `goals.user_id` | middleware ทำแล้ว, ใช้จริงใน F-04 ถึง F-06 |
| BR-09 หน่วยคงที่ | ไม่รับการแก้หน่วย | `unit` default `minutes` | DB ทำแล้ว |

### 1.5 กลยุทธ์การทดสอบ (สรุป)
- **Unit:** ตรรกะล้วน เช่น คำนวณความคืบหน้า กฎวันที่ (เขียนเป็นฟังก์ชันบริสุทธิ์เพื่อทดสอบง่าย)
- **API/DB integration:** supertest กับ Postgres จริง (`TEST_DATABASE_URL`) ครอบคลุมสิทธิ์ ownership constraint และ persistence ทำแล้วสำหรับ F-01, F-02, F-07
- **UI/E2E:** journey หลัก (login → สร้างเป้า → บันทึก → ดูความคืบหน้า) และกรณีถูกปฏิเสธ เลือกเครื่องมือใน contract ของ UI
- ทุก endpoint ที่ป้องกันต้องอยู่ในรายการทดสอบ 401 ของ `backend/tests/rbac.test.js` (regression ของ NFR-01)

## 2. โมเดลข้อมูล

### 2.1 Entities และความสัมพันธ์ (ทำแล้ว — `001_initial_schema.sql`, `002_session_store.sql`)

```
users 1 ──< activity_templates   (created_by)      PM สร้างแม่แบบ
users 1 ──< goals                (user_id)         Participant เป็นเจ้าของเป้าหมาย
activity_templates 1 ──< goals   (template_id)
goals 1 ──< habit_entries        (goal_id)         entry สังกัดเป้าหมาย (เจ้าของ = goals.user_id)
session, schema_migrations       ตารางระบบ (ไม่มี FK)
```

| ตาราง | ฟิลด์หลัก | Constraint สำคัญ |
|---|---|---|
| `users` | id, username, email, password_hash, role | UNIQUE(username), UNIQUE(email), role IN ('pm','participant') |
| `activity_templates` | id, created_by→users, name, unit, min_value, max_value, is_archived | min_value 1–960, max_value ≥ min_value และ ≤ 960, unit default 'minutes' |
| `goals` | id, user_id→users, template_id→templates, target_minutes, start_date, end_date, status | target_minutes > 0, end_date ≥ start_date, status IN ('active','ended'), partial UNIQUE (user_id, template_id) WHERE status='active' |
| `habit_entries` | id, goal_id→goals, entry_date, minutes | minutes 1–960, **UNIQUE(goal_id, entry_date)** |
| `session` | sid, sess, expire | PRIMARY KEY(sid), index บน expire |
| `schema_migrations` | filename, applied_at | PRIMARY KEY(filename) |

### 2.2 ความเป็นเจ้าของข้อมูล
- Participant เป็นเจ้าของ `goals` ผ่าน `goals.user_id` และเป็นเจ้าของ `habit_entries` **ผ่านเป้าหมาย** ตารางนี้ไม่เก็บ `user_id` ซ้ำ เพื่อไม่ให้ขัดแย้งกับเจ้าของจริง (BR-08)
- PM เป็นเจ้าของ `activity_templates` ผ่าน `created_by` แต่ **ไม่มีเส้นทางอ่านข้อมูลของ Participant** (BR-08)
- ไม่มี `ON DELETE CASCADE`: ลบ goal ที่มี entry ไม่ได้ เพื่อกันประวัติหายเงียบๆ

### 2.3 เวลาและวันที่
ใช้ปฏิทิน Asia/Bangkok (A-02) เก็บวันที่เป็นชนิด `DATE` กฎเรื่อง "วันนี้" คำนวณจากเวลาเซิร์ฟเวอร์ (`TZ=Asia/Bangkok`) **ทำใน F-04:** ตั้ง type parser ของ `pg` ให้คืนค่า `DATE` เป็นสตริง `YYYY-MM-DD` เพื่อเลี่ยงการเลื่อนวันจากเขตเวลา (ทำแล้วใน `db.js` พร้อม F-04, PR #9)

### 2.4 Setup ฐานข้อมูล (ทำแล้ว)
- **Migration:** `npm run migrate` อ่าน `src/db/migrations/*.sql` ตามลำดับ บันทึกใน `schema_migrations` รันซ้ำได้ (ข้ามไฟล์ที่ apply แล้ว) แต่ละไฟล์อยู่ใน transaction
- **Seed:** `npm run seed` ทำซ้ำได้ (upsert): PM 1 คน (`pm_alice`), Participant 2 คน (`participant_bob`, `participant_carol`), แม่แบบ "Reading Practice" 1 รายการ, เป้าหมาย active ของ Participant ทั้งสองพร้อม entry ตัวอย่าง 3 วัน รหัสผ่านเป็นค่าสังเคราะห์ เก็บเป็น bcrypt hash

## 3. UI (ทำแล้ว — UI-01, issue #6, PR #11)

### 3.1 หน้าจอหลักและ navigation

| เส้นทาง | บทบาท | เนื้อหา | Feature |
|---|---|---|---|
| `/login` | สาธารณะ | ฟอร์ม username/password | UI-01 |
| `/dashboard` | ทุกบทบาทที่ login | ข้อมูลผู้ใช้ + ปุ่มลัดตามบทบาท | UI-01 |
| `/templates` | PM | รายการแม่แบบของตน + ฟอร์มสร้าง | F-03 |
| `/goals` | Participant | รายการเป้าหมายของตน + ฟอร์มตั้งเป้าจากแม่แบบ (เลือกแม่แบบที่ใช้ได้ในฟอร์มนี้) | F-04 |
| `/goals/:id` | Participant (เจ้าของ) | ความคืบหน้า (ยอดรวม %) ประวัติ entry (ใหม่ → เก่า) ฟอร์มบันทึกรายวัน | F-05, F-06 |
| `/unauthorized` | ที่ login แล้ว | หน้า 403 เมื่อ role เข้า route นั้นไม่ได้ | UI-01 |

- โครงหน้า (Navbar) มีชื่อ/บทบาทผู้ใช้ ปุ่ม logout และเมนูตามบทบาท (PM เห็น Templates, Participant เห็น My Goals) หลัง login ไป `/dashboard` หรือหน้าที่ตั้งใจเข้าถ้า role เข้าได้
- route guard: ยังไม่มี session หรือได้ 401 → กลับ `/login`; role ไม่ตรง → `/unauthorized` ตารางสิทธิ์ของ route อยู่ที่ `frontend/src/config/routes.js`
- **ความเตือน:** เมนูตามบทบาทเป็นเพียงความสะดวกในการใช้งาน การบังคับสิทธิ์จริงอยู่ที่ backend (§5)

### 3.2 พฤติกรรมร่วมของทุกหน้า
| สถานะ | พฤติกรรม |
|---|---|
| Loading | แสดงข้อความ/ตัวบอกสถานะขณะรอ API ปุ่มส่งฟอร์มถูกปิดกันกดซ้ำ |
| Empty | ข้อความบอกว่ายังไม่มีข้อมูล พร้อมการกระทำถัดไป (เช่น "ยังไม่มีเป้าหมาย ตั้งเป้าหมายแรก") |
| Error | แสดงข้อความจาก API (ซึ่งเป็นข้อความคงที่ปลอดภัย §4.3) และปุ่มลองใหม่ ไม่แสดงรายละเอียดภายใน |
| Validation | ตรวจเบื้องต้นฝั่ง UI (ช่วงตัวเลข วันที่) เพื่อความสะดวก แต่ผลชี้ขาดมาจาก API ที่ปฏิเสธเสมอ |
| 401 ระหว่างใช้งาน | พากลับหน้า login พร้อมข้อความว่า session หมดอายุ |

## 4. API

### 4.1 Convention
- เส้นทางขึ้นต้น `/api` ทรัพยากรเป็นพหูพจน์ ใช้ JSON ทั้ง request และ response
- วันที่เป็นสตริง `YYYY-MM-DD` เวลาเป็น ISO 8601 รหัสเป็นจำนวนเต็ม
- รหัสสถานะ: 200/201 สำเร็จ, 204 ไม่มีเนื้อหา, 400 ข้อมูลไม่ถูกต้อง, 401 ไม่มี session, 403 role ไม่พอ, 404 ไม่พบ (รวมทรัพยากรของคนอื่น), 409 ขัดแย้งกับกฎ (เช่น บันทึกซ้ำ), 500 ผิดพลาดฝั่งเซิร์ฟเวอร์
- response ไม่ส่งฟิลด์ที่ไม่จำเป็น (เช่น `password_hash`, `email` ไม่ออกทาง API)

### 4.2 Endpoint ของทั้งระบบ

| Method + Path | สิทธิ์ | Feature | สถานะ |
|---|---|---|---|
| `POST /api/auth/login` | สาธารณะ | F-01 | ทำแล้ว |
| `POST /api/auth/logout` | ต้อง login | F-01 | ทำแล้ว |
| `GET /api/auth/me` | ต้อง login | F-01 | ทำแล้ว |
| `POST /api/templates` | PM | F-03 | ทำแล้ว (PR #9) |
| `GET /api/templates` | PM (ของตน) / Participant (ที่ใช้ได้) | F-03 | ทำแล้ว (PR #9) |
| `POST /api/goals` | Participant | F-04 | ทำแล้ว (PR #9) |
| `GET /api/goals` | Participant (ของตน) | F-04 | ทำแล้ว (PR #9) |
| `GET /api/goals/:id` | Participant (เจ้าของ) | F-04 | ทำแล้ว (PR #9) |
| `POST /api/goals/:id/entries` | Participant (เจ้าของ) | F-05 | ทำแล้ว (PR #10) |
| `GET /api/goals/:id/entries` | Participant (เจ้าของ) | F-06 | ทำแล้ว (PR #10) |
| `GET /api/goals/:id/progress` | Participant (เจ้าของ) | F-06 | ทำแล้ว (PR #10) |

endpoint ทั้ง 11 ตัวทำแล้ว รูปแบบ request/response และรหัสสถานะที่แน่นอนอยู่ใน contract ของแต่ละ feature: `docs/sprints/sprint-1/F-01-F-02-auth-rbac.md`, `F-03-F-04-templates-goals.md`, `F-05-F-06-entry-progress.md`

### 4.3 รูปแบบ error ที่ปลอดภัย (NFR-06) — ทำแล้ว
ทุก error ตอบ `{ "error": "<ข้อความคงที่ตามสถานะ>" }` เท่านั้น: 400 `Bad Request`, 401 `Unauthorized`, 403 `Forbidden`, 404 `Not Found`, 5xx `Internal Server Error` (login ผิดใช้ `Invalid username or password`)
ไม่ส่ง stack trace, SQL หรือ `err.message` ของ library รายละเอียดจริง log ฝั่งเซิร์ฟเวอร์เฉพาะ 5xx
**ข้อกำหนดที่ต้องตัดสินใน F-03/F-05:** error ของการตรวจกฎธุรกิจ (เช่น ค่านอกช่วง) ต้องบอกผู้ใช้ได้ว่าผิดข้อไหน จึงอาจเพิ่มฟิลด์ที่ปลอดภัย เช่น `"fields": { "minutes": "..." }` โดยข้อความต้องมาจากรายการคงที่ ไม่ใช่ข้อความภายใน

## 5. บทบาทและสิทธิ์

หนึ่งบัญชีมีหนึ่งบทบาท (SRS §2) บัญชีมาจาก seed บทบาทและ id มาจาก session ฝั่งเซิร์ฟเวอร์เสมอ ไม่รับจากผู้ใช้

### 5.1 Permission matrix

| การกระทำ | ไม่ login | Participant | PM | ข้อมูลที่เข้าถึงได้ |
|---|---|---|---|---|
| login | ได้ | – | – | – |
| logout, ดูตัวตนปัจจุบัน | 401 | ได้ | ได้ | ของตนเอง |
| สร้างแม่แบบ | 401 | **403** | ได้ | – |
| ดูรายการแม่แบบ | 401 | ได้ (ที่ใช้ได้) | ได้ (ที่ตนสร้าง) | ตามบทบาท |
| ตั้งเป้าหมาย / ดูรายการเป้าหมายของตน | 401 | ได้ | **403** | ของตนเอง |
| ดู/บันทึก entry และความคืบหน้าของเป้าหมาย | 401 | ได้เฉพาะเจ้าของ (ของคนอื่น → **404**) | **403** | ของเจ้าของเท่านั้น |

### 5.2 การบังคับที่ backend (ทำแล้ว — `middleware/auth.js`)
ลำดับ `requireAuth` → `requireRole(...)` → `ownedBy(loader)` และ query ที่กรองด้วยผู้ใช้ปัจจุบัน

| ข้อผิดพลาด | สถานะ | เหตุผล |
|---|---|---|
| ไม่มี session | 401 | NFR-01 |
| role ไม่พอ | 403 | BR-07, BR-08 |
| ทรัพยากรเป็นของ Participant คนอื่น | 404 | ไม่ยืนยันว่ามีข้อมูลของคนอื่น (BR-08) |

ตรวจด้วย `backend/tests/rbac.test.js` ซึ่งทดสอบ middleware กับ route ทดสอบ การทดสอบกับ endpoint จริงเกิดใน contract ของ F-03 ถึง F-06

## 6. การยืนยันตัวตน (ทำแล้ว — F-01, `routes/auth.js`)

| หัวข้อ | การออกแบบ |
|---|---|
| รหัสผ่าน (NFR-02) | `bcrypt` 10 rounds เก็บเฉพาะ hash ไม่เก็บ plaintext |
| Login (FR-01) | username + password ผิดทุกกรณีตอบ 401 ข้อความเดียวกัน (กัน enumeration) ไม่พบ username ก็เทียบกับ hash หลอกเพื่อให้เวลาตอบใกล้เคียงกัน |
| Session (NFR-03) | เก็บในตาราง `session` ส่ง session id ผ่าน cookie `connect.sid` (`HttpOnly`, `SameSite=Lax`, `Secure` เมื่อ `NODE_ENV=production`) อายุ **คงที่ 8 ชม.นับจาก login** (`SESSION_TTL_HOURS`, ไม่ต่ออายุเมื่อใช้งาน) |
| กัน session fixation | ออก session id ใหม่ (`regenerate`) ทุกครั้งที่ login สำเร็จ |
| ผู้ใช้ปัจจุบัน (FR-03) | `GET /api/auth/me` คืน `{id, username, role}` จาก session |
| Logout (FR-02) | ทำลายแถวใน `session` และลบ cookie ใช้ cookie เดิมต่อไม่ได้ (401) |
| ไม่ทำใน Sprint 1 | สมัครสมาชิก กู้รหัสผ่าน ล็อกบัญชีหลังใส่ผิดซ้ำ CSRF token (ใช้ `SameSite=Lax` และรับเฉพาะ JSON แทน) |

## 7. Configuration และการ deploy

### 7.1 Environment variables (ตัวอย่างใน `.env.example` และ `backend/.env.test.example`)

| ตัวแปร | ใช้ทำอะไร | หมายเหตุ |
|---|---|---|
| `DATABASE_URL` | connection string ของ Postgres | บังคับ |
| `SESSION_SECRET` | key ลงนาม cookie | บังคับ แอปไม่เริ่มถ้าไม่ตั้ง |
| `SESSION_TTL_HOURS` | อายุ session (ค่าเริ่มต้น 8) | NFR-03 |
| `APP_PORT` | port ของ Express (ค่าเริ่มต้น 3000) | |
| `TZ` | เขตเวลา `Asia/Bangkok` | กฎวันที่ (A-02) |
| `NODE_ENV` | `production` → cookie `Secure` | |
| `TEST_DATABASE_URL` | DB สำหรับเทสต์เท่านั้น | เทสต์ไม่ fallback ไป `DATABASE_URL` เพื่อกันลบข้อมูลจริง |

### 7.2 การจัดการ secret (NFR-08)
- ค่าจริงอยู่ใน `.env` ซึ่ง `.gitignore` ไม่ให้ commit (รวม `.env.*`) ใน Git มีเฉพาะไฟล์ตัวอย่าง (`.env.example`, `.env.test.example`)
- บนคลาวด์เก็บ secret ใน secret manager ไม่ใส่ในอิมเมจหรือ Git
- ข้อมูลทั้งหมดเป็นข้อมูลสังเคราะห์ (A-03) รหัสผ่านของบัญชี seed ส่งผ่านช่องทางส่วนตัวของวิชา

### 7.3 การรันในเครื่อง
`backend`: `npm install` → ตั้ง `.env` → `npm run migrate` → `npm run seed` → `npm run dev` (ดูรายละเอียดใน README) `frontend`: `npm install` → `npm run dev` (Vite) ตั้ง proxy `/api` ไป `http://localhost:3000`

### 7.4 แผน Docker และ GCP (NFR-10, Lab 5 — **ยังไม่ได้ทำ**)

| ส่วน | แผน |
|---|---|
| อิมเมจ | Docker multi-stage: build frontend (Vite) แล้วให้ Express เสิร์ฟไฟล์ static ได้ container เดียว config มาจาก environment variable ไม่ฝังในอิมเมจ |
| Compute | Cloud Run (container ไม่เก็บสถานะ เหมาะกับ session ที่เก็บใน Postgres) |
| ฐานข้อมูล | Cloud SQL for PostgreSQL (ข้อมูลอยู่รอดหลังรีสตาร์ต/ deploy ใหม่ ตาม NFR-04) |
| Secret | Secret Manager สำหรับ `SESSION_SECRET` และรหัสผ่านฐานข้อมูล |
| Registry / CI-CD | Artifact Registry + GitHub Actions: build + เทสต์บน PR, deploy จาก `main` ผ่าน pipeline (ตาม Lab 5) |
| Migration | รัน `npm run migrate` เป็นขั้นตอนของ release ก่อนเปิดรับ traffic |

รายละเอียดการเข้าถึง GCP จะได้จากคำแนะนำของ Lab 5 แผนนี้จะปรับตามนั้น สิ่งที่ต้องทำตอน deploy ที่รู้ล่วงหน้า:
- ตั้ง `app.set('trust proxy', 1)` เมื่ออยู่หลัง load balancer ของ Cloud Run มิฉะนั้น cookie `Secure` ของ session อาจไม่ถูกตั้ง (ปัจจุบันยังไม่ได้ตั้ง)
- ตั้งค่า pool ของ `pg` ให้เหมาะกับ Cloud SQL (จำนวน connection ต่อ instance)

## 8. ช่องว่างที่รู้ตอนนี้ (Known gaps)

| # | ช่องว่าง | แนวทาง |
|---|---|---|
| G-1 | SRS §8 ระบุแม่แบบ seed 2 รายการ แต่ `seed.js` สร้างแม่แบบ "Reading Practice" 1 รายการ | ปรับ seed ให้มี 2 รายการ หรือปรับ SRS (บันทึกเป็นการเปลี่ยนที่มีเหตุผล) |
| G-2 | seed สร้างเป้าหมายที่เริ่มย้อนหลัง 7 วันเพื่อโชว์ประวัติ ซึ่งขัด BR-04 (วันเริ่มต้องไม่ก่อนวันนี้) ถ้านับเป็นข้อมูลปกติ | BR-04 บังคับที่ชั้น API ตอนสร้าง ไม่ใช่ที่ DB และ seed ข้าม API จึงสร้างได้ ควรบันทึกใน contract หรือปรับ BR-04 ตาม Q-02 ของ SRS |
| G-3 | ยังไม่มี `trust proxy` (ทำใน Lab 5) และ E2E อัตโนมัติ (เทสต์ journey ของ UI ใช้ mock API; ยืนยันกับ backend จริงด้วยการกดทดสอบมือ) ส่วน type parser ของ DATE ทำแล้วใน F-04 | Lab 5 / Sprint 2 |
| G-4 | `seed.js` hash รหัสผ่านและเขียนทับทุกครั้งที่รัน (ข้อเสนอจาก review PR #7) | ติดตามเป็น issue แยก ไม่บล็อก Deliverable 1 |

## 9. ประวัติการแก้ไข

| เวอร์ชัน | วันที่ | การเปลี่ยนแปลง | เหตุผล |
|---|---|---|---|
| 0.0 | 2026-11-02 | โครงเปล่า | เริ่มทำ |
| 0.1 | 2026-11-07 | เขียนครบ §1–§8 จาก schema, contract F-01/F-02, F-07/F-08 ที่ merge แล้ว และ SRS v0.2 | ส่ง Deliverable 1 |
| 0.2 | 2026-11-07 | ปรับสถานะให้ตรงโค้ดหลัง merge F-03–F-06 และ UI-01 (PR #9, #10, #11): endpoint ทั้งหมด, หน้าจอ, โครงโค้ด, ข้อจำกัดเรื่อง E2E | ให้เอกสารตรงกับ `sprint-1-staging` |
