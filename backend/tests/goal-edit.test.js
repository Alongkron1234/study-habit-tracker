/**
 * goal-edit.test.js — F-10 แก้ไขเป้าหมาย (PATCH /api/goals/:id)
 * Contract: docs/sprints/sprint-2/F-10-edit-goal.md (v1.1)
 *   TEST-F10-01, 02a/b/c, 03a/b, 04, 05a/b/c/d/e, 06a/b, 07a/b/c, 08a/b/c
 *   (TEST-F10-08d อยู่ใน rbac.test.js, TEST-F10-09 อยู่ใน validate.test.js,
 *    TEST-F10-10 เป็น UI manual, TEST-F10-11 อยู่ใน frontend/src/tests/messages.test.js)
 * Requirements: FR-12, BR-03, BR-04, BR-05, BR-06, BR-08, NFR-01, NFR-06
 *
 * ทุก test setup ข้อมูลของตัวเองใน beforeEach ไม่พึ่งผลของ test อื่น
 * วันที่คำนวณจาก todayBkk()/addDays() ไม่ hard-code; goal และ entry เก่าสร้างผ่าน SQL ตรงๆ
 */
require('./helpers/test-env');

const request = require('supertest');
const pool = require('../src/db/db');
const { createApp } = require('../src/app');
const { createUser, loginAs, cleanupPrefix, todayBkk, addDays } = require('./helpers/fixtures');

const P = 'test_f10_';
let app, pmId, aId, bId, aCookie, bCookie, pmCookie, templateId;

