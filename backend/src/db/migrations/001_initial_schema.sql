-- Migration: 001_initial_schema.sql
-- Creates all core tables with constraints
-- Closes: AC-F07-01 (persistence), AC-F07-02 (unique constraint)
-- Requirements: NFR-04, NFR-05

-- ───────────────────────────────────────────────────────────────
-- users
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  username   VARCHAR(50)  NOT NULL UNIQUE,
  email      VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT      NOT NULL,
  role       VARCHAR(20)  NOT NULL DEFAULT 'participant'
                CHECK (role IN ('pm', 'participant')),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- activity_templates
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_templates (
  id         SERIAL PRIMARY KEY,
  created_by INTEGER      NOT NULL REFERENCES users(id),
  name       VARCHAR(100) NOT NULL,
  unit       VARCHAR(20)  NOT NULL DEFAULT 'minutes',  -- BR-09: หน่วยคงที่ = นาที
  min_value  INTEGER      NOT NULL DEFAULT 0
                CHECK (min_value >= 0),
  max_value  INTEGER      NOT NULL DEFAULT 960          -- BR-02: max 960 นาที (16 ชม.)
                CHECK (max_value > min_value),
  is_archived BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- goals
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goals (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER     NOT NULL REFERENCES users(id),
  template_id INTEGER     NOT NULL REFERENCES activity_templates(id),
  target_minutes INTEGER  NOT NULL
                CHECK (target_minutes > 0),             -- BR-04: ยอดเป้าหมาย > 0
  start_date  DATE        NOT NULL,
  end_date    DATE        NOT NULL
                CHECK (end_date >= start_date),          -- BR-04: end_date >= start_date
  status      VARCHAR(20) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'ended')),   -- BR-05
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- BR-05: ไม่เกิน 1 active goal ต่อ user ต่อ template
  UNIQUE NULLS NOT DISTINCT (user_id, template_id, status)
);
-- แยก partial index เพื่อรองรับ UNIQUE ของ active goal เท่านั้น
-- (ใช้แทน UNIQUE NULLS NOT DISTINCT ใน PostgreSQL < 15)
CREATE UNIQUE INDEX IF NOT EXISTS uq_goals_active
  ON goals (user_id, template_id)
  WHERE status = 'active';                              -- BR-05

-- ───────────────────────────────────────────────────────────────
-- habit_entries
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS habit_entries (
  id          SERIAL PRIMARY KEY,
  goal_id     INTEGER     NOT NULL REFERENCES goals(id),
  user_id     INTEGER     NOT NULL REFERENCES users(id),
  entry_date  DATE        NOT NULL,
  minutes     INTEGER     NOT NULL
                CHECK (minutes >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NFR-05 / BR-01: บันทึกได้ 1 ครั้งต่อวันต่อเป้าหมาย (ป้องกัน concurrent)
  CONSTRAINT uq_habit_entries_goal_date UNIQUE (goal_id, entry_date)
);
