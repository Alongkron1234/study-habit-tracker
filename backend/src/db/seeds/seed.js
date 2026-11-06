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
 * Requirements: NFR-07 (ready-to-demo), NFR-08 (no secrets in git)
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const bcrypt = require('bcrypt');
const pool   = require('../db');

const SALT_ROUNDS = 10;

// รหัสผ่าน synthetic สำหรับ demo เท่านั้น (ดู README สำหรับ plaintext)
const SEED_USERS = [
  { username: 'pm_alice',         email: 'alice@example.com',  role: 'pm',          plain: 'Demo@Alice1' },
  { username: 'participant_bob',  email: 'bob@example.com',    role: 'participant', plain: 'Demo@Bob123' },
  { username: 'participant_carol',email: 'carol@example.com',  role: 'participant', plain: 'Demo@Carol1' },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ───── users ─────
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

    // ───── activity_templates (PM สร้าง) ─────
    const templateRows = await client.query(
      `INSERT INTO activity_templates (created_by, name, unit, min_value, max_value)
       VALUES ($1, 'Reading Practice', 'minutes', 1, 480)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [userIds['pm_alice']]
    );

    let templateId;
    if (templateRows.rows.length > 0) {
      templateId = templateRows.rows[0].id;
      console.log(`[seed] template created: id=${templateId}`);
    } else {
      const { rows } = await client.query(
        `SELECT id FROM activity_templates WHERE name = 'Reading Practice' AND created_by = $1 LIMIT 1`,
        [userIds['pm_alice']]
      );
      templateId = rows[0].id;
      console.log(`[seed] template already exists: id=${templateId}`);
    }

    // ───── goals (Participant ตั้งเป้า) ─────
    for (const username of ['participant_bob', 'participant_carol']) {
      const userId = userIds[username];
      const { rows } = await client.query(
        `INSERT INTO goals (user_id, template_id, target_minutes, start_date, end_date)
         VALUES ($1, $2, 600, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days')
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [userId, templateId]
      );
      if (rows.length > 0) {
        const goalId = rows[0].id;
        console.log(`[seed] goal created for ${username}: id=${goalId}`);

        // habit_entries sample (3 วันย้อนหลัง)
        const sampleMinutes = [30, 45, 60];
        for (let i = 0; i < sampleMinutes.length; i++) {
          await client.query(
            `INSERT INTO habit_entries (goal_id, user_id, entry_date, minutes)
             VALUES ($1, $2, CURRENT_DATE - $3, $4)
             ON CONFLICT (goal_id, entry_date) DO NOTHING`,
            [goalId, userId, i + 1, sampleMinutes[i]]
          );
        }
        console.log(`[seed] sample entries inserted for ${username}`);
      }
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

