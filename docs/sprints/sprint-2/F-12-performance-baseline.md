# Contract: F-12 พื้นฐานด้านประสิทธิภาพ (Performance Baseline)

**Sprint:** 2 | **Issue:** #<เลข issue> | **Branch:** `feature/f12-performance-baseline`
**อ้างอิง SRS:** NFR-09, BR-04, BR-01
**เวอร์ชัน:** 1.0 (ร่าง) | **วันที่แก้ล่าสุด:** 2026-11-28
**ผู้ทำ:** Alongkron1234 | **ผู้ review:** atiwit

---

## 1. Feature SDS

### พฤติกรรมและ Workflow

NFR-09 กำหนดว่า "endpoint หลักตอบสนองภายใน 500 ms (p95) ในเครื่องที่มี entry ประมาณ 1,000 รายการ" และกำหนดวิธีตรวจสอบเป็น "สคริปต์จับเวลา" F-12 จึงเป็นงานระดับระบบ ไม่ใช่ API ใหม่: สร้างสคริปต์ที่เตรียมข้อมูลขนาดตามสเปก วัดเวลาตอบสนองของ endpoint หลักผ่าน HTTP จริง คำนวณ p95 เทียบเกณฑ์ และรายงานผลผ่าน/ไม่ผ่านพร้อมหลักฐานที่ทำซ้ำได้

Workflow:
1. ผู้ใช้รัน `npm run perf` ในโฟลเดอร์ `backend` (ฐานข้อมูลทดสอบต้องพร้อม)
2. สคริปต์ล้างข้อมูล `perf_` เก่า → เตรียมข้อมูล → เปิดแอปในโปรเซสเดียวกันที่พอร์ตว่างบน loopback → login → วัดทีละ endpoint → พิมพ์รายงาน → ล้างข้อมูล
3. exit code บอกผล: 0 ผ่านทุก endpoint, 1 มี endpoint ที่ p95 ≥ เกณฑ์, 2 เกิดข้อผิดพลาดของการวัด (เช่น ได้ status ที่ไม่คาดไว้ หรือตั้งค่าฐานข้อมูลไม่ถูกต้อง)

### กฎและการตัดสินใจ (ขอให้ reviewer ยืนยัน)

