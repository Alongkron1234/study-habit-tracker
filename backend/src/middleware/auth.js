/**
 * auth.js — middleware ตรวจ session / role / ความเป็นเจ้าของ (F-02)
 *
 * STUB (red phase): ทุกตัวปล่อยผ่านโดยไม่ตรวจอะไร
 * มีไว้เพื่อให้เทสต์ใน tests/rbac.test.js ล้มที่ assertion ไม่ใช่ล้มเพราะหาไฟล์ไม่เจอ
 * จะถูกแทนที่ด้วยโค้ดจริงใน commit ถัดไป
 */
const requireAuth = (_req, _res, next) => next();
const requireRole = (..._roles) => (_req, _res, next) => next();
const ownedBy = (_loader) => (_req, _res, next) => next();

module.exports = { requireAuth, requireRole, ownedBy };
