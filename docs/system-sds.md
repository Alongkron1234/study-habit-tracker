# System-Level SDS (Part C) — โครงเอกสาร

**ผลิตภัณฑ์:** Study Habit Tracker | **เวอร์ชัน:** 0.0 (โครงเปล่า ยังไม่เริ่ม) | **อ้างอิง:** SRS v0.2

> เติมเนื้อหาแต่ละหัวข้อตามที่ Deliverable 1 หัวข้อ 3.3 กำหนด ใช้ diagram เมื่อช่วยให้ชัดขึ้น

## 1. สถาปัตยกรรมและ stack
- stack ที่เลือกและเหตุผล
- หน้าที่ของ UI / API / ฐานข้อมูล และวิธีสื่อสารกัน
- business rule ถูกบังคับที่ชั้นไหน (เชื่อมกับ BR-01 ถึง BR-09)

## 2. โมเดลข้อมูล
- entities: ผู้ใช้, แม่แบบ, เป้าหมาย, entry
- ฟิลด์ ความสัมพันธ์ constraints (รวม unique ของ entry ต่อ goal ต่อวัน) ความเป็นเจ้าของข้อมูล
- วิธี setup DB, migration, seed ที่ทำซ้ำได้

## 3. UI
- หน้าหลักและ navigation
- พฤติกรรมร่วม: validation, loading, empty, error

## 4. API
- convention ของ endpoint, รูป request/response, validation, รูปแบบ error ที่ปลอดภัย (NFR-06)

## 5. บทบาทและสิทธิ์
- role/permission matrix (PM, Participant) และ record ที่เข้าถึงได้
- การบังคับที่ backend

## 6. การยืนยันตัวตน
- hash รหัสผ่าน (NFR-02)
- การสร้างและอายุ session/token (NFR-03)
- current user และ logout

## 7. Configuration และการ deploy
- environment variables (อ้าง `.env.example`) การจัดการ secret (NFR-08)
- config ฐานข้อมูล
- ส่วนประกอบ GCP ที่วางแผน และความเหมาะสมกับ Docker (NFR-10)
