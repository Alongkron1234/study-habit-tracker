/**
 * goals.test.js — F-04 การตั้งเป้าหมาย
 * Contract: docs/sprints/sprint-1/F-03-F-04-templates-goals.md
 *   TEST-F04-01, 02a-e, 03a-e, 04, 05, 06a/b, 07, 08
 * Requirements: FR-07, BR-04, BR-05, BR-08
 */
require('./helpers/test-env');

const request = require('supertest');
const pool = require('../src/db/db');
const { createApp } = require('../src/app');
const { createUser, loginAs, cleanupPrefix, todayBkk, addDays } = require('./helpers/fixtures');

const P = 'test_goal_';
let app, pmId, aId, bId, aCookie, bCookie, pmCookie, t1, t2, tArchived;

async function newTemplate(name, archived = false) {
  const { rows } = await pool.query(
    'INSERT INTO activity_templates (created_by, name, min_value, max_value, is_archived) VALUES ($1,$2,1,120,$3) RETURNING id',
    [pmId, name, archived]
  );
  return rows[0].id;
}
const goalBody = (templateId, over = {}) => {
  const t = todayBkk();
  return { template_id: templateId, target_minutes: 600, start_date: t, end_date: addDays(t, 29), ...over };
};
const create = (cookie, body) => request(app).post('/api/goals').set('Cookie', cookie).send(body);
const countGoals = async (userId, templateId) =>
  Number((await pool.query('SELECT count(*) FROM goals WHERE user_id=$1 AND template_id=$2', [userId, templateId])).rows[0].count);
const clearGoals = () => pool.query('DELETE FROM goals WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1)', [`${P}%`]);

beforeAll(async () => {
  app = createApp();
  await cleanupPrefix(P);
  pmId = await createUser(`${P}pm`, 'pm');
  aId = await createUser(`${P}a`, 'participant');
  bId = await createUser(`${P}b`, 'participant');
  t1 = await newTemplate('T1');
  t2 = await newTemplate('T2');
  tArchived = await newTemplate('Archived', true);
  aCookie = await loginAs(app, `${P}a`);
  bCookie = await loginAs(app, `${P}b`);
  pmCookie = await loginAs(app, `${P}pm`);
});
beforeEach(clearGoals);
afterAll(async () => { await cleanupPrefix(P); await pool.end(); });

describe('TEST-F04-01 — สร้างเป้าหมาย (AC-F04-01)', () => {
  test('TEST-F04-01: 201, active, เจ้าของ = ผู้ใช้, ไม่มี user_id ใน response', async () => {
    const res = await create(aCookie, goalBody(t1));
    expect(res.status).toBe(201);
    expect(res.body.goal).toMatchObject({ template_id: t1, target_minutes: 600, status: 'active' });
    expect(res.body.goal).not.toHaveProperty('user_id');
    const { rows } = await pool.query('SELECT user_id FROM goals WHERE id=$1', [res.body.goal.id]);
    expect(rows[0].user_id).toBe(aId);
  });
});

describe('TEST-F04-02 — validation (AC-F04-02, BR-04)', () => {
  test.each([[0], [-5], [1.5], ['100']])('TEST-F04-02a: target_minutes=%p → 400', async (v) => {
    const res = await create(aCookie, goalBody(t1, { target_minutes: v }));
    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty('target_minutes');
    expect(await countGoals(aId, t1)).toBe(0);
  });
  test('TEST-F04-02a: target_minutes=1 → 201', async () => {
    expect((await create(aCookie, goalBody(t1, { target_minutes: 1 }))).status).toBe(201);
  });
  test.each([['2026-02-30'], ['x'], [undefined]])('TEST-F04-02b: end_date=%p → 400', async (v) => {
    const res = await create(aCookie, goalBody(t1, { end_date: v }));
    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty('end_date');
  });
  test('TEST-F04-02b: start_date ผิดรูปแบบ → 400', async () => {
    const res = await create(aCookie, goalBody(t1, { start_date: '2026-1-5' }));
    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty('start_date');
  });
  test('TEST-F04-02c: end ก่อน start → 400; end = start → 201', async () => {
    const t = todayBkk();
    const bad = await create(aCookie, goalBody(t1, { start_date: addDays(t, 5), end_date: addDays(t, 4) }));
    expect(bad.status).toBe(400);
    expect(bad.body.fields).toHaveProperty('end_date');
    expect((await create(aCookie, goalBody(t1, { start_date: addDays(t, 5), end_date: addDays(t, 5) }))).status).toBe(201);
  });
  test('TEST-F04-02d: start เมื่อวาน → 400; start วันนี้ → 201', async () => {
    const t = todayBkk();
    const bad = await create(aCookie, goalBody(t1, { start_date: addDays(t, -1), end_date: addDays(t, 10) }));
    expect(bad.status).toBe(400);
    expect(bad.body.fields).toHaveProperty('start_date');
    expect((await create(aCookie, goalBody(t1, { start_date: t }))).status).toBe(201);
  });
  test('TEST-F04-02e: 366 วัน → 400; 365 วัน (นับรวมปลาย) → 201', async () => {
    const t = todayBkk();
    expect((await create(aCookie, goalBody(t1, { start_date: t, end_date: addDays(t, 365) }))).status).toBe(400);
    expect((await create(aCookie, goalBody(t1, { start_date: t, end_date: addDays(t, 364) }))).status).toBe(201);
  });
});

