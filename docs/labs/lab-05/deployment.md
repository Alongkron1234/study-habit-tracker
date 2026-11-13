# Lab 5 Deployment Guide & Architecture

**Project:** Study Habit Tracker  
**Team Members:**  
- Atiwit Thongngoen (67070501048, @atiwit)  
- Alongkorn Kaewprom (67070501050, @Alongkron1234)  

---

## 1. Cloud-Ready Architecture & Checklist (Episode 2)

| # | ข้อกำหนด Cloud Run (Episode 2) | สถานะของ Study Habit Tracker |
|---|---|---|
| 1 | **Uploaded files are not saved in a local folder** | ✅ แอปไม่มีการอัปโหลดไฟล์ลง local disk ของ container |
| 2 | **The seed is safe for production** | ✅ `seed.js` ใช้ hash รหัสผ่านที่ปลอดภัย และสามารถรันซ้ำได้โดยไม่พัง (idempotent) |
| 3 | **No dev shortcuts in production** | ✅ ไม่มี bypass หรือ dev backdoor ใน production ทุกคำขอต้องผ่าน auth/session ปกติ |
| 4 | **Sessions are stored in the database** | ✅ เซสชันเก็บในตาราง `session` ของ PostgreSQL ผ่าน `connect-pg-simple` ไม่หายเมื่อ restart container |
| 5 | **The server reads its port from PORT** | ✅ `src/index.js` อ่าน `process.env.PORT || process.env.APP_PORT || 3000` ตาม Cloud Run runtime contract |
| 6 | **/api/ready exists** | ✅ มี `/api/ready` ทดสอบ `SELECT 1` ต่อ DB หากต่อไม่ได้ส่ง HTTP 503 |

---

## 2. Environment Variables Specification (R-02)

| Variable | Description | Secret? | Source in Cloud / Local | Example Value |
|---|---|---|---|---|
| `NODE_ENV` | Application runtime mode | No | Plain env in Cloud Run / `.env` | `production` / `development` |
| `PORT` | Listening port for Express | No | Assigned by Cloud Run / `.env` | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | Yes | Secret Manager (`study-habit-database-url`) / `.env` | `postgresql://user:pass@localhost/dbname?host=/cloudsql/...` |
| `SESSION_SECRET` | Session cookie encryption secret | Yes | Secret Manager (`study-habit-session-secret`) / `.env` | `random-strong-secret` |
| `SESSION_TTL_HOURS` | Session expiry time in hours | No | Plain env in Cloud Run / `.env` | `8` |
| `COOKIE_SECURE` | Session cookie `Secure` flag (needs HTTPS or trust proxy) | No | Plain env: `true` in Cloud Run, `false` in docker compose | `true` |
| `RUN_SEED` | Run demo seed at container start (production entrypoint). Never `true` on the real database | No (default `false`) | Plain env; docker compose sets `true` on `migrate` only | `false` |
| `DB_PORT` / `APP_PORT` | Host ports published by docker compose (defaults 5433 / 3002) | No | `.env` (local only) | `5433` |
| `TZ` | System timezone | No | Plain env in Cloud Run | `Asia/Bangkok` |
| `USER_USERNAME` / `USER_EMAIL` / `USER_ROLE` | First user created by `create-user.js` (only in the `study-habit-create-user` job) | No | Plain env in the job | `admin_pm` / `pm` |
| `USER_PASSWORD` | Password of that user (min. 12 characters). Each user has its own secret: `study-habit-admin-password` (PM) and `study-habit-participant-password` (participant) | Yes | Secret Manager, create-user jobs only | — |
| `DB_POOL_MAX` | Max DB connections per instance (default 10). Cloud Run sets 5: `db-f1-micro` allows ~25 connections in total, 3 instances × 5 = 15 | No | Plain env in Cloud Run / `.env` | `5` |

---

## 3. Differences from the Lab Reference Stack

The Lab 5 starter kit is written for TokTickIT (Prisma, separate `client/` and `server/`). This app differs, so these parts of the kit were adapted:

