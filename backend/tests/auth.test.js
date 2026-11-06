/**
 * auth.test.js — F-01 การยืนยันตัวตน (login / logout / me)
 *
 * Contract: docs/sprints/sprint-1/F-01-F-02-auth-rbac.md
 *   TEST-F01-01, 02a/b/c, 03, 04a/b, 05a/b, 06, 07
 * Requirements: FR-01, FR-02, FR-03, NFR-02, NFR-03
 *
 * ใช้แอปจริง (createApp) + Postgres ของ TEST_DATABASE_URL
 * รหัสผ่านในไฟล์นี้เป็นค่าสังเคราะห์สำหรับเทสต์เท่านั้น
 */
require('./helpers/test-env');

const request = require('supertest');
const bcrypt = require('bcrypt');
const pool = require('../src/db/db');
const seed = require('../src/db/seeds/seed');
const { createApp } = require('../src/app');

const PASSWORD = 'Test-Only-Pw-123';
const PARTICIPANT = 'test_auth_p1';
const PM = 'test_auth_pm';

let app;

async function cleanup() {
  await pool.query('DELETE FROM session');
  await pool.query("DELETE FROM users WHERE username LIKE 'test\\_auth\\_%'");
}

beforeAll(async () => {
  app = createApp();
  await cleanup();
  const hash = await bcrypt.hash(PASSWORD, 4);
  await pool.query(
    `INSERT INTO users (username, email, password_hash, role) VALUES
       ($1, 'auth_p1@test.local', $3, 'participant'),
       ($2, 'auth_pm@test.local', $3, 'pm')`,
    [PARTICIPANT, PM, hash]
  );
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

// ───── helpers ─────
const login = (username = PARTICIPANT, password = PASSWORD, cookie) => {
  const req = request(app).post('/api/auth/login');
  if (cookie) req.set('Cookie', cookie);
  return req.send({ username, password });
};

function setCookieOf(res) {
  const raw = (res.headers['set-cookie'] || [])[0];
  expect(raw).toBeDefined();
  return raw;
}
const cookieOf = (res) => setCookieOf(res).split(';')[0]; // "connect.sid=s%3A<sid>.<sig>"
const sidOf = (cookie) => decodeURIComponent(cookie.split('=')[1]).slice(2).split('.')[0];

// ═══════════════════════════════════════════════════════════════
describe('TEST-F01-01 — login สำเร็จ (AC-F01-01)', () => {
  test('TEST-F01-01: ข้อมูลถูกต้อง → 200 ได้ {id, username, role} + cookie HttpOnly', async () => {
    const res = await login();

    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['user']);
    expect(Object.keys(res.body.user).sort()).toEqual(['id', 'role', 'username']);
    expect(res.body.user.username).toBe(PARTICIPANT);
    expect(res.body.user.role).toBe('participant');
    expect(setCookieOf(res)).toMatch(/HttpOnly/i);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F01-02 — login ล้มเหลว (AC-F01-02)', () => {
  test('TEST-F01-02a: รหัสผ่านผิด → 401 ข้อความทั่วไป', async () => {
    const res = await login(PARTICIPANT, 'wrong-password');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid username or password' });
  });

  test('TEST-F01-02b: ไม่มี username นี้ → 401 และ body เหมือน 02a ทุกตัวอักษร', async () => {
    const wrongPassword = await login(PARTICIPANT, 'wrong-password');
    const unknownUser = await login('test_auth_nobody', PASSWORD);

    expect(unknownUser.status).toBe(401);
    expect(unknownUser.text).toBe(wrongPassword.text);
  });

  test.each([
    ['ไม่ส่ง password', { username: PARTICIPANT }],
    ['password ว่าง', { username: PARTICIPANT, password: '' }],
    ['password เป็นตัวเลข', { username: PARTICIPANT, password: 12345 }],
    ['ไม่ส่ง username', { password: PASSWORD }],
  ])('TEST-F01-02c: %s → 400', async (_label, body) => {
    const res = await request(app).post('/api/auth/login').send(body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Bad Request' });
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F01-03 — ผู้ใช้ปัจจุบัน (AC-F01-03)', () => {
  test('TEST-F01-03: GET /me ด้วย session ที่ถูกต้อง → 200 ตรงกับผู้ใช้ที่ login', async () => {
    const loginRes = await login(PM);
    const res = await request(app).get('/api/auth/me').set('Cookie', cookieOf(loginRes));

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual(loginRes.body.user);
    expect(res.body.user.username).toBe(PM);
    expect(res.body.user.role).toBe('pm');
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F01-04 — logout (AC-F01-04)', () => {
  test('TEST-F01-04a: logout → 204 แล้วใช้ cookie เดิมเรียก /me ได้ 401', async () => {
    const cookie = cookieOf(await login());

    const out = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(204);

    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(401);
  });

  test('TEST-F01-04b: logout แล้วแถวของ session ถูกลบจากตาราง session', async () => {
    const cookie = cookieOf(await login());
    const sid = sidOf(cookie);

    const before = await pool.query('SELECT 1 FROM session WHERE sid = $1', [sid]);
    expect(before.rowCount).toBe(1);

    await request(app).post('/api/auth/logout').set('Cookie', cookie);

    const after = await pool.query('SELECT 1 FROM session WHERE sid = $1', [sid]);
    expect(after.rowCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F01-05 — อายุ session (AC-F01-05, NFR-03)', () => {
  test('TEST-F01-05a: session ที่ expire เลยเวลาแล้ว → 401', async () => {
    const cookie = cookieOf(await login());
    await pool.query(
      "UPDATE session SET expire = now() - interval '1 minute' WHERE sid = $1",
      [sidOf(cookie)]
    );

    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  test('TEST-F01-05b: cookie ที่ออกตอน login มีอายุ 8 ชม. (28800 วินาที ±5)', async () => {
    const raw = setCookieOf(await login());
    const maxAge = /Max-Age=(\d+)/i.exec(raw);
    const expires = /Expires=([^;]+)/i.exec(raw);

    const seconds = maxAge ? Number(maxAge[1]) : (new Date(expires[1]) - Date.now()) / 1000;
    expect(Math.abs(seconds - 28800)).toBeLessThanOrEqual(5);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F01-06 — เก็บรหัสผ่านเป็น hash (AC-F01-06, NFR-02)', () => {
  test('TEST-F01-06: password_hash ของผู้ใช้จาก seed ไม่ใช่รหัสผ่านจริง และเป็น bcrypt', async () => {
    await seed(pool);
    const SEED_PLAIN = 'Demo@Alice1'; // รหัสสังเคราะห์ใน seed.js

    const { rows } = await pool.query(
      "SELECT password_hash FROM users WHERE username = 'pm_alice'"
    );
    const stored = rows[0].password_hash;

    expect(stored).not.toBe(SEED_PLAIN);
    expect(stored.startsWith('$2')).toBe(true);
    expect(await bcrypt.compare(SEED_PLAIN, stored)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F01-07 — session id ใหม่ทุกครั้งที่ login (AC-F01-07)', () => {
  test('TEST-F01-07: login ซ้ำขณะถือ cookie เดิม → ได้ cookie/sid ใหม่ที่ต่างจากเดิม', async () => {
    const first = cookieOf(await login());
    const second = cookieOf(await login(PARTICIPANT, PASSWORD, first));

    expect(sidOf(second)).not.toBe(sidOf(first));
  });
});
