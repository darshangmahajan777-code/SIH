# MediQueue+ Docker Production Deployment Guide

**Version:** 2.0.0 (Production Release)  
**System:** MediQueue+ Healthcare Platform (HC-01 Hospital OPD Queue Management System)  
**Orchestration:** Docker Compose v2 (Compose Specification 3.8+)  
**Container Registry / Base Images:** `node:20-alpine`, `python:3.11-slim`, `nginx:alpine`, `mongo:7`, `redis:7-alpine`

---

## 1. System Architecture & Topology

The Docker deployment encapsulates the entire MediQueue+ stack into five containerized services connected via an internal Docker bridge network (`hospital-queue-net`).

```
                    ┌──────────────────────────────────────────────────┐
                    │               Host System / Browser              │
                    └──────────────┬───────────────────┬───────────────┘
                                   │                   │
                  Port 3000 (HTTP) │                   │ Direct Ports (5000, 8001, 27017)
                                   ▼                   ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  Docker Network: default (Bridge)                                               │
    │                                                                                 │
    │   ┌───────────────────────────┐                                                 │
    │   │       hc01-client         │                                                 │
    │   │      (nginx:alpine)       │                                                 │
    │   │         Port: 80          │                                                 │
    │   │                           │                                                 │
    │   │  - Serves React SPA       │                                                 │
    │   │  - Proxies /api/ ─────────┼──────────┐                                      │
    │   │  - Proxies /socket.io/ ───┼──────────┤                                      │
    │   └───────────────────────────┘          │                                      │
    │                                          ▼                                      │
    │                       ┌─────────────────────────────────────┐                   │
    │                       │             hc01-server             │                   │
    │                       │          (node:20-alpine)           │                   │
    │                       │             Port: 5000              │                   │
    │                       │                                     │                   │
    │                       │  - Express REST API Gateway         │                   │
    │                       │  - Socket.IO Multi-Room Engine      │                   │
    │                       │  - Deterministic Fallback Pipeline  │                   │
    │                       └──────────┬───────────────┬──────────┘                   │
    │                                  │               │                              │
    │                 http://ai:8001   │               │ mongodb://mongodb:27017      │
    │                                  ▼               ▼                              │
    │   ┌───────────────────────────┐     ┌───────────────────────────┐               │
    │   │          hc01-ai          │     │       hc01-mongodb        │               │
    │   │    (python:3.11-slim)     │     │         (mongo:7)         │               │
    │   │        Port: 8001         │     │        Port: 27017        │               │
    │   │                           │     │                           │               │
    │   │  - Poisson Wait Estimator │     │  - 18 Indexed Collections │               │
    │   │  - Bayesian Doctor Ranker │     │  - Partial Unique Slots   │               │
    │   │  - Emergency Triage       │     └─────────────┬─────────────┘               │
    │   └───────────────────────────┘                   │                             │
    │                                                   ▼                             │
    │                                     ┌───────────────────────────┐               │
    │                                     │   hc01_mongodb_data (Vol) │               │
    │                                     │   Persistent /data/db     │               │
    │                                     └───────────────────────────┘               │
    └─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Port Mapping Matrix

| Service | Container Port | Host Port | Protocol | Usage |
|---|---|---|---|---|
| **`client`** | `80` | `3000` | HTTP / WS | **Primary User Gateway**: UI, `/api` proxy, and `/socket.io` proxy. |
| **`server`** | `5000` | `5000` | HTTP / WS | Direct backend API access and external WebSocket signaling. |
| **`ai`** | `8001` | `8001` | HTTP | Direct AI microservice endpoint and clinical decision support. |
| **`mongodb`** | `27017` | `27017` | TCP | Direct MongoDB access for database administration (e.g. Compass). |
| **`redis`** | `6379` | `6379` | TCP | Redis pub/sub broker for horizontal scaling. |

---

## 3. Quick Start Commands

### 3.1 Prerequisites
- Docker Engine 24.0+
- Docker Compose v2.20+ (included in standard Docker Engine & Docker Desktop)

### 3.2 Prepare Environment
```bash
# Copy example environment configuration
cp .env.example .env

# (Optional) Customize JWT_SECRET or CORS_ORIGIN in .env if needed
```

### 3.3 Build and Launch Containers
```bash
# 1. Build all container images using cache-efficient multi-stage builds
docker compose build

# 2. Start all services in detached mode
docker compose up -d

