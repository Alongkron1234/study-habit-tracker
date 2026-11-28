/**
 * entries.js — F-05 การบันทึกกิจกรรมรายวัน + F-06 การคำนวณความคืบหน้า
 * Contract: docs/sprints/sprint-1/F-05-F-06-entry-progress.md
 * F-11 (แก้ไข/ลบ entry): docs/sprints/sprint-2/F-11-edit-delete-entry.md
 * Requirements: FR-08, FR-09, FR-10, FR-13, BR-01, BR-02, BR-03, BR-05, BR-06, BR-08, BR-09, NFR-05
 *
 * Mount ที่ /api/goals (เพื่อ nested route /:id/entries และ /:id/progress)
 */
const express = require('express');
const pool = require('../db/db');
const { requireAuth, requireRole, ownedBy } = require('../middleware/auth');
const { validateEntry, validateEntryUpdate } = require('../lib/validate');
const { todayBangkok, daysInclusive } = require('../lib/dates');

const router = express.Router();

// ── Ownership loader (ใช้ร่วมกับ goals.js — ตรวจจาก DB) ─────────────────
// id ที่ไม่ใช่จำนวนเต็มบวก → คืน null → ownedBy ตอบ 404
const goalOwner = async (req) => {
  if (!/^\d{1,9}$/.test(req.params.id)) return null;
  const { rows } = await pool.query('SELECT user_id FROM goals WHERE id = $1', [Number(req.params.id)]);
  return rows[0] ? rows[0].user_id : null;
};

// ── POST /api/goals/:id/entries — บันทึก entry รายวัน (F-05) ─────────────
router.post(
  '/:id/entries',
  requireAuth,
  requireRole('participant'),
  ownedBy(goalOwner),
  async (req, res, next) => {
    try {
      const today = todayBangkok();
      const goalId = Number(req.params.id);

      // ดึง goal พร้อม template สำหรับ validate
      const goalRes = await pool.query(
        `SELECT g.start_date, g.end_date, g.target_minutes,
                t.min_value, t.max_value
         FROM goals g
         JOIN activity_templates t ON t.id = g.template_id
         WHERE g.id = $1`,
        [goalId]
      );
      const goal = goalRes.rows[0];

      // S-1: goal ended → 409 (end_date < today)
      if (goal.end_date < today) {
        return res.status(409).json({ error: 'Conflict' });
      }

      // Validate body (S-3, S-9, BR-02, BR-03)
      const template = { min_value: goal.min_value, max_value: goal.max_value };
      const goalPeriod = { start_date: goal.start_date, end_date: goal.end_date };
      const v = validateEntry(req.body, goalPeriod, template, today);
      if (!v.ok) {
        return res.status(400).json({ error: 'Bad Request', fields: v.fields });
      }

      // INSERT entry — ถ้า duplicate → 23505 → 409 (BR-01, NFR-05)
      try {
        const { rows } = await pool.query(
          `INSERT INTO habit_entries (goal_id, entry_date, minutes)
           VALUES ($1, $2, $3)
           RETURNING id, entry_date, minutes`,
          [goalId, req.body.entry_date, req.body.minutes]
        );
        return res.status(201).json({ entry: rows[0] });
      } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Conflict' }); // S-4
        throw err;
      }
    } catch (err) {
      return next(err);
    }
  }
);

// ── GET /api/goals/:id/progress — ความคืบหน้า (F-06, BR-06) ─────────────
router.get(
  '/:id/progress',
  requireAuth,
  requireRole('participant'),
  ownedBy(goalOwner),
  async (req, res, next) => {
    try {
      const goalId = Number(req.params.id);

      // ดึง target_minutes จาก goal
      const goalRes = await pool.query('SELECT target_minutes FROM goals WHERE id = $1', [goalId]);
      const targetMinutes = goalRes.rows[0].target_minutes;

      // คำนวณยอดรวม
      const sumRes = await pool.query(
        'SELECT COALESCE(SUM(minutes), 0)::integer AS total FROM habit_entries WHERE goal_id = $1',
        [goalId]
      );
      const totalMinutes = sumRes.rows[0].total;

      // S-5: percent 1 ทศนิยม capped ที่ 100.0 (BR-06)
      const rawPercent = targetMinutes > 0 ? (totalMinutes / targetMinutes) * 100 : 0;
      const percent = Math.round(Math.min(rawPercent, 100) * 10) / 10;

      return res.json({
        progress: {
          total_minutes: totalMinutes,
          target_minutes: targetMinutes,
          percent,
        },
      });
    } catch (err) {
      return next(err);
    }
  }
);

