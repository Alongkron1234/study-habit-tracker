# ##############################################################################
# Study Habit Tracker — Unified production Dockerfile (multi-stage)
# ##############################################################################
# WHAT THIS FILE DOES
#   Builds ONE image that contains the API (Express) AND the built React SPA and
#   serves both on port 3000. Cloud Run (and CI) build/run exactly this image.
#
# STRUCTURE (2 stages)
#   Stage 1  client-builder -> compiles the React frontend (Vite)
#   Stage 2  production     -> Express server; serves API + built SPA on :3000
#
# IMPORTANT
#   * Container MUST listen on $PORT (Cloud Run injects it; default 3000).
#   * Build from the repo root:  docker build .
#   * Secrets (DATABASE_URL, SESSION_SECRET) are NEVER baked in; injected at
#     runtime from Secret Manager (see docs/labs/lab-05/deployment.md).
#   * Stage 2 runs as the unprivileged `node` user — keep it.
#   * Express serves /assets/* from frontend/dist via express.static.
#
# REFERENCES
#   - Multi-stage builds : https://docs.docker.com/build/building/multi-stage/
#   - Cloud Run container contract: https://cloud.google.com/run/docs/container-contract
# ##############################################################################

# ============================================================================
# Stage 1: Build Frontend (React + Vite)
# ============================================================================
FROM node:20-alpine AS client-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./

# Empty API URL => SPA calls the API on the same origin (same Express server).
ENV VITE_API_URL=""
RUN npm run build

# ============================================================================
# Stage 2: Production Runtime (Express serves API + built SPA on :3000)
# ============================================================================
FROM node:20-alpine AS production
WORKDIR /app/backend

# Install backend dependencies (production only)
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY backend/src ./src
COPY backend/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Copy built frontend SPA — Express will serve from /app/frontend/dist
COPY --from=client-builder /app/frontend/dist /app/frontend/dist

# Runtime configuration
ENV NODE_ENV=production
ENV TZ=Asia/Bangkok
ENV PORT=3000
EXPOSE 3000

# Do not run as root inside the container.
USER node

# ENTRYPOINT hands control to CMD so the app becomes PID 1 (SIGTERM from Cloud Run)
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "src/index.js"]

