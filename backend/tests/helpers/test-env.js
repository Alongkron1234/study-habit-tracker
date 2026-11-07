/**
 * test-env.js — เตรียม environment สำหรับเทสต์ที่ใช้แอปจริง (supertest)
 *
 * ต้อง require ไฟล์นี้ก่อน require src/app หรือ src/db/db
 * - ใช้ TEST_DATABASE_URL เท่านั้น (ไม่ fallback ไป DATABASE_URL เพื่อกันลบข้อมูล dev)
 * - SESSION_SECRET เป็นค่าสังเคราะห์สำหรับเทสต์ ไม่ใช่ secret จริง
 */
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.test') });

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    '[FATAL] TEST_DATABASE_URL is not set. Refusing to run tests against default database. Configure it in backend/.env.test'
  );
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.SESSION_SECRET = 'test-only-session-secret-not-real';
process.env.NODE_ENV = 'test';
