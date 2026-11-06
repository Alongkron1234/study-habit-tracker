/**
 * persistence.test.js
 *
 * Tests for NFR-04 and NFR-05 (unique constraint).
 * Verifies:
 *   - AC-F07-01: data written to DB persists across pool reconnect
 *   - AC-F07-02: (goal_id, entry_date) unique constraint is enforced
 *
 * Uses a real PostgreSQL connection (TEST_DATABASE_URL).
 * Run with: npm test
 *
 * Setup: requires DATABASE_URL (or TEST_DATABASE_URL) pointing to a test DB
 *        with migrations already applied.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.test') });

const { Pool } = require('pg');

// ใช้ TEST_DATABASE_URL ถ้ามี ไม่งั้นใช้ DATABASE_URL
const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

let pool;

beforeAll(() => {
  pool = new Pool({ connectionString: TEST_DB_URL });
});

afterAll(async () => {
  await pool.end();
});

// ───── helper ─────────────────────────────────────────────────
async function cleanupTestData(client, label) {
  await client.query(`DELETE FROM habit_entries WHERE goal_id IN (
    SELECT id FROM goals WHERE user_id IN (
      SELECT id FROM users WHERE username LIKE $1
    )
  )`, [`test_${label}%`]);
  await client.query(`DELETE FROM goals WHERE user_id IN (
    SELECT id FROM users WHERE username LIKE $1
  )`, [`test_${label}%`]);
  await client.query(`DELETE FROM activity_templates WHERE name LIKE $1`,
    [`__test_${label}%`]);
  await client.query(`DELETE FROM users WHERE username LIKE $1`, [`test_${label}%`]);
}

// ═══════════════════════════════════════════════════════════════
// AC-F07-01: data persists across pool reconnect (simulates restart)
// ═══════════════════════════════════════════════════════════════
describe('NFR-04 — data persists after pool reconnect', () => {
  const USERNAME = 'test_persist_user';

  beforeEach(async () => {
    const c = await pool.connect();
    await cleanupTestData(c, 'persist');
    c.release();
  });

  afterEach(async () => {
    const c = await pool.connect();
    await cleanupTestData(c, 'persist');
    c.release();
  });

  test('AC-F07-01: row written in one client is readable from a new client', async () => {
    // ── Write ──
    const clientA = await pool.connect();
    await clientA.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, 'participant')`,
      [USERNAME, 'persist@example.com', '$2b$10$fakehashabcdefghijklmnopqrstuv']
    );
    clientA.release(); // คืน connection (จำลองการ "ปิด" connection เดิม)

    // ── Reconnect & Read (simulates restart) ──
    const clientB = await pool.connect(); // connection ใหม่จาก pool
    const { rows } = await clientB.query(
      'SELECT username FROM users WHERE username = $1',
      [USERNAME]
    );
    clientB.release();

    expect(rows).toHaveLength(1);
    expect(rows[0].username).toBe(USERNAME);
  });
});

// ═══════════════════════════════════════════════════════════════
// AC-F07-02: unique constraint on (goal_id, entry_date) — NFR-05 / BR-01
// ═══════════════════════════════════════════════════════════════
describe('NFR-05 — unique constraint (goal_id, entry_date)', () => {
  let pmId, participantId, templateId, goalId;
  const LABEL = 'unique';

  beforeEach(async () => {
    const c = await pool.connect();
    await cleanupTestData(c, LABEL);

    // สร้างข้อมูลที่จำเป็น
    const pm = await c.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ('test_unique_pm', 'upm@test.com', '$2b$10$fakehashabcdefghijklmnopq', 'pm')
       RETURNING id`
    );
    pmId = pm.rows[0].id;

    const participant = await c.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ('test_unique_p1', 'up1@test.com', '$2b$10$fakehashabcdefghijklmnopq', 'participant')
       RETURNING id`
    );
    participantId = participant.rows[0].id;

    const tmpl = await c.query(
      `INSERT INTO activity_templates (created_by, name, unit, min_value, max_value)
       VALUES ($1, '__test_unique_reading', 'minutes', 1, 480)
       RETURNING id`,
      [pmId]
    );
    templateId = tmpl.rows[0].id;

    const goal = await c.query(
      `INSERT INTO goals (user_id, template_id, target_minutes, start_date, end_date)
       VALUES ($1, $2, 300, CURRENT_DATE - 7, CURRENT_DATE + 30)
       RETURNING id`,
      [participantId, templateId]
    );
    goalId = goal.rows[0].id;

    c.release();
  });

  afterEach(async () => {
    const c = await pool.connect();
    await cleanupTestData(c, LABEL);
    c.release();
  });

  test('AC-F07-02: first insert succeeds', async () => {
    const c = await pool.connect();
    const { rows } = await c.query(
      `INSERT INTO habit_entries (goal_id, user_id, entry_date, minutes)
       VALUES ($1, $2, CURRENT_DATE, 30) RETURNING id`,
      [goalId, participantId]
    );
    c.release();
    expect(rows[0].id).toBeDefined();
  });

  test('AC-F07-02: duplicate (goal_id, entry_date) is rejected by DB constraint', async () => {
    const c = await pool.connect();
    // Insert แรก
    await c.query(
      `INSERT INTO habit_entries (goal_id, user_id, entry_date, minutes)
       VALUES ($1, $2, CURRENT_DATE, 30)`,
      [goalId, participantId]
    );

    // Insert ซ้ำวันเดิม — ต้องโยน error
    await expect(
      c.query(
        `INSERT INTO habit_entries (goal_id, user_id, entry_date, minutes)
         VALUES ($1, $2, CURRENT_DATE, 60)`,
        [goalId, participantId]
      )
    ).rejects.toThrow(/unique/i);

    c.release();
  });

  test('AC-F07-02: different dates on the same goal both succeed', async () => {
    const c = await pool.connect();
    await c.query(
      `INSERT INTO habit_entries (goal_id, user_id, entry_date, minutes)
       VALUES ($1, $2, CURRENT_DATE - 1, 30)`,
      [goalId, participantId]
    );
    await c.query(
      `INSERT INTO habit_entries (goal_id, user_id, entry_date, minutes)
       VALUES ($1, $2, CURRENT_DATE - 2, 45)`,
      [goalId, participantId]
    );
    const { rows } = await c.query(
      'SELECT COUNT(*) AS cnt FROM habit_entries WHERE goal_id = $1',
      [goalId]
    );
    c.release();
    expect(parseInt(rows[0].cnt, 10)).toBe(2);
  });
});
