/**
 * dates.js — วันที่แบบปฏิทิน Asia/Bangkok (S-11 ของ contract F-03/F-04)
 * STUB: ยังไม่ implement (TDD red) — จะเขียนจริงหลังบันทึกผลเทสต์ที่ fail
 */
function notImplemented() { throw new Error('not implemented'); }

/** @returns {string} วันนี้เป็น YYYY-MM-DD ตามเขตเวลา Asia/Bangkok */
const todayBangkok = (_now) => notImplemented();
/** @returns {boolean} สตริง YYYY-MM-DD ที่เป็นวันที่จริงหรือไม่ */
const isValidDate = (_s) => notImplemented();
/** @returns {number} จำนวนวันนับรวมวันปลายทั้งสอง */
const daysInclusive = (_start, _end) => notImplemented();

module.exports = { todayBangkok, isValidDate, daysInclusive };
