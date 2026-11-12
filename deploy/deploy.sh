#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Study Habit Tracker — Idempotent Google Cloud Run Deployment Script
# ==============================================================================
# Usage:
#   ./deploy/deploy.sh
#
# Environment Variables (Optional):
#   PROJECT_ID   GCP Project ID (defaults to active gcloud config project)
#   REGION       GCP Region (default: asia-southeast1)
#   DRY_RUN      Set DRY_RUN=1 to print all gcloud commands without executing
#
# WHAT THIS SCRIPT DOES  (one-time / manual first setup; safe to re-run)
#   Creates every cloud resource the app needs and does the first deployment:
#   1 enable APIs     2 Artifact Registry  3 Cloud SQL instance  4 database
#   5 runtime SA+IAM  6 DB user + secret   7 session + first-user secrets
#   (secret access)   9 build image        10 migrate job + first-user job
#   11 Cloud Run service
#   No demo/seed data is ever loaded in the cloud (demo passwords are public).
#   After this, routine releases are done by GitHub Actions (deploy.yml ->
#   deploy/release.sh), which only UPDATES these resources.
#
# ⭐ IMPORTANT
#   - Idempotent: existing resources/secrets are reused, never overwritten
#     (a re-run does not replace credentials).
#   - DB password and SESSION_SECRET are generated with openssl and live only in
#     Secret Manager; they are never printed (run_cmd redacts --password=...).
#   - Preview first with:  DRY_RUN=1 ./deploy/deploy.sh   (no gcloud calls)
#   - Run from the REPO ROOT (step 9 builds the root Dockerfile).
#   - Offline test: deploy/tests/test_deploy_stub.sh
#
# REFERENCES
#   - gcloud run deploy : https://cloud.google.com/sdk/gcloud/reference/run/deploy
#   - Cloud Run jobs    : https://cloud.google.com/run/docs/create-jobs
#   - Cloud SQL + Run   : https://cloud.google.com/sql/docs/postgres/connect-run
#   - Secret Manager    : https://cloud.google.com/secret-manager/docs
#   - Artifact Registry : https://cloud.google.com/artifact-registry/docs/docker
# ==============================================================================

# ------------------------------------------------------------------------------
# Settings & argument parsing
# ------------------------------------------------------------------------------
DRY_RUN="${DRY_RUN:-0}"
REGION="${REGION:-asia-southeast1}"

if [ "$#" -gt 0 ]; then
  echo "Unknown argument: $1" >&2
  echo "Usage: $0" >&2
  exit 1
fi

# Helper: prints the command (DRY_RUN=1) or prints then executes it.
# ⭐ IMPORTANT: --password=... is redacted in the log; keep this behaviour.
run_cmd() {
  # Log the command without exposing generated database credentials.
  local arg
  if [ "$DRY_RUN" = "1" ]; then
    printf '[DRY_RUN] '
  else
    printf '+ '
  fi
  for arg in "$@"; do
    case "$arg" in
      --password=*) printf '%s ' '--password=<REDACTED>' ;;
      *) printf '%q ' "$arg" ;;
    esac
  done
  printf '\n'
  if [ "$DRY_RUN" != "1" ]; then
    "$@"
  fi
}

# Resolve the GCP project: $PROJECT_ID, else the active gcloud project.
if [ "$DRY_RUN" = "1" ]; then
  PROJECT_ID="${PROJECT_ID:-example-gcp-project}"
else
  PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
  if [ -z "$PROJECT_ID" ]; then
    echo "Error: PROJECT_ID is not set and no active gcloud project was found." >&2
    echo "Run: gcloud config set project YOUR_PROJECT_ID" >&2
    exit 1
  fi
fi

