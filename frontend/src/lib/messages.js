/**
 * messages.js — แปลข้อความ validation จาก backend เป็นข้อความที่ผู้ใช้เข้าใจ
 * backend ยังตอบข้อความเดิมตาม contract (ไม่แก้ API) แปลเฉพาะฝั่งแสดงผล
 * ถ้าไม่รู้จักข้อความ จะแสดงข้อความเดิมของ backend
 */
const FRIENDLY = {
  'required, 1-100 characters': 'Enter a name (1–100 characters).',
  'integer 1-960': 'Enter a whole number from 1 to 960.',
  'must be >= min_value': 'Max minutes must be at least the min minutes.',
  'must be <= max_value': 'Min minutes must be at most the max minutes.',
  'must be minutes': 'The unit must be minutes.',
  'positive integer': 'Enter a whole number greater than 0.',
  'must not exceed 350400': 'The target cannot exceed 350,400 minutes (960 minutes a day for 365 days).',
  'date YYYY-MM-DD': 'Choose a valid date.',
  'must not be in the past': 'The start date cannot be in the past.',
  'must not be before start_date': 'The end date cannot be before the start date.',
  'duration must not exceed 365 days': 'A goal can last at most 365 days.',
  'integer required': 'Enter a whole number of minutes.',
  'must not be in the future': 'The date cannot be in the future.',
  'must be within last 7 days': 'You can only record the last 7 days.',
  'must be within goal period': 'The date must be within the goal period.',
};

// ข้อความที่ต้องต่างกันตามชื่อ field (ใช้ก่อน FRIENDLY) เช่น "must not be in the past"
// ของ end_date (F-10) ต้องไม่ถูกแปลว่า "start date"
const FRIENDLY_BY_FIELD = {
  end_date: {
    'must not be in the past': 'The end date cannot be in the past.',
  },
};

/**
 * @param {string} message ข้อความจาก backend
 * @param {{min_value?: number, max_value?: number}} [template] ใช้บอกช่วงที่ถูกต้อง
 * @param {string} [field] ชื่อ field ที่มีข้อความนี้ (ถ้ามี จะดูตารางตาม field ก่อน)
 */
export function friendlyFieldError(message, template, field) {
  if (field && FRIENDLY_BY_FIELD[field] && FRIENDLY_BY_FIELD[field][message]) {
    return FRIENDLY_BY_FIELD[field][message];
  }
  if (message === 'out of template range') {
    if (template && template.min_value != null && template.max_value != null) {
      return `Minutes must be between ${template.min_value} and ${template.max_value}.`;
    }
    return 'Minutes are outside the range allowed by the template.';
  }
  return FRIENDLY[message] || message;
}

export function friendlyFields(fields, template) {
  const out = {};
  Object.keys(fields || {}).forEach((k) => {
    out[k] = friendlyFieldError(fields[k], template, k);
  });
  return out;
}
