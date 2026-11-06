/**
 * app.js — สร้าง Express application (ไม่ listen)
 *
 * แยกออกจาก index.js เพื่อให้เทสต์ (supertest) ใช้แอปตัวเดียวกับของจริง
 * ผู้เรียกต้องโหลด environment (dotenv) ก่อน require ไฟล์นี้
 *
 * Requirements: NFR-06 (safe error responses), NFR-07, NFR-08 (no secrets)
 */
const express   = require('express');
const session   = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const pool      = require('./db/db');
const { notFound, errorHandler } = require('./middleware/errors');

/**
 * @param {object} [options]
 * @param {(app: import('express').Express) => void} [options.mountRoutes]
 *        hook สำหรับเพิ่ม route (ใช้ในเทสต์) ก่อน error handler
 */
function createApp(options = {}) {
  // Fail-fast หากไม่ได้ตั้งค่า SESSION_SECRET (จำเป็นต่อความปลอดภัยของ Session)
  if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET environment variable is required.');
  }

  const app = express();

  // ─── Middleware ────────────────────────────────────────────────
  app.use(express.json());

  app.use(session({
    store: new pgSession({ pool, tableName: 'session' }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: false, // S-3: อายุคงที่ นับจาก login ไม่ต่ออายุเมื่อใช้งาน
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: (parseInt(process.env.SESSION_TTL_HOURS, 10) || 8) * 60 * 60 * 1000,
    },
  }));

  // ─── Health check ──────────────────────────────────────────────
  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', db: 'connected' });
    } catch {
      res.status(503).json({ status: 'error', db: 'unreachable' });
    }
  });

  // ─── Feature routers ───────────────────────────────────────────
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/templates', require('./routes/templates'));
  app.use('/api/goals',     require('./routes/goals'));
  // (mounted by later branches)
  // app.use('/api/entries',   require('./routes/entries'));

  if (typeof options.mountRoutes === 'function') {
    options.mountRoutes(app);
  }

  // ─── 404 และ error handler (NFR-06 — รูปแบบ error ที่ปลอดภัย) ──
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