| # | การตัดสินใจ | เหตุผล |
|---|---|---|
| S-1 | **"endpoint หลัก" ใน Sprint 2** มี 8 รายการ (ผลของ Sprint 1): E1 `POST /api/auth/login`, E2 `GET /api/auth/me`, E3 `GET /api/templates` (Participant), E4 `GET /api/goals`, E5 `GET /api/goals/:id`, E6 `GET /api/goals/:id/entries`, E7 `GET /api/goals/:id/progress`, E8 `POST /api/goals/:id/entries` | เป็นเส้นทางที่ผู้ใช้เรียกทุกครั้งที่ใช้งาน (login, ดูเป้าหมาย/ประวัติ/ความคืบหน้า, บันทึกรายวัน) และตรงกับ dependency ของ F-12 คือ F-06 |
| S-2 | endpoint ใหม่ของ F-09, F-10, F-11 (PATCH/DELETE entry, PATCH goal, แก้/archive แม่แบบ) **ไม่อยู่ในรายการ v1.0** สคริปต์ต้องกำหนดรายการ endpoint เป็นโครงสร้างข้อมูลเดียวที่เพิ่มรายการได้โดยไม่แก้ตรรกะ และเมื่อ feature เหล่านั้น merge เข้า `sprint-2-staging` แล้วให้เพิ่มเข้ารายการและบันทึกผลใน evidence ของ release candidate (บันทึกใน v1.1) | F-12 ไม่ควรรอ feature อื่นเสร็จ แต่ NFR-09 ใช้กับ "endpoint หลัก" ทั้งหมดของระบบ |
| S-3 | **ชุดข้อมูล:** Participant 3 คน คนละ 1 เป้าหมายยาว 365 วัน (สูงสุดตาม BR-04) มี entry ครบทุกวันตั้งแต่ `วันนี้ − 364` ถึงวันนี้ รวม **1,095 entry** (ตามสเปก "ประมาณ 1,000") แต่ละเป้าหมายมี 365 entry ซึ่งเป็นขนาดสูงสุดต่อเป้าหมายที่ระบบอนุญาต (BR-01: 1 entry ต่อวัน) จึงเป็นกรณีหนักสุดของ `GET .../entries` และ `GET .../progress` template 1 อัน (ช่วง 1–960) และ PM 1 คน | ใช้ข้อมูลที่ใหญ่สุดต่อเป้าหมายแทนข้อมูลที่กระจายเบา ๆ เพื่อไม่ให้ผลดูดีเกินจริง |
| S-4 | สร้างข้อมูลผ่าน SQL โดยตรง (`generate_series`) แต่รหัสผ่านของผู้ใช้ต้องแฮชด้วย bcrypt **cost 10** เท่ากับระบบจริง (`create-user.js`, `seed.js`) | fixture ของเทสต์ใช้ cost 4 ซึ่งทำให้ login เร็วเกินจริง (ตรวจแล้ว: login cost 4 ≈ 3 ms, cost 10 ≈ 45–50 ms) |
| S-5 | **วิธีวัด:** เปิดแอปจริง (`createApp()`) ที่พอร์ตว่างบน `127.0.0.1` ผ่าน `http.createServer` และเรียกด้วย `fetch` ของ Node (HTTP stack, session store ใน Postgres และฐานข้อมูลจริงทั้งหมด); ส่งคำขอ **ทีละคำขอ (sequential)** ต่อ endpoint: warm-up 20 ครั้ง (ไม่นับ) แล้ววัด **200 ครั้ง**; จับเวลาด้วย `process.hrtime.bigint()` ตั้งแต่ก่อนเรียก `fetch` จนอ่าน body เสร็จ ค่า N และ warm-up ปรับได้ด้วย `PERF_REQUESTS`, `PERF_WARMUP` (ใช้ค่าน้อยในเทสต์อัตโนมัติ) | ใกล้การใช้งานจริงกว่าเรียกฟังก์ชันตรง ๆ; ไม่ใช้ library เพิ่ม |
| S-6 | **p95 ใช้ nearest-rank:** เรียงตัวอย่างจากน้อยไปมาก แล้วเลือกค่าที่ลำดับ `ceil(0.95 × N)` (N=200 → ลำดับที่ 190; ถ้า `p` = 0 ให้ใช้ลำดับที่ 1 คือค่าต่ำสุด; `p` ต้องอยู่ในช่วง 0–100) รายงาน p50, p95 และ max ด้วย (ทศนิยม 1 ตำแหน่ง มิลลิวินาที) | นิยามชัดและทำซ้ำได้ ทดสอบเป็น unit |
| S-7 | **เกณฑ์ผ่านคือ p95 < 500 ms (เท่ากับ 500 ถือว่าไม่ผ่าน)** ทุก endpoint; ค่าเริ่มต้นมาจาก NFR-09 และเปลี่ยนได้เฉพาะด้วย `PERF_P95_MS` เพื่อพิสูจน์ว่าสคริปต์ล้มเหลวได้จริง (ห้ามใช้ปรับเกณฑ์ใน evidence ของการส่งงาน) | ตรวจสอบที่ผ่านทุกครั้งโดยไม่มีทางล้มเหลวไม่มีค่าเป็นหลักฐาน |
| S-8 | **endpoint เขียน (E8):** ก่อนแต่ละครั้งที่วัด ลบ entry วันนี้ของเป้าหมายนั้นผ่าน SQL **นอกช่วงจับเวลา** แล้วจึงส่ง `POST` (BR-01 ห้าม entry ซ้ำวัน) จับเวลาเฉพาะ `POST` และยอมรับเฉพาะ status 201 | ทำซ้ำได้ 220 ครั้งโดยไม่ชน 409 และไม่ทำให้ขนาดข้อมูลเปลี่ยน |
| S-9 | **status ที่ไม่คาดไว้ = ข้อผิดพลาดของการวัด** (ไม่ใช่ตัวอย่างที่เร็ว): ถ้า endpoint ตอบ status ต่างจากที่ระบุ (login/GET → 200, POST entries → 201) ให้หยุดทั้งหมดและ exit 2 | กัน 401/404/500 ที่ตอบเร็วทำให้ผลดูผ่านทั้งที่ไม่ได้วัดงานจริง |
| S-10 | **ความปลอดภัยของข้อมูล:** ใช้ `PERF_DATABASE_URL` ถ้ามี มิฉะนั้นใช้ `TEST_DATABASE_URL` (โหลดจาก `backend/.env.test` เหมือนเทสต์) **ห้าม fallback ไป `DATABASE_URL`**; ถ้าไม่มีทั้งสองตัว → exit 2 พร้อมข้อความปฏิเสธ ข้อมูลทั้งหมดใช้ username ขึ้นต้น `perf_` ล้างก่อนเริ่มและหลังจบ (รวมกรณีเกิดข้อผิดพลาด) | แบบเดียวกับ `tests/helpers/test-env.js` กันลบ/เขียนข้อมูล dev หรือ production |
| S-11 | **รายงาน** พิมพ์ที่ stdout: บรรทัดสภาพแวดล้อม (วันที่เวลา UTC, Node version, ระบบปฏิบัติการ/จำนวน CPU, เวอร์ชัน PostgreSQL, git commit ถ้ามี), บรรทัดข้อมูล (`users`, `goals`, `entries` ที่นับจริงจากฐานข้อมูลก่อนวัด และ entry ต่อเป้าหมายสูงสุด), ตารางต่อ endpoint (`id`, method + path, N, p50, p95, max, ผล PASS/FAIL) และผลรวม ให้บันทึกผลของ release candidate ที่ `docs/sprints/sprint-2/evidence/F-12-perf-run.txt` | หลักฐานต้องบอกได้ว่าวัดอะไร บนเครื่องแบบไหน กับข้อมูลเท่าไร |
| S-12 | **ไม่รันใน CI อัตโนมัติ:** เครื่อง runner ที่ใช้ร่วมกันมีเวลาแกว่ง ทำให้เกณฑ์สุ่มล้ม; CI รันเฉพาะเทสต์ของสคริปต์ด้วยค่า N น้อย (ตรวจว่าสคริปต์ทำงานและล้มเหลวได้) ส่วนการวัดเต็มเป็นการรันด้วยมือเพื่อเก็บหลักฐาน | ความเสถียรของ pipeline และความซื่อตรงของผล |
| S-13 | **ผลที่วัดตอนเขียน contract (ข้อมูลประกอบ ไม่ใช่เกณฑ์):** ด้วยสคริปต์ทดลองชั่วคราวบนเครื่องพัฒนา (Postgres ในเครื่อง, 1,095 entry) p95 ทุก endpoint ≈ 2–4 ms ยกเว้น login ≈ 51 ms (cost 10) จึงเหลือขอบเขตเกิน 9 เท่าของเกณฑ์ ดังนั้นงานนี้ทำหน้าที่เป็น **เกราะป้องกันการถดถอยและหลักฐานตาม NFR-09** ไม่ใช่การปรับแต่งประสิทธิภาพ ตัวเลขจริงให้ยึดตาม evidence จากสคริปต์ | รายงานตามจริง ไม่อ้างว่ามีปัญหาที่ไม่มี |
| S-14 | **ไม่แก้ production code, schema หรือ API** เพิ่มเฉพาะ `backend/scripts/perf-baseline.js`, `backend/scripts/perf-lib.js`, script `perf` ใน `package.json`, เทสต์ และหัวข้อวิธีรันใน README | ขอบเขตเล็ก ไม่กระทบ feature อื่น |