# 3. Verify that all 5 services are running and healthy
docker compose ps
```

### 3.4 Seed Demonstration Data
```bash
# Seed the complete SIH healthcare scenario (hospitals, doctors, patients, appointments)
docker compose exec server npm run seed:sih
```

### 3.5 Access the Running System
- **Web Application**: Open [http://localhost:3000](http://localhost:3000)
- **Backend Health Check**: [http://localhost:5000/health](http://localhost:5000/health)
- **AI Health Check**: [http://localhost:8001/health](http://localhost:8001/health)

---

## 4. Service Configurations & Health Checks

### 4.1 `mongodb`
- **Image**: `mongo:7`
- **Storage**: Named volume `hc01_mongodb_data` mounted at `/data/db`. Data persists across container teardowns (`docker compose down`).
- **Health Check**:
  ```yaml
  test: ["CMD-SHELL", "mongosh --quiet --eval 'db.adminCommand(\"ping\").ok' || exit 1"]
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 10s
  ```

### 4.2 `ai`
- **Build Context**: `./ai` (`docker/Dockerfile.ai`)
- **Base Image**: `python:3.11-slim`
- **Health Check**:
  ```yaml
  test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')"]
  interval: 15s
  timeout: 5s
  retries: 3
  start_period: 10s
  ```

### 4.3 `server`
- **Build Context**: `./server` (`docker/Dockerfile.server`)
- **Base Image**: `node:20-alpine`
- **Startup Order**: Waits for `mongodb` and `ai` to report `service_healthy`.
- **Health Check**:
  ```yaml
  test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:5000/health"]
  interval: 15s
  timeout: 5s
  retries: 3
  start_period: 15s
  ```

### 4.4 `client`
- **Build Context**: `./client` (`docker/Dockerfile.client`)
- **Architecture**: Multi-stage build (Stage 1: `node:20-alpine` compiles Vite assets; Stage 2: `nginx:alpine` serves static files and reverse-proxies `/api/` and `/socket.io/` to `server:5000`).
- **Health Check**:
  ```yaml
  test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:80/"]
  interval: 15s
  timeout: 5s
  retries: 3
  start_period: 10s
  ```

---

## 5. Security & Secret Hygiene

1. **No Baked Secrets**: No API keys, passwords, or JWT secrets are hardcoded in any `Dockerfile` or committed to git.
2. **Environment Variable Injection**: The backend consumes variables passed at runtime via `docker-compose.yml` and `.env`.
3. **`.dockerignore` Protection**: `.dockerignore` files are maintained in root, `/client`, `/server`, and `/ai` to guarantee:
   - Local `node_modules` are never sent to the Docker daemon.
   - Local `.env` files are never copied into the container filesystem.
   - Git histories, cache directories, and test logs are excluded.
4. **Non-Root Execution**: Alpine minimal images reduce the attack surface.

---

## 6. Verification Runbook

Run these commands on the host to verify every subsystem:

```bash
# 1. Test Backend Health & Database Connectivity
curl -s http://localhost:5000/health | jq
# Expected response:
# {
#   "status": "ok",
#   "service": "hospital-queue-server",
#   "version": "2.0.0",
#   "database": "connected",
#   "environment": "production"
# }

# 2. Test AI Service Health
curl -s http://localhost:8001/health | jq
# Expected response:
# {
#   "status": "healthy",
#   "version": "2.0.0"
# }

# 3. Test Client Nginx SPA Serving
curl -I http://localhost:3000/
# Expected: HTTP/1.1 200 OK, Content-Type: text/html

# 4. Test Reverse Proxy from Client to Server (/api/tokens)
curl -s http://localhost:3000/api/tokens | jq .success
# Expected: true

# 5. Test Socket.IO Handshake via Nginx Proxy
curl -I "http://localhost:3000/socket.io/?EIO=4&transport=polling"
# Expected: HTTP/1.1 200 OK (with Set-Cookie for session affinity)
```

---

## 7. Operational Management

### 7.1 Inspecting Logs
```bash
# Follow logs across all services
docker compose logs -f

# Follow logs for backend server only
docker compose logs -f server

# Follow logs for AI service only
docker compose logs -f ai
```

### 7.2 Container Shell Access
```bash
# Open shell inside backend server
docker compose exec server sh

# Open shell inside MongoDB to query database
docker compose exec mongodb mongosh hospital-queue
```

### 7.3 Database Backup & Restore
```bash
# Create MongoDB dump
docker compose exec mongodb mongodump --db hospital-queue --out /data/db/backup

# Restore MongoDB dump
docker compose exec mongodb mongorestore --db hospital-queue /data/db/backup/hospital-queue
```

### 7.4 Graceful Teardown
```bash
# Stop and remove all containers (preserves database volume)
docker compose down

# Stop and wipe database volume (clean reset)
docker compose down -v
```
