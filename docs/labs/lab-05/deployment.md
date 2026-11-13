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
| `USER_PASSWORD` | Password of that user (min. 12 characters) | Yes | Secret Manager (`study-habit-admin-password`), job only | — |

---

## 3. Differences from the Lab Reference Stack

The Lab 5 starter kit is written for TokTickIT (Prisma, separate `client/` and `server/`). This app differs, so these parts of the kit were adapted:

| Topic | Starter kit (TokTickIT) | Study Habit Tracker |
|---|---|---|
| Layout | `client/` + `server/` | `frontend/` (React + Vite) + `backend/` (Express); one root `Dockerfile` serves both on port 3000 |
| Migration | `npx prisma migrate deploy` | `node src/db/migrate.js` (SQL files, tracked in `schema_migrations`) |
| Tests | Vitest + Prisma | Jest (backend, needs `TEST_DATABASE_URL`) + Vitest (frontend) |
| Seed in the cloud | Non-destructive seed | **None.** `seed.js` creates demo accounts with public passwords, so `RUN_SEED=false` on the migrate job and the service |
| First user | Admin created by seed | `create-user.js` in a Cloud Run job, password from Secret Manager |
| Auth | Token in the response body | Session cookie (`connect.sid`), `Secure` behind Cloud Run (`trust proxy`) |
| Health endpoints | `/api/health` | `/health` and `/api/ready` |

---

## 4. Cloud Resources (Episode 5)

Project `cpe334-toktickit`, region `asia-southeast1`. Created by `deploy/deploy.sh` (idempotent) and removed by `deploy/teardown.sh`.

| Resource | Name |
|---|---|
| Cloud Run service | `study-habit` |
| Cloud Run jobs | `study-habit-migrate`, `study-habit-create-user` |
| Cloud SQL (PostgreSQL 16, `db-f1-micro`) | `study-habit-pg`, database/user `study_habit` |
| Artifact Registry (Docker) | `study-habit` |
| Runtime service account | `study-habit-runner` (`cloudsql.client` + `secretAccessor` per secret only) |
| Secrets | `study-habit-database-url`, `study-habit-session-secret`, `study-habit-admin-password` |

### First deployment

Run from the repository root (Cloud Shell works; `gcloud` must point at the right project):

```bash
gcloud config get-value project
DRY_RUN=1 bash deploy/deploy.sh      # preview, no GCP calls
bash deploy/deploy.sh                # create everything (Cloud SQL takes several minutes)
```

Order inside the script: enable APIs → Artifact Registry → Cloud SQL → database → service account → secrets → build image → **migrate job (must succeed)** → create-user job → deploy service. If the migration fails the service is not deployed.

### Verify

```bash
SERVICE_URL=$(gcloud run services describe study-habit --region asia-southeast1 --format='value(status.url)')
SMOKE_USERNAME=admin_pm \
SMOKE_PASSWORD=$(gcloud secrets versions access latest --secret=study-habit-admin-password) \
python3 deploy/smoke_test.py "$SERVICE_URL"
```

Checks `/health`, `/api/ready`, `/`, a JSON 404 for unknown `/api/*` routes, and login → `/api/auth/me` → logout. Never paste the password into screenshots or the repo.

### Add another user

`create-user.js` never overwrites an existing user. To add one (it uses the same password secret; change it afterwards if needed):

```bash
gcloud run jobs execute study-habit-create-user --region asia-southeast1 --wait \
  --update-env-vars USER_USERNAME=<name>,USER_EMAIL=<email>,USER_ROLE=participant
```

### Cost

Cloud SQL bills while it runs. Pause or delete it when not in use (Episode 9), or run `bash deploy/teardown.sh` to remove everything.
