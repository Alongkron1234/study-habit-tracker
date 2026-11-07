# Contract: UI-01 โครงหน้าเว็บและการยืนยันตัวตน (UI Foundation)

**Sprint:** 1 | **Issue:** #6 | **Branch:** `feature/ui-foundation`
**อ้างอิง SRS:** FR-01, FR-02, FR-03, A-01, BR-08
**เวอร์ชัน:** 1.0 (ร่าง) | **วันที่:** 2026-11-07
**ผู้ทำ:** @atiwit | **ผู้ review:** @Alongkron1234

---

## 1. Feature SDS

### พฤติกรรมและ Workflow

1. **ผู้ใช้เปิดเว็บครั้งแรกโดยยังไม่ล็อกอิน:**
   - ระบบตรวจสถานะผ่าน `GET /api/auth/me`
   - หากยังไม่ล็อกอิน (401) จะแสดงหน้า Login
   - หากพยายามเข้า URL อื่น (เช่น `/dashboard`) จะถูก Guard ดีดกลับมาหน้า Login
2. **การเข้าสู่ระบบ (Login):**
   - ผู้ใช้กรอก username และ password
   - ส่งคำขอ `POST /api/auth/login` พร้อม credential
   - หากสำเร็จ (200): เก็บสถานะผู้ใช้ (`user: { id, username, role }`) และ redirect ไปยังหน้า Dashboard ตามสิทธิ์
   - หากล้มเหลว (401): แสดงข้อความ error "Invalid username or password" โดยไม่แยกว่าฟิลด์ใดผิด (NFR-06) ส่วน error อื่นๆ เช่น เชื่อมต่อไม่ได้จะแสดงข้อความทั่วไปแจ้งเตือนผู้ใช้
3. **การแสดงผลตามสิทธิ์และสถานะ (Navigation & Layout):**
   - Header แสดงชื่อผู้ใช้ และ Badge แสดงบทบาท (`pm` หรือ `participant`)
   - เมนูนำทางแสดงเฉพาะส่วนที่บทบาทนั้นเข้าถึงได้:
     - PM: จัดการแม่แบบ (Templates)
     - Participant: เป้าหมายของฉัน (Goals), บันทึกกิจกรรม (Entries), ดูความคืบหน้า (Progress)
   - มีปุ่ม Logout ชัดเจน
4. **การออกจากระบบ (Logout):**
   - กดปุ่ม Logout ส่ง `POST /api/auth/logout`
   - ล้างสถานะใน client และ redirect ไปยังหน้า Login ทันที
   - หากกดย้อนกลับ (browser back) จะไม่สามารถเข้าหน้าที่ถูกป้องกันได้
5. **Session หมดอายุหรือถูกเพิกถอนระหว่างใช้งาน:**
   - เมื่อเรียก API ใดๆ แล้วได้รับ 401 Unauthorized
   - API client กลางจะดักจับ (interceptor/wrapper) เคลียร์ auth context และนำผู้ใช้กลับหน้า Login พร้อมแจ้งเตือน "Session expired, please login again"
6. **สถานะร่วม (Common UI States):**
   - ทุกหน้าจอและคอมโพเนนต์ที่ดึงข้อมูล async ต้องรองรับ 3 สถานะ:
     - **Loading:** แสดงสถานะกำลังโหลด (spinner หรือข้อความ "กำลังโหลด...")
     - **Empty:** แสดงเมื่อไม่มีข้อมูล พร้อมปุ่มหรือข้อความแนะนำ
     - **Error:** แสดงกล่องข้อความ error พร้อมปุ่มให้ลองใหม่ (Retry)

### กฎและการตัดสินใจ

