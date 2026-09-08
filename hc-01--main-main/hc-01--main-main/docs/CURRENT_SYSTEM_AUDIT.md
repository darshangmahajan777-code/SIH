# CURRENT SYSTEM AUDIT — HC-01 Hospital Queue Management System
**Date:** 2026-09-08 | **Audited By:** Lead Engineer (AI)
**Purpose:** Ground-truth baseline before MediQueue+ extension begins.

---

## 1. Repository Layout (Actual)

```
hc-01--main-main/
├── client/                    # React + Vite + Tailwind + Socket.IO-client
├── server/                    # Node.js + Express + Socket.IO + Mongoose
├── ai/                        # Python FastAPI microservice
├── shared/                    # Shared JS constants
├── docker/                    # Dockerfiles (server, client, ai)
├── docker-compose.yml         # Full-stack orchestration
├── render.yaml                # Render.com deployment config
├── vercel.json                # Vercel deployment config (client)
├── BACKEND_STRUCTURE.md
├── PROJECT_STATUS.md
├── README.md
└── hc_01_hospital_opd_digital_queue_wait_time_estimator_prd_and_execution_plan.md
```

> NOTE: The actual project root is d:\SIH\hc-01--main-main\hc-01--main-main.
> The outer d:\SIH folder contains planning documents (PRD.md, TRD.md, etc.).

---

## 2. Server — Detailed Audit

