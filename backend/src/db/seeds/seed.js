/**
 * seed.js — idempotent seed data for dev/test/demo
 *
 * Seed data (SRS §8):
 *   PM:          pm_alice / alice@example.com
 *   Participant: participant_bob / bob@example.com
 *   Participant: participant_carol / carol@example.com
 *
 * Passwords are SYNTHETIC — stored as bcrypt hash only.
 * Never put real passwords here.
 *
 * Usage: node src/db/seeds/seed.js
 *
 * Requirements: NFR-07 (ready-to-demo), NFR-08 (no secrets in git), BR-03 (entries within goal range)
 */
const path = require('path');
const dotenv = require('dotenv');

// โหลด .env จาก backend/ ก่อน ถ้าไม่มีให้ค้นหาที่ repo root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const bcrypt = require('bcrypt');
const pool   = require('../db');

const SALT_ROUNDS = 10;

// รหัสผ่าน synthetic สำหรับ demo เท่านั้น (ดู README สำหรับ plaintext)
const SEED_USERS = [
  { username: 'pm_alice',          email: 'alice@example.com',  role: 'pm',          plain: 'Demo@Alice1' },
  { username: 'participant_bob',   email: 'bob@example.com',    role: 'participant', plain: 'Demo@Bob123' },
  { username: 'participant_carol', email: 'carol@example.com',  role: 'participant', plain: 'Demo@Carol1' },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ───── 1. users (idempotent upsert) ─────
    const userIds = {};
    for (const u of SEED_USERS) {
      const hash = await bcrypt.hash(u.plain, SALT_ROUNDS);
      const { rows } = await client.query(
        `INSERT INTO users (username, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (username) DO UPDATE
           SET email         = EXCLUDED.email,
               password_hash = EXCLUDED.password_hash,
               role          = EXCLUDED.role,
               updated_at    = now()
         RETURNING id`,
        [u.username, u.email, hash, u.role]
      );
      userIds[u.username] = rows[0].id;
      console.log(`[seed] user upserted: ${u.username} (${u.role})`);
    }

    // ───── 2. activity_templates (idempotent check & insert) ─────
    let templateId;
    const existingTmpl = await client.query(
      `SELECT id FROM activity_templates WHERE created_by = $1 AND name = $2 LIMIT 1`,
      [userIds['pm_alice'], 'Reading Practice']
    );

    if (existingTmpl.rows.length > 0) {
      templateId = existingTmpl.rows[0].id;
      console.log(`[seed] template already exists: id=${templateId}`);
    } else {
      const newTmpl = await client.query(
        `INSERT INTO activity_templates (created_by, name, unit, min_value, max_value)
         VALUES ($1, 'Reading Practice', 'minutes', 1, 480)
         RETURNING id`,
        [userIds['pm_alice']]
      );
      templateId = newTmpl.rows[0].id;
      console.log(`[seed] template created: id=${templateId}`);
    }

    // ───── 3. goals & habit_entries (idempotent & BR-03 compliant) ─────
    for (const username of ['participant_bob', 'participant_carol']) {
      const userId = userIds[username];
      let goalId;

      // ค้นหาเป้าหมาย active ที่มีอยู่เดิม
      const existingGoal = await client.query(
        `SELECT id FROM goals WHERE user_id = $1 AND template_id = $2 AND status = 'active' LIMIT 1`,
        [userId, templateId]
      );

      if (existingGoal.rows.length > 0) {
        goalId = existingGoal.rows[0].id;
        console.log(`[seed] goal already exists for ${username}: id=${goalId}`);
      } else {
        // BR-03: ให้ goal เริ่มต้นย้อนหลัง 7 วัน เพื่อให้ sample entries อยู่ในช่วง [start_date, end_date]
        const newGoal = await client.query(
          `INSERT INTO goals (user_id, template_id, target_minutes, start_date, end_date, status)
           VALUES ($1, $2, 600, CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE + INTERVAL '23 days', 'active')
           RETURNING id`,
          [userId, templateId]
        );
        goalId = newGoal.rows[0].id;
        console.log(`[seed] goal created for ${username}: id=${goalId}`);
      }

      // habit_entries sample (3 วันย้อนหลัง: 1, 2, 3 วันก่อนหน้า)
      // วันที่เหล่านี้อยู่หลัง start_date (7 วันก่อน) ถูกต้องตาม BR-03
      // และไม่เก็บ user_id ซ้ำตาม schema ใหม่
      const sampleMinutes = [30, 45, 60];
      for (let i = 0; i < sampleMinutes.length; i++) {
        const daysAgo = i + 1;
        await client.query(
          `INSERT INTO habit_entries (goal_id, entry_date, minutes)
           VALUES ($1, CURRENT_DATE - $2::int, $3)
           ON CONFLICT (goal_id, entry_date) DO UPDATE
             SET minutes = EXCLUDED.minutes,
                 updated_at = now()`,
          [goalId, daysAgo, sampleMinutes[i]]
        );
      }
      console.log(`[seed] sample entries upserted for ${username}`);
    }

    await client.query('COMMIT');
    console.log('[seed] done');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[seed] ERROR:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
