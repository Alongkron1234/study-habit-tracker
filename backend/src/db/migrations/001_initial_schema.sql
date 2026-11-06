-- Migration: 001_initial_schema.sql
-- Creates all core tables with constraints
-- Closes: AC-F07-01 (persistence), AC-F07-02 (unique constraint)
-- Requirements: NFR-04, NFR-05, BR-01, BR-02, BR-04, BR-05, BR-08, D-07

-- ───────────────────────────────────────────────────────────────
-- users
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'participant'
                  CHECK (role IN ('pm', 'participant')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- activity_templates
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_templates (
  id          SERIAL PRIMARY KEY,
  created_by  INTEGER      NOT NULL REFERENCES users(id),
  name        VARCHAR(100) NOT NULL,
  unit        VARCHAR(20)  NOT NULL DEFAULT 'minutes',  -- BR-09: หน่วยคงที่ = นาที
  -- BR-02: ค่าต่ำสุดต้อง >= 1 นาที และไม่เกินเพดานแพลตฟอร์ม 960 นาที
  min_value   INTEGER      NOT NULL DEFAULT 1
                CHECK (min_value >= 1 AND min_value <= 960),
  -- BR-02: ค่าสูงสุดต้อง >= min_value และไม่เกินเพดานแพลตฟอร์ม 960 นาที
  max_value   INTEGER      NOT NULL DEFAULT 960
                CHECK (max_value >= min_value AND max_value <= 960),
  is_archived BOOLEAN      NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- goals
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goals (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER     NOT NULL REFERENCES users(id),
  template_id    INTEGER     NOT NULL REFERENCES activity_templates(id),
  target_minutes INTEGER     NOT NULL
                   CHECK (target_minutes > 0),             -- BR-04: ยอดเป้าหมาย > 0
  start_date     DATE        NOT NULL,
  end_date       DATE        NOT NULL
                   CHECK (end_date >= start_date),          -- BR-04: end_date >= start_date
  status         VARCHAR(20) NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'ended')),   -- BR-05
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- BR-05: อนุญาตให้มี goal สถานะ 'active' ได้ไม่เกิน 1 เป้าหมายต่อ user ต่อ template
-- (ใช้ Partial Index เพื่อให้ผู้ใช้สามารถมี goal สถานะ 'ended' ซ้ำใน template เดิมได้หลายอัน)
CREATE UNIQUE INDEX IF NOT EXISTS uq_goals_active
  ON goals (user_id, template_id)
  WHERE status = 'active';

-- ───────────────────────────────────────────────────────────────
-- habit_entries
-- ───────────────────────────────────────────────────────────────
-- หมายเหตุ: ไม่เก็บ user_id ซ้ำใน habit_entries เพื่อลดความซ้ำซ้อนตาม 3NF
-- และป้องกันความไม่สอดคล้องกับ goals.user_id (BR-08 ความเป็นเจ้าของข้อมูล)
CREATE TABLE IF NOT EXISTS habit_entries (
  id          SERIAL PRIMARY KEY,
  goal_id     INTEGER     NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  entry_date  DATE        NOT NULL,
  -- BR-02 / D-07: นาทีต้อง >= 1 (ไม่รับ 0 นาที) และไม่เกินเพดานแพลตฟอร์ม 960 นาทีต่อวัน
  minutes     INTEGER     NOT NULL
                CHECK (minutes >= 1 AND minutes <= 960),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NFR-05 / BR-01: หนึ่ง goal บันทึกได้ไม่เกิน 1 ครั้งต่อวัน (ป้องกัน concurrent duplicates)
  CONSTRAINT uq_habit_entries_goal_date UNIQUE (goal_id, entry_date)
);
