/**
 * auth.js — F-01 login / logout / me
 *
 * Contract: docs/sprints/sprint-1/F-01-F-02-auth-rbac.md
 * Requirements: FR-01, FR-02, FR-03, NFR-02, NFR-03
 */
const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// S-2: เทียบกับ hash หลอกเมื่อไม่พบ username เพื่อให้เวลาตอบใกล้เคียงกันทั้งสองกรณี
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing-only', 10);

const GENERIC_LOGIN_ERROR = { error: 'Invalid username or password' };

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (
      typeof username !== 'string' || username === '' ||
      typeof password !== 'string' || password === ''
    ) {
      return res.status(400).json({ error: 'Bad Request' });
    }

    const { rows } = await pool.query(
      'SELECT id, username, password_hash, role FROM users WHERE username = $1',
      [username]
    );
    const user = rows[0];
    const passwordOk = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

    if (!user || !passwordOk) {
      return res.status(401).json(GENERIC_LOGIN_ERROR); // S-1: ข้อความเดียวกันทุกกรณี
    }

    // S-4: ออก session id ใหม่ทุกครั้งที่ login (กัน session fixation)
    req.session.regenerate((regenErr) => {
      if (regenErr) return next(regenErr);
      req.session.user = { id: user.id, username: user.username, role: user.role };
      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        return res.json({ user: req.session.user });
      });
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/logout', requireAuth, (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    return res.sendStatus(204);
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});

module.exports = router;
