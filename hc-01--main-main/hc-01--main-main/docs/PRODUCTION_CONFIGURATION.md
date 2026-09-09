# MediQueue+ Production Configuration Guide

**Version:** 2.0.0 (Production Release)  
**System:** MediQueue+ Healthcare OPD & Digital Queue Management Platform  
**Target Environments:** Cloud PaaS (Render, Vercel, Railway), Container Orchestrators (Docker Compose, Kubernetes), Virtual Machines (Linux / Nginx)

---

## 1. Overview

This document specifies the complete production environment configuration for the MediQueue+ platform across its three microservices:
1. **Client**: Single Page React Application built with Vite, Tailwind CSS, and Socket.IO Client.
2. **Server**: Node.js/Express application with real-time Socket.IO, Mongoose ODM, and REST APIs.
3. **AI Service**: Python FastAPI microservice providing Poisson wait-time estimation, Bayesian doctor ranking, and emergency hospital triage.

---

## 2. Environment Variables Matrix

All configuration variables are organized into 10 logical categories. Real secrets, private keys, or passwords must never be committed to git.

### 2.1 CLIENT (Vite React Single Page Application)

| Variable | Required? | Used By | Example Format | Purpose |
|---|---|---|---|---|
| `VITE_API_URL` | Optional (Required if cross-origin) | `client/src/services/api.js` | `https://api.mediqueue.example.com` | Base URL of the backend REST API. If left empty, the client uses relative `/api` paths (ideal when behind an Nginx reverse proxy or single-origin container). |
| `VITE_SOCKET_URL` | Optional (Required if cross-origin) | `client/src/services/socket.js` | `https://api.mediqueue.example.com` | Public base URL for the WebSocket / Socket.IO connection. If empty, defaults to current window host. |
| `VITE_BACKEND_URL` | Optional | `client/vite.config.js`, `client/src/services/api.js` | `http://localhost:5000` | Fallback backend URL for the local Vite dev proxy and cross-origin decoupled hosting. |

### 2.2 SERVER (Express Core & API Gateway)

| Variable | Required? | Used By | Example Format | Purpose |
|---|---|---|---|---|
| `NODE_ENV` | **Yes** | `server/server.js`, `server/config/database.js` | `production` | Sets the application execution mode (`production`, `development`, or `test`). In production, disables verbose error stack traces and enforces origin checks. |
| `PORT` | Optional | `server/server.js` | `5000` (or injected by PaaS) | The TCP port Express and Socket.IO bind to. Cloud hosts (e.g. Render, Cloud Run) supply this automatically. |
| `CORS_ORIGIN` | **Yes** | `server/server.js` | `https://mediqueue.example.com,*.vercel.app` | Comma-separated list of authorized client origins. Supports exact domains and wildcard subdomains (`*.domain.com`). Safe for `credentials: true`. |
| `RATE_LIMIT_WINDOW_MS` | Optional | `server/middleware/rateLimiter.js` | `900000` (15 min) | Time window in milliseconds for the Express rate limiter. |
| `RATE_LIMIT_MAX_REQUESTS` | Optional | `server/middleware/rateLimiter.js` | `200` | Maximum allowed API requests per IP address within the configured rate limiting window. |

### 2.3 DATABASE (MongoDB Persistence & Caching)

| Variable | Required? | Used By | Example Format | Purpose |
|---|---|---|---|---|
| `MONGO_URI` | **Yes** | `server/config/database.js` | `mongodb+srv://app_user:StrongPass@cluster0.abcde.mongodb.net/mediqueue?retryWrites=true&w=majority` | Fully qualified MongoDB connection URI with credentials and replica set parameters. |
| `REDIS_URL` | Optional | `server/services/queueService.js` (Optional) | `redis://default:SecretToken@redis-cluster:6379` | Connection URI for Redis, used for horizontal multi-instance Socket.IO clustering via `@socket.io/redis-adapter`. |

### 2.4 AUTH (Authentication, Authorization & Security)

| Variable | Required? | Used By | Example Format | Purpose |
|---|---|---|---|---|
| `JWT_SECRET` | **Yes** | `server/services/telemedicineService.js`, `server/middleware/requireAuth.js` | `4f8a3c9b1d7e2f5a8b0c4d6e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a` | High-entropy (256-bit+) cryptographic secret used to sign JWTs and HMAC WebRTC telemedicine session tokens. |
| `JWT_EXPIRY` | Optional | `server/controllers/authController.js` | `7d` | Token expiration duration (e.g. `7d`, `24h`, `3600s`). |
| `ADMIN_API_KEY` | **Yes** | `server/middleware/requireHospitalAccess.js` | `ak_live_79a2f1c849e38d0b52478` | Secret key for administrative platform-wide operations and cross-hospital auditing via the `x-admin-key` header. |

### 2.5 AI (FastAPI Microservice & Clinical Decision Support)

