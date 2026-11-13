/**
 * create-user.test.js — สคริปต์สร้างผู้ใช้คนแรกบน Cloud Run (Lab 5 Ep.5)
 *
 * ใช้ Postgres ของ TEST_DATABASE_URL รหัสผ่านเป็นค่าสังเคราะห์สำหรับเทสต์เท่านั้น
 */
require('./helpers/test-env');

const request = require('supertest');
const pool = require('../src/db/db');
const { createUser } = require('../src/db/create-user');
const { createApp } = require('../src/app');

const PASSWORD = 'Test-Only-Pw-12345';
const USERNAME = 'test_cu_pm';

async function cleanup() {
  await pool.query('DELETE FROM session');
  await pool.query("DELETE FROM users WHERE username LIKE 'test\\_cu\\_%'");
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await pool.end();
});

const input = (over = {}) => ({
  username: USERNAME, email: 'cu_pm@test.local', role: 'pm', password: PASSWORD, ...over,
});

test('creates a user who can log in, with a hashed password', async () => {
  expect(await createUser(input(), pool, 4)).toBe('created');

  const { rows } = await pool.query('SELECT password_hash, role FROM users WHERE username = $1', [USERNAME]);
  expect(rows[0].role).toBe('pm');
  expect(rows[0].password_hash).not.toContain(PASSWORD);

  const res = await request(createApp()).post('/api/auth/login').send({ username: USERNAME, password: PASSWORD });
  expect(res.status).toBe(200);
  expect(res.body.user.role).toBe('pm');
});

test('is idempotent: an existing user is not overwritten', async () => {
  const result = await createUser(input({ password: 'Another-Pw-987654' }), pool, 4);
  expect(result).toBe('exists');

  const res = await request(createApp()).post('/api/auth/login').send({ username: USERNAME, password: PASSWORD });
  expect(res.status).toBe(200); // old password still works
});

test.each([
  ['short password', { password: 'short' }, /USER_PASSWORD/],
  ['missing password', { password: undefined }, /USER_PASSWORD/],
  ['bad role', { role: 'admin' }, /USER_ROLE/],
  ['bad email', { email: 'not-an-email' }, /USER_EMAIL/],
  ['short username', { username: 'ab' }, /USER_USERNAME/],
])('rejects %s without touching the DB', async (_name, over, message) => {
  await expect(createUser(input({ username: 'test_cu_bad', ...over }), pool, 4)).rejects.toThrow(message);
  const { rowCount } = await pool.query("SELECT 1 FROM users WHERE username = 'test_cu_bad'");
  expect(rowCount).toBe(0);
});