### ข้อจำกัดที่ทราบ (ยอมรับใน Sprint 2)

- วัดบนเครื่องพัฒนาเท่านั้น ผลบน Cloud Run (มีเครือข่ายและ cold start) ไม่อยู่ในขอบเขต NFR-09 ที่ระบุ "ในเครื่อง"
- ส่งคำขอทีละคำขอ ไม่ทดสอบภาระพร้อมกันหลายผู้ใช้ (ความถูกต้องแบบ concurrent ของการบันทึกซ้ำวันเดียวกันมี NFR-05 ตรวจแล้ว)
- ผลขึ้นกับโหลดของเครื่องขณะรัน ให้ปิดงานหนักอื่นและบันทึกสภาพแวดล้อมในรายงาน

### Dependencies

F-06 (progress และ entries), F-05 (บันทึก entry), F-04 (เป้าหมาย), F-01/F-02 (login, session), F-07 (ฐานข้อมูลและ migration)

### นอกขอบเขต

การปรับแต่งประสิทธิภาพ (index, cache) ถ้าผลไม่ผ่านให้เปิดงานแก้แยกต่างหาก, วัดบน Cloud Run, load test หลายผู้ใช้พร้อมกัน, endpoint ใหม่ของ F-09/F-10/F-11 ใน v1.0 (ดู S-2)

