/**
 * validate.test.js — unit test ของ validate.js และ dates.js
 * Contract: docs/sprints/sprint-1/F-03-F-04-templates-goals.md  TEST-F03-U1
 * Contract: docs/sprints/sprint-2/F-11-edit-delete-entry.md  TEST-F11-09
 * Contract: docs/sprints/sprint-2/F-10-edit-goal.md  TEST-F10-09
 * Contract: docs/sprints/sprint-2/F-09-edit-archive-template.md  TEST-F09-09
 * Requirements: BR-02, BR-04, BR-09, BR-01, BR-08, NFR-06
 */
const {
  validateTemplate,
  validateTemplateUpdate,
  validateGoal,
  validateGoalUpdate,
  validateEntryUpdate,
} = require('../src/lib/validate');
const { todayBangkok, isValidDate, daysInclusive } = require('../src/lib/dates');

const T = '2026-11-10';
const okTemplate = { name: 'Reading', min_value: 10, max_value: 120 };
const okGoal = { template_id: 1, target_minutes: 600, start_date: T, end_date: '2026-11-20' };

describe('TEST-F03-U1 — validateTemplate (S-2, S-3, S-1)', () => {
  test('ข้อมูลถูกต้อง → ok', () => expect(validateTemplate(okTemplate).ok).toBe(true));
  test.each([[0], [961], [-1], [10.5], ['10'], [null], [undefined]])('min_value=%p → ไม่ผ่าน', (v) => {
    const r = validateTemplate({ ...okTemplate, min_value: v });
    expect(r.ok).toBe(false);
    expect(r.fields).toHaveProperty('min_value');
  });
  test('ขอบเขต 1 และ 960 ผ่าน', () => {
    expect(validateTemplate({ name: 'a', min_value: 1, max_value: 960 }).ok).toBe(true);
  });
  test('max < min → ไม่ผ่านที่ max_value', () => {
    expect(validateTemplate({ ...okTemplate, min_value: 50, max_value: 49 }).fields).toHaveProperty('max_value');
  });
  test.each([[''], ['   '], ['x'.repeat(101)], [5], [undefined]])('name=%p → ไม่ผ่าน', (v) => {
    expect(validateTemplate({ ...okTemplate, name: v }).fields).toHaveProperty('name');
  });
  test('name 100 ตัวอักษรผ่าน', () => {
    expect(validateTemplate({ ...okTemplate, name: 'x'.repeat(100) }).ok).toBe(true);
  });
  test('unit ที่ไม่ใช่ minutes ไม่ผ่าน; minutes ผ่าน', () => {
    expect(validateTemplate({ ...okTemplate, unit: 'hours' }).fields).toHaveProperty('unit');
    expect(validateTemplate({ ...okTemplate, unit: 'minutes' }).ok).toBe(true);
  });
});