describe('TEST-F04-03 — 1 active ต่อแม่แบบ (AC-F04-03, BR-05)', () => {
  test('TEST-F04-03a: ซ้ำในแม่แบบเดียวกัน → 409 และจำนวนไม่เพิ่ม', async () => {
    await create(aCookie, goalBody(t1));
    const res = await create(aCookie, goalBody(t1));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Conflict' });
    expect(await countGoals(aId, t1)).toBe(1);
  });
  test('TEST-F04-03b: คนละแม่แบบ → 201', async () => {
    await create(aCookie, goalBody(t1));
    expect((await create(aCookie, goalBody(t2))).status).toBe(201);
  });
  test('TEST-F04-03c: 5 คำขอพร้อมกัน → สำเร็จ 1 ที่เหลือ 409 ไม่มี 500', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => create(aCookie, goalBody(t1))));
    const codes = results.map((r) => r.status).sort();
    expect(codes).toEqual([201, 409, 409, 409, 409]);
    const { rows } = await pool.query("SELECT count(*) FROM goals WHERE user_id=$1 AND template_id=$2 AND status='active'", [aId, t1]);
    expect(Number(rows[0].count)).toBe(1);
  });
  test('TEST-F04-03d: goal เก่าที่ end_date ผ่านแล้ว (status ยัง active) ไม่ขวาง และถูกปรับเป็น ended', async () => {
    const t = todayBkk();
    const old = await pool.query(
      "INSERT INTO goals (user_id, template_id, target_minutes, start_date, end_date, status) VALUES ($1,$2,100,$3,$4,'active') RETURNING id",
      [aId, t1, addDays(t, -10), addDays(t, -1)]
    );
    const res = await create(aCookie, goalBody(t1));
    expect(res.status).toBe(201);
    const { rows } = await pool.query('SELECT status FROM goals WHERE id=$1', [old.rows[0].id]);
    expect(rows[0].status).toBe('ended');
  });
  test('TEST-F04-03e: คนละผู้ใช้สร้างในแม่แบบเดียวกันได้', async () => {
    expect((await create(aCookie, goalBody(t1))).status).toBe(201);
    expect((await create(bCookie, goalBody(t1))).status).toBe(201);
  });
});

describe('TEST-F04-04 — แม่แบบไม่ถูกต้อง (AC-F04-04)', () => {
  test.each([[999999], ['archived']])('TEST-F04-04: template_id=%p → 404', async (v) => {
    const res = await create(aCookie, goalBody(v === 'archived' ? tArchived : v));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not Found' });
  });
  test('TEST-F04-04: template_id ไม่ใช่ตัวเลข → 400', async () => {
    expect((await create(aCookie, goalBody('abc'))).status).toBe(400);
  });
});

describe('TEST-F04-05 — PM ถูกปฏิเสธ (AC-F04-05, BR-08)', () => {
  test('TEST-F04-05: PM POST/GET /goals → 403', async () => {
    const p = await create(pmCookie, goalBody(t1));
    const g = await request(app).get('/api/goals').set('Cookie', pmCookie);
    expect(p.status).toBe(403);
    expect(g.status).toBe(403);
    expect(await countGoals(pmId, t1)).toBe(0);
  });
});

describe('TEST-F04-06 — ความเป็นเจ้าของ (AC-F04-06, BR-08)', () => {
  test('TEST-F04-06a: รายการเห็นเฉพาะของตน', async () => {
    const a = await create(aCookie, goalBody(t1));
    const b = await create(bCookie, goalBody(t1));
    const res = await request(app).get('/api/goals').set('Cookie', aCookie);
    expect(res.status).toBe(200);
    const ids = res.body.goals.map((g) => g.id);
    expect(ids).toContain(a.body.goal.id);
    expect(ids).not.toContain(b.body.goal.id);
  });
  test('TEST-F04-06b: GET /goals/:id เจ้าของ 200 / คนอื่น 404 / PM 403 / id ไม่ใช่เลข 404', async () => {
    const a = await create(aCookie, goalBody(t1));
    const url = `/api/goals/${a.body.goal.id}`;
    expect((await request(app).get(url).set('Cookie', aCookie)).status).toBe(200);
    expect((await request(app).get(url).set('Cookie', bCookie)).status).toBe(404);
    expect((await request(app).get(url).set('Cookie', pmCookie)).status).toBe(403);
    expect((await request(app).get('/api/goals/abc').set('Cookie', aCookie)).status).toBe(404);
  });
});

describe('TEST-F04-07 — สถานะคำนวณจากวันที่ (AC-F04-07, BR-05)', () => {
  test('TEST-F04-07: end เมื่อวาน → ended; end วันนี้ → active', async () => {
    const t = todayBkk();
    const ins = (tpl, end) => pool.query(
      "INSERT INTO goals (user_id, template_id, target_minutes, start_date, end_date, status) VALUES ($1,$2,100,$3,$4,'active') RETURNING id",
      [aId, tpl, addDays(t, -10), end]
    );
    const past = await ins(t1, addDays(t, -1));
    const today = await ins(t2, t);
    const res = await request(app).get('/api/goals').set('Cookie', aCookie);
    const byId = Object.fromEntries(res.body.goals.map((g) => [g.id, g.status]));
    expect(byId[past.rows[0].id]).toBe('ended');
    expect(byId[today.rows[0].id]).toBe('active');
  });
});

describe('TEST-F04-08 — ต้อง login (NFR-01)', () => {
  test.each([['post', '/api/goals'], ['get', '/api/goals'], ['get', '/api/goals/1']])('TEST-F04-08: %s %s → 401', async (m, p) => {
    const res = await request(app)[m](p);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });
});
