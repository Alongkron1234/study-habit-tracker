/**
 * validate.js — ตรวจข้อมูลแม่แบบ/เป้าหมาย/entry (ฟังก์ชันบริสุทธิ์) ตาม contract F-03/F-04/F-05
 * คืน { ok: boolean, fields: { [ชื่อฟิลด์]: ข้อความคงที่ } } (S-10: ข้อความมาจากรายการคงที่)
 */
const { isValidDate, daysInclusive } = require('./dates');

// เพดานของ target_minutes = 960 นาที/วัน × 365 วัน (ยอดสูงสุดที่ goal หนึ่งทำได้จริง) ใช้ร่วมกับ F-10
const MAX_TARGET_MINUTES = 350400;

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

/**
 * validateTemplateUpdate — ตรวจ body ของ PATCH /api/templates/:id ตาม contract F-09 (S-3, S-4, S-5, S-10)
 * @param {object} body — req.body
 * @param {{min_value: number, max_value: number}} current — ช่วงค่าปัจจุบันของแม่แบบ (ใช้ตรวจข้ามกัน)
 * @returns {{ ok: boolean, fields: object }} รายงานทุก field ที่ผิดพร้อมกัน
 */
function validateTemplateUpdate(body, current) {
  const b = body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  const fields = {};

  // S-3: แก้ได้เฉพาะ name, min_value, max_value (unit ยอมรับเฉพาะ "minutes")
  Object.keys(b).forEach((k) => {
    if (!['name', 'min_value', 'max_value', 'unit'].includes(k)) fields[k] = 'not editable';
  });
  if (has('unit') && b.unit !== 'minutes') fields.unit = 'must be minutes'; // BR-09
  // S-5: ต้องมีอย่างน้อยหนึ่งใน name/min_value/max_value
  if (!has('name') && !has('min_value') && !has('max_value')) fields.body = 'name, min_value or max_value required';

  if (has('name')) {
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (name.length < 1 || name.length > 100) fields.name = 'required, 1-100 characters';
  }
  if (has('min_value') && !inRange(b.min_value)) fields.min_value = 'integer 1-960';
  if (has('max_value') && !inRange(b.max_value)) fields.max_value = 'integer 1-960';

  // S-4: ตรวจข้ามกันหลังรวมกับค่าปัจจุบัน แยกข้อความตามฝั่งที่ client ส่งมา
  const minOk = has('min_value') && inRange(b.min_value);
  const maxOk = has('max_value') && inRange(b.max_value);
  if (maxOk) {
    const effMin = has('min_value') ? (minOk ? b.min_value : null) : current.min_value;
    if (effMin !== null && b.max_value < effMin) fields.max_value = 'must be >= min_value';
  } else if (minOk && !has('max_value') && b.min_value > current.max_value) {
    fields.min_value = 'must be <= max_value';
  }

  return { ok: Object.keys(fields).length === 0, fields };
}

// ตรวจ target_minutes (ใช้ร่วมกันระหว่าง F-04 สร้าง goal และ F-10 แก้ goal) คืนข้อความ error หรือ null
function targetMinutesError(v) {
  if (!isInt(v) || v <= 0) return 'positive integer';
  if (v > MAX_TARGET_MINUTES) return `must not exceed ${MAX_TARGET_MINUTES}`;
  return null;
}

function validateGoal(body, today) {
  const b = body || {};
  const fields = {};

  const tmErr = targetMinutesError(b.target_minutes);
  if (tmErr) fields.target_minutes = tmErr;

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
 * validateGoalUpdate — ตรวจ body ของ PATCH /api/goals/:id ตาม contract F-10 (S-2 ถึง S-8)
 * @param {object} body — req.body
 * @param {{start_date: string}} goal — goal ปัจจุบัน (YYYY-MM-DD)
 * @param {string} today — วันนี้แบบ YYYY-MM-DD (Asia/Bangkok) จาก todayBangkok()
 * @returns {{ ok: boolean, fields: object }} รายงานทุก field ที่ผิดพร้อมกัน (S-8)
 */
function validateGoalUpdate(body, goal, today) {
  const b = body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  const fields = {};

  // S-2: แก้ได้เฉพาะ target_minutes และ end_date
  Object.keys(b).forEach((k) => {
    if (k !== 'target_minutes' && k !== 'end_date') fields[k] = 'not editable';
  });
  // S-3: ต้องมีอย่างน้อยหนึ่งในสอง field
  if (!has('target_minutes') && !has('end_date')) fields.body = 'target_minutes or end_date required';

  if (has('target_minutes')) {
    const err = targetMinutesError(b.target_minutes);
    if (err) fields.target_minutes = err;
  }

  if (has('end_date')) {
    // S-7: รายงานข้อความแรกที่ไม่ผ่านเพียงข้อความเดียว
    if (!isValidDate(b.end_date)) fields.end_date = 'date YYYY-MM-DD';
    else if (b.end_date < goal.start_date) fields.end_date = 'must not be before start_date';
    else if (daysInclusive(goal.start_date, b.end_date) > 365) fields.end_date = 'duration must not exceed 365 days';
    else if (b.end_date < today) fields.end_date = 'must not be in the past';
  }

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

/**
 * validateEntryUpdate — ตรวจ body ของ PATCH entry ตาม contract F-11 (S-4, S-5, S-13)
 * แก้ได้เฉพาะ minutes; field อื่นทุกตัว → "not editable"; รายงานทุก field ที่ผิดพร้อมกัน
 * @param {object} body     — req.body
 * @param {object} template — { min_value, max_value }
 * @returns {{ ok: boolean, fields: object }}
 */
function validateEntryUpdate(body, template) {
  const b = body && typeof body === 'object' ? body : {};
  const fields = {};

  // --- minutes (S-5, BR-02) ---
  if (!isInt(b.minutes)) {
    fields.minutes = 'integer required';
  } else if (b.minutes < template.min_value || b.minutes > template.max_value) {
    fields.minutes = 'out of template range';
  }

  // --- field อื่น (S-4: กัน mass-assignment) ---
  for (const key of Object.keys(b)) {
    if (key !== 'minutes') fields[key] = 'not editable';
  }

  return { ok: Object.keys(fields).length === 0, fields };
}

module.exports = { validateTemplate, validateTemplateUpdate, validateGoal, validateGoalUpdate, validateEntry, validateEntryUpdate, MAX_TARGET_MINUTES };
