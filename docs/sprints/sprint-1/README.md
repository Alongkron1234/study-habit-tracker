# Sprint 1 — Engineering Contracts (Part E)

เก็บ contract ของแต่ละ feature ใน Sprint 1 ที่นี่ **ก่อน implement** โดย commit แยกจากโค้ด

Feature ใน Sprint 1: F-01 ถึง F-08 (ดู `../plan.md` และ `../../features.md`)

แนะนำไฟล์ละหนึ่ง feature เช่น `F-05-daily-entry.md` แต่ละไฟล์ประกอบด้วย:

1. Feature SDS: พฤติกรรม, workflow, dependency, business rules, validation, failure/boundary, permissions
2. สเปก UI / API / data (ระบุว่า layer ไหนไม่เปลี่ยน ถ้าไม่เกี่ยว)
3. Acceptance Criteria: `AC-Fxx-nn` พร้อมผลลัพธ์ที่สังเกตได้ รวม negative/boundary และข้อจำกัดของ role
4. Software Test Specification: `TEST-Fxx-nn`, AC ที่ครอบคลุม, level, input/precondition, action, expected
5. Definition of Done และหลักฐานที่ต้องใช้

เก็บประวัติการแก้ contract พร้อมเหตุผล อย่าเขียนทับเงียบๆ
