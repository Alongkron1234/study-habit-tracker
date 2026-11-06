-- Migration: 002_session_store.sql
-- Creates table for express-session (connect-pg-simple)
-- Requirements: NFR-01, NFR-03

CREATE TABLE IF NOT EXISTS session (
  sid    VARCHAR      NOT NULL PRIMARY KEY,
  sess   JSON         NOT NULL,
  expire TIMESTAMPTZ  NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);
