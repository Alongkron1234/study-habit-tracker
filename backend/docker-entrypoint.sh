#!/bin/sh
set -e

# ------------------------------------------------------------------------------
# Container entrypoint — Study Habit Tracker (Lab 5 Episode 3)
#
# In production (Cloud Run):
#   1. Runs DB migrations (idempotent — safe on every deploy).
#   2. Runs seed ONLY when RUN_SEED=true (demo accounts; off by default).
#   3. Hands control to CMD (`node src/index.js`) via exec so the app becomes
#      PID 1 and receives SIGTERM from Cloud Run for graceful shutdown.
#
# Ref: https://cloud.google.com/run/docs/container-contract#instance-shutdown
# ------------------------------------------------------------------------------

echo "[entrypoint] NODE_ENV=${NODE_ENV:-development}"

if [ "${NODE_ENV}" = "production" ]; then
  echo "[entrypoint] running DB migrations..."
  node src/db/migrate.js

  # Seed สร้างบัญชี demo ที่รหัสผ่านเปิดเผยได้ → รันเฉพาะเมื่อสั่ง RUN_SEED=true เท่านั้น
  # (ค่าเริ่มต้น = ไม่รัน เพื่อไม่ให้บัญชี demo ไปอยู่ใน database จริงบน Cloud Run)
  if [ "${RUN_SEED:-false}" = "true" ]; then
    echo "[entrypoint] RUN_SEED=true → running seed..."
    node src/db/seeds/seed.js
  else
    echo "[entrypoint] RUN_SEED is not true → skipping seed"
  fi
fi

echo "[entrypoint] starting app..."
exec "$@"

