/**
 * persistence.test.js
 *
 * Tests for NFR-04, NFR-05 (unique constraint), BR-01, BR-02, BR-05, D-07.
 * Verifies:
 *   - TEST-F07-01: data written to DB persists after full pool shutdown and reconnect (simulates restart, NFR-04, AC-F07-01)
 *   - TEST-F07-02a: initial habit entry insert succeeds (NFR-05, BR-01, AC-F07-02)
 *   - TEST-F07-02b: duplicate (goal_id, entry_date) is rejected by DB constraint with code '23505' (NFR-05, BR-01, AC-F07-02)
 *   - TEST-F07-02c: different entry dates on the same goal both succeed (NFR-05, BR-01, AC-F07-02)
 *   - TEST-F07-03: seed data execution is idempotent across multiple runs (AC-F07-03)
 *   - TEST-F07-04a: minutes = 0 is rejected by DB check constraint with code '23514' (BR-02, D-07, AC-F07-04)
 *   - TEST-F07-04b: minutes = 1 (minimum allowed) is accepted (BR-02, AC-F07-04)
 *   - TEST-F07-04c: minutes = 960 (platform ceiling) is accepted (BR-02, AC-F07-04)
 *   - TEST-F07-04d: minutes = 961 (above platform ceiling) is rejected with code '23514' (BR-02, AC-F07-04)
 *   - TEST-F07-05a: multiple ended goals for the same user and template are allowed (BR-05, AC-F07-05)
 *   - TEST-F07-05b: second active goal on the same template is rejected with code '23505' (BR-05, AC-F07-05)
 *
 * Requirements:
 *   - Must specify TEST_DATABASE_URL in .env.test. Does NOT fallback to DATABASE_URL to prevent data loss.
 *   - Run with: npm test
 */
jest.setTimeout(30000);

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env.test') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

const { Pool } = require('pg');
const seed = require('../src/db/seeds/seed');

// ไม่อนุญาตให้ fallback ไป DATABASE_URL เด็ดขาด เพื่อป้องกันการลบข้อมูลใน Dev/Production DB
const TEST_DB_URL = process.env.TEST_DATABASE_URL;

if (!TEST_DB_URL) {
  throw new Error(
    '[FATAL] TEST_DATABASE_URL is not set. Refusing to run tests against default database to prevent accidental data loss. Please configure TEST_DATABASE_URL in backend/.env.test'
  );
}

let pool;

async function globalCleanup(p) {
  const c = await p.connect();
  try {
    await c.query(`DELETE FROM habit_entries WHERE goal_id IN (
      SELECT id FROM goals WHERE user_id IN (
        SELECT id FROM users WHERE username LIKE 'test_%'
      )
    )`);
    await c.query(`DELETE FROM goals WHERE user_id IN (
      SELECT id FROM users WHERE username LIKE 'test_%'
    )`);
    await c.query(`DELETE FROM activity_templates WHERE name LIKE '__test_%'`);
    await c.query(`DELETE FROM users WHERE username LIKE 'test_%'`);
  } finally {
    c.release();
  }
}

beforeAll(async () => {
  pool = new Pool({ connectionString: TEST_DB_URL });
  await globalCleanup(pool);
});

afterAll(async () => {
  if (pool) {
    await globalCleanup(pool);
    await pool.end();
  }
});

