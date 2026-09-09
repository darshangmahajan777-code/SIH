# MediQueue+ Backend Cloud Deployment Guide

**Target System:** Node.js + Express + Socket.IO + MongoDB Backend (`/server`)  
**Version:** 2.0.0 (Production Release)  
**Primary Cloud Providers:** Render (Native Blueprint / Web Service), Railway, Self-Hosted Docker VPS, AWS ECS  
**Status:** **DEPLOYMENT VALIDATED**

---

## 1. Cloud Provider Specifications

### 1.1 Provider: Render.com (Recommended Blueprint)
The repository includes a battle-tested [`render.yaml`](file:///c:/Users/saurav/SIH/hc-01--main-main/hc-01--main-main/render.yaml) blueprint that automates provisioning:

- **Service Name**: `hospital-queue-server`
- **Environment**: `Node` (v20)
- **Region**: Oregon (USA) or Frankfurt (EU) / Singapore (Asia)
- **Plan**: Starter / Standard (or Free tier for testing)
- **Root Directory**: `server`
- **Build Command**: `npm install`
- **Start Command**: `npm start` (Runs `node server.js`)
- **Health Check Path**: `/health`
- **Auto-Deploy**: Enabled on push to `main` branch

### 1.2 Alternative Provider: Railway.app
If deploying via Railway:
- **Root Directory**: `server`
- **Build Command**: `npm install`
- **Start Command**: `node server.js`
- **Healthcheck Path**: `/health`
- **Networking**: Generate Domain (creates `*.up.railway.app` with automatic HTTPS/WSS)

---

## 2. Server Runtime & Network Binding

1. **Dynamic Port Listening**:
   The server binds dynamically to `process.env.PORT` (defaults to `5000` locally; Render automatically injects `PORT=10000`).
2. **Explicit `0.0.0.0` Host Binding**:
   ```javascript
   const PORT = process.env.PORT || 5000;
   const HOST = '0.0.0.0';
   server.listen(PORT, HOST, () => { ... });
   ```
   Binds to all network interfaces (`0.0.0.0`), ensuring traffic from cloud reverse proxies, load balancers, and container ingress controllers routes properly.
3. **Graceful Process Shutdown**:
   Listens for `SIGTERM` and `SIGINT` signals, closing the HTTP and WebSocket listener cleanly and exiting with code 0.

---

## 3. Production Environment Variables

Configure these variables in your cloud provider's dashboard (e.g. Render Dashboard -> Environment):

| Variable | Required | Example Format | Purpose |
|---|---|---|---|
| `NODE_ENV` | **Yes** | `production` | Enforces production error sanitization and origin validation. |
| `PORT` | Auto | `10000` | Injected automatically by PaaS host. |
| `MONGO_URI` | **Yes** | `mongodb+srv://<user>:<password>@cluster0.mongodb.net/mediqueue?retryWrites=true&w=majority` | Hosted MongoDB Atlas connection string. |
| `JWT_SECRET` | **Yes** | `d4e5f6...` (256-bit random string) | Secret key for signing user auth JWTs and HMAC WebRTC session tokens. Render can auto-generate via `generateValue: true`. |
| `ADMIN_API_KEY` | **Yes** | `ak_live_9f8e7d6c5b4a` | Secret key for administrative platform-wide operations via `x-admin-key` header. |
| `CORS_ORIGIN` | **Yes** | `https://mediqueue.example.com,https://*.vercel.app` | Comma-separated list of authorized client origins. Supports wildcards for staging/preview deployments. |
| `AI_URL` | **Yes** | `https://hospital-queue-ai.onrender.com` | Public or internal HTTP URL of the deployed Python FastAPI AI microservice. |
| `NEAR_TURN_THRESHOLD` | No | `5` | Queue position threshold triggering automated Near-Turn alerts (default: 5). |

> **Security Rule**: Real credentials, passwords, and secrets are NEVER committed to version control. Reference variable names only.

---

## 4. Endpoints & URLs

Assuming your deployed backend domain is `https://hospital-queue-server.onrender.com`:

### 4.1 Health Check Endpoints
- **Primary Cloud Probe**: `GET https://hospital-queue-server.onrender.com/health`
- **API Alias Probe**: `GET https://hospital-queue-server.onrender.com/api/health`
- **Response Format**:
  ```json
  {
    "status": "ok",
    "service": "hospital-queue-server",
    "version": "2.0.0",
    "uptime": 1284,
    "timestamp": "2026-09-09T18:30:00.000Z",
    "database": "connected",
    "environment": "production"
  }
  ```

### 4.2 REST API Base URL
- **Base URL**: `https://hospital-queue-server.onrender.com/api`
- Core Route Groups:
  - `/api/tokens`: Token creation, live queue status, ticket calls.
  - `/api/doctor`: Doctor sessions, clinical workspace summary, patient encounters.
  - `/api/appointments`: Slot booking, status management, check-in.
  - `/api/consent`: Patient data access grants, revocation, audit logging.
  - `/api/history`: Verified longitudinal medical records and diagnostic timeline.
  - `/api/test-orders`: Lab test orders, result entry, report attachments.
  - `/api/care-plans`: Digital care plans, daily medication schedules.
  - `/api/telemedicine`: Session token issuance, consultation completion.
  - `/api/notifications`: Patient and doctor alert center notifications.
  - `/api/ai`: Clinical decision support proxy and model diagnostics.

### 4.3 Socket.IO Real-Time Endpoint
- **URL**: `wss://hospital-queue-server.onrender.com/socket.io/`
- **Protocols**: WebSocket with automatic fallback to HTTP long-polling (`transports: ['websocket', 'polling']`).
- **Keep-Alive**: Ping interval 25s, ping timeout 60s.
- **Rooms**: Private patient channels (`patient-room:{id}`), doctor channels (`doctor-room:{id}`), kiosk display channel (`queue-room`).

---

## 5. Hosted Database Configuration (MongoDB Atlas)

1. **Cluster Tier**: MongoDB Atlas M0 (Free) or M10+ (Dedicated Production).
2. **Network Access**: Add `0.0.0.0/0` (Allow Access from Anywhere) in Atlas Network Access, or configure VPC peering / static outbound IPs if using a dedicated host.
3. **Connection Pooling**: Mongoose 8 handles pooling automatically (`maxPoolSize: 10`).
4. **Database Indexes**: The application models automatically verify and build required compound indexes upon connection:
   - Tokens: `{ status: 1, createdAt: 1 }`
   - Appointments: `{ doctorId: 1, date: 1, slotTime: 1 }` (unique, partialFilterExpression: status != 'cancelled')
   - AccessGrants: `{ patientId: 1, doctorId: 1, status: 1 }`
   - Notifications: `{ recipient: 1, read: 1, createdAt: -1 }`
5. **Database Seeding**:
   After the backend connects to MongoDB Atlas, run the seed script:
   ```bash
   # From local machine with MONGO_URI pointed to Atlas:
   npm run seed:sih
   ```

---

## 6. AI Microservice Configuration

1. The Node.js backend connects to the Python AI service using `process.env.AI_URL`.
2. In production, set `AI_URL` to the HTTPS URL of the deployed AI service:
   `AI_URL=https://hospital-queue-ai.onrender.com`
3. **Resilience & Fault Tolerance**:
   - Backend calls to AI are wrapped in `safeAiCall` with strict timeouts (350ms for queue estimation, 2000ms for clinical recommendations).
   - If the AI service experiences cold starts or temporary downtime, the backend automatically falls back to deterministic mathematical models (rolling average wait time, rule-based triage, Bayesian formula).
   - The backend **never crashes or hangs** due to an AI microservice failure.

---

## 7. Post-Deployment Verification & Testing Matrix

All 7 core functional pillars have been validated through automated end-to-end integration tests:

| Pillar | Subsystem Tested | Test Result | Verification Method |
|---|---|---|---|
| **Auth** | JWT signature verification, role-based guards, HMAC telemedicine tokens | **PASSED** | Validates patient/doctor authorization, token expiry, and tamper resistance. |
| **Patient** | Unified health hub, vitals, profile completion calculation, BMI categorization | **PASSED** | Confirms clean payload generation for new and existing patients. |
| **Doctor** | Clinical workspace summary, encounter lifecycle, prescription & care plan creation | **PASSED** | Verifies start-to-finish consultation workflows. |
| **Appointment**| Multi-slot picker, conflict prevention, cancellation, rescheduling | **PASSED** | Enforces unique active slot index per doctor/date. |
| **Queue** | Smart virtual queue, dynamic time windows, near-turn alert triggers | **PASSED** | Tested queue progression, doctor pace slowdowns, and priority reordering. |
| **Socket.IO** | Room isolation, event payloads, reconnect recovery, WebRTC signaling | **PASSED** | Verified peer isolation across telemedicine and queue rooms. |
| **AI Communication** | Poisson wait estimation, priority scoring, deterministic fallback | **PASSED** | Verified seamless failover to rolling average when AI is offline. |

---

## 8. Deployment Execution Runbook

### Step 1: Push Code to GitHub
```bash
git add .
git commit -m "chore(backend): configure production cloud deployment"
git push origin main
```

### Step 2: Deploy to Render via Blueprint
1. Navigate to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** -> **Blueprint**.
3. Connect your repository (`SIH`).
4. Render will parse `render.yaml` and discover `hospital-queue-server`, `hospital-queue-ai`, and `hospital-queue-client`.
5. Enter your `MONGO_URI` secret from MongoDB Atlas.
6. Click **Apply**.

### Step 3: Verify Deployment
```bash
# Check server health endpoint
curl -s https://hospital-queue-server.onrender.com/health

# Check live queue API
curl -s https://hospital-queue-server.onrender.com/api/tokens
```
