/**
 * db.js — shared PostgreSQL pool
 * Reads DATABASE_URL from environment (loaded by dotenv in entry-point)
 * Requirements: NFR-04 (data survives restart — pool reconnects on startup)
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('[db] idle client error', err.message);
});

module.exports = pool;