// ───── Helper: ล้างข้อมูลเฉพาะที่ขึ้นต้นด้วย prefix ทดสอบ ─────
async function cleanupTestData(client, label) {
  const userPattern = `test_${label}%`;
  const tmplPattern = `__test_${label}%`;
  await client.query(`DELETE FROM habit_entries WHERE goal_id IN (
    SELECT id FROM goals WHERE user_id IN (
      SELECT id FROM users WHERE username LIKE $1
    )
  )`, [userPattern]);
  await client.query(`DELETE FROM goals WHERE user_id IN (
    SELECT id FROM users WHERE username LIKE $1
  )`, [userPattern]);
  await client.query(`DELETE FROM activity_templates WHERE name LIKE $1`, [tmplPattern]);
  await client.query(`DELETE FROM users WHERE username LIKE $1`, [userPattern]);
  // เก็บกวาดชื่อย่อ legacy หากมีค้าง
  if (label === 'minutes_bnd') {
    await client.query(`DELETE FROM users WHERE username LIKE 'test_bnd_%'`);
  }
  if (label === 'goal_status') {
    await client.query(`DELETE FROM users WHERE username LIKE 'test_gs_%'`);
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST-F07-01: Data persistence across pool restart (NFR-04, AC-F07-01)
// ═══════════════════════════════════════════════════════════════
describe('TEST-F07-01 — NFR-04 data persistence across restart', () => {
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

  test('TEST-F07-01: row written to DB persists after full pool shutdown and reconnect', async () => {
    // ── Process 1: บันทึกข้อมูลแล้วปิด connection pool ทั้งหมด (จำลอง process exit / restart) ──
    const poolA = new Pool({ connectionString: TEST_DB_URL });
    await poolA.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, 'participant')`,
      [USERNAME, 'persist@example.com', '$2b$10$fakehashabcdefghijklmnopqrstuv']
    );
    await poolA.end(); // ปิด pool ทั้งหมดโดยสมบูรณ์

    // ── Process 2: เริ่มต้น pool ใหม่ขึ้นมา (จำลองแอปเปิดใหม่หลังรีสตาร์ต) ──
    const poolB = new Pool({ connectionString: TEST_DB_URL });
    const { rows } = await poolB.query(
      'SELECT username FROM users WHERE username = $1',
      [USERNAME]
    );
    await poolB.end();

    expect(rows).toHaveLength(1);
    expect(rows[0].username).toBe(USERNAME);
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST-F07-02: Unique constraint on (goal_id, entry_date) (NFR-05, BR-01, AC-F07-02)
// ═══════════════════════════════════════════════════════════════
describe('TEST-F07-02 — NFR-05 / BR-01 unique constraint (goal_id, entry_date)', () => {
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

  test('TEST-F07-02a: initial habit entry insert succeeds', async () => {
    const c = await pool.connect();
    const { rows } = await c.query(
      `INSERT INTO habit_entries (goal_id, entry_date, minutes)
       VALUES ($1, CURRENT_DATE, 30) RETURNING id`,
      [goalId]
    );
    c.release();
    expect(rows[0].id).toBeDefined();
  });

  test('TEST-F07-02b: duplicate (goal_id, entry_date) is rejected by DB constraint with code 23505', async () => {
    const c = await pool.connect();
    await c.query(
      `INSERT INTO habit_entries (goal_id, entry_date, minutes)
       VALUES ($1, CURRENT_DATE, 30)`,
      [goalId]
    );

    let error;
    try {
      await c.query(
        `INSERT INTO habit_entries (goal_id, entry_date, minutes)
         VALUES ($1, CURRENT_DATE, 60)`,
        [goalId]
      );
    } catch (err) {
      error = err;
    } finally {
      c.release();
    }

    expect(error).toBeDefined();
    // 23505 = unique_violation ใน PostgreSQL
    expect(error.code).toBe('23505');
  });

  test('TEST-F07-02c: different entry dates on the same goal both succeed', async () => {
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
// TEST-F07-03: Seed data idempotency (AC-F07-03)
// ═══════════════════════════════════════════════════════════════
describe('TEST-F07-03 — Seed data idempotency (AC-F07-03)', () => {
  test('TEST-F07-03: running seed logic twice does not duplicate records', async () => {
    // รัน seed ครั้งที่ 1
    await seed(pool);

    const c = await pool.connect();
    const countUsers1 = await c.query("SELECT COUNT(*) AS cnt FROM users WHERE username IN ('pm_alice', 'participant_bob', 'participant_carol')");
    const countTmpl1  = await c.query("SELECT COUNT(*) AS cnt FROM activity_templates WHERE name = 'Reading Practice'");
    const countGoals1 = await c.query("SELECT COUNT(*) AS cnt FROM goals WHERE status = 'active'");
    const countEntries1 = await c.query("SELECT COUNT(*) AS cnt FROM habit_entries");

    // รัน seed ครั้งที่ 2 ซ้ำ
    await seed(pool);

    const countUsers2 = await c.query("SELECT COUNT(*) AS cnt FROM users WHERE username IN ('pm_alice', 'participant_bob', 'participant_carol')");
    const countTmpl2  = await c.query("SELECT COUNT(*) AS cnt FROM activity_templates WHERE name = 'Reading Practice'");
    const countGoals2 = await c.query("SELECT COUNT(*) AS cnt FROM goals WHERE status = 'active'");
    const countEntries2 = await c.query("SELECT COUNT(*) AS cnt FROM habit_entries");
    c.release();

    // จำนวนแถวต้องเท่าเดิม ไม่เพิ่มขึ้น
    expect(countUsers2.rows[0].cnt).toBe(countUsers1.rows[0].cnt);
    expect(countTmpl2.rows[0].cnt).toBe(countTmpl1.rows[0].cnt);
    expect(countGoals2.rows[0].cnt).toBe(countGoals1.rows[0].cnt);
    expect(countEntries2.rows[0].cnt).toBe(countEntries1.rows[0].cnt);
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST-F07-04: Habit entry minutes boundary constraints (BR-02, D-07, AC-F07-04)
// ═══════════════════════════════════════════════════════════════
describe('TEST-F07-04 — habit_entries minutes boundaries (BR-02, D-07, AC-F07-04)', () => {
  let goalId;
  const LABEL = 'minutes_bnd';

  beforeEach(async () => {
    const c = await pool.connect();
    await cleanupTestData(c, LABEL);

    const pm = await c.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ('test_minutes_bnd_pm', 'bpm@test.com', '$2b$10$fakehashabcdefghijklmnopq', 'pm')
       RETURNING id`
    );
    const p1 = await c.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ('test_minutes_bnd_p1', 'bp1@test.com', '$2b$10$fakehashabcdefghijklmnopq', 'participant')
       RETURNING id`
    );
    const tmpl = await c.query(
      `INSERT INTO activity_templates (created_by, name, unit, min_value, max_value)
       VALUES ($1, '__test_minutes_bnd_reading', 'minutes', 1, 960)
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

  test('TEST-F07-04a: minutes = 0 is rejected by DB check constraint with code 23514', async () => {
    const c = await pool.connect();
    let error;
    try {
      await c.query(
        `INSERT INTO habit_entries (goal_id, entry_date, minutes)
         VALUES ($1, CURRENT_DATE, 0)`,
        [goalId]
      );
    } catch (err) {
      error = err;
    } finally {
      c.release();
    }
    expect(error).toBeDefined();
    // 23514 = check_violation ใน PostgreSQL
    expect(error.code).toBe('23514');
  });

  test('TEST-F07-04b: minutes = 1 (minimum allowed) is accepted', async () => {
    const c = await pool.connect();
    const { rows } = await c.query(
      `INSERT INTO habit_entries (goal_id, entry_date, minutes)
       VALUES ($1, CURRENT_DATE, 1) RETURNING id`,
      [goalId]
    );
    c.release();
    expect(rows[0].id).toBeDefined();
  });

  test('TEST-F07-04c: minutes = 960 (platform ceiling) is accepted', async () => {
    const c = await pool.connect();
    const { rows } = await c.query(
      `INSERT INTO habit_entries (goal_id, entry_date, minutes)
       VALUES ($1, CURRENT_DATE, 960) RETURNING id`,
      [goalId]
    );
    c.release();
    expect(rows[0].id).toBeDefined();
  });

  test('TEST-F07-04d: minutes = 961 (above platform ceiling) is rejected with code 23514', async () => {
    const c = await pool.connect();
    let error;
    try {
      await c.query(
        `INSERT INTO habit_entries (goal_id, entry_date, minutes)
         VALUES ($1, CURRENT_DATE, 961)`,
        [goalId]
      );
    } catch (err) {
      error = err;
    } finally {
      c.release();
    }
    expect(error).toBeDefined();
    expect(error.code).toBe('23514');
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST-F07-05: Goals active vs ended status constraint (BR-05, AC-F07-05)
// ═══════════════════════════════════════════════════════════════
describe('TEST-F07-05 — goals active status constraint (BR-05, AC-F07-05)', () => {
  let userId, templateId;
  const LABEL = 'goal_status';

  beforeEach(async () => {
    const c = await pool.connect();
    await cleanupTestData(c, LABEL);

    const pm = await c.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ('test_goal_status_pm', 'gspm@test.com', '$2b$10$fakehashabcdefghijklmnopq', 'pm')
       RETURNING id`
    );
    const p1 = await c.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ('test_goal_status_p1', 'gsp1@test.com', '$2b$10$fakehashabcdefghijklmnopq', 'participant')
       RETURNING id`
    );
    userId = p1.rows[0].id;

    const tmpl = await c.query(
      `INSERT INTO activity_templates (created_by, name, unit, min_value, max_value)
       VALUES ($1, '__test_goal_status_reading', 'minutes', 1, 480)
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

  test('TEST-F07-05a: multiple ended goals for the same user and template are allowed', async () => {
    const c = await pool.connect();
    await c.query(
      `INSERT INTO goals (user_id, template_id, target_minutes, start_date, end_date, status)
       VALUES ($1, $2, 300, CURRENT_DATE - 60, CURRENT_DATE - 30, 'ended')`,
      [userId, templateId]
    );
    const secondEnded = await c.query(
      `INSERT INTO goals (user_id, template_id, target_minutes, start_date, end_date, status)
       VALUES ($1, $2, 400, CURRENT_DATE - 29, CURRENT_DATE - 1, 'ended')
       RETURNING id`,
      [userId, templateId]
    );
    expect(secondEnded.rows[0].id).toBeDefined();

    const activeGoal = await c.query(
      `INSERT INTO goals (user_id, template_id, target_minutes, start_date, end_date, status)
       VALUES ($1, $2, 500, CURRENT_DATE, CURRENT_DATE + 30, 'active')
       RETURNING id`,
      [userId, templateId]
    );
    expect(activeGoal.rows[0].id).toBeDefined();

    c.release();
  });

  test('TEST-F07-05b: second active goal on the same template is rejected with code 23505', async () => {
    const c = await pool.connect();
    await c.query(
      `INSERT INTO goals (user_id, template_id, target_minutes, start_date, end_date, status)
       VALUES ($1, $2, 300, CURRENT_DATE, CURRENT_DATE + 30, 'active')`,
      [userId, templateId]
    );

    let error;
    try {
      await c.query(
        `INSERT INTO goals (user_id, template_id, target_minutes, start_date, end_date, status)
         VALUES ($1, $2, 600, CURRENT_DATE, CURRENT_DATE + 30, 'active')`,
        [userId, templateId]
      );
    } catch (err) {
      error = err;
    } finally {
      c.release();
    }

    expect(error).toBeDefined();
    // 23505 = unique_violation จาก uq_goals_active partial index
    expect(error.code).toBe('23505');
  });
});