describe('TEST-F03-U1 — validateGoal (S-5)', () => {
  test('ข้อมูลถูกต้อง → ok', () => expect(validateGoal(okGoal, T).ok).toBe(true));
  test.each([[0], [-5], [1.5], ['100'], [null], [undefined]])('target_minutes=%p → ไม่ผ่าน', (v) => {
    expect(validateGoal({ ...okGoal, target_minutes: v }, T).fields).toHaveProperty('target_minutes');
  });
  test('target_minutes = 1 ผ่าน', () => {
    expect(validateGoal({ ...okGoal, target_minutes: 1 }, T).ok).toBe(true);
  });
  // Bug #42: เพดานบน 350400 = 960 นาที/วัน × 365 วัน
  test('target_minutes = 350400 (เพดาน) ผ่าน', () => {
    expect(validateGoal({ ...okGoal, target_minutes: 350400 }, T).ok).toBe(true);
  });
  test.each([[350401], [2147483648], [3000000000]])('target_minutes=%p → must not exceed 350400', (v) => {
    expect(validateGoal({ ...okGoal, target_minutes: v }, T).fields.target_minutes).toBe('must not exceed 350400');
  });
  test.each([['2026-02-30'], ['x'], ['2026-1-5'], [undefined], [20261120]])('end_date=%p → ไม่ผ่าน', (v) => {
    expect(validateGoal({ ...okGoal, end_date: v }, T).fields).toHaveProperty('end_date');
  });
  test('end ก่อน start → ไม่ผ่าน; end = start ผ่าน', () => {
    expect(validateGoal({ ...okGoal, end_date: '2026-11-09' }, T).fields).toHaveProperty('end_date');
    expect(validateGoal({ ...okGoal, end_date: T }, T).ok).toBe(true);
  });
  test('start ก่อนวันนี้ → ไม่ผ่าน; start = วันนี้ ผ่าน', () => {
    expect(validateGoal({ ...okGoal, start_date: '2026-11-09', end_date: '2026-11-15' }, T).fields).toHaveProperty('start_date');
    expect(validateGoal({ ...okGoal, start_date: T }, T).ok).toBe(true);
  });
  test('ระยะ 365 วันผ่าน 366 วันไม่ผ่าน (นับรวมปลาย)', () => {
    expect(validateGoal({ ...okGoal, start_date: '2026-11-10', end_date: '2027-11-09' }, T).ok).toBe(true); // 365 วัน
    expect(validateGoal({ ...okGoal, start_date: '2026-11-10', end_date: '2027-11-10' }, T).fields).toHaveProperty('end_date'); // 366
  });
});

describe('TEST-F03-U1 — dates (S-11)', () => {
  test('daysInclusive นับรวมวันปลายทั้งสอง', () => {
    expect(daysInclusive('2026-11-10', '2026-11-10')).toBe(1);
    expect(daysInclusive('2026-11-10', '2026-11-12')).toBe(3);
  });
  test('isValidDate', () => {
    expect(isValidDate('2026-02-28')).toBe(true);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2024-02-29')).toBe(true);
    expect(isValidDate('2026-2-3')).toBe(false);
    expect(isValidDate(20261120)).toBe(false);
  });
  test('todayBangkok: 17:00Z ของวันก่อนหน้าคือเที่ยงคืน Bangkok (วันถัดไป)', () => {
    expect(todayBangkok(new Date('2026-11-09T16:59:59Z'))).toBe('2026-11-09');
    expect(todayBangkok(new Date('2026-11-09T17:00:00Z'))).toBe('2026-11-10');
  });
});

