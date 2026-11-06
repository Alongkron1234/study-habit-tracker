/**
 * auth.js — middleware ตรวจ session / role / ความเป็นเจ้าของ (F-02)
 *
 * ใช้ลำดับ: requireAuth → requireRole(...) → ownedBy(...)
 * - ไม่มี session            → 401 Unauthorized   (NFR-01)
 * - role ไม่พอ               → 403 Forbidden      (BR-07, BR-08)
 * - ไม่ใช่เจ้าของทรัพยากร    → 404 Not Found      (BR-08: ไม่ยืนยันว่ามีข้อมูลของคนอื่น)
 *
 * ข้อความ error คงที่ ไม่เปิดเผยข้อมูลภายใน (NFR-06)
 */

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

/** ต้องใช้หลัง requireAuth */
function requireRole(...roles) {
  return (req, res, next) => {
    const user = req.session && req.session.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (!roles.includes(user.role)) return res.status(403).json({ error: 'Forbidden' });
    return next();
  };
}

/**
 * @param {(req) => (number|string|null|undefined|Promise<number|string|null|undefined>)} loader
 *        คืน id ของเจ้าของทรัพยากร (หรือ null/undefined ถ้าไม่มีทรัพยากร)
 */
function ownedBy(loader) {
  return async (req, res, next) => {
    try {
      const ownerId = await loader(req);
      const user = req.session && req.session.user;
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      if (ownerId === null || ownerId === undefined || Number(ownerId) !== Number(user.id)) {
        return res.status(404).json({ error: 'Not Found' });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { requireAuth, requireRole, ownedBy };
