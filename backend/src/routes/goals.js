/**
 * goals.js — F-04 การตั้งเป้าหมาย
 * Contract: docs/sprints/sprint-1/F-03-F-04-templates-goals.md
 * Requirements: FR-07, BR-04, BR-05, BR-08
 */
const express = require('express');
const pool = require('../db/db');
const { requireAuth, requireRole, ownedBy } = require('../middleware/auth');
const { validateGoal } = require('../lib/validate');
const { todayBangkok } = require('../lib/dates');

const router = express.Router();

// สถานะคำนวณจากวันที่ (S-7): active ถึง end_date รวมวันนั้น
const SELECT_GOAL = `SELECT id, template_id, target_minutes, start_date, end_date,
  CASE WHEN end_date < $2::date THEN 'ended' ELSE 'active' END AS status
  FROM goals`;

router.post('/', requireAuth, requireRole('participant'), async (req, res, next) => {
  try {
    const today = todayBangkok();
    const v = validateGoal(req.body, today);
    const tid = req.body && req.body.template_id;
    if (!Number.isInteger(tid) || tid < 1) v.fields.template_id = 'positive integer';
    if (!v.ok || v.fields.template_id) return res.status(400).json({ error: 'Bad Request', fields: v.fields });

    const userId = req.session.user.id;
    const tpl = await pool.query('SELECT 1 FROM activity_templates WHERE id = $1 AND is_archived = false', [tid]);
    if (tpl.rowCount === 0) return res.status(404).json({ error: 'Not Found' });

    // S-7: ปรับเป้าหมายที่หมดเวลาแล้วเป็น ended ก่อน เพื่อไม่ให้ unique index ขวาง
    await pool.query(
      "UPDATE goals SET status = 'ended', updated_at = now() WHERE user_id = $1 AND status = 'active' AND end_date < $2::date",
      [userId, today]
    );

    try {
      const { rows } = await pool.query(
        `INSERT INTO goals (user_id, template_id, target_minutes, start_date, end_date)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, template_id, target_minutes, start_date, end_date, status`,
        [userId, tid, req.body.target_minutes, req.body.start_date, req.body.end_date]
      );
      return res.status(201).json({ goal: rows[0] });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Conflict' }); // S-8: uq_goals_active
      throw err;
    }
  } catch (err) {
    return next(err);
  }
});

router.get('/', requireAuth, requireRole('participant'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(`${SELECT_GOAL} WHERE user_id = $1 ORDER BY id DESC`, [
      req.session.user.id,
      todayBangkok(),
    ]);
    return res.json({ goals: rows });
  } catch (err) {
    return next(err);
  }
});

// id ที่ไม่ใช่จำนวนเต็มบวก → loader คืน null → ownedBy ตอบ 404
const goalOwner = async (req) => {
  if (!/^\d{1,9}$/.test(req.params.id)) return null;
  const { rows } = await pool.query('SELECT user_id FROM goals WHERE id = $1', [Number(req.params.id)]);
  return rows[0] ? rows[0].user_id : null;
};

router.get('/:id', requireAuth, requireRole('participant'), ownedBy(goalOwner), async (req, res, next) => {
  try {
    const { rows } = await pool.query(`${SELECT_GOAL} WHERE id = $1`, [Number(req.params.id), todayBangkok()]);
    return res.json({ goal: rows[0] });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