// ── GET /api/goals/:id/entries — ประวัติ entry (F-06, FR-10) ─────────────
router.get(
  '/:id/entries',
  requireAuth,
  requireRole('participant'),
  ownedBy(goalOwner),
  async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, entry_date, minutes
         FROM habit_entries
         WHERE goal_id = $1
         ORDER BY entry_date DESC`,
        [Number(req.params.id)]
      );
      return res.json({ entries: rows });
    } catch (err) {
      return next(err);
    }
  }
);

// ── F-11: แก้ไข/ลบ entry (FR-13) ────────────────────────────────────────
// โหลด entry ที่อยู่ใน goal ตาม URL จริง พร้อมข้อมูลที่ใช้ตัดสินว่าแก้ได้ไหม
// คืน null เมื่อ entryId ไม่ใช่จำนวนเต็มบวก / ไม่มี / อยู่ใน goal อื่น → 404 (S-6)
async function loadEntry(req) {
  if (!/^\d{1,9}$/.test(req.params.entryId)) return null;
  const entryId = Number(req.params.entryId);
  if (entryId < 1) return null;
  const { rows } = await pool.query(
    `SELECT e.id, e.entry_date, g.end_date, t.min_value, t.max_value
     FROM habit_entries e
     JOIN goals g ON g.id = e.goal_id
     JOIN activity_templates t ON t.id = g.template_id
     WHERE e.id = $1 AND e.goal_id = $2`,
    [entryId, Number(req.params.id)]
  );
  return rows[0] || null;
}

// S-1: แก้/ลบได้เมื่อ entry_date >= วันนี้ − 7 และ goal ยังไม่จบ (end_date >= วันนี้)
// daysInclusive(entry_date, today) <= 8 ⇔ entry_date >= today − 7 (เหมือน BR-03 ใน validateEntry)
const isEditable = (entry, today) =>
  entry.end_date >= today && daysInclusive(entry.entry_date, today) <= 8;

// ── PATCH /api/goals/:id/entries/:entryId — แก้ minutes (F-11) ──────────
router.patch(
  '/:id/entries/:entryId',
  requireAuth,
  requireRole('participant'),
  ownedBy(goalOwner),
  async (req, res, next) => {
    try {
      const entry = await loadEntry(req);
      if (!entry) return res.status(404).json({ error: 'Not Found' });

      // S-2, S-12: นอกช่วงที่แก้ได้ → 409 ก่อนตรวจค่า
      if (!isEditable(entry, todayBangkok())) {
        return res.status(409).json({ error: 'Conflict' });
      }

      const v = validateEntryUpdate(req.body, { min_value: entry.min_value, max_value: entry.max_value });
      if (!v.ok) {
        return res.status(400).json({ error: 'Bad Request', fields: v.fields });
      }

      // ไม่มี trigger อัปเดต updated_at จึงตั้งเอง; ไม่ส่ง goal_id/created_at/updated_at กลับ (S-8, NFR-06)
      const { rows } = await pool.query(
        `UPDATE habit_entries SET minutes = $1, updated_at = now()
         WHERE id = $2
         RETURNING id, entry_date, minutes`,
        [req.body.minutes, entry.id]
      );
      return res.status(200).json({ entry: rows[0] });
    } catch (err) {
      return next(err);
    }
  }
);

// ── DELETE /api/goals/:id/entries/:entryId — ลบ entry จริง (F-11, S-9) ───
router.delete(
  '/:id/entries/:entryId',
  requireAuth,
  requireRole('participant'),
  ownedBy(goalOwner),
  async (req, res, next) => {
    try {
      const entry = await loadEntry(req);
      if (!entry) return res.status(404).json({ error: 'Not Found' });

      if (!isEditable(entry, todayBangkok())) {
        return res.status(409).json({ error: 'Conflict' });
      }

      await pool.query('DELETE FROM habit_entries WHERE id = $1', [entry.id]);
      return res.status(204).end();
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;