| Variable | Required? | Used By | Example Format | Purpose |
|---|---|---|---|---|
| `AI_URL` | **Yes** | `server/services/aiService.js`, `server/services/virtualQueueService.js` | `http://ai:8001` or `https://ai.mediqueue.example.com` | Internal or public HTTP URL of the Python FastAPI microservice as reachable by the Node.js backend. |
| `AI_HOST` | Optional | `ai/main.py` | `0.0.0.0` | Bind IP address for the Python Uvicorn ASGI server. |
| `AI_PORT` | Optional | `ai/main.py` | `8001` (or PaaS `PORT`) | Network port for the FastAPI service. |
| `STARVATION_LIMIT` | Optional | `server/services/priorityService.js` | `2` | Maximum patient starvation bypass limit in minutes before priority insertion is forced. |

### 2.6 SOCKET (Real-Time Communication & WebSockets)

| Variable | Required? | Used By | Example Format | Purpose |
|---|---|---|---|---|
| `SOCKET_PING_TIMEOUT` | Optional | `server/server.js` | `60000` (60s) | Inactivity timeout in milliseconds before considering a Socket.IO connection closed. |
| `SOCKET_PING_INTERVAL` | Optional | `server/server.js` | `25000` (25s) | Heartbeat ping interval in milliseconds. |
| `SOCKET_TRANSPORTS` | Optional | `server/server.js` | `websocket,polling` | Supported transport protocols. Guarantees long-polling fallback if WebSockets are blocked by proxies. |

### 2.7 STORAGE (Medical Documents, Lab Results & Reports)

| Variable | Required? | Used By | Example Format | Purpose |
|---|---|---|---|---|
| `FILE_UPLOAD_DIR` | Optional | `server/services/testOrderService.js` | `./uploads` or `/var/data/uploads` | Path to persistent local filesystem directory for storing diagnostic test reports and medical record files. |
| `MAX_UPLOAD_SIZE_BYTES` | Optional | `server/middleware/uploadMiddleware.js` | `10485760` (10 MB) | File size ceiling for document and lab report uploads. |
| `STORAGE_PROVIDER` | Optional | `server/services/storageService.js` | `local` (or `s3_compatible`) | Storage driver abstraction (`local` or `s3_compatible`). |
| `S3_BUCKET` | Optional | `server/services/storageService.js` | `mediqueue-production-records` | Cloud object storage bucket name if using S3/GCS. |
| `S3_REGION` | Optional | `server/services/storageService.js` | `ap-south-1` | Cloud object storage region. |

### 2.8 NOTIFICATIONS (Alerts, Reminders & Near-Turn System)

| Variable | Required? | Used By | Example Format | Purpose |
|---|---|---|---|---|
| `NEAR_TURN_THRESHOLD` | Optional | `server/services/virtualQueueService.js` | `5` | Patient count threshold ahead in queue that triggers the automated Near-Turn alert event. |
| `ENABLE_SMS_NOTIFICATIONS` | Optional | `server/services/notificationService.js` | `true` | Enables real-time SMS delivery for appointment reminders and queue alerts. |
| `ENABLE_EMAIL_NOTIFICATIONS`| Optional | `server/services/notificationService.js` | `true` | Enables email dispatch for digital care plans and appointment receipts. |
| `NOTIFICATION_CRON_INTERVAL`| Optional | `server/services/reminderScheduler.js` | `*/1 * * * *` | Cron expression for the background reminder scheduler (runs every minute by default). |

### 2.9 VIDEO (Telemedicine WebRTC Infrastructure)

| Variable | Required? | Used By | Example Format | Purpose |
|---|---|---|---|---|
| `STUN_SERVER_URL` | Optional | `client/src/pages/TelemedicinePage.jsx` | `stun:stun.l.google.com:19302` | Public STUN server URL for WebRTC NAT candidate discovery. |
| `TURN_SERVER_URL` | Optional | `client/src/pages/TelemedicinePage.jsx` | `turn:turn.mediqueue.example.com:3478` | TURN relay server URL for clients behind strict symmetric NATs or institutional firewalls. |
| `TURN_SERVER_USERNAME` | Optional | `client/src/pages/TelemedicinePage.jsx` | `turn_user_2026` | Authentication username for TURN relay server. |
| `TURN_SERVER_CREDENTIAL` | Optional | `client/src/pages/TelemedicinePage.jsx` | `turn_secret_key_production` | Shared secret / password for TURN relay server. |

### 2.10 EXTERNAL SERVICES (Third-Party Providers)

| Variable | Required? | Used By | Example Format | Purpose |
|---|---|---|---|---|
| `SMS_GATEWAY_URL` | Optional | `server/services/smsService.js` | `https://api.sms-provider.com/v1/send` | REST endpoint URL of external SMS provider gateway. |
| `SMS_API_KEY` | Optional | `server/services/smsService.js` | `sms_live_9a7d3f2e1c0b` | API key token for external SMS dispatch. |
| `SMTP_HOST` | Optional | `server/services/emailService.js` | `smtp.sendgrid.net` | Outgoing SMTP mail server host. |
| `SMTP_PORT` | Optional | `server/services/emailService.js` | `587` | Outgoing SMTP port (587 for TLS, 465 for SSL). |
| `SMTP_USER` | Optional | `server/services/emailService.js` | `apikey` | Outgoing SMTP username. |
| `SMTP_PASS` | Optional | `server/services/emailService.js` | `SG.production_key_here` | Outgoing SMTP password or API token. |

