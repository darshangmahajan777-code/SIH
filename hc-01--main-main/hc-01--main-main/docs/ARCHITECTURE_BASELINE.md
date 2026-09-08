# ARCHITECTURE BASELINE — HC-01 / MediQueue+
**Date:** 2026-09-08 | **Status:** Actual current state (pre-MediQueue+ extension)
**Purpose:** Reference document for every engineer working on the extension.
**Source of truth:** Code, not documentation.

---

## 1. Actual Current Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  BROWSER (Port 5173 / 3000)                                         │
│                                                                     │
│  React 18 + Vite 5 + Tailwind CSS 3                                 │
│  ┌──────────┐ ┌────────────┐ ┌──────────┐ ┌──────────┐             │
│  │Reception │ │  Doctor    │ │  Display │ │Emergency │             │
│  │  Panel   │ │   Panel    │ │  Board   │ │  Panel   │             │
│  └────┬─────┘ └─────┬──────┘ └────┬─────┘ └────┬─────┘             │
│       │              │             │             │                   │
│  ┌────▼──────────────▼─────────────▼─────────────▼────┐             │
│  │         SocketContext + QueueContext (Zustand)       │             │
│  │  socket.io-client ← → Rooms: queue/doctor/display   │             │
│  │  axios API client ← → /api endpoints                │             │
│  └─────────────────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────────────┘
                           │ HTTP + WebSocket
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  BACKEND SERVER (Port 5000)                                         │
│                                                                     │
│  Node.js + Express 4 + Socket.IO 4 (ESM, server.js)                │
│                                                                     │
│  Middleware: CORS → JSON → apiLimiter (60/min)                      │
│                                                                     │
│  Routes:                                                            │
│  /api/tokens    → tokenRoutes.js    → queueService.js               │
│  /api/doctor    → doctorRoutes.js   → queueService.js               │
│  /api/emergency → emergencyRoutes.js → aiService.js (local)         │
│  /api/summary   → summaryRoutes.js  → summaryService.js             │
│  /api/health    → inline                                            │
│                                                                     │
│  Socket.IO Rooms: queue-room, doctor-room, display-room,            │
│                   reception-room                                    │
│  Events: token_created, patient_called, consultation_complete,      │
│          queue_updated, wait_time_updated                           │
│                                                                     │
│  Services:                                                          │
│  queueService.js   — core queue engine (generateToken, callNext,    │
│                       completeToken, getQueue, emitQueueUpdate)     │
│  aiService.js      — local Haversine + weighted hospital scoring    │
│                       + proxy to FastAPI /update-data               │
│  summaryService.js — daily analytics aggregation                    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ Mongoose ODM
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  MONGODB (Port 27017)                                               │
│                                                                     │
│  Collections:                                                       │
│  tokens        — queue tokens (5 indexes for priority+date queries)│
│  doctorsessions — doctor login sessions                             │
│  queuestates   — atomic daily counters (currentTokenNumber etc.)    │
│  emergencycases — emergency hospital redirect logs                  │
│  dailysummaries — analytics snapshots                               │
└─────────────────────────────────────────────────────────────────────┘
                               │ HTTP (from aiService.js only)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  AI SERVICE (Port 8001)                                             │
│                                                                     │
│  Python FastAPI 0.115 + Uvicorn                                     │
│                                                                     │
│  Endpoints:                                                         │
│  POST /update-data      ← called by Node.js aiService.js            │
│  POST /predict          ← NOT CALLED (dead code in running app)     │
│  POST /emergency/redirect ← NOT CALLED (Node.js has own copy)       │
│  GET  /hospitals/nearby ← NOT CALLED (Node.js has own copy)         │
│  GET  /health                                                       │
│                                                                     │
│  State: in-memory rolling avg_consult_time (lost on restart)        │
│  Algorithm: Poisson-inspired wait predictor + Haversine distance    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  REDIS (Port 6379) — DECLARED BUT UNUSED                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Flow — Core Workflow (Existing, Working)

```
Reception Panel                 Server                     Doctor Panel
     │                             │                            │
     │  POST /api/tokens           │                            │
     │ ──────────────────────────► │                            │
     │                        generateToken()                   │
     │                        → Token.create()                  │
     │                        → QueueState $inc                 │
     │                        → io.emit('token_created')        │
     │                        → emitQueueUpdate()               │
     │                             │                            │
     │                             │── queue_updated ──────────►│
     │                             │                            │
     │                      (Display board also                 │
     │                       receives queue_updated)            │
     │                             │                            │
     │                             │  POST /api/doctor/call-next│
     │                             │◄───────────────────────────│
     │                        callNextToken()                   │
     │                        → Token.findOneAndUpdate          │
     │                          (priority: emergency>senior>gen)│
     │                        → io.emit('patient_called')       │
     │                        → emitQueueUpdate()               │
     │                             │                            │
     │                             │── patient_called ─────────►│
     │                             │── queue_updated ──────────►│
     │                             │                            │
     │                             │  POST /doctor/complete/:n  │
     │                             │◄───────────────────────────│
     │                        completeToken()                   │
     │                        → token.status = 'done'           │
     │                        → consultationDuration calculated │
     │                        → updateAiData() fired            │
     │                        → emitQueueUpdate()               │
     │                             │                            │
     │                             │── consultation_complete ──►│
     │                             │── queue_updated ──────────►│
```

