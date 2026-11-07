/**
 * messages.js — แปลข้อความ validation จาก backend เป็นข้อความที่ผู้ใช้เข้าใจ
 * backend ยังตอบข้อความเดิมตาม contract (ไม่แก้ API) แปลเฉพาะฝั่งแสดงผล
 * ถ้าไม่รู้จักข้อความ จะแสดงข้อความเดิมของ backend
 */
const FRIENDLY = {
  'required, 1-100 characters': 'Enter a name (1–100 characters).',
  'integer 1-960': 'Enter a whole number from 1 to 960.',
  'must be >= min_value': 'Max minutes must be at least the min minutes.',
  'must be minutes': 'The unit must be minutes.',
  'positive integer': 'Enter a whole number greater than 0.',
  'date YYYY-MM-DD': 'Choose a valid date.',
  'must not be in the past': 'The start date cannot be in the past.',
  'must not be before start_date': 'The end date cannot be before the start date.',
  'duration must not exceed 365 days': 'A goal can last at most 365 days.',
  'integer required': 'Enter a whole number of minutes.',
  'must not be in the future': 'The date cannot be in the future.',
  'must be within last 7 days': 'You can only record the last 7 days.',
  'must be within goal period': 'The date must be within the goal period.',
};

/**
 * @param {string} message ข้อความจาก backend
 * @param {{min_value?: number, max_value?: number}} [template] ใช้บอกช่วงที่ถูกต้อง
 */
export function friendlyFieldError(message, template) {
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
    out[k] = friendlyFieldError(fields[k], template);
  });
  return out;
}