# ------------------------------------------------------------------------------
# Resource names
# ⚠️ deploy.yml / release.sh / teardown.sh and deploy/tests use the same names.
#    If you rename anything here, rename it there too.
# ------------------------------------------------------------------------------
REPO_NAME="study-habit"
SQL_INSTANCE="study-habit-pg"
DB_NAME="study_habit"
DB_USER="study_habit"
SERVICE_NAME="study-habit"
MIGRATE_JOB_NAME="study-habit-migrate"
SA_NAME="study-habit-runner"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
SQL_CONN_NAME="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest"

# Secret Manager secret names (values are never stored in this repo).
SECRET_DB_URL="study-habit-database-url"
SECRET_SESSION="study-habit-session-secret"
SECRET_ADMIN_PASS="study-habit-admin-password"

# First application user (the app has no sign-up page and the cloud DB is not
# seeded, so this job creates one PM account; see step 10b).
CREATE_USER_JOB_NAME="study-habit-create-user"
FIRST_USERNAME="admin_pm"
FIRST_EMAIL="admin@study-habit.example"

echo "=================================================================="
echo "Study Habit Tracker Cloud Run Deployment"
echo "Project : ${PROJECT_ID}"
echo "Region  : ${REGION}"
echo "Dry Run : ${DRY_RUN}"
echo "=================================================================="

# ==============================================================================
# 1. Enable required GCP APIs
# ==============================================================================
run_cmd gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  --project "$PROJECT_ID"

# ==============================================================================
# 2. Create Artifact Registry repository (idempotent)
#    Stores the container images (deploy.yml pushes one per commit SHA).
# ==============================================================================
if [ "$DRY_RUN" = "1" ]; then
  run_cmd gcloud artifacts repositories describe "$REPO_NAME" --location "$REGION" --project "$PROJECT_ID"
  run_cmd gcloud artifacts repositories create "$REPO_NAME" --repository-format=docker --location "$REGION" --description="Study Habit Tracker container repository" --project "$PROJECT_ID"
else
  if ! gcloud artifacts repositories describe "$REPO_NAME" --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
    run_cmd gcloud artifacts repositories create "$REPO_NAME" \
      --repository-format=docker \
      --location "$REGION" \
      --description="Study Habit Tracker container repository" \
      --project "$PROJECT_ID"
  fi
fi

# ==============================================================================
# 3. Create Cloud SQL for PostgreSQL instance (idempotent, db-f1-micro requires --edition=enterprise on POSTGRES_16)
#    ⭐ IMPORTANT: keep `--edition=enterprise` (lowercase) — required by
#       db-f1-micro and asserted by deploy/tests/test_deploy_stub.sh.
#       Creating the instance takes several minutes and costs money until
#       deploy/teardown.sh is run.
# ==============================================================================
if [ "$DRY_RUN" = "1" ]; then
  run_cmd gcloud sql instances describe "$SQL_INSTANCE" --project "$PROJECT_ID"
  run_cmd gcloud sql instances create "$SQL_INSTANCE" --database-version=POSTGRES_16 --edition=enterprise --tier=db-f1-micro --region="$REGION" --storage-size=10GB --storage-type=SSD --backup-start-time=03:00 --project "$PROJECT_ID"
else
  if ! gcloud sql instances describe "$SQL_INSTANCE" --project "$PROJECT_ID" >/dev/null 2>&1; then
    run_cmd gcloud sql instances create "$SQL_INSTANCE" \
      --database-version=POSTGRES_16 \
      --edition=enterprise \
      --tier=db-f1-micro \
      --region="$REGION" \
      --storage-size=10GB \
      --storage-type=SSD \
      --backup-start-time=03:00 \
      --project "$PROJECT_ID"
  fi
fi

# ==============================================================================
# 4. Create Database (idempotent)
# ==============================================================================
if [ "$DRY_RUN" = "1" ]; then
  run_cmd gcloud sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE" --project "$PROJECT_ID"
  run_cmd gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE" --project "$PROJECT_ID"
else
  if ! gcloud sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE" --project "$PROJECT_ID" >/dev/null 2>&1; then
    run_cmd gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE" --project "$PROJECT_ID"
  fi
fi

