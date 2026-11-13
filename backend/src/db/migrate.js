/**
 * migrate.js — run SQL migration files in order
 *
 * Usage: node src/db/migrate.js
 *
 * Maintains a simple `schema_migrations` table to track which files
 * have already been applied (idempotent — safe to run repeatedly).
 *
 * Requirements: NFR-04 (persistent schema), NFR-07 (one-command setup)
 */
const path = require('path');
const dotenv = require('dotenv');

// โหลด .env จาก backend/ ก่อน ถ้าไม่มีให้ค้นหาที่ repo root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const fs   = require('fs');
const pool = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// เลขล็อกโดยพลการ (ใช้ร่วมกันทุก instance) — กัน migration ชนกันเมื่อหลาย
// instance ของ Cloud Run สตาร์ตพร้อมกัน (entrypoint รัน migrate ทุกครั้งที่เริ่ม)
const MIGRATE_LOCK_ID = 7_340_001;

async function migrate() {
  const client = await pool.connect();
  try {
    // รอจนได้ล็อก (session-level) ตัวที่มาทีหลังจะเห็นว่าไฟล์ถูก apply แล้วและข้าม
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATE_LOCK_ID]);

    // สร้างตาราง tracking ถ้ายังไม่มี
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT        NOT NULL PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [file]
      );
      if (rows.length > 0) {
        console.log(`[migrate] skip  ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations(filename) VALUES ($1)',
        [file]
      );
      await client.query('COMMIT');
      console.log(`[migrate] apply ${file}`);
    }

    console.log('[migrate] done');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[migrate] ERROR:', err.message);
    process.exit(1);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATE_LOCK_ID]).catch(() => {});
    client.release();
    await pool.end();
  }
}

migrate();
