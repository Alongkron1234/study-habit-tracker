/**
 * app.js — สร้าง Express application (ไม่ listen)
 *
 * แยกออกจาก index.js เพื่อให้เทสต์ (supertest) ใช้แอปตัวเดียวกับของจริง
 * ผู้เรียกต้องโหลด environment (dotenv) ก่อน require ไฟล์นี้
 *
 * Requirements: NFR-06 (safe error responses), NFR-07, NFR-08 (no secrets)
 * Lab 5 R-03: Express serves built React SPA from /app/frontend/dist (production)
 */
const path      = require('path');
const express   = require('express');
const session   = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const pool      = require('./db/db');
const { notFound, errorHandler } = require('./middleware/errors');

// Path ที่ Dockerfile วาง built React SPA ไว้ (ใช้เฉพาะ production container)
const SPA_DIR = path.resolve(__dirname, '../../frontend/dist');

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

  // Ready check for Cloud Run & smoke tests (Lab 5 Episode 2)
  app.get('/api/ready', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ready', db: 'connected' });
    } catch {
      res.status(503).json({ status: 'not_ready' });
    }
  });

  // ─── Feature routers ───────────────────────────────────────────
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/templates', require('./routes/templates'));
  app.use('/api/goals',     require('./routes/goals'));
  app.use('/api/goals',     require('./routes/entries')); // F-05/F-06: /:id/entries, /:id/progress

  if (typeof options.mountRoutes === 'function') {
    options.mountRoutes(app);
  }

  // ─── Static SPA (production เท่านั้น — Lab 5 R-03) ──────────────
  // เสิร์ฟ built React SPA ที่ Dockerfile วางไว้ที่ /app/frontend/dist
  // ต้องอยู่หลัง /api routes ทั้งหมดเสมอ
  if (process.env.NODE_ENV === 'production') {
    const fs = require('fs');
    if (fs.existsSync(SPA_DIR)) {
      app.use(express.static(SPA_DIR));
      // SPA fallback: ทุก route ที่ไม่ใช่ /api ให้ส่ง index.html
      app.get('*', (_req, res) => {
        res.sendFile(path.join(SPA_DIR, 'index.html'));
      });
    }
  }

  // ─── 404 และ error handler (NFR-06 — รูปแบบ error ที่ปลอดภัย) ──
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
