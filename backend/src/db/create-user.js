/**
 * create-user.js — สร้างผู้ใช้คนแรก (ใช้บน Cloud Run job หลัง migrate)
 *
 * Usage: node src/db/create-user.js
 *
 * Env:
 *   DATABASE_URL     ฐานข้อมูล
 *   USER_USERNAME    ชื่อผู้ใช้ (3–50 ตัวอักษร)
 *   USER_EMAIL       อีเมล
 *   USER_ROLE        pm | participant (ค่าเริ่มต้น pm)
 *   USER_PASSWORD    รหัสผ่าน (อย่างน้อย 12 ตัว) — มาจาก Secret Manager ไม่ใส่ใน repo
 *
 * ปลอดภัยและรันซ้ำได้: ถ้ามี username นี้อยู่แล้วจะ "ไม่แก้ทับ" (ไม่เปลี่ยนรหัสผ่าน)
 * ไม่พิมพ์รหัสผ่านออก log (NFR-08)
 *
 * ต่างจาก seed.js ที่สร้างบัญชี demo รหัสผ่านเปิดเผย → ห้ามรันกับ database จริง
 */
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const bcrypt = require('bcrypt');
const defaultPool = require('./db');

const SALT_ROUNDS = 10;
const ROLES = ['pm', 'participant'];
const MIN_PASSWORD_LENGTH = 12;

/**
 * @returns {Promise<'created'|'exists'>}
 */
async function createUser({ username, email, role = 'pm', password }, pool = defaultPool, saltRounds = SALT_ROUNDS) {
  if (typeof username !== 'string' || username.length < 3 || username.length > 50) {
    throw new Error('USER_USERNAME must be 3-50 characters.');
  }
  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+$/.test(email) || email.length > 255) {
    throw new Error('USER_EMAIL must be a valid email address.');
  }
  if (!ROLES.includes(role)) {
    throw new Error(`USER_ROLE must be one of: ${ROLES.join(', ')}.`);
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`USER_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const hash = await bcrypt.hash(password, saltRounds);
  const { rowCount } = await pool.query(
    `INSERT INTO users (username, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [username, email, hash, role]
  );
  return rowCount === 1 ? 'created' : 'exists';
}

async function main() {
  try {
    const result = await createUser({
      username: process.env.USER_USERNAME,
      email: process.env.USER_EMAIL,
      role: process.env.USER_ROLE || 'pm',
      password: process.env.USER_PASSWORD,
    });
    console.log(`[create-user] ${process.env.USER_USERNAME}: ${result}`);
  } catch (err) {
    console.error('[create-user] failed:', err.message);
    process.exitCode = 1;
  } finally {
    await defaultPool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { createUser };