---

## 2. สเปก API / Data / UI

### API

**ไม่มี endpoint ใหม่และไม่เปลี่ยน endpoint เดิม**

### อินเทอร์เฟซของสคริปต์

| รายการ | รายละเอียด |
|---|---|
| คำสั่ง | `npm run perf` (= `node scripts/perf-baseline.js`) รันจากโฟลเดอร์ `backend` |
| ตัวแปรสภาพแวดล้อม | `PERF_DATABASE_URL` / `TEST_DATABASE_URL` (ฐานข้อมูล, S-10), `PERF_REQUESTS` (ค่าเริ่มต้น 200), `PERF_WARMUP` (ค่าเริ่มต้น 20), `PERF_P95_MS` (ค่าเริ่มต้น 500, S-7), `PERF_ENV_FILE` (ไฟล์ env ที่โหลด ค่าเริ่มต้น `backend/.env.test`) |
| exit code | 0 ผ่านทุก endpoint, 1 มี endpoint p95 ≥ เกณฑ์, 2 ข้อผิดพลาดของการวัดหรือการตั้งค่า |
| ผลลัพธ์ | รายงานข้อความที่ stdout (รูปแบบตาม S-11) |

### โมดูล `backend/scripts/perf-lib.js` (ฟังก์ชันบริสุทธิ์/แยกทดสอบได้)

| ฟังก์ชัน | หน้าที่ |
|---|---|
| `percentile(values, p)` | nearest-rank ตาม S-6; ไม่แก้ array ต้นฉบับ; array ว่างหรือ `p` นอก 0–100 → โยน `RangeError` |
| `summarize(samples)` | คืน `{ count, p50, p95, max }` |
| `evaluate(results, thresholdMs)` | รับรายการ `{ id, p95 }` คืน `{ pass, failures }` โดย p95 < เกณฑ์ ถือว่าผ่าน (S-7) |
| `measure(fn, { requests, warmup })` | เรียก `fn` ทั้งหมด `warmup + requests` ครั้ง คืนเวลา (ms) ของ `requests` ครั้งหลัง; ถ้า `fn` โยนข้อผิดพลาดให้ปฏิเสธทันที (S-9) |
| `resolveDatabaseUrl(env)` | คืน `PERF_DATABASE_URL` หรือ `TEST_DATABASE_URL`; ถ้าไม่มีทั้งสอง โยนข้อผิดพลาดที่ปฏิเสธชัดเจนและไม่อ่าน `DATABASE_URL` (S-10) |

### ผลต่อโครงสร้างโค้ด

| ชั้น | เปลี่ยน? | รายละเอียด |
|---|---|---|
| ฐานข้อมูล | **ไม่เปลี่ยน schema** | ข้อมูล `perf_` ถูกสร้างและลบภายในการรันแต่ละครั้ง |
| API | ไม่เปลี่ยน | – |
| Logic (production) | ไม่เปลี่ยน | – |
| Tooling | เปลี่ยน | เพิ่ม `backend/scripts/perf-baseline.js`, `backend/scripts/perf-lib.js`, script `perf` ใน `backend/package.json`, หัวข้อ "วัดประสิทธิภาพ" ใน README |
| UI | ไม่เปลี่ยน | – |

