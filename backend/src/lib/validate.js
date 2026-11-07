/**
 * validate.js — ตรวจข้อมูลแม่แบบ/เป้าหมาย/entry (ฟังก์ชันบริสุทธิ์) ตาม contract F-03/F-04/F-05
 * คืน { ok: boolean, fields: { [ชื่อฟิลด์]: ข้อความคงที่ } } (S-10: ข้อความมาจากรายการคงที่)
 */
const { isValidDate, daysInclusive } = require('./dates');

const isInt = (v) => typeof v === 'number' && Number.isInteger(v);
const inRange = (v) => isInt(v) && v >= 1 && v <= 960;

function validateTemplate(body) {
  const b = body || {};
  const fields = {};

  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (name.length < 1 || name.length > 100) fields.name = 'required, 1-100 characters';
  if (!inRange(b.min_value)) fields.min_value = 'integer 1-960';
  if (!inRange(b.max_value)) fields.max_value = 'integer 1-960';
  else if (inRange(b.min_value) && b.max_value < b.min_value) fields.max_value = 'must be >= min_value';
  if (b.unit !== undefined && b.unit !== 'minutes') fields.unit = 'must be minutes'; // BR-09

  return { ok: Object.keys(fields).length === 0, fields };
}

function validateGoal(body, today) {
  const b = body || {};
  const fields = {};

  if (!isInt(b.target_minutes) || b.target_minutes <= 0) fields.target_minutes = 'positive integer';

  const startOk = isValidDate(b.start_date);
  const endOk = isValidDate(b.end_date);
  if (!startOk) fields.start_date = 'date YYYY-MM-DD';
  else if (b.start_date < today) fields.start_date = 'must not be in the past';
  if (!endOk) fields.end_date = 'date YYYY-MM-DD';
  else if (startOk && b.end_date < b.start_date) fields.end_date = 'must not be before start_date';
  else if (startOk && daysInclusive(b.start_date, b.end_date) > 365) fields.end_date = 'duration must not exceed 365 days';

  return { ok: Object.keys(fields).length === 0, fields };
}

/**
 * validateEntry — ตรวจข้อมูล entry ตาม contract F-05 (S-3, S-9)
 * @param {object} body    — req.body
 * @param {object} goal    — { start_date, end_date } (YYYY-MM-DD strings)
 * @param {object} template — { min_value, max_value }
 * @param {string} today   — วันนี้แบบ YYYY-MM-DD (Asia/Bangkok) จาก todayBangkok()
 * @returns {{ ok: boolean, fields: object }}
 */
function validateEntry(body, goal, template, today) {
  const b = body || {};
  const fields = {};

  // --- minutes (S-3, BR-02) ---
  if (!isInt(b.minutes)) {
    fields.minutes = 'integer required';
  } else if (b.minutes < template.min_value || b.minutes > template.max_value) {
    fields.minutes = 'out of template range';
  }

  // --- entry_date (S-9, BR-03) ---
  if (!isValidDate(b.entry_date)) {
    fields.entry_date = 'date YYYY-MM-DD';
  } else if (b.entry_date > today) {
    fields.entry_date = 'must not be in the future';
  } else if (daysInclusive(b.entry_date, today) > 8) {
    // daysInclusive(d, today) = ระยะห่างเป็นวัน + 1
    // today − 7 วัน: daysInclusive = 8 → ผ่าน (≤ 8)
    // today − 8 วัน: daysInclusive = 9 → ไม่ผ่าน (> 8)
    fields.entry_date = 'must be within last 7 days';
  } else if (b.entry_date < goal.start_date || b.entry_date > goal.end_date) {
    fields.entry_date = 'must be within goal period';
  }

  return { ok: Object.keys(fields).length === 0, fields };
}

module.exports = { validateTemplate, validateGoal, validateEntry };