---

## 3. Priority Ordering Algorithm (Existing, Working)

```
Queue priority order:
  1. in-progress tokens (currently being seen)
  2. emergency priority (waiting)        ← highest
  3. senior priority (waiting)           ← medium
  4. general priority (waiting)          ← lowest
  5. Within same priority: FIFO by createdAt
  6. done tokens (shown for history)

callNextToken() iterates priority list ['emergency', 'senior', 'general']
and picks the oldest (createdAt ASC) waiting token at the highest priority.

Wait time estimate:
  waitingAhead = count of tokens that will be seen before this one
  estimatedWaitTime = waitingAhead × avgConsultTime (rolling avg, 60s cache)
  avgConsultTime influenced by time-of-day factor (sin wave, ±15% peak at 11am/3pm)
```

---

## 4. Socket.IO Room Architecture (Existing)

```
Client connects → auto-joins queue-room
Client emits join_room → can join doctor-room, display-room, or reception-room

queue-room:    Reception + Display boards
doctor-room:   Doctor panel
display-room:  Public TV display
reception-room: Reception panel

Server-emitted events (all to queue-room):
  token_created        — new token registered
  patient_called       — doctor called next patient
  consultation_complete — consultation finished
  queue_updated        — full queue array (after any mutation)
  wait_time_updated    — {avgWait, queueLength}
```

---

## 5. Planned MediQueue+ Architecture Additions

```
NEW CLIENT ROUTES (not yet built):
  /login               → Login page (JWT storage)
  /signup              → Signup page (patient or doctor)
  /patient-dashboard   → Patient home with queue status + medicine reminders
  /patient-dashboard/profile    → Vitals + privacy controls
  /patient-dashboard/history    → Medical history timeline
  /patient-dashboard/appointments → Appointment list
  /patient-dashboard/tests      → Lab test orders
  /patient-dashboard/care-plans → Doctor care plans
  /find-doctors        → Doctor search/filter/sort
  /doctor-dashboard    → Doctor home with today's queue
  /doctor-dashboard/profile     → Doctor profile setup
  /doctor-dashboard/appointments → Today's appointments + completion flow
  /video/:appointmentId → WebRTC video consultation

NEW SERVER ROUTES (not yet built):
  /api/auth/signup, /api/auth/login, /api/auth/me
  /api/patients/me/profile (GET, PUT)
  /api/patients/me/history (GET, POST)
  /api/doctors (GET - search), /api/doctors/:id (GET)
  /api/doctors/me/profile (PUT), /api/doctors/me/availability (PUT)
  /api/appointments (POST, GET /mine, PATCH /:id/status, GET /:id/queue-position)
  /api/prescriptions (POST, GET /patient/:patientId)
  /api/reminders/mine (GET), /api/reminders/:id (PATCH)
  /api/ratings (POST, GET /doctor/:doctorId)
  /api/test-orders (POST, PATCH /:id/result, GET /patient/:patientId)
  /api/care-plans (POST, GET /patient/:patientId)
  /api/access/grant (POST), /api/access/revoke (POST), /api/access/log/mine (GET)
  /api/video/:appointmentId/token (POST)

NEW SOCKET.IO ROOMS:
  patient-room:{patientId}  → personal room per patient

NEW SOCKET.IO EVENTS (server → client):
  queue:position-update → to patient-room:{patientId} with {position, estimatedTime}
  queue:near-turn       → once when patient is N away from being called
  reminder:due          → to patient-room:{patientId} at each scheduled reminder time
  video:call-ready      → to patient + doctor rooms when video appointment starts
  video:offer, video:answer, video:ice-candidate → relayed for WebRTC signaling

NEW AI ENDPOINTS (not yet built):
  POST /rank-doctors       → composite score (rating + distance + fee)
  POST /priority-score     → reorder queue with anti-starvation algorithm
  GET  /wait-estimate/patient/{tokenId} → per-patient ETA

NEW MONGOOSE MODELS (not yet built):
  User, PatientProfile, DoctorProfile, MedicalHistoryEntry,
  Appointment, Prescription, ReminderSchedule, Rating,
  TestOrder, CarePlan, AccessGrant, AccessLog

NEW MIDDLEWARE (not yet built):
  server/middleware/auth.js → requireAuth(), requireRole()
  server/middleware/checkAccess.js → consent + audit logging

NEW SERVICES (not yet built):
  server/services/historyService.js → createDoctorVerifiedHistoryEntry()
  server/services/reminderService.js → generateReminders()
```