---

## 3. Acceptance Criteria

| ID | เงื่อนไข (ผลที่สังเกตได้) | Requirement |
|---|---|---|
| **AC-F12-01** | สคริปต์เตรียมข้อมูลได้ครบตาม S-3 ก่อนวัด และรายงานจำนวนที่นับจริงจากฐานข้อมูล (`entries` ≥ 1,000, ไม่เกิน 365 ต่อเป้าหมาย); หลังจบทั้งกรณีผ่านและไม่ผ่าน ไม่เหลือผู้ใช้ เป้าหมาย หรือ entry ที่เป็นของ `perf_` ในฐานข้อมูล; เมื่อเกิดข้อผิดพลาดระหว่างวัด (exit 2) สคริปต์ล้างข้อมูลก่อนออกด้วย (ตรวจด้วยการทบทวนโค้ด เพราะไม่มีวิธีจำลองข้อผิดพลาดโดยไม่เพิ่ม hook ในสคริปต์) | NFR-09, BR-01, BR-04 |
| **AC-F12-02** | สคริปต์วัด endpoint ครบ E1–E8 ตาม S-1 แต่ละรายการด้วยจำนวนคำขอตามที่ตั้ง (หลัง warm-up) และรายงาน p50, p95, max ต่อ endpoint; endpoint ที่ตอบ status ต่างจากที่คาดทำให้ exit 2 และไม่ถูกนับเป็นผ่าน | NFR-09 |
| **AC-F12-03** | `percentile` คำนวณ nearest-rank ถูกต้องตามนิยาม S-6 รวมค่าขอบ (N=1, N=200, p=100, ข้อมูลไม่เรียง, ไม่แก้ array เดิม, อินพุตผิดโยน `RangeError`) | NFR-09 |
| **AC-F12-04** | ถ้า p95 ของทุก endpoint < เกณฑ์ → exit 0 และรายงาน PASS; ถ้า endpoint ใดมี p95 ≥ เกณฑ์ (รวมกรณีเท่ากับเกณฑ์พอดี) → exit 1 และรายงาน FAIL ที่ endpoint นั้น; พิสูจน์ได้ด้วย `PERF_P95_MS` ต่ำมาก | NFR-09 |
| **AC-F12-05** | สคริปต์ปฏิเสธการรันเมื่อไม่มี `PERF_DATABASE_URL` หรือ `TEST_DATABASE_URL` (exit 2, ข้อความระบุว่าไม่ใช้ `DATABASE_URL`) และไม่แตะข้อมูลที่ username ไม่ขึ้นต้น `perf_` | NFR-08 |
| **AC-F12-06** | การรันเต็มด้วยค่าเริ่มต้น (200 คำขอ ต่อ endpoint, เกณฑ์ 500 ms) บน release candidate ผ่านทุก endpoint (p95 < 500 ms) และผลถูกบันทึกในไฟล์ evidence พร้อมสภาพแวดล้อมและจำนวนข้อมูลตาม S-11 | NFR-09 |

---

## 4. Software Test Specification

ไฟล์เทสต์: `backend/tests/perf-lib.test.js` (unit), `backend/tests/perf-baseline.test.js` (integration: รันสคริปต์จริงเป็น child process ด้วย `PERF_REQUESTS=20 PERF_WARMUP=2` เพื่อให้ suite เร็ว ใช้ฐานข้อมูลทดสอบ)

สภาพแวดล้อม: ใช้ `helpers/test-env.js` (ตั้งค่า env/ฐานข้อมูลทดสอบ); child process สืบทอด `TEST_DATABASE_URL`; **ทุก test ใช้ข้อมูลที่ setup ใหม่ของตัวเอง ไม่พึ่งผลของ test อื่น**