# ==============================================================================
# 5. Create Dedicated Runtime Service Account & IAM bindings (idempotent)
#    The app runs as this account with least privilege. Here it only gets
#    cloudsql.client (connect to the DB); access to individual secrets is
#    granted later, per secret, after they exist.
# ==============================================================================
if [ "$DRY_RUN" = "1" ]; then
  run_cmd gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT_ID"
  run_cmd gcloud iam service-accounts create "$SA_NAME" --display-name="Study Habit Tracker Cloud Run Service Account" --project "$PROJECT_ID"
else
  if ! gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1; then
    run_cmd gcloud iam service-accounts create "$SA_NAME" \
      --display-name="Study Habit Tracker Cloud Run Service Account" \
      --project "$PROJECT_ID"
  fi
fi

run_cmd gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/cloudsql.client" \
  --condition=None \
  --quiet

# ==============================================================================
# 6. Create DB User & Store DATABASE_URL in Secret Manager (only if secret does not exist yet)
#    ⭐ IMPORTANT: the DB user's password and the password inside DATABASE_URL
#       must be the same value (checked by test_deploy_stub.sh). Never echo it.
#    The URL uses the Cloud SQL unix socket via the `host` query parameter,
#    which node-postgres (pg) understands.
# ==============================================================================
if [ "$DRY_RUN" = "1" ]; then
  run_cmd gcloud secrets describe "$SECRET_DB_URL" --project "$PROJECT_ID"
  run_cmd gcloud sql users list --instance="$SQL_INSTANCE" --project "$PROJECT_ID" --format="value(name)"
  run_cmd gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" --password="<GENERATED_HEX_PASSWORD>" --project "$PROJECT_ID"
  run_cmd gcloud secrets create "$SECRET_DB_URL" --replication-policy="automatic" --project "$PROJECT_ID"
  run_cmd gcloud secrets versions add "$SECRET_DB_URL" --data-file=- --project "$PROJECT_ID"
else
  if ! gcloud secrets describe "$SECRET_DB_URL" --project "$PROJECT_ID" >/dev/null 2>&1; then
    DB_PASS="$(openssl rand -hex 24)"
    if gcloud sql users list --instance="$SQL_INSTANCE" --project "$PROJECT_ID" --format="value(name)" | grep -qx "$DB_USER"; then
      run_cmd gcloud sql users set-password "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASS" --project "$PROJECT_ID"
    else
      run_cmd gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASS" --project "$PROJECT_ID"
    fi
    DB_URL_VALUE="postgresql://${DB_USER}:${DB_PASS}@localhost/${DB_NAME}?host=/cloudsql/${SQL_CONN_NAME}"
    run_cmd gcloud secrets create "$SECRET_DB_URL" --replication-policy="automatic" --project "$PROJECT_ID"
    printf "%s" "$DB_URL_VALUE" | gcloud secrets versions add "$SECRET_DB_URL" --data-file=- --project "$PROJECT_ID"
  fi
fi

# ==============================================================================
# 7. Create SESSION_SECRET in Secret Manager (only if secret does not exist yet)
#    express-session signs cookies with it; the app refuses to start without it.
#    Read it later with: gcloud secrets versions access latest --secret=<name>
# ==============================================================================
if [ "$DRY_RUN" = "1" ]; then
  run_cmd gcloud secrets describe "$SECRET_SESSION" --project "$PROJECT_ID"
  run_cmd gcloud secrets create "$SECRET_SESSION" --replication-policy="automatic" --project "$PROJECT_ID"
  run_cmd gcloud secrets versions add "$SECRET_SESSION" --data-file=- --project "$PROJECT_ID"
else
  if ! gcloud secrets describe "$SECRET_SESSION" --project "$PROJECT_ID" >/dev/null 2>&1; then
    GENERATED_SESSION_SECRET="$(openssl rand -hex 32)"
    run_cmd gcloud secrets create "$SECRET_SESSION" --replication-policy="automatic" --project "$PROJECT_ID"
    printf "%s" "$GENERATED_SESSION_SECRET" | gcloud secrets versions add "$SECRET_SESSION" --data-file=- --project "$PROJECT_ID"
  fi
