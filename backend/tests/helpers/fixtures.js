/**
 * fixtures.js — ตัวช่วยเทสต์ของ F-03/F-04 (ผู้ใช้ทดสอบ, login จริง, วันที่แบบ Bangkok)
 * รหัสผ่านเป็นค่าสังเคราะห์สำหรับเทสต์เท่านั้น
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const pool = require('../../src/db/db');

const PASSWORD = 'Test-Only-Pw-123';

// คำนวณเองในเทสต์ (ไม่พึ่ง src/lib/dates) เพื่อให้เป็นการตรวจอิสระ
const todayBkk = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function createUser(username, role) {
  const hash = await bcrypt.hash(PASSWORD, 4);
  const { rows } = await pool.query(
    'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
    [username, `${username}@test.local`, hash, role]
  );
  return rows[0].id;
}

async function loginAs(app, username) {
  const res = await request(app).post('/api/auth/login').send({ username, password: PASSWORD });
  if (res.status !== 200) throw new Error(`fixture login failed for ${username}: ${res.status}`);
  return res.headers['set-cookie'][0].split(';')[0];
}

async function cleanupPrefix(prefix) {
  const like = `${prefix}%`;
  await pool.query(
    'DELETE FROM habit_entries WHERE goal_id IN (SELECT id FROM goals WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1))',
    [like]
  );
  await pool.query('DELETE FROM goals WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1)', [like]);
  await pool.query('DELETE FROM activity_templates WHERE created_by IN (SELECT id FROM users WHERE username LIKE $1)', [like]);
  await pool.query('DELETE FROM session');
  await pool.query('DELETE FROM users WHERE username LIKE $1', [like]);
}

module.exports = { PASSWORD, todayBkk, addDays, createUser, loginAs, cleanupPrefix };