| # | การตัดสินใจ | เหตุผล |
|---|---|---|
| S-1 | ใช้ React (Vite SPA) + React Router | สอดคล้องกับ System SDS Part C §1.2 ไม่เพิ่ม server ซ้ำซ้อน |
| S-2 | Dev server ตั้ง Vite proxy `/api` ไปยัง Express backend (`http://localhost:3000`) | เบราว์เซอร์มองเป็น origin เดียวกัน session cookie ทำงานอัตโนมัติ ไม่ต้องเปิด CORS |
| S-3 | API client รวมศูนย์ (Fetch wrapper หรือ Axios instance) ส่ง `credentials: 'include'` ทุกครั้ง | เพื่อส่ง session cookie และมีจุดดักจับ 401 กลางจุดเดียว |
| S-4 | Route Guard บังคับเช็ค auth ก่อน render children | ป้องกันการแสดงผลหน้าที่ต้องการ login และรองรับ role-based route guard |
| S-5 | การซ่อนเมนูใน UI เป็นเรื่อง UX เท่านั้น ไม่ใช่ security boundary | สิทธิ์ที่แท้จริงถูกบังคับที่ Backend middleware (F-02) อยู่แล้ว |
| S-6 | Component unit test ใช้ Vitest + React Testing Library | รันเร็ว เข้ากับ Vite โดยตรง ทดสอบพฤติกรรมผู้ใช้และ AC ได้แม่นยำ |

---

## 2. โครงสร้างไฟล์และคอมโพเนนต์ (`frontend/`)

```
frontend/
├── src/
│   ├── api/
│   │   ├── client.js          # Fetch wrapper จัดการ credentials, error, และ 401 handler
│   │   └── auth.js            # login, logout, getMe API functions
│   ├── context/
│   │   └── AuthContext.jsx    # เก็บสถานะ user, login(), logout(), loading
│   ├── components/
│   │   ├── ProtectedRoute.jsx # Guard ตรวจสอบ login และ role
│   │   ├── Navbar.jsx         # Header แสดงผู้ใช้, role badge, ปุ่ม logout, เมนู
│   │   └── StateFeedback.jsx  # Loading, Empty, Error message reusable components
│   ├── pages/
│   │   ├── LoginPage.jsx      # ฟอร์ม Login และ error alert
│   │   ├── DashboardPage.jsx  # หน้าหลักแสดงข้อมูลผู้ใช้และสรุปตามบทบาท
│   │   └── UnauthorizedPage.jsx # หน้าแจ้งเตือนกรณีเข้าถึง route ที่ไม่ตรงกับ role
│   ├── App.jsx                # Router config และ AuthProvider
│   ├── main.jsx               # Entry point
│   └── index.css              # Minimal styling (Clean & Accessible CSS)
├── index.html
├── package.json
└── vite.config.js             # กำหนด proxy `/api` ไป http://localhost:3000
```

---

## 3. Acceptance Criteria

| ID | เงื่อนไข (ผลที่สังเกตได้) | Requirement |
|---|---|---|
| **AC-UI-01** | เปิดเว็บโดยยังไม่ login → แสดงหน้า Login; พยายามเข้า protected route → redirect มาหน้า login | FR-01, A-01 |
| **AC-UI-02** | Login ถูกต้อง → เข้า Dashboard เห็น username และ role (ไม่มีฟิลด์ email ตาม contract F-01); Login ผิดพลาด (401) → แสดง error "Invalid username or password" ไม่แยก username/password (NFR-06); ปัญหาสัญญาณเครือข่าย/เซิร์ฟเวอร์ → แสดงข้อความทั่วไป | FR-01, NFR-06 |
| **AC-UI-03** | กด Logout → เรียก `/api/auth/logout`, ล้าง session ใน client, redirect ไป Login; กดย้อนกลับไม่สามารถดูข้อมูลเดิมได้ | FR-02 |
| **AC-UI-04** | เมื่อ API ภายในแอปตอบ 401 Unauthorized → client ดักจับ ล้าง user state และพากลับหน้า Login พร้อมแสดงข้อความ session หมดอายุ | FR-01, NFR-03 |
| **AC-UI-05** | มีคอมโพเนนต์สถานะร่วม (Loading, Empty, Error) ที่สามารถใช้งานซ้ำได้อย่างสม่ำเสมอ | Issue #6 scope |
| **AC-UI-06** | Navbar แสดงเมนูและ Badge ตามบทบาท (PM / Participant) อย่างถูกต้อง | FR-03, BR-08 |