fi

# ==============================================================================
# 7b. Create the first user's password in Secret Manager (only if missing)
#     Read it later with: gcloud secrets versions access latest --secret=<name>
# ==============================================================================
if [ "$DRY_RUN" = "1" ]; then
  run_cmd gcloud secrets describe "$SECRET_ADMIN_PASS" --project "$PROJECT_ID"
  run_cmd gcloud secrets create "$SECRET_ADMIN_PASS" --replication-policy="automatic" --project "$PROJECT_ID"
  run_cmd gcloud secrets versions add "$SECRET_ADMIN_PASS" --data-file=- --project "$PROJECT_ID"
else
  if ! gcloud secrets describe "$SECRET_ADMIN_PASS" --project "$PROJECT_ID" >/dev/null 2>&1; then
    GENERATED_ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)Aa1!"
    run_cmd gcloud secrets create "$SECRET_ADMIN_PASS" --replication-policy="automatic" --project "$PROJECT_ID"
    printf "%s" "$GENERATED_ADMIN_PASSWORD" | gcloud secrets versions add "$SECRET_ADMIN_PASS" --data-file=- --project "$PROJECT_ID"
  fi
fi

# ------------------------------------------------------------------------------
# Secret access (per secret, NOT project-wide)
# ⭐ IMPORTANT: test_deploy_stub.sh fails if a project-wide secretAccessor
#    binding is added — keep access limited to this app's own secrets.
# ------------------------------------------------------------------------------
# Grant access only to this app's secrets, after they exist.
RUNTIME_SECRETS=("$SECRET_DB_URL" "$SECRET_SESSION" "$SECRET_ADMIN_PASS")
for secret in "${RUNTIME_SECRETS[@]}"; do
  run_cmd gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --project "$PROJECT_ID" --quiet
done

# ==============================================================================
# 9. Build & Push Unified Container Image via Cloud Build
#    Builds the root Dockerfile (run this script from the repo root).
#    Tag `latest` is only for this first manual setup; deploy.yml uses commit SHAs.
# ==============================================================================
run_cmd gcloud builds submit \
  --tag "$IMAGE_URI" \
  --project "$PROJECT_ID"

# ==============================================================================
# 10. Create/Update & Execute Cloud Run Job for DB migration (NO seed)
#     ⭐ IMPORTANT: if this job fails the script stops BEFORE deploying the
#        service, so a broken migration never reaches users.
#     The migration is `node src/db/migrate.js` (idempotent, tracked in the
#     schema_migrations table). The seed script creates demo accounts with
#     public passwords, so RUN_SEED is explicitly false here.
#     deploy.yml / release.sh later re-run this same job (name: study-habit-migrate).
# ==============================================================================
run_cmd gcloud run jobs deploy "$MIGRATE_JOB_NAME" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --service-account "$SA_EMAIL" \
  --set-cloudsql-instances "$SQL_CONN_NAME" \
  --set-secrets "DATABASE_URL=${SECRET_DB_URL}:latest" \
  --set-env-vars "NODE_ENV=production,TZ=Asia/Bangkok,RUN_SEED=false" \
  --command "node" \
  --args "src/db/migrate.js" \
  --max-retries 1 \
  --task-timeout 300s \
  --project "$PROJECT_ID"

if ! run_cmd gcloud run jobs execute "$MIGRATE_JOB_NAME" \
  --region "$REGION" \
  --wait \
  --project "$PROJECT_ID"; then
  printf '%s\n' "ERROR: Cloud Run migration job '${MIGRATE_JOB_NAME}' failed. Aborting service deployment." >&2
  printf '%s\n' "View job logs with:" >&2
  printf '%s\n' "  gcloud logging read \"resource.type=cloud_run_job AND resource.labels.job_name=${MIGRATE_JOB_NAME}\" --project \"${PROJECT_ID}\" --limit 50 --format=\"value(textPayload)\"" >&2
  exit 1
