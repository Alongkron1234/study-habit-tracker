# Requirements Traceability Matrix (Part B)

**ผลิตภัณฑ์:** Study Habit Tracker | **อ้างอิง:** SRS v0.2 และ `features.md` v0.1 | **เวอร์ชัน:** 0.1 (ร่าง)

อ่านตารางจากซ้ายไปขวา: ความต้องการ → feature ที่รับผิดชอบ → sprint ที่สร้าง → วิธีและ sprint ที่ตรวจสอบ
สถานะ AC/Test ของ Sprint 1 จะกรอกเลขจริงและผลการรันใน Part E–F ส่วน Sprint 2–3 กรอกก่อน implement แต่ละ feature

## 1. Functional Requirements

| Requirement | Feature | Sprint (สร้าง) | วิธีตรวจสอบ (วางแผน) | Sprint (ตรวจ) | สถานะ |
|---|---|---|---|---|---|
| FR-01 login | F-01 | 1 | API integration: login ถูก/ผิด | 1 | implement แล้ว — AC-F01-01, 02 · TEST-F01-01, 02a–c ผ่าน (@c7c0508) |
| FR-02 logout | F-01 | 1 | API integration: ใช้ session หลัง logout ไม่ได้ | 1 | implement แล้ว — AC-F01-04 · TEST-F01-04a, b ผ่าน (@c7c0508) |
| FR-03 ผู้ใช้ปัจจุบัน | F-01 | 1 | API integration | 1 | implement แล้ว — AC-F01-03 · TEST-F01-03 ผ่าน (@c7c0508) |
| FR-04 PM สร้างแม่แบบ | F-03 | 1 | API integration + persistence | 1 | ผ่าน — AC-F03-01 · TEST-F03-01 (@b081a81) |
| FR-05 PM ดูรายการแม่แบบ | F-03 | 1 | API integration | 1 | ผ่าน — AC-F03-04 · TEST-F03-04 (@b081a81) |
| FR-06 Participant ดูแม่แบบ | F-03 | 1 | API integration | 1 | ผ่าน — AC-F03-05 · TEST-F03-05 (@b081a81) |
| FR-07 ตั้งเป้าหมาย | F-04 | 1 | API integration + unit | 1 | ผ่าน — AC-F04-01 · TEST-F04-01 (@b081a81) |
| FR-08 บันทึกรายวัน | F-05 | 1 | API integration + E2E journey | 1 | ผ่าน — AC-F05-01 · TEST-F05-01 (@5370950) |
| FR-09 ดูความคืบหน้า | F-06 | 1 | Unit (คำนวณ) + API | 1 | ผ่าน — AC-F06-01 · TEST-F06-01a–c (@5370950) |
| FR-10 ดูประวัติ | F-06 | 1 | API integration | 1 | ผ่าน — AC-F06-02 · TEST-F06-02 (@5370950) |
| FR-11 แก้ไข/archive แม่แบบ | F-09 | 2 | กำหนดก่อน implement | 2 | วางแผน |
| FR-12 แก้ไขเป้าหมาย | F-10 | 2 | กำหนดก่อน implement | 2 | วางแผน |
| FR-13 แก้ไข/ลบ entry | F-11 | 2 | กำหนดก่อน implement | 2 | วางแผน |
| FR-14 streak | F-13 | 3 | กำหนดก่อน implement | 3 | วางแผน |
| FR-15 สรุปและกรอง | F-14 | 3 | กำหนดก่อน implement | 3 | วางแผน |
| FR-16 ตารางเตือน | F-15 | 3 | กำหนดก่อน implement | 3 | วางแผน |

## 2. Business Rules