| ID Test | AC | Level | Precondition | Input / Action | Expected |
|---|---|---|---|---|---|
| **TEST-F12-01a** | AC-F12-03 | Unit | – | `percentile([1..100], 95)`; `percentile([1..200], 95)`; `percentile([1,2,3,4], 50)` | 95; 190; 2 |
| **TEST-F12-01b** | AC-F12-03 | Unit | – | `percentile([7], 95)`; `percentile([3,1,2], 100)`; `percentile([3,1,2], 0)` | 7; 3; 1 (ค่าต่ำสุด) |
| **TEST-F12-01c** | AC-F12-03 | Unit | อินพุตไม่เรียง `[5,1,4,2,3]` | `percentile(input, 95)` แล้วตรวจ `input` | ผล 5; `input` ยังเป็น `[5,1,4,2,3]` (ไม่ถูกเรียงในที่เดิม) |
| **TEST-F12-01d** | AC-F12-03 | Unit | – | `percentile([], 95)`; `percentile([1], -1)`; `percentile([1], 101)`; `percentile([1], NaN)` | โยน `RangeError` ทุกกรณี |
| **TEST-F12-02a** | AC-F12-02 | Unit | – | `summarize([10, 20, 30, 40])` และ `summarize` ของ 200 ค่า 1..200 | `{count: 4, p50: 20, p95: 40, max: 40}`; `{count: 200, p50: 100, p95: 190, max: 200}` |
| **TEST-F12-02b** | AC-F12-02 | Unit | – | `measure(fn, {requests: 5, warmup: 3})` โดย `fn` นับจำนวนครั้งที่ถูกเรียก | `fn` ถูกเรียก 8 ครั้ง; ผลมี 5 ค่า (ตัวเลข ≥ 0) |
| **TEST-F12-02c** | AC-F12-02 | Unit | `fn` โยนข้อผิดพลาดในครั้งที่ 4 | `measure(fn, {requests: 5, warmup: 3})` | ปฏิเสธด้วยข้อผิดพลาดนั้น (ไม่คืนผลบางส่วน) |
| **TEST-F12-03a** | AC-F12-04 | Unit | – | `evaluate([{id:'E1',p95:499.9},{id:'E2',p95:10}], 500)` | `pass: true`, `failures: []` |
| **TEST-F12-03b** | AC-F12-04 | Unit | – | `evaluate([{id:'E1',p95:500},{id:'E2',p95:10}], 500)` | `pass: false`; `failures` มี `E1` เท่านั้น (เท่ากับเกณฑ์ = ไม่ผ่าน) |
| **TEST-F12-04** | AC-F12-05 | Unit | – | `resolveDatabaseUrl({DATABASE_URL: 'x'})`; `resolveDatabaseUrl({TEST_DATABASE_URL: 'a'})`; `resolveDatabaseUrl({PERF_DATABASE_URL: 'p', TEST_DATABASE_URL: 'a'})` | แรก: โยนข้อผิดพลาด (ไม่คืน `'x'`); สอง: `'a'`; สาม: `'p'` |
| **TEST-F12-05** | AC-F12-01, AC-F12-02, AC-F12-04 | Integration (child process) | ฐานข้อมูลทดสอบพร้อม; ไม่มีข้อมูล `perf_` | รัน `node scripts/perf-baseline.js` ด้วย `PERF_REQUESTS=20 PERF_WARMUP=2` | exit 0; stdout มีบรรทัดข้อมูล `entries=1095` (≥ 1000) และ `max_per_goal=365` และ 8 บรรทัด endpoint (E1–E8) แต่ละบรรทัดมี `PASS` และค่า p50/p95/max; บรรทัดสรุป PASS; หลังจบไม่มี user ขึ้นต้น `perf_` ใน `users` และไม่มี entry ของเป้าหมาย `perf_` |
| **TEST-F12-06** | AC-F12-04, AC-F12-01 | Integration (child process) | เหมือน 05 | รันด้วย `PERF_P95_MS=0.001` (เกณฑ์ต่ำจนไม่มีทางผ่าน) | exit 1; stdout มี `FAIL` อย่างน้อยหนึ่ง endpoint และบรรทัดสรุป FAIL; หลังจบไม่มีข้อมูล `perf_` เหลือ |
| **TEST-F12-07** | AC-F12-05 | Integration (child process) | – | รันสคริปต์โดยลบ `TEST_DATABASE_URL`/`PERF_DATABASE_URL` ออกจาก env และตั้ง `PERF_ENV_FILE` ไปยังไฟล์ว่าง เพื่อไม่ให้ `.env.test` ถูกโหลด และตั้ง `DATABASE_URL` เป็นค่าอื่น | exit 2; ข้อความ (stderr) ระบุว่าปฏิเสธการรันเพราะไม่มี `PERF_DATABASE_URL`/`TEST_DATABASE_URL` และไม่ใช้ `DATABASE_URL`; ไม่มีการเชื่อมต่อฐานข้อมูล |
| **TEST-F12-08** | AC-F12-06 | Performance (รันด้วยมือ พร้อม evidence) | เครื่องพัฒนาที่ว่างพอ ฐานข้อมูลทดสอบพร้อม ข้อมูลตาม S-3 | `npm run perf` ด้วยค่าเริ่มต้น (200 คำขอ, เกณฑ์ 500 ms) บน release candidate | exit 0; ทุก endpoint E1–E8 p95 < 500 ms; บันทึกผลทั้งรายงานที่ `evidence/F-12-perf-run.txt` พร้อมสภาพแวดล้อมและจำนวนข้อมูล |