---

## 6. Key Reusable Modules

| Module | Location | Reuse Pattern |
|---|---|---|
| `generateToken()` | `server/services/queueService.js` | Call from appointmentRoutes when booking a same-day appointment to integrate into existing queue |
| `emitQueueUpdate()` | `server/services/queueService.js` | Call from any new route that changes queue state |
| `getIO()` | `server/socketHandler.js` | Get Socket.IO instance from any service/route for new event emissions |
| `haversineDistance()` | `server/services/aiService.js` | Reuse for doctor distance sorting (do not rewrite) |
| `haversine()` | `ai/main.py` | Reuse for /rank-doctors and /priority-score Python endpoints |
| `asyncHandler()` | `server/middleware/errorHandler.js` | Wrap all new route handlers |
| `AppError` | `server/middleware/errorHandler.js` | Throw for all error conditions in new routes |
| `apiLimiter` | `server/middleware/rateLimiter.js` | New sensitive routes should add specific limiters |
| Axios API client | `client/src/services/api.js` | Add new API functions for all new endpoints here |
| `getSocket()` | `client/src/services/socket.js` | Reuse for new socket event subscriptions |
| `useQueue` Zustand store | `client/src/context/QueueContext.jsx` | Extend store for patient dashboard state |
| `ROOMS`, `SOCKET_EVENTS` constants | `shared/constants.js` | Add new room names and event names here |

---

## 7. Main Risks (Summary)

| Rank | Risk | Impact | Action |
|---|---|---|---|
| 1 | Appointment→Token bridge fails | Breaks both new booking AND existing queue | Thorough integration test of generateToken() call from appointmentRoutes |
| 2 | Auth middleware accidentally guards existing routes | Breaks kiosk panels (Reception, Doctor, Display) | Apply auth ONLY to new routes; leave /api/tokens /api/doctor /api/summary /api/emergency untouched |
| 3 | Priority enum mismatch (critical/urgent/routine vs emergency/senior/general) | Wrong queue position for booked appointments | Add explicit mapping function, enforce in appointmentRoutes |
| 4 | Socket room extension breaks whitelist | New patient rooms rejected | Extend whitelist logic in socketHandler to accept patient-room:* prefix dynamically |
| 5 | Dual server entry points (server.js vs server.ts) | New code added to wrong file, breaks on startup | Resolve immediately in Section A before any feature work |
| 6 | Vite proxy hardcoded to production | Local development broken | Fix vite.config.js proxy target to localhost:5000 |
| 7 | FastAPI state in-memory | AI loses learning on restart during demo | Consider writing avg_consult_time to a file or env for persistence |

---

## 8. Technology Stack (Actual, Confirmed)

### Backend Server
- Node.js (ESM modules, "type": "module")
- Express 4.21.1
- Socket.IO 4.8.0
- Mongoose 8.7.0 (MongoDB 7)
- Axios 1.7.7 (for calling FastAPI)
- express-rate-limit 7.4.0
- cors 2.8.5
- dotenv 16.4.5
- TypeScript 5.6.3 + tsx (dev dependency, only used in server.ts path)

### AI Service
- Python 3.x
- FastAPI 0.115.0
- Uvicorn 0.31.1 (standard extras)
- Pydantic 2.9.2

### Frontend Client
- React 18.3.1 + ReactDOM
- Vite 5.4.9
- Tailwind CSS 3.4.13 + PostCSS + Autoprefixer
- React Router DOM 6.26.2
- Socket.IO-client 4.8.0
- Axios 1.7.7
- Zustand 5.0.12
- Framer Motion 12.38.0
- GSAP 3.13.0
- Lucide React 1.7.0
- Recharts 3.8.1
- react-hot-toast 2.4.1
- react-icons 5.3.0
- clsx + tailwind-merge
- dayjs 1.11.13

### Database
- MongoDB 7 (via Docker or Atlas)
- Redis 7-alpine (declared in Docker, unused in code)

### Infrastructure
- Docker Compose (all 5 services)
- Vercel (client deployment)
- Render (server + AI deployment)

---

## 9. Environment Map

```
server/.env (from .env.example):
  NODE_ENV=development|production
  PORT=5000
  MONGO_URI=mongodb://localhost:27017/hospital-queue
  AI_URL=http://localhost:8001
  CORS_ORIGIN=http://localhost:5173     ← ADD THIS (missing from .env.example)
  JWT_SECRET=<secret>                   ← ADD THIS (needed for auth)

client/.env (from .env.example):
  VITE_API_URL=https://hospital-queue-backend-e99o.onrender.com  ← production
  VITE_SOCKET_URL=https://hospital-queue-backend-e99o.onrender.com  ← production
  (local dev relies on Vite proxy in vite.config.js → must fix)
```
