/**
 * templates.js — F-03 แม่แบบกิจกรรม
 * Contract: docs/sprints/sprint-1/F-03-F-04-templates-goals.md
 * Requirements: FR-04, FR-05, FR-06, BR-02, BR-07, BR-09
 */
const express = require('express');
const pool = require('../db/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validateTemplate } = require('../lib/validate');

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

module.exports = router;
