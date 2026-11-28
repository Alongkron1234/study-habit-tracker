/**
 * template-edit.test.js — F-09 แก้ไข/เก็บถาวร (archive) แม่แบบ
 * Contract: docs/sprints/sprint-2/F-09-edit-archive-template.md (v1.1)
 *   TEST-F09-01, 02, 03a–e, 04a/b, 05a/b/c, 06a/b/c, 07, 08a/b/c
 *   (TEST-F09-08d อยู่ใน rbac.test.js, TEST-F09-09 อยู่ใน validate.test.js,
 *    TEST-F09-10 เป็น UI manual, TEST-F09-11 อยู่ใน frontend/src/tests/messages.test.js)
 * Requirements: FR-11, BR-02, BR-05, BR-07, BR-08, BR-09, NFR-01, NFR-06
 *
 * ทุก test setup ข้อมูลของตัวเองใน beforeEach ไม่พึ่งผลของ test อื่น
 * goal และ entry สร้างผ่าน SQL ตรงๆ; วันที่คำนวณจาก todayBkk()/addDays()
 */
require('./helpers/test-env');

const request = require('supertest');
const pool = require('../src/db/db');
const { createApp } = require('../src/app');
const { createUser, loginAs, cleanupPrefix, todayBkk, addDays } = require('./helpers/fixtures');

const P = 'test_f09_';
let app, pmAId, pmBId, partId, pmACookie, pmBCookie, partCookie;

// แม่แบบของ PM A: Reading 10–120 ยังไม่ archived; ตั้ง updated_at ย้อนหลังให้เทียบได้แน่นอน
async function insertTemplate(createdBy, o = {}) {
  const { rows } = await pool.query(
    `INSERT INTO activity_templates (created_by, name, min_value, max_value, is_archived, updated_at)
     VALUES ($1, $2, $3, $4, $5, now() - interval '1 hour') RETURNING id`,
    [createdBy, o.name ?? `${P}Reading`, o.min_value ?? 10, o.max_value ?? 120, o.is_archived ?? false]
  );
  return rows[0].id;
}

