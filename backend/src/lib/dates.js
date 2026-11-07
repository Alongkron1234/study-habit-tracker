/**
 * dates.js — วันที่แบบปฏิทิน Asia/Bangkok (S-11 ของ contract F-03/F-04)
 * ใช้สตริง YYYY-MM-DD ตลอด ไม่ใช้ Date ที่ผูกเขตเวลาเครื่อง
 */
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** @returns {string} วันนี้เป็น YYYY-MM-DD ตามเขตเวลา Asia/Bangkok */
function todayBangkok(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now);
}

/** @returns {boolean} สตริง YYYY-MM-DD ที่เป็นวันที่จริงหรือไม่ */
function isValidDate(s) {
  if (typeof s !== 'string' || !YMD.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** @returns {number} จำนวนวันนับรวมวันปลายทั้งสอง (ต้องเป็นวันที่ถูกต้องทั้งคู่) */
function daysInclusive(start, end) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1;
}

module.exports = { todayBangkok, isValidDate, daysInclusive };