| Topic | Starter kit (TokTickIT) | Study Habit Tracker |
|---|---|---|
| Layout | `client/` + `server/` | `frontend/` (React + Vite) + `backend/` (Express); one root `Dockerfile` serves both on port 3000 |
| Migration | `npx prisma migrate deploy` | `node src/db/migrate.js` (SQL files, tracked in `schema_migrations`) |
| Tests | Vitest + Prisma | Jest (backend, needs `TEST_DATABASE_URL`) + Vitest (frontend) |
| Seed in the cloud | Non-destructive seed | **None.** `seed.js` creates demo accounts with public passwords, so `RUN_SEED=false` on the migrate job and the service |
| Users | Admin created by seed | `create-user.js` in one Cloud Run job per user (a PM and a participant), each with its own password secret |
| Auth | Token in the response body | Session cookie (`connect.sid`), `Secure` behind Cloud Run (`trust proxy`) |
| Health endpoints | `/api/health` | `/health` and `/api/ready` |

---

## 4. Cloud Resources (Episode 5)

Project `cpe334-toktickit` (the project ID was chosen in Episode 1 and cannot be renamed; every resource inside it is named `study-habit-*`), region `asia-southeast1`. Created by `deploy/deploy.sh` (idempotent) and removed by `deploy/teardown.sh`.

| Resource | Name |
|---|---|
| Cloud Run service | `study-habit` |
| Cloud Run jobs | `study-habit-migrate`, `study-habit-create-user` (PM `admin_pm`), `study-habit-create-participant` (`demo_participant`) |
| Cloud SQL (PostgreSQL 16, `db-f1-micro`) | `study-habit-pg`, database/user `study_habit` |
| Artifact Registry (Docker) | `study-habit` |
| Runtime service account | `study-habit-runner` (`cloudsql.client` + `secretAccessor` per secret only) |
| Secrets | `study-habit-database-url`, `study-habit-session-secret`, `study-habit-admin-password`, `study-habit-participant-password` |

### First deployment

Run from the repository root (Cloud Shell works; `gcloud` must point at the right project):

```bash
gcloud config get-value project
DRY_RUN=1 bash deploy/deploy.sh      # preview, no GCP calls
bash deploy/deploy.sh                # create everything (Cloud SQL takes several minutes)
```

Order inside the script: enable APIs → Artifact Registry → Cloud SQL → database → service account → secrets → build image → **migrate job (must succeed)** → create-user jobs → deploy service. If the migration fails the service is not deployed. The script is safe to re-run: existing resources, secrets and users are kept.

Concurrent instance starts are safe: `migrate.js` takes a PostgreSQL advisory lock, so only one instance applies a migration at a time.

### Verify

```bash
SERVICE_URL=$(gcloud run services describe study-habit --region asia-southeast1 --format='value(status.url)')
SMOKE_USERNAME=admin_pm \
SMOKE_PASSWORD=$(gcloud secrets versions access latest --secret=study-habit-admin-password) \
python3 deploy/smoke_test.py "$SERVICE_URL"
```

Checks `/health`, `/api/ready`, `/`, a JSON 404 for unknown `/api/*` routes, and login → `/api/auth/me` → logout. Never paste the password into screenshots or the repo.

### Users

Two accounts are created, each by its own job and with its own password secret, so the PM and participant roles are really separate:

| Role | Username | Password secret |
|---|---|---|
| `pm` | `admin_pm` | `study-habit-admin-password` |
| `participant` | `demo_participant` | `study-habit-participant-password` |

`create-user.js` never overwrites an existing user, so re-running `deploy.sh` does not reset a password. To add another user, add a password secret, grant access to it, and call `create_user_job` in `deploy/deploy.sh`. Do not reuse another user's secret.

Log in as the participant when you demo the participant flows:

```bash
SMOKE_USERNAME=demo_participant \
SMOKE_PASSWORD=$(gcloud secrets versions access latest --secret=study-habit-participant-password) \
python3 deploy/smoke_test.py "$SERVICE_URL"
```

### Cost

Cloud SQL bills while it runs. Pause or delete it when not in use (Episode 9), or run `bash deploy/teardown.sh` to remove everything.