async function insertGoal(userId, templateId) {
  const today = todayBkk();
  const { rows } = await pool.query(
    `INSERT INTO goals (user_id, template_id, target_minutes, start_date, end_date, status)
     VALUES ($1, $2, 600, $3, $4, 'active') RETURNING id`,
    [userId, templateId, addDays(today, -10), addDays(today, 20)]
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

const dbTemplate = async (id) => {
  const { rows } = await pool.query(
    'SELECT id, created_by, name, unit, min_value, max_value, is_archived, updated_at FROM activity_templates WHERE id = $1',
    [id]
  );
  return rows[0];
};

async function expectUnchanged(id, before) {
  const after = await dbTemplate(id);
  expect(after.name).toBe(before.name);
  expect(after.min_value).toBe(before.min_value);
  expect(after.max_value).toBe(before.max_value);
  expect(after.is_archived).toBe(before.is_archived);
  expect(after.unit).toBe(before.unit);
  expect(after.updated_at.getTime()).toBe(before.updated_at.getTime());
}

const patchTpl = (cookie, id, body) =>
  request(app).patch(`/api/templates/${id}`).set('Cookie', cookie).send(body);
const archiveTpl = (cookie, id) =>
  request(app).post(`/api/templates/${id}/archive`).set('Cookie', cookie);

const clearAll = async () => {
  await pool.query(
    'DELETE FROM habit_entries WHERE goal_id IN (SELECT id FROM goals WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1))',
    [`${P}%`]
  );
  await pool.query('DELETE FROM goals WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1)', [`${P}%`]);
  await pool.query(
    'DELETE FROM activity_templates WHERE created_by IN (SELECT id FROM users WHERE username LIKE $1)',
    [`${P}%`]
  );
};

beforeAll(async () => {
  app = createApp();
  await cleanupPrefix(P);
  pmAId = await createUser(`${P}pma`, 'pm');
  pmBId = await createUser(`${P}pmb`, 'pm');
  partId = await createUser(`${P}part`, 'participant');
  pmACookie = await loginAs(app, `${P}pma`);
  pmBCookie = await loginAs(app, `${P}pmb`);
  partCookie = await loginAs(app, `${P}part`);
});

beforeEach(clearAll);

afterAll(async () => {
  await cleanupPrefix(P);
  await pool.end();
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F09-01/02 — แก้ไขสำเร็จ (AC-F09-01)', () => {
  test('TEST-F09-01: 200, ชื่อถูก trim, ไม่มี field ต้องห้าม; DB ตรงกันและ updated_at ใหม่กว่าเดิม', async () => {
    const id = await insertTemplate(pmAId);
    const before = await dbTemplate(id);

    const res = await patchTpl(pmACookie, id, { name: '  Deep Reading  ', min_value: 15, max_value: 90 });

    expect(res.status).toBe(200);
    expect(res.body.template).toEqual({
      id,
      name: 'Deep Reading',
      unit: 'minutes',
      min_value: 15,
      max_value: 90,
      is_archived: false,
    });
    expect(res.body.template).not.toHaveProperty('created_by');
    expect(res.body.template).not.toHaveProperty('created_at');
    expect(res.body.template).not.toHaveProperty('updated_at');

    const after = await dbTemplate(id);
    expect(after.name).toBe('Deep Reading');
    expect(after.min_value).toBe(15);
    expect(after.max_value).toBe(90);
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
  });

  test.each([
    ['name', { name: 'New' }, { name: 'New', min_value: 10, max_value: 120 }],
    ['min_value', { min_value: 20 }, { name: `${P}Reading`, min_value: 20, max_value: 120 }],
    ['max_value', { max_value: 100 }, { name: `${P}Reading`, min_value: 10, max_value: 100 }],
    ['min_value + unit minutes', { min_value: 30, unit: 'minutes' }, { name: `${P}Reading`, min_value: 30, max_value: 120 }],
  ])('TEST-F09-02: ส่งเฉพาะ %s → 200 เปลี่ยนเฉพาะที่ส่ง, unit ยัง minutes', async (_label, body, expected) => {
    const id = await insertTemplate(pmAId);

    const res = await patchTpl(pmACookie, id, body);

    expect(res.status).toBe(200);
    expect(res.body.template).toMatchObject({ ...expected, unit: 'minutes' });
    const after = await dbTemplate(id);
    expect({ name: after.name, min_value: after.min_value, max_value: after.max_value }).toEqual(expected);
    expect(after.unit).toBe('minutes');
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F09-03 — ตรวจค่า (AC-F09-02, BR-02, BR-09)', () => {
  test.each([[''], ['   '], ['x'.repeat(101)], [123], [null]])('TEST-F09-03a: name=%p → 400', async (v) => {
    const id = await insertTemplate(pmAId);
    const before = await dbTemplate(id);

    const res = await patchTpl(pmACookie, id, { name: v });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Bad Request', fields: { name: 'required, 1-100 characters' } });
    await expectUnchanged(id, before);
  });

  test.each([
    ['min_value', 0], ['min_value', 961], ['min_value', 1.5], ['min_value', '10'], ['min_value', null],
    ['max_value', 0], ['max_value', 961], ['max_value', 1.5], ['max_value', '10'], ['max_value', null],
  ])('TEST-F09-03b: %s=%p → 400 integer 1-960', async (field, v) => {
    const id = await insertTemplate(pmAId);
    const before = await dbTemplate(id);

    const res = await patchTpl(pmACookie, id, { [field]: v });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Bad Request', fields: { [field]: 'integer 1-960' } });
    await expectUnchanged(id, before);
  });

  test('TEST-F09-03c: ค่าขอบ 1–960 และ min = max → 200', async () => {
    const id = await insertTemplate(pmAId);
    expect((await patchTpl(pmACookie, id, { min_value: 1, max_value: 960 })).status).toBe(200);
    expect((await patchTpl(pmACookie, id, { min_value: 50, max_value: 50 })).status).toBe(200);
  });

  test('TEST-F09-03d: ตรวจข้ามกัน min/max (แยกข้อความตามฝั่งที่ส่ง)', async () => {
    const id = await insertTemplate(pmAId);
    const before = await dbTemplate(id);

    const r1 = await patchTpl(pmACookie, id, { max_value: 5 });
    expect(r1.status).toBe(400);
    expect(r1.body.fields).toEqual({ max_value: 'must be >= min_value' });

    const r2 = await patchTpl(pmACookie, id, { min_value: 200 });
    expect(r2.status).toBe(400);
    expect(r2.body.fields).toEqual({ min_value: 'must be <= max_value' });

    const r3 = await patchTpl(pmACookie, id, { min_value: 80, max_value: 70 });
    expect(r3.status).toBe(400);
    expect(r3.body.fields).toEqual({ max_value: 'must be >= min_value' });

    await expectUnchanged(id, before);
  });

  test('TEST-F09-03e: unit ที่ไม่ใช่ minutes → 400 must be minutes; ชื่อไม่เปลี่ยน', async () => {
    const id = await insertTemplate(pmAId);
    const before = await dbTemplate(id);

    const res = await patchTpl(pmACookie, id, { name: 'X', unit: 'hours' });

    expect(res.status).toBe(400);
    expect(res.body.fields.unit).toBe('must be minutes');
    await expectUnchanged(id, before);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F09-04 — field ที่แก้ไม่ได้ / body ว่าง (AC-F09-03, BR-07, NFR-06)', () => {
  test.each([
    [{ name: 'X', is_archived: true }, 'is_archived'],
    [{ name: 'X', created_by: 999 }, 'created_by'],
    [{ name: 'X', id: 999 }, 'id'],
  ])('TEST-F09-04a: %j → 400 not editable', async (body, field) => {
    const id = await insertTemplate(pmAId);
    const before = await dbTemplate(id);

    const res = await patchTpl(pmACookie, id, body);

    expect(res.status).toBe(400);
    expect(res.body.fields[field]).toBe('not editable');
    await expectUnchanged(id, before);
  });

  test('TEST-F09-04b: body ว่าง / มีแต่ unit → fields.body; ผิดหลาย field → รายงานครบ', async () => {
    const id = await insertTemplate(pmAId);
    const before = await dbTemplate(id);

    for (const body of [{}, { unit: 'minutes' }]) {
      const r = await patchTpl(pmACookie, id, body);
      expect(r.status).toBe(400);
      expect(r.body.fields.body).toBe('name, min_value or max_value required');
    }

    const r3 = await patchTpl(pmACookie, id, { min_value: 1.5, is_archived: false });
    expect(r3.status).toBe(400);
    expect(r3.body.fields).toHaveProperty('min_value');
    expect(r3.body.fields).toHaveProperty('is_archived');

    await expectUnchanged(id, before);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F09-05 — archive (AC-F09-04, FR-11)', () => {
  test('TEST-F09-05a: 200 is_archived=true; DB เก็บและ updated_at ใหม่กว่าเดิม', async () => {
    const id = await insertTemplate(pmAId);
    const before = await dbTemplate(id);

    const res = await archiveTpl(pmACookie, id);

    expect(res.status).toBe(200);
    expect(res.body.template).toEqual({
      id,
      name: `${P}Reading`,
      unit: 'minutes',
      min_value: 10,
      max_value: 120,
      is_archived: true,
    });
    const after = await dbTemplate(id);
    expect(after.is_archived).toBe(true);
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
  });

  test('TEST-F09-05b: archive ซ้ำ → 200 และ updated_at ไม่เปลี่ยน (idempotent)', async () => {
    const id = await insertTemplate(pmAId);
    expect((await archiveTpl(pmACookie, id)).status).toBe(200);
    const afterFirst = await dbTemplate(id);

    const res = await archiveTpl(pmACookie, id);

    expect(res.status).toBe(200);
    expect(res.body.template.is_archived).toBe(true);
    expect((await dbTemplate(id)).updated_at.getTime()).toBe(afterFirst.updated_at.getTime());
  });

  test('TEST-F09-05c: PATCH แม่แบบที่ archived → 409; DB เดิม', async () => {
    const id = await insertTemplate(pmAId);
    expect((await archiveTpl(pmACookie, id)).status).toBe(200);
    const before = await dbTemplate(id);

    const res = await patchTpl(pmACookie, id, { name: 'X' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Conflict' });
    await expectUnchanged(id, before);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F09-06 — ผลของ archive ต่อ feature อื่น (AC-F09-05, S-8)', () => {
  test('TEST-F09-06a: Participant ไม่เห็นแม่แบบที่ archived; PM เห็นพร้อม is_archived: true', async () => {
    const first = await insertTemplate(pmAId, { name: `${P}First` });
    const second = await insertTemplate(pmAId, { name: `${P}Second` });
    expect((await archiveTpl(pmACookie, first)).status).toBe(200);

    const part = await request(app).get('/api/templates').set('Cookie', partCookie);
    const mine = part.body.templates.filter((t) => t.name.startsWith(P)).map((t) => t.id);
    expect(mine).toEqual([second]);

    const pm = await request(app).get('/api/templates').set('Cookie', pmACookie);
    const pmMine = pm.body.templates.filter((t) => t.name.startsWith(P));
    expect(pmMine.map((t) => [t.id, t.is_archived])).toEqual([[first, true], [second, false]]);
  });

  test('TEST-F09-06b: POST /api/goals ด้วยแม่แบบที่ archived → 404; ไม่มี goal ใหม่', async () => {
    const id = await insertTemplate(pmAId);
    expect((await archiveTpl(pmACookie, id)).status).toBe(200);
    const today = todayBkk();

    const res = await request(app)
      .post('/api/goals')
      .set('Cookie', partCookie)
      .send({ template_id: id, target_minutes: 300, start_date: today, end_date: addDays(today, 10) });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not Found' });
    const { rows } = await pool.query('SELECT 1 FROM goals WHERE user_id = $1', [partId]);
    expect(rows).toHaveLength(0);
  });

  test('TEST-F09-06c: goal active เดิมยังบันทึก entry ได้หลัง archive และ progress ถูกต้อง', async () => {
    const today = todayBkk();
    const id = await insertTemplate(pmAId);
    const goalId = await insertGoal(partId, id);
    const post = (date, minutes) =>
      request(app).post(`/api/goals/${goalId}/entries`).set('Cookie', partCookie).send({ entry_date: date, minutes });

    // positive control: บันทึกได้ก่อน archive (ใช้วันก่อนหน้า เพื่อไม่ชนวันที่ใช้หลัง archive)
    expect((await post(addDays(today, -1), 20)).status).toBe(201);
    expect((await archiveTpl(pmACookie, id)).status).toBe(200);

    const res = await post(today, 30);
    expect(res.status).toBe(201);

    const progress = await request(app).get(`/api/goals/${goalId}/progress`).set('Cookie', partCookie);
    expect(progress.body.progress.total_minutes).toBe(50);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F09-07 — แก้ช่วงค่ามีผลกับ entry ใหม่เท่านั้น (AC-F09-06, S-7)', () => {
  test('TEST-F09-07: entry เดิมคงอยู่/นับ progress; entry ใหม่ตรวจกับช่วงใหม่', async () => {
    const today = todayBkk();
    const id = await insertTemplate(pmAId);
    const goalId = await insertGoal(partId, id);
    await insertEntry(goalId, addDays(today, -1), 30);

    expect((await patchTpl(pmACookie, id, { min_value: 40 })).status).toBe(200);

    const post = (minutes) =>
      request(app).post(`/api/goals/${goalId}/entries`).set('Cookie', partCookie).send({ entry_date: today, minutes });
    const low = await post(30);
    expect(low.status).toBe(400);
    expect(low.body.fields.minutes).toBe('out of template range');
    expect((await post(50)).status).toBe(201);

    const entries = await request(app).get(`/api/goals/${goalId}/entries`).set('Cookie', partCookie);
    expect(entries.body.entries.map((e) => e.minutes).sort((a, b) => a - b)).toEqual([30, 50]);
    const progress = await request(app).get(`/api/goals/${goalId}/progress`).set('Cookie', partCookie);
    expect(progress.body.progress.total_minutes).toBe(80);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('TEST-F09-08 — สิทธิ์ (AC-F09-07, BR-07, NFR-01)', () => {
  test('TEST-F09-08a: Participant → 403 ทั้งสอง endpoint; แม่แบบไม่เปลี่ยน', async () => {
    const id = await insertTemplate(pmAId);
    const before = await dbTemplate(id);

    const r1 = await patchTpl(partCookie, id, { name: 'X' });
    const r2 = await archiveTpl(partCookie, id);

    expect(r1.status).toBe(403);
    expect(r1.body).toEqual({ error: 'Forbidden' });
    expect(r2.status).toBe(403);
    expect(r2.body).toEqual({ error: 'Forbidden' });
    await expectUnchanged(id, before);
  });

  test('TEST-F09-08b: PM B กับแม่แบบของ PM A → 404 ทั้งสอง; แม่แบบของ A คงค่าที่ A แก้', async () => {
    const id = await insertTemplate(pmAId);
    // positive control: PM A แก้ชื่อได้
    expect((await patchTpl(pmACookie, id, { name: 'Renamed by A' })).status).toBe(200);
    const afterA = await dbTemplate(id);

    const r1 = await patchTpl(pmBCookie, id, { name: 'Hacked' });
    const r2 = await archiveTpl(pmBCookie, id);

    expect(r1.status).toBe(404);
    expect(r1.body).toEqual({ error: 'Not Found' });
    expect(r2.status).toBe(404);
    expect(r2.body).toEqual({ error: 'Not Found' });
    await expectUnchanged(id, afterA);
    expect(afterA.name).toBe('Renamed by A');
    expect(afterA.is_archived).toBe(false);
    expect(pmBId).toBeDefined();
  });

  test.each([['abc'], ['0'], ['-1'], ['999999']])('TEST-F09-08c: id=%s → 404 ทั้งสอง endpoint', async (badId) => {
    const id = await insertTemplate(pmAId);
    // positive control: route มีอยู่ และ PM A ใช้กับแม่แบบตนเองได้
    expect((await patchTpl(pmACookie, id, { name: 'Control' })).status).toBe(200);

    const r1 = await patchTpl(pmACookie, badId, { name: 'X' });
    const r2 = await archiveTpl(pmACookie, badId);

    expect(r1.status).toBe(404);
    expect(r1.body).toEqual({ error: 'Not Found' });
    expect(r2.status).toBe(404);
    expect(r2.body).toEqual({ error: 'Not Found' });
  });
});
