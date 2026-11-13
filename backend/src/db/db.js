/**
 * db.js — shared PostgreSQL pool
 * Reads DATABASE_URL from environment (loaded by dotenv in entry-point)
 * Requirements: NFR-04 (data survives restart — pool reconnects on startup)
 */
const { Pool, types } = require('pg');

// S-11: คืนค่า DATE (oid 1082) เป็นสตริง YYYY-MM-DD ไม่แปลงเป็น Date เพื่อกันวันเลื่อนจากเขตเวลา
types.setTypeParser(1082, (v) => v);

// DB_POOL_MAX จำกัดจำนวน connection ต่อ instance (Cloud SQL db-f1-micro รับได้ ~25
// รวมทุก instance) — ค่าเริ่มต้นของ pg คือ 10
const poolMax = parseInt(process.env.DB_POOL_MAX, 10);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(poolMax > 0 ? { max: poolMax } : {}),
});

pool.on('error', (err) => {
  console.error('[db] idle client error', err.message);
});

module.exports = pool;

