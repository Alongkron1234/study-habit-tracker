/**
 * validate.test.js — unit test ของ validate.js และ dates.js
 * Contract: docs/sprints/sprint-1/F-03-F-04-templates-goals.md  TEST-F03-U1
 * Requirements: BR-02, BR-04, BR-09
 */
const { validateTemplate, validateGoal } = require('../src/lib/validate');
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