---

## 4. Software Test Specification (STS)

- ไฟล์ทดสอบ: `frontend/src/tests/auth.test.jsx`, `frontend/src/tests/components.test.jsx`
- เครื่องมือ: Vitest + React Testing Library + jsdom
- ม็อค API responses เพื่อทดสอบพฤติกรรม UI อย่างอิสระ

| ID Test | AC | Action | Expected |
|---|---|---|---|
| **TEST-UI-01** | AC-UI-01 | เข้าหน้า `/` หรือ `/dashboard` ขณะยังไม่ได้ล็อกอิน | ถูก redirect ไปหน้า `/login` พร้อมแสดงฟอร์มเข้าสู่ระบบ |
| **TEST-UI-02a** | AC-UI-02 | กรอก username/password ถูกต้องแล้วกด Submit | เรียก API สำเร็จ นำทางไปหน้า Dashboard แสดงชื่อผู้ใช้และ role |
| **TEST-UI-02b** | AC-UI-02 | กรอก credential ผิดพลาด (API ตอบ 401) | แสดงข้อความผิดพลาด "Invalid username or password" อยู่ที่หน้าเดิม |
| **TEST-UI-03** | AC-UI-03 | คลิกปุ่ม "Logout" | เรียก `/api/auth/logout`, user state กลายเป็น null, แสดงหน้า Login |
| **TEST-UI-04** | AC-UI-04 | API ภายในส่ง 401 Unauthorized กลับมา | AuthContext รับทราบ ล้าง state นำทางไปหน้า Login พร้อมข้อความเตือน |
| **TEST-UI-05** | AC-UI-05 | Render LoadingSpinner, EmptyState, ErrorAlert | แสดงข้อความหรือ DOM element ถูกต้องตาม props |
| **TEST-UI-06** | AC-UI-06 | Render Navbar ด้วย user role ต่างๆ (`pm`, `participant`) | Badge role ถูกต้อง เมนูแสดงตามบทบาทอย่างเหมาะสม |
| **TEST-UI-07** | Journey | PM เข้าสู่ระบบ → เปิดหน้า /templates → สร้างแม่แบบ → เห็นแม่แบบในรายการ | สำเร็จตาม workflow ของ F-03 |
| **TEST-UI-08** | Journey | Participant เข้าสู่ระบบ → เปิด /goals/:id → บันทึกนาที → ความคืบหน้าคำนวณใหม่ | สำเร็จตาม workflow ของ F-04, F-05, F-06 |

---

## 5. Definition of Done (DoD)

- [x] contract นี้ถูก commit ก่อนเขียนโค้ด frontend — `633ca78`
- [x] โครงสร้างโปรเจกต์ `frontend/` ติดตั้งและรัน `npm run build` ผ่าน
- [x] มี automated tests (Vitest) ครอบคลุม AC-UI-01 ถึง AC-UI-06 ทั้งหมด
- [x] รันเทสต์ frontend ผ่าน 100% พร้อมบันทึกหลักฐาน — โค้ด `0cc7e3e`, ผลรัน `evidence/UI-01-green-run.txt` (9/9 passed)
- [x] อัปเดต `README.md` เพิ่มคำแนะนำการติดตั้งและรัน Frontend
- [x] อัปเดต `docs/traceability.md` บันทึกความครอบคลุมของ UI
- [x] ตรวจสอบความปลอดภัย: ไม่เก็บ token ใน LocalStorage (ใช้ HTTP-only session cookie ผ่าน proxy), ไม่รั่วไหลข้อมูลสิทธิ์, จัดการ error ปลอดภัย
- [ ] PR เข้า `sprint-1-staging` ผ่าน review จาก @Alongkron1234

---

## 6. ประวัติการเปลี่ยนแปลง Contract

| วันที่ | การเปลี่ยนแปลง | เหตุผล |
|---|---|---|
| 2026-11-07 | สร้าง v1.0 (ร่าง) | กำหนดขอบเขตและ AC ก่อนเริ่มสร้าง Frontend โครงสร้างพื้นฐาน |