### 2.1 Entry Point: server/server.js
- Framework: Express 4.x on Node.js, ESM ("type": "module")
- HTTP: http.createServer(app) + Socket.IO Server on same port (5000)
- CORS: Single origin from CORS_ORIGIN env var (default http://localhost:3000)
- Middleware chain: cors() → express.json({limit:'1mb'}) → apiLimiter (60/min)
- Health check: GET /api/health — returns uptime + timestamp
- Route registrations (ALL CONFIRMED):
  - app.use('/api/tokens', tokenRoutes)
  - app.use('/api/doctor', doctorRoutes)
  - app.use('/api/summary', summaryRoutes)
  - app.use('/api/emergency', emergencyRoutes)
- Socket.IO: Single io.on('connection') entry, delegates to socketHandler.js
- Graceful shutdown: SIGTERM / SIGINT handlers implemented
- Export: export { io } so services can get the socket instance

> CRITICAL NOTE: server.ts (TypeScript) also exists but server.js is the actual
> active entrypoint for npm run dev:js. npm run dev uses tsx watch server.ts.
> TWO ENTRY POINTS EXIST — potential confusion; must resolve before extending.

### 2.2 Socket Handler: server/socketHandler.js
- Singleton ioInstance stored in module scope; exported via getIO()
- Every client auto-joins queue-room on connection
- Valid rooms whitelist: queue-room, doctor-room, display-room, reception-room
- Client-side events handled: join_room, request_queue, disconnect, error
- Server-emitted events (from queueService): token_created, patient_called,
  consultation_complete, queue_updated, wait_time_updated — all to queue-room

> MISSING for MediQueue+: No patient-room:{patientId} pattern,
> no video:* events, no reminder:due event.

### 2.3 Models — All 5 Confirmed

| Model | Key Fields | Notable |
|---|---|---|
| Token | tokenNumber, patientName, age, condition, priority(emergency/senior/general), status(waiting/in-progress/done/cancelled), isEmergency, estimatedWaitTime, consultationDuration, calledAt, completedAt, sessionDate | 3 compound indexes |
| DoctorSession | doctorName, department, sessionDate, startTime, endTime, tokensHandled, avgConsultTime, isActive | isActive + sessionDate indexes |
| QueueState | date, department, currentTokenNumber, totalTokensIssued, totalCompleted, totalCancelled, avgWaitTime, peakHour | (date+dept) unique |
| EmergencyCase | tokenId→Token, patientName, condition, severity(critical/high/medium), hospitalLocation{lat,lng}, suggestedHospitals[], redirected, selectedHospital | createdAt -1 index |
| DailySummary | date, totalTokens, totalCompleted, totalCancelled, totalEmergencies, avgWaitTime, avgConsultTime, hourlyBreakdown[] | date unique |

> MISSING for MediQueue+: User, PatientProfile, DoctorProfile, MedicalHistoryEntry,
> Appointment, Prescription, ReminderSchedule, Rating, TestOrder, CarePlan,
> AccessGrant, AccessLog — all 11 new models in TRD §3.

### 2.4 Routes — All 4 Confirmed

tokenRoutes.js → /api/tokens:
  POST /       — create token (10/min rate-limit + validation)
  GET /        — full queue
  GET /:id     — single token
  PATCH /:id/cancel — cancel token

doctorRoutes.js → /api/doctor:
  POST /call-next               — priority-aware call
  POST /complete/:tokenNumber   — complete + AI update + session stats
  POST /session/start           — start session (ends existing)
  POST /session/end             — end session
  GET  /session                 — current active session

emergencyRoutes.js → /api/emergency:
  POST /redirect     — AI hospital recommendation
  GET  /nearby       — all hospitals sorted by distance
  POST /select       — mark hospital selection

summaryRoutes.js → /api/summary:
  GET /        — live stats today
  GET /daily   — full daily summary
  GET /:date   — specific date summary

### 2.5 Services — All 3 Confirmed

queueService.js:
  generateToken() — atomic create, emits socket events
  getQueue() — full sorted queue with dynamic wait times
  callNextToken() — priority-respecting next-in-line
  completeToken() — marks done, records duration, emits events
  getAvgConsultTime() — rolling average (60s cache, last 20)
  calculateWaitTime() — per-token estimate by priority position
  emitQueueUpdate() — pushes queue + stats to queue-room
  cancelToken(), getTokenById()

aiService.js (CRITICAL FINDING — DUPLICATION):
  updateAiData() — POSTs to FastAPI /update-data (fire-and-forget)
  findNearbyHospitals() — LOCAL Haversine + weighted scoring (same as Python)
  getAllNearbyHospitals() — distance-sorted list
  The FastAPI /emergency/redirect endpoint EXISTS but is NOT called from Node.js.
  emergencyRoutes.js calls findNearbyHospitals() in aiService.js (Node-side).
  This is full duplication and the FastAPI version is dead code.

summaryService.js:
  generateDailySummary() — computes + upserts to DailySummary collection
  getSummaryByDate() — cached or freshly generated
  getLiveStats() — live count for today

### 2.6 Middleware — All 3 Confirmed

errorHandler.js: AppError class, asyncHandler wrapper, global errorHandler, notFoundHandler (404)
rateLimiter.js: apiLimiter (60/min global), tokenCreationLimiter (10/min)
validate.js: validateCreateToken, validateTokenParam, validateDoctorSession, validateEmergencyRedirect

---

## 3. AI Service — Detailed Audit

File: ai/main.py
Framework: FastAPI 0.115.0 + Uvicorn 0.31.1 + Pydantic 2.9.2
CORS: allow_origins=["*"]
State: avg_consult_time, completion_data[] — IN-MEMORY ONLY, lost on restart

Endpoints CONFIRMED:
  POST /predict          — Poisson wait time prediction (NOT called by Node.js)
  POST /update-data      — Update rolling average (IS called by Node.js aiService)
  POST /emergency/redirect — AI hospital ranking (NOT called by Node.js)
  GET  /hospitals/nearby  — Distance-sorted hospitals (NOT called by Node.js)
  GET  /health            — Health check

MISSING for MediQueue+: /rank-doctors, /priority-score, /wait-estimate/patient/{tokenId}

CRITICAL: The /predict endpoint is unused — Node.js calculates all wait times internally.
The FastAPI service is only integrated for /update-data (timing feedback loop).
Everything else in FastAPI is dead code relative to the running application.

---

## 4. Client — Detailed Audit

### 4.1 Framework
Vite 5.x + React 18.x (JSX files, not TSX despite TS devDeps) + Tailwind CSS 3.x

CRITICAL: vite.config.js proxy is hardcoded to production Render URL, not localhost:5000.
This BREAKS local development. Must be fixed before any development work.

### 4.2 Dependencies
Key packages: axios, zustand, socket.io-client, react-router-dom, framer-motion,
gsap, lucide-react, recharts, react-hot-toast, react-icons, clsx, tailwind-merge, dayjs

### 4.3 Pages — All 6 Confirmed
  Home.jsx       /home        — Landing page
  Reception.jsx  /reception   — Token issuance panel
  Doctor.jsx     /doctor      — Doctor session + queue management
  Display.jsx    /display     — Public TV queue board (no nav, isolated)
  Emergency.jsx  /emergency   — AI hospital redirect
  NotFound.jsx   *            — 404

### 4.4 Components
  ConsultationTimer.jsx — live timer during in-progress consultation
  ErrorBoundary.jsx     — React error boundary
  QueueList.jsx         — token list component
  StatsCard.jsx         — stat card
  TokenCard.jsx         — single token card
  components/common/    — directory exists, shared UI elements

### 4.5 State Management
Zustand store (QueueContext.jsx): queue[], currentToken, stats, loading, connected, error
Actions: fetchQueue, fetchStats, refreshAll, createToken, callNext, completeToken
Socket integration in QueueProvider: subscribes to 5 socket events, fallback polling every 15s

SocketContext.jsx: React context, auto-joins room based on URL path, exports useSocket hook

### 4.6 API Client (services/api.js)
Axios instance, response interceptor unwraps {success, data, error} envelope.
All API functions exported (tokens, doctor, summary, emergency).
No auth headers — no Bearer token injection anywhere.

### 4.7 Routing (App.jsx)
All routes in single Routes block. No protected routes. No auth guards. All public.
GSAP animations on route change. Mobile hamburger menu.

---

## 5. Infrastructure

### 5.1 Docker Compose
Services: mongodb(7), redis(7-alpine), server, ai, client
Redis DECLARED but COMPLETELY UNUSED — no code references it at all.
Health checks on all services. Server depends on MongoDB healthy start.

### 5.2 Deployment
Client: Vercel (vercel.json) — Vite build, SPA rewrite
Server+AI: Render (render.yaml)
BUG in render.yaml: Server's AI_URL=http://localhost:8001 — deployed server
cannot reach deployed AI service. Needs Render internal URL.

### 5.3 Environment Variables
Server: PORT, MONGO_URI, AI_URL, CORS_ORIGIN, NODE_ENV
Client: VITE_API_URL, VITE_SOCKET_URL
MISSING: JWT_SECRET, BCRYPT_ROUNDS, NEAR_TURN_THRESHOLD

---

## 6. Testing
NO TEST FILES FOUND ANYWHERE.
No jest, vitest, mocha, or any test framework in any package.json.
No CI/CD workflows.

---

## 7. Seed Data
NO SEED SCRIPTS FOUND.
TRD/MASTER_BREAKDOWN mention server/scripts/seedDoctors.js — does not exist.
Mock hospital data hardcoded in aiService.js and main.py.

---

## 8. Technical Debt Summary

| ID | Issue | Severity |
|---|---|---|
| TD-1 | Dual server entry points (server.js + server.ts) | HIGH |
| TD-2 | Hospital ranking logic duplicated in Node.js and Python; FastAPI version unused | HIGH |
| TD-3 | FastAPI /predict endpoint exists but Node.js calculates wait times internally | MEDIUM |
| TD-4 | Redis declared in docker-compose but completely unused in code | MEDIUM |
| TD-5 | Vite proxy hardcoded to production URL; local dev broken | HIGH |
| TD-6 | FastAPI state is in-memory; lost on every restart | MEDIUM |
| TD-7 | render.yaml AI_URL=localhost; deployed server can't reach deployed AI | HIGH |
| TD-8 | No authentication; all panels publicly accessible | HIGH |
| TD-9 | Zero test coverage | HIGH |
| TD-10 | DoctorSession.doctorName is free text; no link to user/profile | MEDIUM |
| TD-11 | QueueState.waitingCount used in $inc but NOT in schema (silent data loss) | HIGH |
| TD-12 | Single-department hardcoded as 'OPD' throughout queueService | MEDIUM |
| TD-13 | CORS_ORIGIN missing from .env.example | LOW |

---

## 9. Integration Risks for MediQueue+

| ID | Risk | Mitigation |
|---|---|---|
| IR-1 | Token→Appointment bridge must use same generateToken() path | Reuse generateToken() in appointmentRoutes; do not fork |
| IR-2 | patient-room:{patientId} rooms must not break existing room whitelist | Extend whitelist dynamically for patient-room:* prefix |
| IR-3 | JWT auth must not break existing public kiosk panels | New auth middleware guards only NEW routes |
| IR-4 | Priority enum mismatch: Token uses emergency/senior/general; Appointment uses routine/urgent/critical | Map: critical→emergency, urgent→senior, routine→general |
| IR-5 | Two server entry points; unclear which to extend | Pick one (recommend JS), delete the other |
| IR-6 | TRD says "reuse Haversine from AI service" but it's in Node.js | Decide once: extend FastAPI for /rank-doctors OR do it Node-side |
| IR-7 | Vite proxy broken | Fix immediately before development |
| IR-8 | QueueState.waitingCount schema bug | Add field to schema before extending |

---

## 10. Security Risks

| ID | Risk | Severity |
|---|---|---|
| SR-1 | No authentication; all endpoints public | CRITICAL |
| SR-2 | FastAPI CORS wildcard | LOW (demo acceptable) |
| SR-3 | No JWT_SECRET configured | HIGH |
| SR-4 | DoctorSession endpoints unprotected | HIGH |
| SR-5 | Emergency endpoint abuse (partially rate-limited) | MEDIUM |
| SR-6 | MongoDB URI externalized in env | OK |
| SR-7 | No CSRF protection | MEDIUM |
| SR-8 | No Helmet.js security headers | MEDIUM |

---

## 11. What Actually Works

- Token generation (atomic, priority-aware, socket events)
- Priority queue ordering (emergency → senior → general → FIFO)
- Doctor session management (start/end, stats tracking)
- Doctor calls next patient (priority-respecting)
- Consultation completion with duration tracking
- Real-time Socket.IO updates (queue, called, complete, wait_time)
- Room-based socket architecture (4 valid rooms)
- Local Haversine hospital ranking with specialization matching
- Emergency case logging to MongoDB
- Daily summary analytics (hourly breakdown, peak hour, avg wait/consult)
- Live stats API
- Global rate limiting (60/min, 10/min tokens)
- Input validation (name, priority enum, age bounds)
- Global error handling with asyncHandler
- Graceful server shutdown
- Docker Compose (MongoDB + Redis + Server + AI + Client)
- Render + Vercel deployment configs

## 12. What Does NOT Work / Partially Works

- Vite proxy broken (hardcoded production URL)
- FastAPI /predict unused (wait time done in Node.js)
- FastAPI /emergency/redirect unused (Node.js Haversine called instead)
- Redis declared but unused
- QueueState.waitingCount schema bug (silently discarded)
- No authentication / JWT
- No patient accounts
- No doctor profiles  
- No appointment booking
- No prescriptions / reminders
- No medical history
- No video consultation
- No consent/access control
- No test orders / care plans
- No seed data
- Zero test coverage

---

## 13. Preservation Rules — Do NOT Modify These Files

| File | Reason |
|---|---|
| server/models/Token.js | Core queue model; existing indexes must not change |
| server/models/DoctorSession.js | Session tracking; doctorRoutes depends on this |
| server/models/QueueState.js | Atomic counters; generateToken depends on this |
| server/services/queueService.js | Core queue engine; all socket + priority logic lives here |
| server/routes/tokenRoutes.js | Token CRUD; Reception panel depends on these |
| server/routes/doctorRoutes.js | Doctor session + call-next + complete |
| server/routes/emergencyRoutes.js | Emergency hospital redirect |
| server/routes/summaryRoutes.js | Analytics |
| client/src/pages/Reception.jsx | Working reception panel |
| client/src/pages/Doctor.jsx | Working doctor panel |
| client/src/pages/Display.jsx | Working public display board |
| client/src/pages/Emergency.jsx | Working emergency panel |
| client/src/context/SocketContext.jsx | Socket room management |
| client/src/context/QueueContext.jsx | Zustand queue store |
| shared/constants.js | Shared enums and room names |