หมายเหตุ: สคริปต์โหลด `backend/.env.test` เหมือนเทสต์ (S-10) จึงต้องมี `PERF_ENV_FILE` เพื่อให้ TEST-F12-07 ชี้ไปไฟล์ว่างแทน ตัวแปรนี้เป็นส่วนหนึ่งของอินเทอร์เฟซของสคริปต์ (§2) และ child process ของ TEST-F12-07 ต้องตั้ง `DATABASE_URL` เป็นค่าอื่นด้วย เพราะ `test-env.js` ตั้ง `DATABASE_URL` ให้เท่ากับฐานข้อมูลทดสอบ จึงต้องพิสูจน์ว่าสคริปต์ไม่อ่านตัวแปรนี้

---

## 5. Definition of Done และหลักฐาน

- [ ] contract นี้ commit ก่อนโค้ดและเทสต์ (commit แยก) — `<sha>`
- [ ] เทสต์ทุกข้อใน §4 (ยกเว้น TEST-F12-08) เขียนก่อนโค้ด และบันทึกผลรันที่ **fail** พร้อม commit — `<sha>`, ผลรัน `evidence/F-12-red-run.txt`
- [ ] โค้ดครบตาม §2 และ `npm test` ผ่านทุกเทสต์ — `<sha>`, ผลรัน `evidence/F-12-green-run.txt` (ระบุจำนวน passed/failed/skipped)
- [ ] TEST-F12-08 รันบน release candidate แล้ว ผ่านทุก endpoint — ผลรัน `evidence/F-12-perf-run.txt` (มีสภาพแวดล้อม จำนวนข้อมูล และ commit ที่วัด)
- [ ] **ทั้ง test suite** ยังผ่าน (regression ของ F-01 ถึง F-07 และ feature อื่นใน Sprint 2)
- [ ] README มีหัวข้อวิธีรัน `npm run perf` และข้อควรระวัง (ฐานข้อมูลทดสอบ, ปิดงานหนักอื่น)
- [ ] ไม่มีข้อมูลหรือรหัสผ่านจริงใน script/รายงาน (รหัสผ่านที่ใช้เป็นค่าสังเคราะห์)
- [ ] `docs/traceability.md` อัปเดตแถว NFR-09 ด้วย AC/TEST, ผลรัน และ commit SHA (สถานะเปลี่ยนจาก "วางแผน")
- [ ] PR เข้า `sprint-2-staging` ผ่าน review จากเพื่อน — PR #<เลข>
- [ ] merge เข้า `main` อยู่ใน release Sprint 2 (tag `<tag>`) และปิด Issue #<เลข> แล้ว

---

## 6. ประวัติการเปลี่ยนแปลง Contract

| วันที่ | เวอร์ชัน | การเปลี่ยนแปลง | เหตุผล |
|---|---|---|---|
| 2026-11-28 | 1.0 | สร้างร่าง | ก่อนเริ่ม implement |