| Requirement | Feature | Sprint (สร้าง) | วิธีตรวจสอบ (วางแผน) | Sprint (ตรวจ) | สถานะ |
|---|---|---|---|---|---|
| BR-01 1 entry ต่อวัน | F-05 (คงไว้ใน F-11) | 1 | Unit + DB integration (unique) | 1 | ผ่าน — AC-F05-02 · TEST-F05-02a, 02b (concurrent) (@5370950) |
| BR-02 ช่วงค่า entry | F-03 (นิยาม), F-05 (บังคับ) | 1 | Unit boundary: 0, 1, 960, 961, ทศนิยม | 1 | ส่วนแม่แบบผ่าน — AC-F03-03 · TEST-F03-03a–c, TEST-F03-U1 (@b081a81); entry ผ่าน — AC-F05-03 · TEST-F05-03a, 03b (@5370950) |
| BR-03 ช่วงวันที่ entry | F-05 | 1 | Unit boundary: วันนี้, พรุ่งนี้, ย้อน 7 และ 8 วัน, นอกช่วงเป้าหมาย | 1 | ผ่าน — AC-F05-04 · TEST-F05-04a–f (@5370950) |
| BR-04 เงื่อนไขเป้าหมาย | F-04 | 1 | Unit boundary | 1 | ผ่าน — AC-F04-02 · TEST-F04-02a–e, TEST-F03-U1 (@b081a81) |
| BR-05 สถานะเป้าหมาย / 1 active ต่อแม่แบบ | F-04, F-05 | 1 | Unit + API (entry หลังสิ้นสุด, เป้าหมายซ้อน) | 1 | ส่วนเป้าหมายผ่าน — AC-F04-03, AC-F04-07 · TEST-F04-03a–e, TEST-F04-07 (@b081a81); entry หลังสิ้นสุดผ่าน — AC-F05-05 · TEST-F05-05a, 05b (@5370950) |
| BR-06 คำนวณความคืบหน้า | F-06 | 1 | Unit (รวม case เกินเป้า) | 1 | ผ่าน — AC-F06-01 · TEST-F06-01a–c (@5370950) |
| BR-07 เฉพาะ PM จัดการแม่แบบ | F-02, F-03 | 1 | API role test | 1 | ส่วน middleware ผ่าน — AC-F02-02 · TEST-F02-02a–c (@c7c0508) รอตรวจกับ endpoint จริงใน F-03; endpoint แม่แบบผ่าน — AC-F03-02 · TEST-F03-02 (@b081a81) |
| BR-08 ข้อมูลเป็นของเจ้าของ / PM อ่านไม่ได้ | F-02, F-04, F-05, F-06 | 1 | API ownership + role test | 1 | ส่วน middleware ผ่าน — AC-F02-03 · TEST-F02-03a–c (@c7c0508) รอตรวจกับ endpoint จริงใน F-04 ถึง F-06; endpoint เป้าหมายผ่าน — AC-F04-05, AC-F04-06 · TEST-F04-05, 06a–b (@b081a81); entry/progress ผ่าน — AC-F05-06, AC-F06-03 · TEST-F05-06a–b, TEST-F06-03a–b (@5370950) |
| BR-09 หน่วยคงที่ | F-03, F-05 | 1 | Unit | 1 | ส่วนแม่แบบผ่าน — AC-F03-01, AC-F03-03 · TEST-F03-01, TEST-F03-03c (@b081a81); entry ผ่าน (minutes integer ใน template range) — AC-F05-03 · TEST-F05-03b (@5370950) |

## 3. Non-Functional Requirements

