/**
 * templates.test.js — F-03 แม่แบบกิจกรรม
 * Contract: docs/sprints/sprint-1/F-03-F-04-templates-goals.md
 *   TEST-F03-01, 02, 03a/b/c, 04, 05, 06
 * Requirements: FR-04, FR-05, FR-06, BR-02, BR-07, BR-09
 */
require('./helpers/test-env');

const request = require('supertest');
const pool = require('../src/db/db');
const { createApp } = require('../src/app');
const { createUser, loginAs, cleanupPrefix } = require('./helpers/fixtures');

const P = 'test_tpl_';
let app, pm1Cookie, pm2Cookie, partCookie, pm1Id;

const count = async () => Number((await pool.query('SELECT count(*) FROM activity_templates WHERE created_by IN (SELECT id FROM users WHERE username LIKE $1)', [`${P}%`])).rows[0].count);
const post = (cookie, body) => request(app).post('/api/templates').set('Cookie', cookie).send(body);
const valid = (over = {}) => ({ name: 'Reading', min_value: 10, max_value: 120, ...over });

beforeAll(async () => {
  app = createApp();
  await cleanupPrefix(P);
  pm1Id = await createUser(`${P}pm1`, 'pm');
  await createUser(`${P}pm2`, 'pm');
  await createUser(`${P}p1`, 'participant');
  pm1Cookie = await loginAs(app, `${P}pm1`);
  pm2Cookie = await loginAs(app, `${P}pm2`);
  partCookie = await loginAs(app, `${P}p1`);
});
afterAll(async () => { await cleanupPrefix(P); await pool.end(); });

describe('TEST-F03-01 — PM สร้างแม่แบบ (AC-F03-01)', () => {
  test('TEST-F03-01: 201, unit=minutes, บันทึกใน DB ด้วย created_by = PM', async () => {
    const res = await post(pm1Cookie, valid());
    expect(res.status).toBe(201);
    expect(res.body.template).toMatchObject({ name: 'Reading', unit: 'minutes', min_value: 10, max_value: 120, is_archived: false });
    expect(res.body.template).not.toHaveProperty('created_by');
    const { rows } = await pool.query('SELECT created_by FROM activity_templates WHERE id = $1', [res.body.template.id]);
    expect(rows[0].created_by).toBe(pm1Id);
  });
});

describe('TEST-F03-02 — Participant สร้างไม่ได้ (AC-F03-02, BR-07)', () => {
  test('TEST-F03-02: 403 และไม่มีแถวใหม่', async () => {
    const before = await count();
    const res = await post(partCookie, valid());
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
    expect(await count()).toBe(before);
  });
});

describe('TEST-F03-03 — validation (AC-F03-03, BR-02, BR-09)', () => {
  test.each([[0], [961]])('TEST-F03-03a: min_value=%p → 400 พร้อม fields', async (v) => {
    const before = await count();
    const res = await post(pm1Cookie, valid({ min_value: v, max_value: 960 }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad Request');
    expect(res.body.fields).toHaveProperty('min_value');
    expect(await count()).toBe(before);
  });
  test('TEST-F03-03a: max_value=961 → 400; min=1,max=960 → 201', async () => {
    expect((await post(pm1Cookie, valid({ min_value: 1, max_value: 961 }))).status).toBe(400);
    expect((await post(pm1Cookie, valid({ min_value: 1, max_value: 960 }))).status).toBe(201);
  });
  test.each([
    ['max < min', { min_value: 50, max_value: 49 }],
    ['ทศนิยม', { min_value: 10.5 }],
    ['เป็น string', { min_value: '10' }],
    ['ขาด min_value', { min_value: undefined }],
    ['ขาด max_value', { max_value: undefined }],
  ])('TEST-F03-03b: %s → 400', async (_n, over) => {
    expect((await post(pm1Cookie, valid(over))).status).toBe(400);
  });
  test.each([[''], ['   '], ['x'.repeat(101)]])('TEST-F03-03c: ชื่อไม่ถูกต้อง (%#) → 400', async (name) => {
    expect((await post(pm1Cookie, valid({ name }))).status).toBe(400);
  });
  test('TEST-F03-03c: ชื่อ 100 ตัวอักษร → 201; unit=hours → 400', async () => {
    expect((await post(pm1Cookie, valid({ name: 'x'.repeat(100) }))).status).toBe(201);
    const res = await post(pm1Cookie, valid({ unit: 'hours' }));
    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty('unit');
  });
});

describe('TEST-F03-04/05 — รายการแม่แบบ (AC-F03-04, AC-F03-05)', () => {
  test('TEST-F03-04: PM เห็นเฉพาะของตน', async () => {
    await post(pm2Cookie, valid({ name: 'PM2-only' }));
    const r1 = await request(app).get('/api/templates').set('Cookie', pm1Cookie);
    const r2 = await request(app).get('/api/templates').set('Cookie', pm2Cookie);
    expect(r1.status).toBe(200);
    expect(r1.body.templates.map((t) => t.name)).not.toContain('PM2-only');
    expect(r2.body.templates.map((t) => t.name)).toEqual(['PM2-only']);
  });
  test('TEST-F03-05: Participant เห็นเฉพาะที่ไม่ archived', async () => {
    const a = await post(pm1Cookie, valid({ name: 'Visible-tpl' }));
    const b = await post(pm1Cookie, valid({ name: 'Archived-tpl' }));
    await pool.query('UPDATE activity_templates SET is_archived = true WHERE id = $1', [b.body.template.id]);
    const res = await request(app).get('/api/templates').set('Cookie', partCookie);
    expect(res.status).toBe(200);
    const names = res.body.templates.map((t) => t.name);
    expect(names).toContain('Visible-tpl');
    expect(names).not.toContain('Archived-tpl');
    expect(res.body.templates.find((t) => t.id === a.body.template.id)).not.toHaveProperty('created_by');
  });
});

describe('TEST-F03-06 — ต้อง login (NFR-01)', () => {
  test.each([['post', '/api/templates'], ['get', '/api/templates']])('TEST-F03-06: %s %s ไม่มี cookie → 401', async (m, p) => {
    const res = await request(app)[m](p);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });
});
