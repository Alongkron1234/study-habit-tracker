/**
 * entry-edit.test.js — F-11 แก้ไข/ลบ entry
 * Contract: docs/sprints/sprint-2/F-11-edit-delete-entry.md (v1.2)
 *   TEST-F11-01, 02a/b, 03a/b/c, 04a/b, 05a/b, 06, 07, 08a/b/c
 *   (TEST-F11-08d อยู่ใน rbac.test.js, TEST-F11-09 อยู่ใน validate.test.js, TEST-F11-10 เป็น UI)
 * Requirements: FR-13, BR-01, BR-02, BR-03, BR-05, BR-06, BR-08, NFR-01, NFR-06
 *
 * ทุก test setup ข้อมูลของตัวเองใน beforeEach ไม่พึ่งผลของ test อื่น
 * วันที่คำนวณจาก todayBkk()/addDays() ไม่ hard-code; goal และ entry เก่าสร้างผ่าน SQL ตรงๆ
 */
require('./helpers/test-env');

const request = require('supertest');
const pool = require('../src/db/db');
const { createApp } = require('../src/app');
const { createUser, loginAs, cleanupPrefix, todayBkk, addDays } = require('./helpers/fixtures');

const P = 'test_f11_';
let app, pmId, aId, bId, aCookie, bCookie, pmCookie, templateId, templateId2;

