/**
 * rbac.test.js — F-02 การควบคุมสิทธิ์และ error ที่ปลอดภัย
 *
 * Contract: docs/sprints/sprint-1/F-01-F-02-auth-rbac.md
 *   TEST-F02-01a/b, 02a/b/c, 03a/b/c, 04a/b/c
 * Requirements: NFR-01, BR-07, BR-08, NFR-06
 *
 * ยังไม่มี endpoint ธุรกิจจริง จึงทดสอบ middleware กับ route ทดสอบ (/__test/*)
 * ที่ประกาศในไฟล์นี้เท่านั้น ส่วน /__test/login ตั้ง session ตรงๆ เพื่อให้เทสต์ F-02
 * ไม่ขึ้นกับ implementation ของ login (F-01)
 * การตรวจ BR-07/BR-08 กับ endpoint จริงเป็นของ contract F-03 ถึง F-06
 */
require('./helpers/test-env');

const request = require('supertest');
const pool = require('../src/db/db');
const { createApp } = require('../src/app');
const { requireAuth, requireRole, ownedBy } = require('../src/middleware/auth');

// ผู้ใช้สมมติ (ไม่ต้องมีแถวใน users เพราะ /__test/login ไม่ตรวจกับ DB)
const PM = { id: 9001, username: 'rbac_pm', role: 'pm' };
const PARTICIPANT_A = { id: 9101, username: 'rbac_a', role: 'participant' };
const PARTICIPANT_B = { id: 9102, username: 'rbac_b', role: 'participant' };

// ทรัพยากรทดสอบ: item 1 เป็นของ A
const OWNER_OF = { 1: PARTICIPANT_A.id };

// รายการ endpoint ที่ป้องกัน — feature ถัดไปต้องเพิ่ม endpoint ของตนที่นี่ทุกครั้ง (NFR-01)
const PROTECTED_ENDPOINTS = [
  ['get', '/api/auth/me'],
  ['post', '/api/auth/logout'],
  ['get', '/__test/pm-only'],
  ['get', '/__test/participant-only'],
  ['get', '/__test/items/1'],
  ['post', '/api/templates'],
  ['get', '/api/templates'],
  ['post', '/api/goals'],
  ['get', '/api/goals'],
  ['get', '/api/goals/1'],
];

let app;

beforeAll(async () => {
  await pool.query('DELETE FROM session');
  app = createApp({
    mountRoutes(a) {
      // TEST-ONLY route: ตั้ง session ตรงๆ โดยไม่ตรวจรหัสผ่าน เพื่อให้เทสต์ F-02 ไม่ขึ้นกับ F-01
      // ไม่มีอยู่ในแอปจริง (app.js ไม่ mount) ห้ามนำไปใช้นอกไฟล์เทสต์
      a.post('/__test/login', (req, res) => {
        req.session.user = req.body;
        res.sendStatus(204);
      });
      a.get('/__test/pm-only', requireAuth, requireRole('pm'), (_req, res) => res.json({ ok: true }));
      a.get('/__test/participant-only', requireAuth, requireRole('participant'), (_req, res) => res.json({ ok: true }));
      a.get(
        '/__test/items/:id',
        requireAuth,
        requireRole('participant'),
        ownedBy((req) => OWNER_OF[req.params.id]),
        (_req, res) => res.json({ ok: true })
      );
      a.get('/__test/boom', () => {
        throw new Error('SELECT * FROM users failed — secret-db-detail');
      });
    },
  });
});

afterAll(async () => {
  await pool.query('DELETE FROM session');
  await pool.end();
});

async function cookieFor(user) {
  const res = await request(app).post('/__test/login').send(user);
  expect(res.status).toBe(204);
  return res.headers['set-cookie'][0].split(';')[0];
}

// ═══════════════════════════════════════════════════════════════
describe('TEST-F02-01 — ไม่มี session ต้องได้ 401 (AC-F02-01, NFR-01)', () => {
  test.each(PROTECTED_ENDPOINTS)('TEST-F02-01a: %s %s ไม่มี cookie → 401 Unauthorized', async (method, path) => {
    const res = await request(app)[method](path);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  test.each(PROTECTED_ENDPOINTS)('TEST-F02-01b: %s %s cookie ปลอม → 401', async (method, path) => {
    const res = await request(app)[method](path).set('Cookie', 'connect.sid=s%3Aforged.invalidsignature');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F02-02 — บังคับ role (AC-F02-02, BR-07/BR-08)', () => {
  test('TEST-F02-02a: Participant เรียก endpoint เฉพาะ PM → 403', async () => {
    const res = await request(app).get('/__test/pm-only').set('Cookie', await cookieFor(PARTICIPANT_A));

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  test('TEST-F02-02b: PM เรียก endpoint เฉพาะ Participant → 403', async () => {
    const res = await request(app).get('/__test/participant-only').set('Cookie', await cookieFor(PM));

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  test('TEST-F02-02c: PM เรียก endpoint ของ PM → 200', async () => {
    const res = await request(app).get('/__test/pm-only').set('Cookie', await cookieFor(PM));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F02-03 — ความเป็นเจ้าของข้อมูล (AC-F02-03, BR-08)', () => {
  test('TEST-F02-03a: เจ้าของทรัพยากร (Participant A) → 200', async () => {
    const res = await request(app).get('/__test/items/1').set('Cookie', await cookieFor(PARTICIPANT_A));

    expect(res.status).toBe(200);
  });

  test('TEST-F02-03b: Participant คนอื่น (B) → 404 ไม่ยืนยันว่าข้อมูลมีอยู่', async () => {
    const res = await request(app).get('/__test/items/1').set('Cookie', await cookieFor(PARTICIPANT_B));

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not Found' });
  });

  test('TEST-F02-03c: PM อ่านทรัพยากรของ Participant → 403', async () => {
    const res = await request(app).get('/__test/items/1').set('Cookie', await cookieFor(PM));

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F02-04 — error ที่ปลอดภัย (AC-F02-04, NFR-06)', () => {
  test('TEST-F02-04a: error ที่ไม่คาดคิด → 500 ข้อความกลาง ไม่มี SQL/stack/message ภายใน', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).get('/__test/boom');
    const logged = spy.mock.calls.length;
    spy.mockRestore();

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal Server Error' });
    expect(res.text).not.toMatch(/select|secret|stack|node_modules|\.js/i);
    expect(logged).toBeGreaterThan(0); // 5xx ต้อง log รายละเอียดจริงไว้ฝั่งเซิร์ฟเวอร์
  });

  test('TEST-F02-04b: JSON พัง → 400 ข้อความคงที่ ไม่มีข้อความ parse ของ library', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"username": ');
    const logged = spy.mock.calls.length;
    spy.mockRestore();

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Bad Request' });
    expect(logged).toBe(0); // 4xx เป็นความผิดของ client ไม่ log เป็น server error (review PR #7)
  });

  test('TEST-F02-04c: route ที่ไม่มีอยู่ → 404 JSON ข้อความคงที่', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).get('/__test/does-not-exist');
    const logged = spy.mock.calls.length;
    spy.mockRestore();

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not Found' });
    expect(logged).toBe(0);
  });
});
