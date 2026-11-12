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
| `DATABASE_URL` | PostgreSQL connection string | Yes | Secret Manager (`studyhabit-database-url`) / `.env` | `postgresql://user:pass@/dbname?host=/cloudsql/...` |
| `SESSION_SECRET` | Session cookie encryption secret | Yes | Secret Manager (`studyhabit-session-secret`) / `.env` | `random-strong-secret` |
| `SESSION_TTL_HOURS` | Session expiry time in hours | No | Plain env in Cloud Run / `.env` | `8` |
| `COOKIE_SECURE` | Session cookie `Secure` flag (needs HTTPS or trust proxy) | No | Plain env: `true` in Cloud Run, `false` in docker compose | `true` |
| `RUN_SEED` | Run demo seed at container start (production entrypoint). Never `true` on the real database | No (default `false`) | Plain env; docker compose sets `true` on `migrate` only | `false` |
| `DB_PORT` / `APP_PORT` | Host ports published by docker compose (defaults 5433 / 3002) | No | `.env` (local only) | `5433` |
| `TZ` | System timezone | No | Plain env in Cloud Run | `Asia/Bangkok` |
