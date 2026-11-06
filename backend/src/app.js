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
    cookie: {
      httpOnly: true,
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

  // ─── Feature routers (mounted by later branches) ───────────────
  // app.use('/api/templates', require('./routes/templates'));
  // app.use('/api/goals',     require('./routes/goals'));
  // app.use('/api/entries',   require('./routes/entries'));

  if (typeof options.mountRoutes === 'function') {
    options.mountRoutes(app);
  }

  // ─── Global error handler (NFR-06 — safe error format) ────────
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status && Number.isInteger(err.status) ? err.status : 500;

    // Log ข้อผิดพลาดจริงฝั่งเซิร์ฟเวอร์เท่านั้น
    console.error('[server error]', err);

    // NFR-06: หากเป็น 500 หรือ server error ให้ตอบข้อความกลางๆ เสมอ เพื่อไม่เปิดเผยข้อมูลภายใน
    if (status >= 500) {
      return res.status(500).json({
        error: 'Internal Server Error',
      });
    }

    // Client errors (4xx) ตอบข้อความ error ปลอดภัย
    return res.status(status).json({
      error: err.message || 'Bad Request',
    });
  });

  return app;
}

module.exports = { createApp };