// goal active ตาม precondition ของ contract §4: start_date = วันนี้ − 10, end_date = วันนี้ + 29
async function insertGoal(userId, overrides = {}) {
  const today = todayBkk();
  const { rows } = await pool.query(
    `INSERT INTO goals (user_id, template_id, target_minutes, start_date, end_date, status)
     VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
    [
      userId,
      overrides.template_id ?? templateId,
      overrides.target_minutes ?? 600,
      overrides.start_date ?? addDays(today, -10),
      overrides.end_date ?? addDays(today, 29),
    ]
  );
  return rows[0].id;
}

// สร้าง entry ผ่าน SQL; ตั้ง updated_at ย้อนหลัง 1 ชั่วโมง เพื่อให้เทียบกับค่าหลังแก้ได้แน่นอน
async function insertEntry(goalId, entryDate, minutes) {
  const { rows } = await pool.query(
    `INSERT INTO habit_entries (goal_id, entry_date, minutes, updated_at)
     VALUES ($1, $2, $3, now() - interval '1 hour') RETURNING id`,
    [goalId, entryDate, minutes]
  );
  return rows[0].id;
}

const dbEntry = async (entryId) => {
  const { rows } = await pool.query(
    'SELECT id, goal_id, to_char(entry_date, \'YYYY-MM-DD\') AS entry_date, minutes, updated_at FROM habit_entries WHERE id = $1',
    [entryId]
  );
  return rows[0];
};

const patchEntry = (cookie, goalId, entryId, body) =>
  request(app).patch(`/api/goals/${goalId}/entries/${entryId}`).set('Cookie', cookie).send(body);

const deleteEntry = (cookie, goalId, entryId) =>
  request(app).delete(`/api/goals/${goalId}/entries/${entryId}`).set('Cookie', cookie);

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

beforeAll(async () => {
  app = createApp();
  await cleanupPrefix(P);
  pmId = await createUser(`${P}pm`, 'pm');
  aId = await createUser(`${P}a`, 'participant');
  bId = await createUser(`${P}b`, 'participant');
  // template ของทุก test: min=10, max=120
  const { rows } = await pool.query(
    'INSERT INTO activity_templates (created_by, name, min_value, max_value) VALUES ($1, $2, 10, 120) RETURNING id',
    [pmId, `${P}template`]
  );
  templateId = rows[0].id;
  // template ที่สอง: ผู้ใช้คนเดียวมี goal active ได้ 1 อันต่อ template (uq_goals_active)
  const t2 = await pool.query(
    'INSERT INTO activity_templates (created_by, name, min_value, max_value) VALUES ($1, $2, 10, 120) RETURNING id',
    [pmId, `${P}template2`]
  );
  templateId2 = t2.rows[0].id;
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
describe('TEST-F11-01 — แก้ minutes สำเร็จ (AC-F11-01)', () => {
  test('TEST-F11-01: 200, entry.minutes ใหม่, ไม่มี field ต้องห้าม; DB เก็บค่าใหม่และ updated_at ใหม่กว่าเดิม', async () => {
    const today = todayBkk();
    const goalId = await insertGoal(aId);
    const entryId = await insertEntry(goalId, today, 30);
    const before = await dbEntry(entryId);

    const res = await patchEntry(aCookie, goalId, entryId, { minutes: 45 });

    expect(res.status).toBe(200);
    expect(res.body.entry).toEqual({ id: entryId, entry_date: today, minutes: 45 });
    expect(res.body.entry).not.toHaveProperty('goal_id');
    expect(res.body.entry).not.toHaveProperty('user_id');
    expect(res.body.entry).not.toHaveProperty('created_at');
    expect(res.body.entry).not.toHaveProperty('updated_at');

    const after = await dbEntry(entryId);
    expect(after.minutes).toBe(45);
    expect(after.entry_date).toBe(today);
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F11-02 — progress หลังแก้/ลบ (AC-F11-02, BR-06)', () => {
  test('TEST-F11-02a: แก้ entry 60 เป็น 80 → progress total=170, percent=85', async () => {
    const today = todayBkk();
    const goalId = await insertGoal(aId, { target_minutes: 200 });
    const e60 = await insertEntry(goalId, addDays(today, -1), 60);
    await insertEntry(goalId, today, 90);

    const res = await patchEntry(aCookie, goalId, e60, { minutes: 80 });
    expect(res.status).toBe(200);

    const prog = await getProgress(aCookie, goalId);
    expect(prog.status).toBe(200);
    expect(prog.body.progress.total_minutes).toBe(170);
    expect(prog.body.progress.percent).toBe(85);
  });

  test('TEST-F11-02b: ลบ entry 90 → progress total=60, percent=30; entry ที่ลบไม่อยู่ใน GET entries', async () => {
    const today = todayBkk();
    const goalId = await insertGoal(aId, { target_minutes: 200 });
    await insertEntry(goalId, addDays(today, -1), 60);
    const e90 = await insertEntry(goalId, today, 90);

    const del = await deleteEntry(aCookie, goalId, e90);
    expect(del.status).toBe(204);

    const prog = await getProgress(aCookie, goalId);
    expect(prog.body.progress.total_minutes).toBe(60);
    expect(prog.body.progress.percent).toBe(30);

    const list = await getEntries(aCookie, goalId);
    expect(list.status).toBe(200);
    expect(list.body.entries.map((e) => e.id)).not.toContain(e90);
    expect(list.body.entries.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F11-03 — ตรวจค่า minutes (AC-F11-03, BR-02)', () => {
  let goalId, entryId;
  beforeEach(async () => {
    goalId = await insertGoal(aId);
    entryId = await insertEntry(goalId, todayBkk(), 30);
  });

  test('TEST-F11-03a: ทศนิยม / string / null / ไม่มี field → 400 "integer required"; DB = 30', async () => {
    const bodies = [{ minutes: 1.5 }, { minutes: '60' }, { minutes: null }, {}];
    for (const body of bodies) {
      const res = await patchEntry(aCookie, goalId, entryId, body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.fields.minutes).toBe('integer required');
    }
    expect((await dbEntry(entryId)).minutes).toBe(30);
  });

  test('TEST-F11-03b: 0, -5, 9, 121 → 400 "out of template range"; DB = 30', async () => {
    for (const minutes of [0, -5, 9, 121]) {
      const res = await patchEntry(aCookie, goalId, entryId, { minutes });
      expect(res.status).toBe(400);
      expect(res.body.fields.minutes).toBe('out of template range');
    }
    expect((await dbEntry(entryId)).minutes).toBe(30);
  });

  test('TEST-F11-03c: ค่าขอบ 10 และ 120 → 200 ทั้งคู่; DB = 120', async () => {
    const lo = await patchEntry(aCookie, goalId, entryId, { minutes: 10 });
    expect(lo.status).toBe(200);
    const hi = await patchEntry(aCookie, goalId, entryId, { minutes: 120 });
    expect(hi.status).toBe(200);
    expect((await dbEntry(entryId)).minutes).toBe(120);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F11-04 — แก้ field อื่นไม่ได้ (AC-F11-04, S-4, S-13)', () => {
  let goalId, entryId, today;
  beforeEach(async () => {
    today = todayBkk();
    goalId = await insertGoal(aId);
    entryId = await insertEntry(goalId, today, 30);
  });

  test('TEST-F11-04a: ส่ง entry_date หรือ goal_id → 400 "not editable"; DB เดิม', async () => {
    const r1 = await patchEntry(aCookie, goalId, entryId, { minutes: 40, entry_date: addDays(today, -1) });
    expect(r1.status).toBe(400);
    expect(r1.body.fields.entry_date).toBe('not editable');

    const r2 = await patchEntry(aCookie, goalId, entryId, { minutes: 40, goal_id: 999 });
    expect(r2.status).toBe(400);
    expect(r2.body.fields.goal_id).toBe('not editable');

    const row = await dbEntry(entryId);
    expect(row.minutes).toBe(30);
    expect(row.entry_date).toBe(today);
    expect(row.goal_id).toBe(goalId);
  });

  test('TEST-F11-04b: minutes ผิดและมี entry_date เกินมา → 400 มีทั้ง fields.minutes และ fields.entry_date', async () => {
    const res = await patchEntry(aCookie, goalId, entryId, { minutes: 1.5, entry_date: addDays(today, -1) });
    expect(res.status).toBe(400);
    expect(res.body.fields.minutes).toBe('integer required');
    expect(res.body.fields.entry_date).toBe('not editable');
    const row = await dbEntry(entryId);
    expect(row.minutes).toBe(30);
    expect(row.entry_date).toBe(today);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F11-05 — ช่วงที่แก้/ลบได้ 7 วัน (AC-F11-05, S-1, S-2, BR-03)', () => {
  test('TEST-F11-05a: entry วันที่ วันนี้−8 → PATCH และ DELETE ได้ 409 Conflict; DB เดิม', async () => {
    const goalId = await insertGoal(aId);
    const entryId = await insertEntry(goalId, addDays(todayBkk(), -8), 30);

    const p = await patchEntry(aCookie, goalId, entryId, { minutes: 50 });
    expect(p.status).toBe(409);
    expect(p.body).toEqual({ error: 'Conflict' });

    const d = await deleteEntry(aCookie, goalId, entryId);
    expect(d.status).toBe(409);
    expect(d.body).toEqual({ error: 'Conflict' });

    const row = await dbEntry(entryId);
    expect(row).toBeDefined();
    expect(row.minutes).toBe(30);
  });

  test('TEST-F11-05b: entry วันที่ วันนี้−7 (ขอบ) → PATCH 200, DELETE 204', async () => {
    const goalId = await insertGoal(aId);
    const entryId = await insertEntry(goalId, addDays(todayBkk(), -7), 30);

    const p = await patchEntry(aCookie, goalId, entryId, { minutes: 50 });
    expect(p.status).toBe(200);
    expect(p.body.entry.minutes).toBe(50);

    const d = await deleteEntry(aCookie, goalId, entryId);
    expect(d.status).toBe(204);
    expect(await dbEntry(entryId)).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F11-06 — goal ที่จบแล้ว (AC-F11-06, S-1, BR-05)', () => {
  test('TEST-F11-06: end_date = เมื่อวาน, entry เมื่อวาน (อยู่ในหน้าต่าง 7 วัน) → PATCH และ DELETE 409; DB เดิม', async () => {
    const today = todayBkk();
    const goalId = await insertGoal(aId, { start_date: addDays(today, -10), end_date: addDays(today, -1) });
    const entryId = await insertEntry(goalId, addDays(today, -1), 30);

    const p = await patchEntry(aCookie, goalId, entryId, { minutes: 50 });
    expect(p.status).toBe(409);
    expect(p.body).toEqual({ error: 'Conflict' });

    const d = await deleteEntry(aCookie, goalId, entryId);
    expect(d.status).toBe(409);

    const row = await dbEntry(entryId);
    expect(row).toBeDefined();
    expect(row.minutes).toBe(30);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F11-07 — ลบแล้วบันทึกวันเดิมใหม่ได้ (AC-F11-07, S-9, BR-01)', () => {
  test('TEST-F11-07: DELETE 204 ไม่มี body, แถวหายจาก DB; POST entry วันเดิม → 201', async () => {
    const today = todayBkk();
    const goalId = await insertGoal(aId);
    const entryId = await insertEntry(goalId, today, 30);

    const del = await deleteEntry(aCookie, goalId, entryId);
    expect(del.status).toBe(204);
    expect(del.text).toBe('');
    expect(await dbEntry(entryId)).toBeUndefined();

    const post = await request(app)
      .post(`/api/goals/${goalId}/entries`)
      .set('Cookie', aCookie)
      .send({ entry_date: today, minutes: 45 });
    expect(post.status).toBe(201);
    expect(post.body.entry).toMatchObject({ entry_date: today, minutes: 45 });
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F11-08 — สิทธิ์และ ownership (AC-F11-08, BR-08, NFR-01)', () => {
  test('TEST-F11-08a: PM เรียก PATCH และ DELETE → 403 ทั้งคู่; entry ไม่เปลี่ยน', async () => {
    const goalId = await insertGoal(aId);
    const entryId = await insertEntry(goalId, todayBkk(), 30);

    const p = await patchEntry(pmCookie, goalId, entryId, { minutes: 50 });
    expect(p.status).toBe(403);
    const d = await deleteEntry(pmCookie, goalId, entryId);
    expect(d.status).toBe(403);

    expect((await dbEntry(entryId)).minutes).toBe(30);
  });

  test('TEST-F11-08b: Participant B เรียกกับ entry ของ A → 404 ทั้งคู่; entry ของ A ไม่เปลี่ยนและยังอยู่', async () => {
    const goalId = await insertGoal(aId);
    const entryId = await insertEntry(goalId, todayBkk(), 30);

    // positive control: เจ้าของแก้ได้ (พิสูจน์ว่า route มีอยู่จริง ไม่ใช่ 404 เพราะไม่มี route)
    const own = await patchEntry(aCookie, goalId, entryId, { minutes: 35 });
    expect(own.status).toBe(200);

    const p = await patchEntry(bCookie, goalId, entryId, { minutes: 50 });
    expect(p.status).toBe(404);
    const d = await deleteEntry(bCookie, goalId, entryId);
    expect(d.status).toBe(404);

    const row = await dbEntry(entryId);
    expect(row).toBeDefined();
    expect(row.minutes).toBe(35);
  });

  test('TEST-F11-08c: entry อยู่ goal อื่น หรือ entryId ผิดรูปแบบ/ไม่มี → 404 ทุกกรณี; entry ใน goalY ไม่เปลี่ยน', async () => {
    const today = todayBkk();
    const goalX = await insertGoal(aId);
    const goalY = await insertGoal(aId, { template_id: templateId2 });
    const entryInY = await insertEntry(goalY, today, 30);

    // positive control: แก้ผ่าน goal ที่ถูกต้องได้ (พิสูจน์ว่า route มีอยู่จริง)
    const ok = await patchEntry(aCookie, goalY, entryInY, { minutes: 35 });
    expect(ok.status).toBe(200);

    const cross = await patchEntry(aCookie, goalX, entryInY, { minutes: 50 });
    expect(cross.status).toBe(404);
    const crossDel = await deleteEntry(aCookie, goalX, entryInY);
    expect(crossDel.status).toBe(404);

    for (const bad of ['abc', '0', '-1', '999999']) {
      const p = await patchEntry(aCookie, goalX, bad, { minutes: 50 });
      expect(p.status).toBe(404);
      const d = await deleteEntry(aCookie, goalX, bad);
      expect(d.status).toBe(404);
    }

    const row = await dbEntry(entryInY);
    expect(row).toBeDefined();
    expect(row.minutes).toBe(35);
  });
});