// ── F-11: validateEntryUpdate (TEST-F11-09, S-4, S-5, S-13) ─────────────────
describe('TEST-F11-09 — validateEntryUpdate (S-4, S-5, S-13)', () => {
  const tpl = { min_value: 10, max_value: 120 };

  test.each([[10], [11], [60], [119], [120]])('minutes=%p (ในช่วง/ขอบ) → ok', (v) => {
    const r = validateEntryUpdate({ minutes: v }, tpl);
    expect(r.ok).toBe(true);
    expect(r.fields).toEqual({});
  });

  test.each([[-1], [0], [1], [9], [121]])('minutes=%p (จำนวนเต็มนอกช่วง) → "out of template range"', (v) => {
    const r = validateEntryUpdate({ minutes: v }, tpl);
    expect(r.ok).toBe(false);
    expect(r.fields).toEqual({ minutes: 'out of template range' });
  });

  test.each([[1.5], ['60'], [null], [undefined], [true], [NaN]])('minutes=%p (ไม่ใช่จำนวนเต็ม) → "integer required"', (v) => {
    const r = validateEntryUpdate({ minutes: v }, tpl);
    expect(r.ok).toBe(false);
    expect(r.fields).toEqual({ minutes: 'integer required' });
  });

  test('ไม่มี field minutes (body ว่าง / ไม่มี body) → "integer required"', () => {
    expect(validateEntryUpdate({}, tpl).fields).toEqual({ minutes: 'integer required' });
    expect(validateEntryUpdate(undefined, tpl).fields).toEqual({ minutes: 'integer required' });
  });

  test('field เกิน (entry_date, goal_id) → "not editable" แม้ minutes ถูกต้อง', () => {
    const r = validateEntryUpdate({ minutes: 30, entry_date: '2026-11-10', goal_id: 5 }, tpl);
    expect(r.ok).toBe(false);
    expect(r.fields).toEqual({ entry_date: 'not editable', goal_id: 'not editable' });
  });

  test('S-13: minutes ผิดและมี field เกิน → รายงานทุก field พร้อมกัน', () => {
    const r = validateEntryUpdate({ minutes: 1.5, entry_date: '2026-11-10' }, tpl);
    expect(r.ok).toBe(false);
    expect(r.fields).toEqual({ minutes: 'integer required', entry_date: 'not editable' });
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST-F10-09 — validateGoalUpdate (S-2 ถึง S-8)
describe('TEST-F10-09 — validateGoalUpdate (F-10)', () => {
  const goal = { start_date: '2026-11-01' }; // today = T (2026-11-10)
  const v = (body) => validateGoalUpdate(body, goal, T);

  test('ข้อมูลถูกต้องอย่างใดอย่างหนึ่งหรือทั้งสอง → ok', () => {
    expect(v({ target_minutes: 900 }).ok).toBe(true);
    expect(v({ end_date: '2026-11-30' }).ok).toBe(true);
    expect(v({ target_minutes: 900, end_date: '2026-11-30' }).ok).toBe(true);
  });

  test.each([[0], [-5], [1.5], ['1'], [null]])('target_minutes=%p → positive integer', (x) => {
    expect(v({ target_minutes: x }).fields).toEqual({ target_minutes: 'positive integer' });
  });
  test('target_minutes = 1 และ 350400 ผ่าน; 350401 → must not exceed 350400', () => {
    expect(v({ target_minutes: 1 }).ok).toBe(true);
    expect(v({ target_minutes: 350400 }).ok).toBe(true);
    expect(v({ target_minutes: 350401 }).fields.target_minutes).toBe('must not exceed 350400');
  });

  test.each([['2026-13-45'], ['abc'], [20261130], [null]])('end_date=%p → date YYYY-MM-DD', (x) => {
    expect(v({ end_date: x }).fields).toEqual({ end_date: 'date YYYY-MM-DD' });
  });
  test('end_date ก่อน start_date → must not be before start_date (แม้ผ่านมาแล้วด้วย: ข้อความแรกตาม S-7)', () => {
    expect(v({ end_date: '2026-10-31' }).fields.end_date).toBe('must not be before start_date');
  });
  test('ระยะเวลา 365 วันพอดีผ่าน, 366 วัน → duration must not exceed 365 days', () => {
    expect(v({ end_date: '2027-10-31' }).ok).toBe(true);
    expect(v({ end_date: '2027-11-01' }).fields.end_date).toBe('duration must not exceed 365 days');
  });
  test('end_date ก่อนวันนี้ → must not be in the past; วันนี้ผ่าน', () => {
    expect(v({ end_date: '2026-11-09' }).fields.end_date).toBe('must not be in the past');
    expect(v({ end_date: T }).ok).toBe(true);
  });

  test.each([['template_id'], ['start_date'], ['status'], ['user_id'], ['id']])('field %s → not editable', (k) => {
    const r = v({ target_minutes: 900, [k]: 1 });
    expect(r.ok).toBe(false);
    expect(r.fields[k]).toBe('not editable');
    expect(r.fields).not.toHaveProperty('body');
  });
  test('body ว่าง หรือมีแต่ field ที่แก้ไม่ได้ → fields.body', () => {
    expect(v({}).fields.body).toBe('target_minutes or end_date required');
    expect(v(undefined).fields.body).toBe('target_minutes or end_date required');
    const r = v({ status: 'ended' });
    expect(r.fields.body).toBe('target_minutes or end_date required');
    expect(r.fields.status).toBe('not editable');
  });
  test('ผิดหลาย field → รายงานครบ (S-8)', () => {
    const r = v({ target_minutes: 1.5, end_date: 'x', start_date: '2026-01-01' });
    expect(Object.keys(r.fields).sort()).toEqual(['end_date', 'start_date', 'target_minutes']);
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST-F09-09 — validateTemplateUpdate (S-3, S-4, S-5, S-10)
describe('TEST-F09-09 — validateTemplateUpdate (F-09)', () => {
  const current = { name: 'Reading', min_value: 10, max_value: 120 };
  const v = (body) => validateTemplateUpdate(body, current);

  test('ส่งบางตัวหรือทั้งหมดที่ถูกต้อง → ok', () => {
    expect(v({ name: 'New' }).ok).toBe(true);
    expect(v({ min_value: 20 }).ok).toBe(true);
    expect(v({ max_value: 100 }).ok).toBe(true);
    expect(v({ name: 'Deep', min_value: 15, max_value: 90 }).ok).toBe(true);
  });

  test.each([[''], ['   '], ['x'.repeat(101)], [123], [null]])('name=%p → required, 1-100 characters', (x) => {
    expect(v({ name: x }).fields).toEqual({ name: 'required, 1-100 characters' });
  });
  test('name 100 ตัวอักษรผ่าน', () => {
    expect(v({ name: 'x'.repeat(100) }).ok).toBe(true);
  });

  test.each([['min_value'], ['max_value']])('%s: 0, 961, 1.5, "10", null → integer 1-960; 1 และ 960 ผ่าน', (k) => {
    [0, 961, 1.5, '10', null].forEach((x) => {
      expect(v({ [k]: x }).fields[k]).toBe('integer 1-960');
    });
    expect(v({ min_value: 1, max_value: 960 }).ok).toBe(true);
  });

  test('ตรวจข้ามกัน: ส่งเฉพาะ max ต่ำกว่า min เดิม → max_value; ส่งเฉพาะ min สูงกว่า max เดิม → min_value', () => {
    expect(v({ max_value: 5 }).fields).toEqual({ max_value: 'must be >= min_value' });
    expect(v({ min_value: 200 }).fields).toEqual({ min_value: 'must be <= max_value' });
  });
  test('ส่งทั้งคู่และ max < min → ชี้ที่ max_value; min = max ผ่าน', () => {
    expect(v({ min_value: 80, max_value: 70 }).fields).toEqual({ max_value: 'must be >= min_value' });
    expect(v({ min_value: 50, max_value: 50 }).ok).toBe(true);
  });

  test('unit: minutes ผ่าน (ไม่นับเป็นข้อมูลที่แก้), hours → must be minutes', () => {
    expect(v({ name: 'X', unit: 'minutes' }).ok).toBe(true);
    expect(v({ name: 'X', unit: 'hours' }).fields).toEqual({ unit: 'must be minutes' });
  });

  test.each([['is_archived'], ['created_by'], ['id'], ['created_at']])('field %s → not editable', (k) => {
    const r = v({ name: 'X', [k]: 1 });
    expect(r.ok).toBe(false);
    expect(r.fields[k]).toBe('not editable');
    expect(r.fields).not.toHaveProperty('body');
  });

  test('body ว่าง / มีแต่ unit → fields.body', () => {
    expect(v({}).fields.body).toBe('name, min_value or max_value required');
    expect(v(undefined).fields.body).toBe('name, min_value or max_value required');
    expect(v({ unit: 'minutes' }).fields.body).toBe('name, min_value or max_value required');
  });

  test('ผิดหลาย field → รายงานครบ (S-10)', () => {
    const r = v({ name: '', min_value: 1.5, is_archived: true });
    expect(Object.keys(r.fields).sort()).toEqual(['is_archived', 'min_value', 'name']);
  });
});