---

## 3. Production Architecture & Network Topology

```
                  ┌───────────────────────────────────────────────┐
                  │                 Internet                      │
                  └───────────────────────┬───────────────────────┘
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │    Cloudflare / Cloud Load Balancer   │
                      │       (SSL/TLS Termination, WAF)      │
                      └───────────┬───────────────┬───────────┘
                                  │               │
                     https://app...               https://api...
                                  ▼               ▼
      ┌─────────────────────────────┐           ┌─────────────────────────────┐
      │       Frontend Client       │           │       Backend Server        │
      │   (Vercel / Nginx Alpine)   │           │    (Node.js / Express 20)   │
      │                             │           │                             │
      │  - SPA Routing Fallback     │  Sockets  │  - CORS Policy Engine       │
      │  - Static Asset Cache (1y)  ├──────────►│  - JWT & Consent Guards    │
      │  - Auto-prefixed /api calls │   REST    │  - Socket.IO Multi-Room     │
      └─────────────────────────────┘           └──────────────┬──────────────┘
                                                               │
                                          Internal Network     │
                                          (VPC / Docker Net)   │
                                                               ▼
                                                ┌─────────────────────────────┐
                                                │      AI Microservice        │
                                                │    (Python 3.11 FastAPI)    │
                                                │                             │
                                                │  - Poisson Wait Estimator   │
                                                │  - Bayesian Doctor Ranker   │
                                                │  - Emergency Triage Scorer  │
                                                └──────────────┬──────────────┘
                                                               │
                                                               ▼
                                                ┌─────────────────────────────┐
                                                │       MongoDB Cluster       │
                                                │       (MongoDB 7.0+)        │
                                                │                             │
                                                │  - 18 Indexed Collections   │
                                                │  - Partial Unique Slots     │
                                                │  - TTL Grant Expiry         │
                                                └─────────────────────────────┘
```

---

## 4. CORS & Cross-Origin Deployment

### 4.1 Production Security Rules
1. **Configurable Origins**: Set `CORS_ORIGIN` on the backend to the exact domain(s) of your deployed client (e.g. `CORS_ORIGIN=https://mediqueue.example.com,https://staging.mediqueue.example.com`).
2. **Wildcard Subdomains**: Supported for preview deployments (e.g. `*.vercel.app`).
3. **Credentials Safety**: The backend dynamically evaluates the requesting origin against `allowedOrigins` and reflects the matching origin. It never returns `Access-Control-Allow-Origin: *` when `credentials: true` is enabled, avoiding browser CORS security rejections.
4. **Non-Origin Requests**: Requests lacking an `Origin` header (such as curl, mobile native clients, health probes, or server-to-server API calls) are permitted.

---

## 5. Socket.IO Production Configuration

### 5.1 Client Configuration (`client/src/services/socket.js`)
- **Transport Strategy**: `transports: ['websocket', 'polling']`. Initiates with WebSocket, gracefully falling back to HTTP long-polling if corporate firewalls or proxies drop WebSocket upgrades.
- **Reconnection Logic**: Automatic reconnect enabled with 10 attempts, exponential backoff starting at 800ms up to 5000ms.
- **Dynamic Endpoint**: Automatically selects `VITE_SOCKET_URL`, falling back to `VITE_BACKEND_URL`, and finally to window origin if unconfigured.

### 5.2 Server Configuration (`server/server.js`)
- **Transport Strategy**: `transports: ['websocket', 'polling']`.
- **Heartbeat / Keepalive**: `pingInterval: 25000` (25s), `pingTimeout: 60000` (60s).
- **Origin Authorization**: Evaluated through `isOriginAllowed` matching the Express CORS rules.

---

## 6. Deployment Verification & Validation Checklist

Execute the following commands to confirm production readiness in any staging or deployment pipeline:

```bash
# 1. Validate Client Production Compilation
cd client
npm run build
# Expected: Exit code 0, dist/ created with index.html, CSS, and JS bundles

# 2. Validate Server Syntax
cd ../server
npm run build
# Expected: Exit code 0 (node --check server.js passes)

# 3. Run Automated Integration Test Suite
npm test
# Expected: 96/96 tests pass across all 10 test suites (0 failures)

# 4. Validate Python AI Syntax
cd ../ai
python -m py_compile main.py
# Expected: Exit code 0

# 5. Verify Health Checks
# Server:
curl -f http://localhost:5000/health
# AI:
curl -f http://localhost:8001/health
```

---

## 7. Status

MediQueue+ configuration is **CLEAN, SECURE, AND PRODUCTION READY**.
