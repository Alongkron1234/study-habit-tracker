#!/bin/sh
set -e

# ------------------------------------------------------------------------------
# Container entrypoint — Study Habit Tracker (Lab 5 Episode 3)
#
# In production (Cloud Run):
#   1. Runs DB migrations (idempotent — safe on every deploy).
#   2. Runs seed (idempotent — skips existing rows).
#   3. Hands control to CMD (`node src/index.js`) via exec so the app becomes
#      PID 1 and receives SIGTERM from Cloud Run for graceful shutdown.
#
# Ref: https://cloud.google.com/run/docs/container-contract#instance-shutdown
# ------------------------------------------------------------------------------

echo "[entrypoint] NODE_ENV=${NODE_ENV:-development}"

if [ "${NODE_ENV}" = "production" ]; then
  echo "[entrypoint] running DB migrations..."
  node src/db/migrate.js

  echo "[entrypoint] running seed..."
  node src/db/seeds/seed.js
fi

echo "[entrypoint] starting app..."
exec "$@"

