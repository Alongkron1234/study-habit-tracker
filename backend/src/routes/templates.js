/**
 * templates.js — F-03 แม่แบบกิจกรรม
 * Contract: docs/sprints/sprint-1/F-03-F-04-templates-goals.md
 * Requirements: FR-04, FR-05, FR-06, BR-02, BR-07, BR-09
 * F-09 (PATCH /:id, POST /:id/archive): docs/sprints/sprint-2/F-09-edit-archive-template.md — FR-11
 */
const express = require('express');
const pool = require('../db/db');
const { requireAuth, requireRole, ownedBy } = require('../middleware/auth');
const { validateTemplate, validateTemplateUpdate } = require('../lib/validate');

const router = express.Router();
const COLUMNS = 'id, name, unit, min_value, max_value, is_archived';

router.post('/', requireAuth, requireRole('pm'), async (req, res, next) => {
  try {
    const v = validateTemplate(req.body);
    if (!v.ok) return res.status(400).json({ error: 'Bad Request', fields: v.fields });

    const { name, min_value, max_value } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO activity_templates (created_by, name, unit, min_value, max_value)
       VALUES ($1, $2, 'minutes', $3, $4) RETURNING ${COLUMNS}`,
      [req.session.user.id, name.trim(), min_value, max_value]
    );
    return res.status(201).json({ template: rows[0] });
  } catch (err) {
    return next(err);
  }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { id, role } = req.session.user;
    const { rows } = role === 'pm'
      ? await pool.query(`SELECT ${COLUMNS} FROM activity_templates WHERE created_by = $1 ORDER BY id`, [id])
      : await pool.query(`SELECT ${COLUMNS} FROM activity_templates WHERE is_archived = false ORDER BY id`);
    return res.json({ templates: rows });
  } catch (err) {
    return next(err);
  }
});

// id ที่ไม่ใช่จำนวนเต็มบวก → loader คืน null → ownedBy ตอบ 404; แม่แบบของ PM คนอื่น → 404 (S-1)
const templateOwner = async (req) => {
  if (!/^\d{1,9}$/.test(req.params.id)) return null;
  const { rows } = await pool.query('SELECT created_by FROM activity_templates WHERE id = $1', [Number(req.params.id)]);
  return rows[0] ? rows[0].created_by : null;
};

// F-09: แก้ name / min_value / max_value (S-11: 401 → 403 → 404 → 409 → 400)
router.patch('/:id', requireAuth, requireRole('pm'), ownedBy(templateOwner), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cur = await pool.query('SELECT min_value, max_value, is_archived FROM activity_templates WHERE id = $1', [id]);
    if (cur.rows[0].is_archived) return res.status(409).json({ error: 'Conflict' }); // S-6

    const v = validateTemplateUpdate(req.body, cur.rows[0]);
    if (!v.ok) return res.status(400).json({ error: 'Bad Request', fields: v.fields });

    const { name, min_value, max_value } = req.body;
    // คำสั่งเดียว: field ที่ไม่ได้ส่งคงค่าเดิม; เงื่อนไข is_archived = false กัน race กับ archive (S-6)
    const { rows } = await pool.query(
      `UPDATE activity_templates
          SET name = COALESCE($2::text, name),
              min_value = COALESCE($3::int, min_value),
              max_value = COALESCE($4::int, max_value),
              updated_at = now()
        WHERE id = $1 AND is_archived = false
        RETURNING ${COLUMNS}`,
      [id, typeof name === 'string' ? name.trim() : null, min_value ?? null, max_value ?? null]
    );
    if (rows.length === 0) return res.status(409).json({ error: 'Conflict' });
    return res.json({ template: rows[0] });
  } catch (err) {
    return next(err);
  }
});

// F-09: archive (idempotent: ซ้ำ → 200 ไม่เปลี่ยน updated_at; ไม่มี un-archive — S-2, S-6)
router.post('/:id/archive', requireAuth, requireRole('pm'), ownedBy(templateOwner), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const upd = await pool.query(
      `UPDATE activity_templates SET is_archived = true, updated_at = now()
        WHERE id = $1 AND is_archived = false RETURNING ${COLUMNS}`,
      [id]
    );
    if (upd.rows[0]) return res.json({ template: upd.rows[0] });
    const { rows } = await pool.query(`SELECT ${COLUMNS} FROM activity_templates WHERE id = $1`, [id]);
    return res.json({ template: rows[0] });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