| Requirement | Feature / ความรับผิดชอบ | Sprint (สร้าง) | วิธีตรวจสอบ (วางแผน) | Sprint (ตรวจ) | สถานะ |
|---|---|---|---|---|---|
| NFR-01 ไม่มี session → 401 | F-01, F-02 | 1 | API test ครอบคลุมทุก endpoint ที่ป้องกัน | 1 (ทดสอบซ้ำทุก sprint) | ผ่านกับ endpoint ปัจจุบัน — AC-F02-01 · TEST-F02-01a, b (@c7c0508); endpoint F-05/F-06 เพิ่มใน PROTECTED_ENDPOINTS — TEST-F05-07a–c (@5370950) |
| NFR-02 hash รหัสผ่าน | F-01 | 1 | Integration บน DB + ตรวจโค้ด | 1 | ผ่าน — AC-F01-06 · TEST-F01-06 (@c7c0508) |
| NFR-03 session หมดอายุ 8 ชม. | F-01 | 1 | API test ด้วย token หมดอายุ/ถูกเพิกถอน | 1 | ผ่าน — AC-F01-04, 05, 07 · TEST-F01-04, 05a, 05b, 07 (@c7c0508) |
| NFR-04 ข้อมูลอยู่รอดหลังรีสตาร์ต | F-07 | 1 | Integration: เขียน → รีสตาร์ต → อ่าน | 1 | วางแผน |
| NFR-05 ส่งพร้อมกันเหลือ 1 entry | F-05 (พึ่ง F-07) | 1 | Integration คำขอขนาน | 1 | ผ่าน — AC-F05-02 · TEST-F05-02b (concurrent 5 req → 1 success, 4×409) (@5370950) |
| NFR-06 error ไม่เปิดเผยข้อมูลภายใน | F-02 | 1 | API test ตรวจรูปแบบ error | 1 | ผ่าน — AC-F02-04 · TEST-F02-04a–c (@c7c0508) |
| NFR-07 ติดตั้งใน 15 นาที | F-08 | 1 | เพื่อนทำตาม README บนเครื่องสะอาด | 1 | วางแผน |
| NFR-08 ไม่ commit secret | F-08 | 1 | สแกน repo + review | 1 | วางแผน |
| NFR-09 p95 < 500 ms | F-12 | 2 | สคริปต์จับเวลา | 2 | วางแผน |
| NFR-10 รันใน container | F-16 | Lab 5 | Docker build/run | Lab 5 | วางแผน |

## 4. ตรวจความครอบคลุม (Coverage check)

| รายการ | จำนวนใน SRS | ผูกกับ feature แล้ว | ยังไม่ครอบคลุม |
|---|---|---|---|
| FR | 16 | 16 | 0 |
| BR | 9 | 9 | 0 |
| NFR | 10 | 10 | 0 |

ข้อสังเกต
- **Sprint 1** ครอบคลุม FR-01 ถึง FR-10, BR ทั้ง 9 ข้อ (ใช้ครั้งแรกใน Sprint 1) และ NFR-01 ถึง NFR-08
- BR-01, BR-02, BR-03 ถูกใช้ซ้ำใน F-11 (Sprint 2) จึงต้องมี regression test ว่ากฎยังบังคับหลังเพิ่มการแก้ไข entry
- NFR-01 และ BR-08 ใช้กับ endpoint ใหม่ทุกตัวใน Sprint 2–3 ต้องเพิ่มการทดสอบทุกครั้งที่เพิ่ม endpoint
- NFR-10 ไม่ใช่งานของ Deliverable 1 ประเมินใน Lab 5

## 5. การเปลี่ยนแปลงที่ตกลงกันแล้ว (Approved changes)

| วันที่ | การเปลี่ยนแปลง | เหตุผล | ผลต่อ traceability |
|---|---|---|---|
| 2 พ.ย. 2026 | SRS v0.1 → v0.2: เลข FR เปลี่ยนเป็น FR-01 ถึง FR-16, เพิ่ม BR-04/05 ใหม่ (นิยามเป้าหมาย), เพิ่ม NFR-05/06 | ปิดความกำกวมก่อนเริ่ม traceability | ตารางนี้อ้างเลขของ v0.2 ทั้งหมด |
| 7 พ.ย. 2026 | เพิ่มงาน UI-01 (issue #6) ใน Sprint 1 | สเปก Sprint 1 ต้องมี journey UI → API → DB | ไม่เพิ่ม/ลบ requirement; UI-01 เป็นการตรวจสอบเสริมของ FR-01–10 ผ่านหน้าจอ จะบันทึก AC/TEST ของ UI เมื่อ contract เสร็จ |
