/**
 * entries.test.js — F-05 การบันทึกกิจกรรมรายวัน + F-06 การคำนวณความคืบหน้า
 * Contract: docs/sprints/sprint-1/F-05-F-06-entry-progress.md
 *   TEST-F05-01, 02a/b, 03a/b, 04a-f, 05a/b, 06a/b, 07
 *   TEST-F06-01a-c, 02, 03a/b
 * Requirements: FR-08, FR-09, FR-10, BR-01, BR-02, BR-03, BR-05, BR-06, BR-08, BR-09, NFR-05
 */
require('./helpers/test-env');

const request = require('supertest');
const pool = require('../src/db/db');
const { createApp } = require('../src/app');
const { createUser, loginAs, cleanupPrefix, todayBkk, addDays } = require('./helpers/fixtures');

const P = 'test_entry_';
let app, pmId, aId, bId, aCookie, bCookie, pmCookie, templateId;

// สร้าง goal ใน DB ตรงๆ (ไม่ผ่าน API) เพื่อควบคุม start_date/end_date ได้อิสระ
async function insertGoal(userId, tplId, overrides = {}) {
  const today = todayBkk();
  const { rows } = await pool.query(
    `INSERT INTO goals (user_id, template_id, target_minutes, start_date, end_date, status)
     VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
    [
      userId,
      tplId,
      overrides.target_minutes ?? 600,
      overrides.start_date ?? today,
      overrides.end_date ?? addDays(today, 29),
    ]
  );
  return rows[0].id;
}

async function insertEntry(goalId, entryDate, minutes) {
  const { rows } = await pool.query(
    'INSERT INTO habit_entries (goal_id, entry_date, minutes) VALUES ($1, $2, $3) RETURNING id',
    [goalId, entryDate, minutes]
  );
  return rows[0].id;
}

const postEntry = (cookie, goalId, body) =>
  request(app).post(`/api/goals/${goalId}/entries`).set('Cookie', cookie).send(body);

const getProgress = (cookie, goalId) =>
  request(app).get(`/api/goals/${goalId}/progress`).set('Cookie', cookie);

const getEntries = (cookie, goalId) =>
  request(app).get(`/api/goals/${goalId}/entries`).set('Cookie', cookie);

const clearGoalData = () =>
  pool.query(
    'DELETE FROM habit_entries WHERE goal_id IN (SELECT id FROM goals WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1))',
    [`${P}%`]
  );
const clearGoals = () =>
  pool.query('DELETE FROM goals WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1)', [`${P}%`]);

beforeAll(async () => {
  app = createApp();
  await cleanupPrefix(P);
  pmId = await createUser(`${P}pm`, 'pm');
  aId = await createUser(`${P}a`, 'participant');
  bId = await createUser(`${P}b`, 'participant');
  // สร้าง template สำหรับทุก test: min=10, max=120
  const { rows } = await pool.query(
    'INSERT INTO activity_templates (created_by, name, min_value, max_value) VALUES ($1, $2, 10, 120) RETURNING id',
    [pmId, `${P}template`]
  );
  templateId = rows[0].id;
  aCookie = await loginAs(app, `${P}a`);
  bCookie = await loginAs(app, `${P}b`);
  pmCookie = await loginAs(app, `${P}pm`);
});

beforeEach(async () => {
  await clearGoalData();
  await clearGoals();
});

afterAll(async () => {
  await cleanupPrefix(P);
  await pool.end();
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F05-01 — บันทึก entry สำเร็จ (AC-F05-01)', () => {
  test('TEST-F05-01: 201, response มี id/entry_date/minutes ไม่มี goal_id/user_id/created_at/updated_at; แถวอยู่ใน DB', async () => {
    const today = todayBkk();
    const goalId = await insertGoal(aId, templateId);
    const res = await postEntry(aCookie, goalId, { entry_date: today, minutes: 60 });

    expect(res.status).toBe(201);
    expect(res.body.entry).toMatchObject({ entry_date: today, minutes: 60 });
    expect(typeof res.body.entry.id).toBe('number');
    expect(res.body.entry).not.toHaveProperty('goal_id');
    expect(res.body.entry).not.toHaveProperty('user_id');
    expect(res.body.entry).not.toHaveProperty('created_at');
    expect(res.body.entry).not.toHaveProperty('updated_at');

    const { rows } = await pool.query('SELECT * FROM habit_entries WHERE id = $1', [res.body.entry.id]);
    expect(rows.length).toBe(1);
    expect(rows[0].goal_id).toBe(goalId);
    expect(rows[0].minutes).toBe(60);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F05-02 — ซ้ำวัน + concurrent (AC-F05-02, BR-01, NFR-05)', () => {
  test('TEST-F05-02a: บันทึกซ้ำวันเดียวกัน → 409 Conflict; DB ยังมี 1 แถว', async () => {
    const today = todayBkk();
    const goalId = await insertGoal(aId, templateId);
    await insertEntry(goalId, today, 60);

    const res = await postEntry(aCookie, goalId, { entry_date: today, minutes: 30 });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Conflict' });
    const { rows } = await pool.query('SELECT count(*) FROM habit_entries WHERE goal_id = $1', [goalId]);
    expect(Number(rows[0].count)).toBe(1);
  });

  test('TEST-F05-02b: ส่ง 5 request พร้อมกัน → สำเร็จ 1 (201), ที่เหลือ 409; ไม่มี 500; DB มี 1 แถว', async () => {
    const today = todayBkk();
    const goalId = await insertGoal(aId, templateId);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => postEntry(aCookie, goalId, { entry_date: today, minutes: 60 }))
    );

    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201).length).toBe(1);
    expect(statuses.filter((s) => s === 409).length).toBe(4);
    expect(statuses.filter((s) => s === 500).length).toBe(0);

    const { rows } = await pool.query('SELECT count(*) FROM habit_entries WHERE goal_id = $1', [goalId]);
    expect(Number(rows[0].count)).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F05-03 — validation minutes (AC-F05-03, BR-02)', () => {
  let goalId;
  beforeEach(async () => {
    goalId = await insertGoal(aId, templateId);
  });

  test.each([
    ['ทศนิยม', 1.5],
    ['string', '60'],
    ['null', null],
    ['ไม่ส่ง', undefined],
    ['ติดลบ', -1],
    ['ศูนย์', 0],
  ])('TEST-F05-03a: minutes = %s → 400 มี fields.minutes', async (_label, minutes) => {
    const body = { entry_date: todayBkk() };
    if (minutes !== undefined) body.minutes = minutes;
    const res = await postEntry(aCookie, goalId, body);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad Request');
    expect(res.body.fields).toHaveProperty('minutes');
  });

  test('TEST-F05-03b: minutes นอกช่วง template (min=10,max=120): 9 → 400, 121 → 400, 10 → 201, 120 → 201', async () => {
    const today = todayBkk();

    const r9 = await postEntry(aCookie, goalId, { entry_date: today, minutes: 9 });
    expect(r9.status).toBe(400);
    expect(r9.body.fields).toHaveProperty('minutes');

    const r121 = await postEntry(aCookie, goalId, { entry_date: today, minutes: 121 });
    expect(r121.status).toBe(400);
    expect(r121.body.fields).toHaveProperty('minutes');

    const r10 = await postEntry(aCookie, goalId, { entry_date: today, minutes: 10 });
    expect(r10.status).toBe(201);

    // ต้องลบ entry วันนี้ก่อนบันทึกซ้ำ (BR-01)
    await pool.query('DELETE FROM habit_entries WHERE goal_id = $1', [goalId]);

    const r120 = await postEntry(aCookie, goalId, { entry_date: today, minutes: 120 });
    expect(r120.status).toBe(201);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F05-04 — validation entry_date (AC-F05-04, BR-03)', () => {
  let goalId;
  beforeEach(async () => {
    // goal ที่ครอบคลุมช่วง 30 วัน ย้อนหลัง 10 วัน
    const today = todayBkk();
    goalId = await insertGoal(aId, templateId, {
      start_date: addDays(today, -10),
      end_date: addDays(today, 19),
    });
  });

  test('TEST-F05-04a: entry_date = พรุ่งนี้ (อนาคต) → 400 fields.entry_date', async () => {
    const res = await postEntry(aCookie, goalId, { entry_date: addDays(todayBkk(), 1), minutes: 60 });
    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty('entry_date');
  });

  test('TEST-F05-04b: entry_date = วันนี้ − 8 วัน (เกิน 7 วัน) → 400 fields.entry_date', async () => {
    const res = await postEntry(aCookie, goalId, { entry_date: addDays(todayBkk(), -8), minutes: 60 });
    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty('entry_date');
  });

  test('TEST-F05-04c: entry_date ก่อน start_date ของ goal → 400 fields.entry_date', async () => {
    // goal เริ่ม 10 วันที่แล้ว → วันที่ −11 นอกช่วง goal
    const res = await postEntry(aCookie, goalId, { entry_date: addDays(todayBkk(), -11), minutes: 60 });
    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty('entry_date');
  });

  test('TEST-F05-04d: entry_date รูปแบบผิด/วันที่ไม่มีจริง → 400 fields.entry_date', async () => {
    const r1 = await postEntry(aCookie, goalId, { entry_date: '2026-02-30', minutes: 60 });
    expect(r1.status).toBe(400);
    expect(r1.body.fields).toHaveProperty('entry_date');

    const r2 = await postEntry(aCookie, goalId, { entry_date: 'not-a-date', minutes: 60 });
    expect(r2.status).toBe(400);
    expect(r2.body.fields).toHaveProperty('entry_date');
  });

  test('TEST-F05-04e: entry_date = วันนี้ (ขอบ) → 201', async () => {
    const res = await postEntry(aCookie, goalId, { entry_date: todayBkk(), minutes: 60 });
    expect(res.status).toBe(201);
  });

  test('TEST-F05-04f: entry_date = วันนี้ − 7 วัน (ขอบล่าง 7 วัน) และอยู่ใน goal period → 201', async () => {
    const res = await postEntry(aCookie, goalId, { entry_date: addDays(todayBkk(), -7), minutes: 60 });
    expect(res.status).toBe(201);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F05-05 — goal ended (AC-F05-05, BR-05)', () => {
  test('TEST-F05-05a: goal ที่ end_date เมื่อวาน → 409 Conflict', async () => {
    const yesterday = addDays(todayBkk(), -1);
    const goalId = await insertGoal(aId, templateId, {
      start_date: addDays(todayBkk(), -10),
      end_date: yesterday,
    });
    const res = await postEntry(aCookie, goalId, { entry_date: yesterday, minutes: 60 });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Conflict' });
  });

  test('TEST-F05-05b: goal ที่ end_date = วันนี้ → 201 (ยังถือเป็น active)', async () => {
    const today = todayBkk();
    const goalId = await insertGoal(aId, templateId, {
      start_date: today,
      end_date: today,
    });
    const res = await postEntry(aCookie, goalId, { entry_date: today, minutes: 60 });
    expect(res.status).toBe(201);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F05-06 — RBAC สำหรับ POST entries (AC-F05-06, BR-08)', () => {
  test('TEST-F05-06a: PM เรียก POST entries → 403', async () => {
    const goalId = await insertGoal(aId, templateId);
    const res = await postEntry(pmCookie, goalId, { entry_date: todayBkk(), minutes: 60 });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  test('TEST-F05-06b: Participant B เรียก POST entries ใต้ goal ของ A → 404', async () => {
    const goalId = await insertGoal(aId, templateId);
    const res = await postEntry(bCookie, goalId, { entry_date: todayBkk(), minutes: 60 });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not Found' });
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F05-07 — ไม่มี session → 401 (NFR-01)', () => {
  test('TEST-F05-07a: POST /api/goals/1/entries ไม่มี cookie → 401', async () => {
    const res = await request(app).post('/api/goals/1/entries').send({ entry_date: todayBkk(), minutes: 60 });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  test('TEST-F05-07b: GET /api/goals/1/progress ไม่มี cookie → 401', async () => {
    const res = await request(app).get('/api/goals/1/progress');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  test('TEST-F05-07c: GET /api/goals/1/entries ไม่มี cookie → 401', async () => {
    const res = await request(app).get('/api/goals/1/entries');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F06-01 — progress calculation (AC-F06-01, BR-06)', () => {
  test('TEST-F06-01a: 2 entries รวม 150 min, target 200 → percent 75.0', async () => {
    const today = todayBkk();
    const goalId = await insertGoal(aId, templateId, { target_minutes: 200 });
    await insertEntry(goalId, today, 60);
    await insertEntry(goalId, addDays(today, -1), 90);

    const res = await getProgress(aCookie, goalId);
    expect(res.status).toBe(200);
    expect(res.body.progress).toEqual({ total_minutes: 150, target_minutes: 200, percent: 75.0 });
  });

  test('TEST-F06-01b: total_minutes > target → percent = 100.0 (capped), total_minutes = ค่าจริง', async () => {
    const today = todayBkk();
    const goalId = await insertGoal(aId, templateId, { target_minutes: 100 });
    await insertEntry(goalId, today, 120); // เกินเป้า

    const res = await getProgress(aCookie, goalId);
    expect(res.status).toBe(200);
    expect(res.body.progress.total_minutes).toBe(120);
    expect(res.body.progress.target_minutes).toBe(100);
    expect(res.body.progress.percent).toBe(100.0);
  });

  test('TEST-F06-01c: ไม่มี entry → total_minutes = 0, percent = 0.0', async () => {
    const goalId = await insertGoal(aId, templateId, { target_minutes: 200 });
    const res = await getProgress(aCookie, goalId);
    expect(res.status).toBe(200);
    expect(res.body.progress).toEqual({ total_minutes: 0, target_minutes: 200, percent: 0.0 });
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F06-02 — entry history (AC-F06-02, FR-10)', () => {
  test('TEST-F06-02: 3 entries เรียง entry_date DESC; ไม่มี goal_id/user_id/created_at/updated_at', async () => {
    const today = todayBkk();
    const goalId = await insertGoal(aId, templateId);
    await insertEntry(goalId, addDays(today, -2), 30);
    await insertEntry(goalId, addDays(today, -1), 60);
    await insertEntry(goalId, today, 90);

    const res = await getEntries(aCookie, goalId);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
    expect(res.body.entries.length).toBe(3);

    // เรียง DESC — entry_date ต้องลดลง
    const dates = res.body.entries.map((e) => e.entry_date);
    expect(dates[0]).toBe(today);
    expect(dates[1]).toBe(addDays(today, -1));
    expect(dates[2]).toBe(addDays(today, -2));

    // response ไม่มีฟิลด์ที่ไม่ควรมี
    for (const entry of res.body.entries) {
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('entry_date');
      expect(entry).toHaveProperty('minutes');
      expect(entry).not.toHaveProperty('goal_id');
      expect(entry).not.toHaveProperty('user_id');
      expect(entry).not.toHaveProperty('created_at');
      expect(entry).not.toHaveProperty('updated_at');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F06-03 — RBAC สำหรับ GET progress/entries (AC-F06-03, BR-08)', () => {
  test('TEST-F06-03a: PM เรียก GET progress และ GET entries → 403 ทั้งคู่', async () => {
    const goalId = await insertGoal(aId, templateId);

    const r1 = await getProgress(pmCookie, goalId);
    expect(r1.status).toBe(403);
    expect(r1.body).toEqual({ error: 'Forbidden' });

    const r2 = await getEntries(pmCookie, goalId);
    expect(r2.status).toBe(403);
    expect(r2.body).toEqual({ error: 'Forbidden' });
  });

  test('TEST-F06-03b: Participant B เรียก endpoint ของ goal A → 404 ทั้งคู่', async () => {
    const goalId = await insertGoal(aId, templateId);

    const r1 = await getProgress(bCookie, goalId);
    expect(r1.status).toBe(404);
    expect(r1.body).toEqual({ error: 'Not Found' });

    const r2 = await getEntries(bCookie, goalId);
    expect(r2.status).toBe(404);
    expect(r2.body).toEqual({ error: 'Not Found' });
  });
});