fi

# ==============================================================================
# 10b. Create the first user (PM) with a Cloud Run job
#      The app has no sign-up page and the cloud DB is NOT seeded, so without
#      this nobody could log in. The password comes from Secret Manager
#      (never printed). The script is idempotent: an existing user is kept as
#      is, so re-running never resets a password.
#      Add more users later with:
#        gcloud run jobs execute study-habit-create-user --region <region> --wait \
#          --update-env-vars USER_USERNAME=<name>,USER_EMAIL=<email>,USER_ROLE=participant
#      (they share the admin password secret; change it in the DB if needed).
# ==============================================================================
run_cmd gcloud run jobs deploy "$CREATE_USER_JOB_NAME" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --service-account "$SA_EMAIL" \
  --set-cloudsql-instances "$SQL_CONN_NAME" \
  --set-secrets "DATABASE_URL=${SECRET_DB_URL}:latest,USER_PASSWORD=${SECRET_ADMIN_PASS}:latest" \
  --set-env-vars "NODE_ENV=production,USER_USERNAME=${FIRST_USERNAME},USER_EMAIL=${FIRST_EMAIL},USER_ROLE=pm" \
  --command "node" \
  --args "src/db/create-user.js" \
  --max-retries 0 \
  --task-timeout 120s \
  --project "$PROJECT_ID"

if ! run_cmd gcloud run jobs execute "$CREATE_USER_JOB_NAME" \
  --region "$REGION" \
  --wait \
  --project "$PROJECT_ID"; then
  printf '%s\n' "ERROR: Cloud Run job '${CREATE_USER_JOB_NAME}' failed. Aborting service deployment." >&2
  exit 1
fi

# ==============================================================================
# 11. Deploy Cloud Run Service
#     --port must equal the port in the Dockerfile (3000).
#     NODE_ENV=production makes cookies Secure (Cloud Run serves HTTPS) and the
#     entrypoint re-runs the (idempotent) migration on start; RUN_SEED=false
#     keeps demo accounts out of the real database.
#     --max-instances 3: each instance opens up to 10 DB connections and
#     db-f1-micro allows ~25, so keep this low.
#     ⚠️ --allow-unauthenticated makes the service public (needed for the demo).
# ==============================================================================
run_cmd gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --service-account "$SA_EMAIL" \
  --add-cloudsql-instances "$SQL_CONN_NAME" \
  --set-secrets "DATABASE_URL=${SECRET_DB_URL}:latest,SESSION_SECRET=${SECRET_SESSION}:latest" \
  --set-env-vars "NODE_ENV=production,TZ=Asia/Bangkok,RUN_SEED=false" \
  --min-instances 0 \
  --max-instances 3 \
  --memory 512Mi \
  --cpu 1 \
  --port 3000 \
  --project "$PROJECT_ID"

if [ "$DRY_RUN" = "1" ]; then
  SERVICE_URL="https://${SERVICE_NAME}-<hash>-as.a.run.app"
else
  SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')"
fi

# ------------------------------------------------------------------------------
# Summary output (URLs; passwords stay in Secret Manager and are not printed)
# ------------------------------------------------------------------------------
printf '\n'
printf '%s\n' "=================================================================="
printf '%s\n' "Deployment Completed!"
printf '%s\n' "Service URL    : ${SERVICE_URL}"
printf '%s\n' "Health Check   : ${SERVICE_URL}/health"
printf '%s\n' "Readiness Check: ${SERVICE_URL}/api/ready"
printf '%s\n' "Secrets        : ${SECRET_DB_URL}, ${SECRET_SESSION}, ${SECRET_ADMIN_PASS} (in Secret Manager, not printed)."
printf '%s\n' "Login          : username ${FIRST_USERNAME} (role pm); password in Secret Manager: ${SECRET_ADMIN_PASS}"
printf '%s\n' "=================================================================="
