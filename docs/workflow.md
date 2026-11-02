# ขั้นตอนการทำงานของทีม (Git และ Release)

ตามสเปก CPE 334 หัวข้อ 8.3 ใช้ขั้นตอนเดียวกันทุก sprint

## Branch

| Branch | หน้าที่ |
|---|---|
| `main` | release ที่ผ่านการตรวจแล้วเท่านั้น (deploy จากที่นี่หลัง Lab 5) |
| `sprint-1-staging` | รวมงานของ Sprint 1 (Sprint 2 และ 3 ใช้ `sprint-2-staging`, `sprint-3-staging`) |
| `feature/F-xx-ชื่อสั้น` | งานของ feature หนึ่งรายการ แตกจาก staging ของ sprint ปัจจุบัน |
| `fix/ชื่อสั้น` | แก้ defect แตกจาก staging |

## ลำดับการทำงาน

1. สร้าง **Issue** ผูกกับ requirement และ feature (เช่น FR-08, F-05) ใช้ template ใน `.github/ISSUE_TEMPLATE`
2. เขียน **contract** ของ feature (Feature SDS, AC, STS, DoD) แล้ว commit แยกก่อนโค้ด
3. สร้าง branch จาก staging
4. เขียนเทสต์ที่ **fail ก่อน** แล้ว implement จนผ่าน (TDD) เก็บหลักฐานว่า fail → pass
5. รันเทสต์ทั้งหมด ตรวจ diff อัปเดตเอกสาร
6. เปิด **PR เข้า staging** ใช้ PR template ระบุ Issue, AC, ผลเทสต์
7. **เพื่อนร่วมทีม review** ต้องมีการตรวจ คำถาม หรือเหตุผลที่อนุมัติเฉพาะเจาะจง ห้าม approve PR ของตัวเอง
8. รวมเข้า staging รัน integration/system test และ acceptance check
9. เปิด **release PR** จาก staging เข้า `main` เมื่อผ่านทุกอย่าง
10. **Tag** release (เช่น `v0.1.0` สำหรับ Sprint 1) และบันทึก commit

ถ้า integration ไม่ผ่าน ให้กลับไปเปิด Issue หรือ fix branch ใหม่ แล้วทดสอบซ้ำ

## กติกาของทีม

- ทำงานเป็นคู่ ไม่แบ่งบทบาทถาวร สลับกันเขียนและ review
- ระบุงานคู่ (pair work) ใน Issue/PR
- ห้ามปิดหรือลดเทสต์เพื่อให้ผลผ่าน
- ห้าม commit secret หรือรหัสผ่านจริง
- commit หลัง release ที่ส่งตรวจต้องไม่ทับเวอร์ชันที่ใช้ประเมินแบบเงียบๆ
- ตั้งค่า branch protection ของ `main` ให้ต้องผ่าน PR (CI บังคับเพิ่มใน Lab 5)