// goal active ตาม precondition ของ contract §4: target=600, start=วันนี้−10, end=วันนี้+20
async function insertGoal(userId, overrides = {}) {
  const today = todayBkk();
  const { rows } = await pool.query(
    `INSERT INTO goals (user_id, template_id, target_minutes, start_date, end_date, status, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'active', now() - interval '1 hour') RETURNING id`,
    [
      userId,
      overrides.template_id ?? templateId,
      overrides.target_minutes ?? 600,
      overrides.start_date ?? addDays(today, -10),
      overrides.end_date ?? addDays(today, 20),
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

const dbGoal = async (goalId) => {
  const { rows } = await pool.query(
    `SELECT id, user_id, template_id, target_minutes,
            to_char(start_date, 'YYYY-MM-DD') AS start_date,
            to_char(end_date, 'YYYY-MM-DD') AS end_date, status, updated_at
       FROM goals WHERE id = $1`,
    [goalId]
  );
  return rows[0];
};

const patchGoal = (cookie, goalId, body) =>
  request(app).patch(`/api/goals/${goalId}`).set('Cookie', cookie).send(body);
const getProgress = (cookie, goalId) =>
  request(app).get(`/api/goals/${goalId}/progress`).set('Cookie', cookie);
const getEntries = (cookie, goalId) =>
  request(app).get(`/api/goals/${goalId}/entries`).set('Cookie', cookie);

const clearAll = async () => {
  await pool.query(
    'DELETE FROM habit_entries WHERE goal_id IN (SELECT id FROM goals WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1))',
    [`${P}%`]
  );
  await pool.query('DELETE FROM goals WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1)', [`${P}%`]);
};

// ตรวจว่า goal ใน DB ยังเป็นค่า precondition (target=600, end=วันนี้+20)
async function expectUnchanged(goalId, before) {
  const after = await dbGoal(goalId);
  expect(after.target_minutes).toBe(before.target_minutes);
  expect(after.end_date).toBe(before.end_date);
  expect(after.start_date).toBe(before.start_date);
  expect(after.template_id).toBe(before.template_id);
  expect(after.updated_at.getTime()).toBe(before.updated_at.getTime());
}

beforeAll(async () => {
  app = createApp();
  await cleanupPrefix(P);
  pmId = await createUser(`${P}pm`, 'pm');
  aId = await createUser(`${P}a`, 'participant');
  bId = await createUser(`${P}b`, 'participant');
  const { rows } = await pool.query(
    'INSERT INTO activity_templates (created_by, name, min_value, max_value) VALUES ($1, $2, 10, 120) RETURNING id',
    [pmId, `${P}template`]
  );
  templateId = rows[0].id;
  aCookie = await loginAs(app, `${P}a`);
  bCookie = await loginAs(app, `${P}b`);
  pmCookie = await loginAs(app, `${P}pm`);
});

beforeEach(clearAll);

afterAll(async () => {
  await cleanupPrefix(P);
  await pool.end();
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F10-01 — แก้ target_minutes สำเร็จ (AC-F10-01)', () => {
  test('TEST-F10-01: 200, goal.target_minutes ใหม่, ไม่มี field ต้องห้าม; DB เก็บค่าใหม่และ updated_at ใหม่กว่าเดิม', async () => {
    const today = todayBkk();
    const goalId = await insertGoal(aId);
    const before = await dbGoal(goalId);

    const res = await patchGoal(aCookie, goalId, { target_minutes: 900 });

    expect(res.status).toBe(200);
    expect(res.body.goal).toEqual({
      id: goalId,
      template_id: templateId,
      target_minutes: 900,
      start_date: addDays(today, -10),
      end_date: addDays(today, 20),
      status: 'active',
    });
    expect(res.body.goal).not.toHaveProperty('user_id');
    expect(res.body.goal).not.toHaveProperty('created_at');
    expect(res.body.goal).not.toHaveProperty('updated_at');

    const after = await dbGoal(goalId);
    expect(after.target_minutes).toBe(900);
    expect(after.start_date).toBe(before.start_date);
    expect(after.end_date).toBe(before.end_date);
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F10-02 — แก้ end_date และทั้งสอง field (AC-F10-02)', () => {
  test('TEST-F10-02a: ขยายแล้วย่น end_date → 200 ทั้งคู่; target_minutes ไม่เปลี่ยน', async () => {
    const today = todayBkk();
    const goalId = await insertGoal(aId);

    const r1 = await patchGoal(aCookie, goalId, { end_date: addDays(today, 40) });
    expect(r1.status).toBe(200);
    expect(r1.body.goal.end_date).toBe(addDays(today, 40));
    expect(r1.body.goal.target_minutes).toBe(600);

    const r2 = await patchGoal(aCookie, goalId, { end_date: addDays(today, 5) });
    expect(r2.status).toBe(200);
    expect(r2.body.goal.end_date).toBe(addDays(today, 5));
    expect(r2.body.goal.target_minutes).toBe(600);

    const after = await dbGoal(goalId);
    expect(after.end_date).toBe(addDays(today, 5));
    expect(after.target_minutes).toBe(600);
  });

  test('TEST-F10-02b: ส่งทั้งสอง field → 200 และทั้งสองค่าเปลี่ยนใน DB', async () => {
    const today = todayBkk();
    const goalId = await insertGoal(aId);

    const res = await patchGoal(aCookie, goalId, { target_minutes: 700, end_date: addDays(today, 30) });

    expect(res.status).toBe(200);
    const after = await dbGoal(goalId);
    expect(after.target_minutes).toBe(700);
    expect(after.end_date).toBe(addDays(today, 30));
  });

  test('TEST-F10-02c: field หนึ่งผิด → 400 และอีก field ไม่เปลี่ยนครึ่งเดียว', async () => {
    const goalId = await insertGoal(aId);
    const before = await dbGoal(goalId);

    const res = await patchGoal(aCookie, goalId, { target_minutes: 700, end_date: 'ไม่ใช่วันที่' });

    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty('end_date');
    expect(res.body.fields).not.toHaveProperty('target_minutes');
    await expectUnchanged(goalId, before);
    expect((await dbGoal(goalId)).target_minutes).toBe(600);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F10-03 — entry คงอยู่และ progress ใช้เป้าใหม่ (AC-F10-03, BR-06)', () => {
  async function setup() {
    const today = todayBkk();
    const goalId = await insertGoal(aId, { target_minutes: 200 });
    await insertEntry(goalId, addDays(today, -2), 60);
    await insertEntry(goalId, today, 90);
    return goalId;
  }

  test('TEST-F10-03a: เป้า 200 → 300: total=150, percent=50; entries ยัง 2 แถวค่าเดิม', async () => {
    const goalId = await setup();

    expect((await patchGoal(aCookie, goalId, { target_minutes: 300 })).status).toBe(200);

    const progress = await getProgress(aCookie, goalId);
    expect(progress.body.progress.total_minutes).toBe(150);
    expect(progress.body.progress.percent).toBe(50);
    const entries = await getEntries(aCookie, goalId);
    expect(entries.body.entries.map((e) => e.minutes).sort((x, y) => x - y)).toEqual([60, 90]);
  });

  test('TEST-F10-03b: ลดเป้าเหลือ 100 (ต่ำกว่ายอดรวม) → total=150, percent=100 ไม่เกิน 100', async () => {
    const goalId = await setup();

    expect((await patchGoal(aCookie, goalId, { target_minutes: 100 })).status).toBe(200);

    const progress = await getProgress(aCookie, goalId);
    expect(progress.body.progress.total_minutes).toBe(150);
    expect(progress.body.progress.percent).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F10-04 — ตรวจ target_minutes (AC-F10-04, BR-04)', () => {
  test.each([[0], [-5], [1.5], ['100'], [null]])('TEST-F10-04a: target_minutes=%p → 400 positive integer', async (v) => {
    const goalId = await insertGoal(aId);
    const before = await dbGoal(goalId);

    const res = await patchGoal(aCookie, goalId, { target_minutes: v });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Bad Request', fields: { target_minutes: 'positive integer' } });
    await expectUnchanged(goalId, before);
  });

  test.each([[350401], [3000000000]])('TEST-F10-04b: target_minutes=%p → 400 must not exceed 350400 (ไม่ใช่ 500)', async (v) => {
    const goalId = await insertGoal(aId);
    const before = await dbGoal(goalId);

    const res = await patchGoal(aCookie, goalId, { target_minutes: v });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Bad Request', fields: { target_minutes: 'must not exceed 350400' } });
    await expectUnchanged(goalId, before);
  });

  test('TEST-F10-04c: target_minutes=350400 (เพดานพอดี) → 200', async () => {
    const goalId = await insertGoal(aId);
    const res = await patchGoal(aCookie, goalId, { target_minutes: 350400 });
    expect(res.status).toBe(200);
    expect((await dbGoal(goalId)).target_minutes).toBe(350400);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F10-05 — ตรวจ end_date (AC-F10-05, BR-03, BR-04)', () => {
  test.each([['2026-13-45'], ['abc'], [20261130]])('TEST-F10-05a: end_date=%p → 400 date YYYY-MM-DD', async (v) => {
    const goalId = await insertGoal(aId);
    const before = await dbGoal(goalId);

    const res = await patchGoal(aCookie, goalId, { end_date: v });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Bad Request', fields: { end_date: 'date YYYY-MM-DD' } });
    await expectUnchanged(goalId, before);
  });

  test('TEST-F10-05b: ก่อน start_date → must not be before start_date; ระยะเวลา 366 วัน → duration must not exceed 365 days', async () => {
    const today = todayBkk();
    const goalId = await insertGoal(aId);
    const before = await dbGoal(goalId);
    const start = addDays(today, -10);

    const r1 = await patchGoal(aCookie, goalId, { end_date: addDays(start, -1) });
    expect(r1.status).toBe(400);
    expect(r1.body.fields.end_date).toBe('must not be before start_date');

    const r2 = await patchGoal(aCookie, goalId, { end_date: addDays(start, 365) });
    expect(r2.status).toBe(400);
    expect(r2.body.fields.end_date).toBe('duration must not exceed 365 days');

    await expectUnchanged(goalId, before);
  });

  test('TEST-F10-05c: end_date = วันนี้ − 1 → 400 must not be in the past', async () => {
    const goalId = await insertGoal(aId);
    const before = await dbGoal(goalId);

    const res = await patchGoal(aCookie, goalId, { end_date: addDays(todayBkk(), -1) });

    expect(res.status).toBe(400);
    expect(res.body.fields.end_date).toBe('must not be in the past');
    await expectUnchanged(goalId, before);
  });

  test('TEST-F10-05d: ย่น end_date เป็นวันนี้ (ขอบ) → 200; entry เดิมครบและยอดรวมเท่าเดิม', async () => {
    const today = todayBkk();
    const goalId = await insertGoal(aId);
    await insertEntry(goalId, addDays(today, -1), 40);
    await insertEntry(goalId, today, 25);

    const res = await patchGoal(aCookie, goalId, { end_date: today });

    expect(res.status).toBe(200);
    const entries = await getEntries(aCookie, goalId);
    expect(entries.body.entries).toHaveLength(2);
    expect(entries.body.entries.map((e) => e.minutes).sort((x, y) => x - y)).toEqual([25, 40]);
    const progress = await getProgress(aCookie, goalId);
    expect(progress.body.progress.total_minutes).toBe(65);
  });

  test('TEST-F10-05e: ระยะเวลา 365 วันพอดี → 200', async () => {
    const today = todayBkk();
    const goalId = await insertGoal(aId);

    const res = await patchGoal(aCookie, goalId, { end_date: addDays(addDays(today, -10), 364) });

    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F10-06 — field ที่แก้ไม่ได้ / body ว่าง (AC-F10-06, BR-08, NFR-06)', () => {
  test('TEST-F10-06a: template_id / start_date / status → 400 not editable', async () => {
    const goalId = await insertGoal(aId);
    const before = await dbGoal(goalId);

    const r1 = await patchGoal(aCookie, goalId, { target_minutes: 700, template_id: 999 });
    expect(r1.status).toBe(400);
    expect(r1.body.fields.template_id).toBe('not editable');

    const r2 = await patchGoal(aCookie, goalId, { target_minutes: 700, start_date: addDays(todayBkk(), -5) });
    expect(r2.status).toBe(400);
    expect(r2.body.fields.start_date).toBe('not editable');

    const r3 = await patchGoal(aCookie, goalId, { status: 'ended' });
    expect(r3.status).toBe(400);
    expect(r3.body.fields.status).toBe('not editable');
    expect(r3.body.fields).toHaveProperty('body');

    await expectUnchanged(goalId, before);
  });

  test('TEST-F10-06b: body ว่าง → fields.body; ผิดหลาย field → รายงานครบ (S-8)', async () => {
    const goalId = await insertGoal(aId);
    const before = await dbGoal(goalId);

    const r1 = await patchGoal(aCookie, goalId, {});
    expect(r1.status).toBe(400);
    expect(r1.body.fields.body).toBe('target_minutes or end_date required');

    const r2 = await patchGoal(aCookie, goalId, { target_minutes: 1.5, start_date: '2026-01-01' });
    expect(r2.status).toBe(400);
    expect(r2.body.fields).toHaveProperty('target_minutes');
    expect(r2.body.fields).toHaveProperty('start_date');

    await expectUnchanged(goalId, before);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F10-07 — goal ที่จบแล้วแก้ไม่ได้ (AC-F10-07, BR-05)', () => {
  test('TEST-F10-07a: end_date = วันนี้ − 1 → 409 ทั้งแก้ target และ end_date; DB เดิม', async () => {
    const today = todayBkk();
    const goalId = await insertGoal(aId, { end_date: addDays(today, -1) });
    const before = await dbGoal(goalId);

    const r1 = await patchGoal(aCookie, goalId, { target_minutes: 700 });
    const r2 = await patchGoal(aCookie, goalId, { end_date: addDays(today, 10) });

    expect(r1.status).toBe(409);
    expect(r1.body).toEqual({ error: 'Conflict' });
    expect(r2.status).toBe(409);
    expect(r2.body).toEqual({ error: 'Conflict' });
    await expectUnchanged(goalId, before);
  });

  test('TEST-F10-07b: end_date = วันนี้ ยังแก้ได้ → 200', async () => {
    const goalId = await insertGoal(aId, { end_date: todayBkk() });
    const res = await patchGoal(aCookie, goalId, { target_minutes: 700 });
    expect(res.status).toBe(200);
    expect((await dbGoal(goalId)).target_minutes).toBe(700);
  });

  test('TEST-F10-07c: goal จบระหว่างตรวจกับบันทึก → UPDATE ไม่มีแถว (null); DB เดิม', async () => {
    // require ในเทสต์ เพื่อให้เทสต์อื่นในไฟล์รันและรายงานผลของตัวเองได้ก่อนที่ module นี้จะมี
    const { updateActiveGoal } = require('../src/lib/goal-update');
    const today = todayBkk();
    const goalId = await insertGoal(aId);
    const before = await dbGoal(goalId);

    // today ที่เลยวันสิ้นสุด (วันนี้ + 21) = goal จบไปแล้วตอนบันทึก
    const lost = await updateActiveGoal({
      id: goalId,
      userId: aId,
      fields: { target_minutes: 700 },
      today: addDays(today, 21),
    });
    expect(lost).toBeNull();
    await expectUnchanged(goalId, before);

    // positive control: today ปกติ → แก้ได้
    const ok = await updateActiveGoal({ id: goalId, userId: aId, fields: { target_minutes: 700 }, today });
    expect(ok).toMatchObject({ id: goalId, target_minutes: 700, status: 'active' });
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F10-08 — สิทธิ์ (AC-F10-08, BR-08, NFR-01)', () => {
  test('TEST-F10-08a: PM → 403; goal ไม่เปลี่ยน', async () => {
    const goalId = await insertGoal(aId);
    const before = await dbGoal(goalId);

    const res = await patchGoal(pmCookie, goalId, { target_minutes: 700 });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
    await expectUnchanged(goalId, before);
  });

  test('TEST-F10-08b: Participant B แก้ goal ของ A → 404; goal ของ A คงค่าที่ A แก้', async () => {
    const goalId = await insertGoal(aId);
    // positive control: A แก้ได้
    expect((await patchGoal(aCookie, goalId, { target_minutes: 800 })).status).toBe(200);
    const afterA = await dbGoal(goalId);

    const res = await patchGoal(bCookie, goalId, { target_minutes: 100 });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not Found' });
    await expectUnchanged(goalId, afterA);
    expect(afterA.target_minutes).toBe(800);
    expect(bId).toBeDefined();
  });

  test.each([['abc'], ['0'], ['-1'], ['999999']])('TEST-F10-08c: id=%s → 404', async (id) => {
    const goalId = await insertGoal(aId);
    // positive control: A แก้ goal ของตัวเองได้
    expect((await patchGoal(aCookie, goalId, { target_minutes: 650 })).status).toBe(200);

    const res = await request(app).patch(`/api/goals/${id}`).set('Cookie', aCookie).send({ target_minutes: 700 });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not Found' });
  });
});
