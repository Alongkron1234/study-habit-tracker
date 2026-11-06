/**
 * persistence.test.js
 *
 * Tests for NFR-04, NFR-05 (unique constraint), BR-01, BR-02, BR-05, D-07.
 * Verifies:
 *   - AC-F07-01: data written to DB persists across pool reconnect (simulates restart)
 *   - AC-F07-02: (goal_id, entry_date) unique constraint is enforced (NFR-05, BR-01)
 *   - BR-02 / D-07: entry minutes boundary (0 rejected, 1 accepted, 960 accepted, 961 rejected)
 *   - BR-05: only 1 active goal per template allowed, multiple ended goals allowed
 *
 * Uses a real PostgreSQL connection (TEST_DATABASE_URL).
 * Run with: npm test
 */
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env.test') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

const { Pool } = require('pg');

const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

let pool;

beforeAll(() => {
  pool = new Pool({ connectionString: TEST_DB_URL });
});

afterAll(async () => {
  if (pool) {
    await pool.end();
  }
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
    clientA.release(); // คืน connection (จำลองการปิด connection)

    // ── Reconnect & Read (simulates restart) ──
    const clientB = await pool.connect();
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
describe('NFR-05 / BR-01 — unique constraint (goal_id, entry_date)', () => {
  let pmId, participantId, templateId, goalId;
  const LABEL = 'unique';

  beforeEach(async () => {
    const c = await pool.connect();
    await cleanupTestData(c, LABEL);

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
      `INSERT INTO goals (user_id, template_id, target_minutes, start_date, end_date, status)
       VALUES ($1, $2, 300, CURRENT_DATE - 7, CURRENT_DATE + 30, 'active')
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
      `INSERT INTO habit_entries (goal_id, entry_date, minutes)
       VALUES ($1, CURRENT_DATE, 30) RETURNING id`,
      [goalId]
    );
    c.release();
    expect(rows[0].id).toBeDefined();
  });

  test('AC-F07-02: duplicate (goal_id, entry_date) is rejected by DB constraint', async () => {
    const c = await pool.connect();
    await c.query(
      `INSERT INTO habit_entries (goal_id, entry_date, minutes)
       VALUES ($1, CURRENT_DATE, 30)`,
      [goalId]
    );

    await expect(
      c.query(
        `INSERT INTO habit_entries (goal_id, entry_date, minutes)
         VALUES ($1, CURRENT_DATE, 60)`,
        [goalId]
      )
    ).rejects.toThrow(/unique/i);

    c.release();
  });

  test('AC-F07-02: different dates on the same goal both succeed', async () => {
    const c = await pool.connect();
    await c.query(
      `INSERT INTO habit_entries (goal_id, entry_date, minutes)
       VALUES ($1, CURRENT_DATE - 1, 30)`,
      [goalId]
    );
    await c.query(
      `INSERT INTO habit_entries (goal_id, entry_date, minutes)
       VALUES ($1, CURRENT_DATE - 2, 45)`,
      [goalId]
    );
    const { rows } = await c.query(
      'SELECT COUNT(*) AS cnt FROM habit_entries WHERE goal_id = $1',
      [goalId]
    );
    c.release();
    expect(parseInt(rows[0].cnt, 10)).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// BR-02 / D-07: Habit entry minutes boundary constraints
// ═══════════════════════════════════════════════════════════════
describe('BR-02 / D-07 — habit_entries minutes boundaries', () => {
  let goalId;
  const LABEL = 'minutes_bnd';

  beforeEach(async () => {
    const c = await pool.connect();
    await cleanupTestData(c, LABEL);

    const pm = await c.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ('test_bnd_pm', 'bpm@test.com', '$2b$10$fakehashabcdefghijklmnopq', 'pm')
       RETURNING id`
    );
    const p1 = await c.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ('test_bnd_p1', 'bp1@test.com', '$2b$10$fakehashabcdefghijklmnopq', 'participant')
       RETURNING id`
    );
    const tmpl = await c.query(
      `INSERT INTO activity_templates (created_by, name, unit, min_value, max_value)
       VALUES ($1, '__test_bnd_reading', 'minutes', 1, 960)
       RETURNING id`,
      [pm.rows[0].id]
    );
    const goal = await c.query(
      `INSERT INTO goals (user_id, template_id, target_minutes, start_date, end_date, status)
       VALUES ($1, $2, 600, CURRENT_DATE - 7, CURRENT_DATE + 30, 'active')
       RETURNING id`,
      [p1.rows[0].id, tmpl.rows[0].id]
    );
    goalId = goal.rows[0].id;
    c.release();
  });

  afterEach(async () => {
    const c = await pool.connect();
    await cleanupTestData(c, LABEL);
    c.release();
  });

  test('D-07: minutes = 0 is rejected by DB constraint', async () => {
    const c = await pool.connect();
    await expect(
      c.query(
        `INSERT INTO habit_entries (goal_id, entry_date, minutes)
         VALUES ($1, CURRENT_DATE, 0)`,
        [goalId]
      )
    ).rejects.toThrow();
    c.release();
  });

  test('BR-02: minutes = 1 (minimum) is accepted', async () => {
    const c = await pool.connect();
    const { rows } = await c.query(
      `INSERT INTO habit_entries (goal_id, entry_date, minutes)
       VALUES ($1, CURRENT_DATE, 1) RETURNING id`,
      [goalId]
    );
    c.release();
    expect(rows[0].id).toBeDefined();
  });

  test('BR-02: minutes = 960 (maximum platform ceiling) is accepted', async () => {
    const c = await pool.connect();
    const { rows } = await c.query(
      `INSERT INTO habit_entries (goal_id, entry_date, minutes)
       VALUES ($1, CURRENT_DATE, 960) RETURNING id`,
      [goalId]
    );
    c.release();
    expect(rows[0].id).toBeDefined();
  });

  test('BR-02: minutes = 961 (above ceiling) is rejected by DB constraint', async () => {
    const c = await pool.connect();
    await expect(
      c.query(
        `INSERT INTO habit_entries (goal_id, entry_date, minutes)
         VALUES ($1, CURRENT_DATE, 961)`,
        [goalId]
      )
    ).rejects.toThrow();
    c.release();
  });
});

// ═══════════════════════════════════════════════════════════════
// BR-05: Only 1 active goal per template, multiple ended allowed
// ═══════════════════════════════════════════════════════════════
describe('BR-05 — goals active status constraint', () => {
  let userId, templateId;
  const LABEL = 'goal_status';

  beforeEach(async () => {
    const c = await pool.connect();
    await cleanupTestData(c, LABEL);

    const pm = await c.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ('test_gs_pm', 'gspm@test.com', '$2b$10$fakehashabcdefghijklmnopq', 'pm')
       RETURNING id`
    );
    const p1 = await c.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ('test_gs_p1', 'gsp1@test.com', '$2b$10$fakehashabcdefghijklmnopq', 'participant')
       RETURNING id`
    );
    userId = p1.rows[0].id;

    const tmpl = await c.query(
      `INSERT INTO activity_templates (created_by, name, unit, min_value, max_value)
       VALUES ($1, '__test_gs_reading', 'minutes', 1, 480)
       RETURNING id`,
      [pm.rows[0].id]
    );
    templateId = tmpl.rows[0].id;
    c.release();
  });

  afterEach(async () => {
    const c = await pool.connect();
    await cleanupTestData(c, LABEL);
    c.release();
  });

  test('BR-05: multiple ended goals for the same user and template are allowed', async () => {
    const c = await pool.connect();
    // Goal ที่ ended ตัวที่ 1
    await c.query(
      `INSERT INTO goals (user_id, template_id, target_minutes, start_date, end_date, status)
       VALUES ($1, $2, 300, CURRENT_DATE - 60, CURRENT_DATE - 30, 'ended')`,
      [userId, templateId]
    );
    // Goal ที่ ended ตัวที่ 2 บน template เดียวกัน — ต้องทำได้
    const secondEnded = await c.query(
      `INSERT INTO goals (user_id, template_id, target_minutes, start_date, end_date, status)
       VALUES ($1, $2, 400, CURRENT_DATE - 29, CURRENT_DATE - 1, 'ended')
       RETURNING id`,
      [userId, templateId]
    );
    expect(secondEnded.rows[0].id).toBeDefined();

    // และสร้าง active goal ตัวที่ 1 ได้ด้วย
    const activeGoal = await c.query(
      `INSERT INTO goals (user_id, template_id, target_minutes, start_date, end_date, status)
       VALUES ($1, $2, 500, CURRENT_DATE, CURRENT_DATE + 30, 'active')
       RETURNING id`,
      [userId, templateId]
    );
    expect(activeGoal.rows[0].id).toBeDefined();

    c.release();
  });

  test('BR-05: second active goal on the same template is rejected', async () => {
    const c = await pool.connect();
    // สร้าง active goal ตัวแรก
    await c.query(
      `INSERT INTO goals (user_id, template_id, target_minutes, start_date, end_date, status)
       VALUES ($1, $2, 300, CURRENT_DATE, CURRENT_DATE + 30, 'active')`,
      [userId, templateId]
    );

    // พยายามสร้าง active goal ตัวที่ 2 บน template เดียวกัน — ต้องโยน unique violation
    await expect(
      c.query(
        `INSERT INTO goals (user_id, template_id, target_minutes, start_date, end_date, status)
         VALUES ($1, $2, 600, CURRENT_DATE, CURRENT_DATE + 30, 'active')`,
        [userId, templateId]
      )
    ).rejects.toThrow(/unique/i);

    c.release();
  });
});
