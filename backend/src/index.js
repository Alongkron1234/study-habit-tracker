/**
 * index.js — Express application entry-point (skeleton for Sprint 1)
 *
 * This file wires up environment, DB pool, session, and a health-check
 * endpoint. Feature routers (auth, templates, goals, entries) will be
 * mounted in later branches.
 *
 * Requirements: NFR-07 (runs with one command), NFR-08 (no secrets)
 */
require('dotenv').config();

const express      = require('express');
const session      = require('express-session');
const pgSession    = require('connect-pg-simple')(session);
const pool         = require('./db/db');

const app  = express();
const PORT = process.env.APP_PORT || 3000;

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
// app.use('/api/auth',      require('./routes/auth'));
// app.use('/api/templates', require('./routes/templates'));
// app.use('/api/goals',     require('./routes/goals'));
// app.use('/api/entries',   require('./routes/entries'));

// ─── Global error handler (NFR-06 — safe error format) ────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

app.listen(PORT, () => {
  console.log(`[app] running on port ${PORT}`);
});

module.exports = app; // exported for supertest

