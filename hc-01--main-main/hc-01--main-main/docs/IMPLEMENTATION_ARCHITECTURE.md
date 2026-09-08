# IMPLEMENTATION ARCHITECTURE — MediQueue+
**Date:** 2026-09-09 | **Base:** HC-01 Hospital Queue Management System
**Principle:** Every new module wraps around the existing HC-01 core. Nothing is replaced.

---

## 1. System Architecture

```mermaid
graph TB
    subgraph BROWSER["Browser Clients"]
        KP["Kiosk Panels (unchanged)\nReception / Doctor / Display / Emergency"]
        PP["Patient Dashboard (new)\n/login /signup /patient-dashboard\n/find-doctors /video/:id"]
        DP["Doctor Dashboard (new)\n/doctor-dashboard\n/doctor-dashboard/profile"]
    end

    subgraph CLIENT["client/ — React 18 + Vite + Tailwind"]
        ROUTER["React Router v6\nApp.jsx (extended)"]
        AUTH_CTX["AuthContext (new)\nuseAuth hook, JWT storage"]
        SOCK_CTX["SocketContext (existing)\nExtended: joins patient-room:{id}"]
        Q_CTX["QueueContext / Zustand (existing)\nExtended: patientQueue state"]
        API_SVC["api.js (existing)\nExtended: new endpoint functions"]
        SOCK_SVC["socket.js (existing)\nUnchanged"]
    end

    subgraph SERVER["server/ — Node.js + Express + Socket.IO"]
        subgraph EXISTING_ROUTES["Existing Routes (DO NOT TOUCH)"]
            TR["tokenRoutes.js\n/api/tokens"]
            DR["doctorRoutes.js\n/api/doctor"]
            ER["emergencyRoutes.js\n/api/emergency"]
            SR["summaryRoutes.js\n/api/summary"]
        end

        subgraph NEW_ROUTES["New Routes"]
            AR["authRoutes.js\n/api/auth"]
            PR["patientRoutes.js\n/api/patients"]
            DPR["doctorProfileRoutes.js\n/api/doctors"]
            APR["appointmentRoutes.js\n/api/appointments"]
            PRER["prescriptionRoutes.js\n/api/prescriptions"]
            RR["reminderRoutes.js\n/api/reminders"]
            RAT["ratingRoutes.js\n/api/ratings"]
            TOR["testOrderRoutes.js\n/api/test-orders"]
            CPR["carePlanRoutes.js\n/api/care-plans"]
            ACR["accessRoutes.js\n/api/access"]
            VR["videoRoutes.js\n/api/video"]
        end

        subgraph EXISTING_SVC["Existing Services (DO NOT TOUCH)"]
            QS["queueService.js\ngenerateToken / callNext\ncompleteToken / emitQueueUpdate"]
            AS["aiService.js\nhaversineDistance\nfindNearbyHospitals"]
            SS["summaryService.js"]
        end

        subgraph NEW_SVC["New Services"]
            HS["historyService.js\ncreateDoctorVerifiedEntry"]
            RS["reminderService.js\ngenerateReminders"]
            NTS["notificationService.js\nsend / mock"]
        end

        subgraph MIDDLEWARE["Middleware"]
            EH["errorHandler.js (existing)"]
            RL["rateLimiter.js (existing)"]
            VAL["validate.js (existing)"]
            AUTH_MW["auth.js (new)\nrequireAuth / requireRole"]
            CA["checkAccess.js (new)\nconsent + audit log"]
        end

        SH["socketHandler.js (extended)\n+patient-room:{patientId}\n+queue:position-update\n+queue:near-turn\n+reminder:due\n+video:* signaling"]

        CRON["node-cron scheduler (new)\nReminderSchedule poller"]
    end

    subgraph DB["MongoDB 7"]
        subgraph EXISTING_MODELS["Existing Collections (DO NOT TOUCH)"]
            TK["tokens"]
            DS["doctorsessions"]
            QST["queuestates"]
            EC["emergencycases"]
            DSUM["dailysummaries"]
        end
        subgraph NEW_MODELS["New Collections"]
            US["users"]
            PAT["patientprofiles"]
            DPRO["doctorprofiles"]
            MH["medicalhistoryentries"]
            AP["appointments"]
            PRE["prescriptions"]
            RSCHED["reminderschedules"]
            RAT_M["ratings"]
            TO["testorders"]
            CP["careplans"]
            AG["accessgrants"]
            AL["accesslogs"]
        end
    end

    subgraph AI["ai/ — FastAPI + Uvicorn"]
        subgraph EXISTING_AI["Existing Endpoints"]
            PRED["/predict (Poisson)"]
            UPD["/update-data"]
            EMRD["/emergency/redirect"]
            HN["/hospitals/nearby"]
        end
        subgraph NEW_AI["New Endpoints"]
            RD["/rank-doctors\ncomposite score"]
            PS["/priority-score\nanti-starvation reorder"]
            WE["/wait-estimate/patient/{tokenId}\nper-patient ETA"]
        end
        HAVE["haversine() utility\nshared by old + new"]
    end

    KP & PP & DP --> ROUTER
    ROUTER --> AUTH_CTX & SOCK_CTX & Q_CTX
    AUTH_CTX & Q_CTX --> API_SVC
    SOCK_CTX --> SOCK_SVC

    API_SVC -->|HTTP| EXISTING_ROUTES
    API_SVC -->|HTTP| NEW_ROUTES

    SOCK_SVC -->|WebSocket| SH

    EXISTING_ROUTES --> EXISTING_SVC
    NEW_ROUTES --> NEW_SVC
    NEW_ROUTES --> EXISTING_SVC
    NEW_ROUTES --> MIDDLEWARE
    APR -->|calls generateToken| QS

    EXISTING_SVC --> DB
    NEW_SVC --> DB
    NEW_ROUTES --> DB

    QS -->|HTTP fire-forget| AS
    AS -->|/update-data| UPD
    APR -->|/priority-score| PS
    APR -->|/wait-estimate| WE
    DPR -->|/rank-doctors| RD

    SH --> DB
    CRON --> DB
    CRON --> SH
```

---

## 2. Frontend Architecture

### 2.1 Route Map (Extended App.jsx)

```
/                        → redirect to /home
/home                    → Home.jsx (existing, unchanged)
/reception               → Reception.jsx (existing, unchanged)
/doctor                  → Doctor.jsx (existing, unchanged, extended with priority badge)
/display                 → Display.jsx (existing, unchanged)
/emergency               → Emergency.jsx (existing, unchanged)

── NEW ROUTES ──────────────────────────────────────────────────────
/login                   → Login.jsx             (public)
/signup                  → Signup.jsx            (public)

/patient-dashboard       → PatientDashboard.jsx  (role=patient guard)
  /patient-dashboard/profile        → PatientProfile.jsx
  /patient-dashboard/history        → MedicalHistory.jsx
  /patient-dashboard/appointments   → PatientAppointments.jsx
  /patient-dashboard/tests          → TestOrders.jsx
  /patient-dashboard/care-plans     → CarePlans.jsx

/find-doctors            → FindDoctors.jsx        (role=patient guard)
/doctors/:id             → DoctorDetail.jsx       (role=patient guard)

/doctor-dashboard        → DoctorDashboard.jsx   (role=doctor guard)
  /doctor-dashboard/profile         → DoctorProfileSetup.jsx
  /doctor-dashboard/appointments    → DoctorAppointments.jsx

/video/:appointmentId    → VideoConsult.jsx       (patient or doctor guard)
```

### 2.2 Client State Architecture

```
┌─── AuthContext (NEW) ───────────────────────────────────────────┐
│  state: { user, token, isAuthenticated, loading }               │
│  actions: login(), logout(), fetchMe()                          │
│  storage: localStorage (JWT) or httpOnly cookie                 │
│  axios interceptor: attaches Authorization: Bearer {token}      │
│  to api.js on every request                                     │
└─────────────────────────────────────────────────────────────────┘

┌─── SocketContext (EXISTING — EXTEND) ──────────────────────────┐
│  Existing: auto-joins room by URL path                          │
│  NEW: if role=patient, also emit join_room('patient-room:{id}') │
│  Room stays active for the session lifetime                     │
└─────────────────────────────────────────────────────────────────┘

┌─── QueueContext / Zustand (EXISTING — EXTEND) ─────────────────┐
│  Existing state: queue[], currentToken, stats, loading          │
│  NEW state: patientQueueStatus {position, estimatedTime, near}  │
│  NEW actions: fetchQueuePosition(appointmentId)                 │
│  NEW socket listeners: queue:position-update, queue:near-turn   │
└─────────────────────────────────────────────────────────────────┘

┌─── api.js (EXISTING — EXTEND) ─────────────────────────────────┐
│  All new endpoint functions appended to existing file           │
│  Auth interceptor injected from AuthContext initialization      │
│  Existing: createToken, getQueue, callNextPatient, etc.         │
│  NEW: signup, login, getProfile, updateProfile,                 │
│       getDoctors, getDoctor, createAppointment, etc.            │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Patient Workflow Diagram

```mermaid
sequenceDiagram
    actor P as Patient
    participant FD as /find-doctors
    participant DD as DoctorDetail
    participant PD as PatientDashboard
    participant SRV as Server
    participant SOCK as Socket.IO
    participant AI as AI Service

    P->>FD: Search (specialty, location, fee, rating)
    FD->>SRV: GET /api/doctors?specialty=&lat=&lng=&sortBy=
    SRV->>AI: POST /rank-doctors (candidate docs + weights)
    AI-->>SRV: ranked list with composite scores
    SRV-->>FD: doctor cards with distance, fee, avgRating

    P->>DD: Select doctor → pick date + slot
    DD->>SRV: POST /api/appointments
    Note over SRV: Validates slot not taken
    Note over SRV: If date=today → calls generateToken()
    SRV-->>DD: appointment created {id, tokenId?}

    P->>PD: View dashboard
    PD->>SOCK: emit join_room('patient-room:{patientId}')
    PD->>SRV: GET /api/appointments/:id/queue-position
    SRV->>AI: POST /priority-score (today's token list)
    AI-->>SRV: reordered queue with reasons
    SRV->>AI: GET /wait-estimate/patient/{tokenId}
    AI-->>SRV: {position, estimatedTime}
    SRV-->>PD: {position:12, estimatedTime:"14:30±10min"}

    loop Every queue advance
        SOCK-->>PD: queue:position-update {position, estimatedTime}
    end
    SOCK-->>PD: queue:near-turn (when 5 away)
    PD->>P: In-app alert "Head to hospital now"
```

### 2.4 Doctor Workflow Diagram

```mermaid
sequenceDiagram
    actor D as Doctor
    participant DD as DoctorDashboard
    participant SRV as Server
    participant SOCK as Socket.IO
    participant EX as Existing Doctor Panel

    D->>DD: /doctor-dashboard (new, role=doctor)
    DD->>SRV: GET /api/appointments/mine?date=today
    SRV-->>DD: today's appointment list with priorities

    Note over EX: Existing /doctor panel unchanged
    D->>EX: Start session, Call Next (existing flow unchanged)
    EX->>SRV: POST /api/doctor/call-next (existing)
    SRV-->>SOCK: patient_called (existing)
    SOCK-->>DD: queue:position-update to patient rooms

    D->>DD: Mark appointment in-progress → complete
    DD->>SRV: PATCH /api/appointments/:id/status {status:'completed'}
    Note over SRV: createDoctorVerifiedHistoryEntry() called
    SRV-->>DD: appointment completed

    D->>DD: Write prescription
    DD->>SRV: POST /api/prescriptions {medicines:[...]}
    Note over SRV: generateReminders() creates ReminderSchedule docs

    D->>DD: Order test
    DD->>SRV: POST /api/test-orders

    D->>DD: Write care plan (optional)
    DD->>SRV: POST /api/care-plans
```

---

## 3. Backend Architecture

### 3.1 Server Entry Point Strategy

**Decision:** Use `server.js` (JavaScript) as the single canonical entry point.

- `server.ts` is to be **deleted** (or kept frozen and ignored) to avoid ambiguity.
- All new routes registered in `server.js` beneath existing registrations.
- Pattern:
  ```
  // ── Existing Routes (DO NOT MODIFY ORDER) ──
  app.use('/api/tokens', tokenRoutes);
  app.use('/api/doctor', doctorRoutes);
  app.use('/api/summary', summaryRoutes);
  app.use('/api/emergency', emergencyRoutes);

  // ── New MediQueue+ Routes ──
  app.use('/api/auth', authRoutes);
  app.use('/api/patients', patientRoutes);
  app.use('/api/doctors', doctorProfileRoutes);
  app.use('/api/appointments', appointmentRoutes);
  app.use('/api/prescriptions', prescriptionRoutes);
  app.use('/api/reminders', reminderRoutes);
  app.use('/api/ratings', ratingRoutes);
  app.use('/api/test-orders', testOrderRoutes);
  app.use('/api/care-plans', carePlanRoutes);
  app.use('/api/access', accessRoutes);
  app.use('/api/video', videoRoutes);
  ```
- `node-cron` scheduler initialized in `server.js` after DB connects (not in a route file).

### 3.2 New Service Layer

```
server/services/
├── queueService.js       (EXISTING — untouched)
├── aiService.js          (EXISTING — extended: add rankDoctors(), getPriorityScore())
├── summaryService.js     (EXISTING — untouched)
├── historyService.js     (NEW)  — createDoctorVerifiedHistoryEntry()
└── reminderService.js    (NEW)  — generateReminders(prescription)
                                 — schedulePoller() (sets up node-cron job)
```

**`historyService.js` interface:**
```js
export async function createDoctorVerifiedHistoryEntry(
  patientId, doctorId, appointmentId, condition, notes
) → MedicalHistoryEntry
```

**`reminderService.js` interface:**
```js
export async function generateReminders(prescription) → ReminderSchedule[]
export function startReminderPoller(io) // called once from server.js after DB connect
```

### 3.3 Appointment → Token Integration (Critical Path)

```mermaid
flowchart TD
    A[POST /api/appointments] --> B{Is date today?}
    B -- Yes --> C[Call generateToken from queueService.js]
    C --> D[Token created in existing queue\nwith same priority mapping]
    D --> E[appointment.tokenId = token._id]
    E --> F[Appointment saved]
    B -- No --> G[Appointment saved\ntokenId = null]
    F --> H[Return appointment to client]
    G --> H

    I[Day-of morning job or\ncheck-in event] --> J{appointment.tokenId null?}
    J -- Yes, today's date --> C
```

**Priority Mapping (Appointment → Token):**
```
Appointment.priority    Token.priority
─────────────────────────────────────
'critical'          →  'emergency'
'urgent'            →  'senior'
'routine'           →  'general'
```

This mapping is a single utility function in `appointmentRoutes.js`, not in `queueService.js`.

---

## 4. Database Architecture

### 4.1 Collection Map

```mermaid
erDiagram
    %% EXISTING (untouched)
    tokens {
        ObjectId _id PK
        Number tokenNumber
        String patientName
        String priority
        String status
        String sessionDate
        Boolean isEmergency
        Date calledAt
        Date completedAt
    }

    doctorsessions {
        ObjectId _id PK
        String doctorName
        Boolean isActive
        String sessionDate
    }

    queuestates {
        ObjectId _id PK
        String date
        String department
        Number currentTokenNumber
    }

    %% NEW
    users {
        ObjectId _id PK
        String role
        String name
        String email
        String phone
        String passwordHash
    }

    patientprofiles {
        ObjectId _id PK
        ObjectId userId FK
        Date dob
        String bloodGroup
        Number heightCm
        Number weightKg
        Array allergies
        Object emergencyContact
    }

    doctorprofiles {
        ObjectId _id PK
        ObjectId userId FK
        String specialty
        String hospitalName
        Object location
        Number consultationFee
        Number avgRating
        Array workingHours
        Boolean videoEnabled
    }

    appointments {
        ObjectId _id PK
        ObjectId patientId FK
        ObjectId doctorId FK
        ObjectId tokenId FK
        String date
        String slotTime
        String mode
        String status
        String priority
        String chiefComplaint
        Boolean accessGranted
    }

    medicalhistoryentries {
        ObjectId _id PK
        ObjectId patientId FK
        String source
        ObjectId recordedByDoctorId FK
        ObjectId appointmentId FK
        String condition
        String notes
    }

    prescriptions {
        ObjectId _id PK
        ObjectId appointmentId FK
        ObjectId patientId FK
        ObjectId doctorId FK
        Array medicines
    }

    reminderschedules {
        ObjectId _id PK
        ObjectId prescriptionId FK
        ObjectId patientId FK
        String medicineName
        Date scheduledAt
        String status
    }

    ratings {
        ObjectId _id PK
        ObjectId appointmentId FK
        ObjectId patientId FK
        ObjectId doctorId FK
        Number stars
        String comment
    }

    testorders {
        ObjectId _id PK
        ObjectId appointmentId FK
        ObjectId patientId FK
        ObjectId doctorId FK
        String testName
        String status
        Object result
    }

    careplans {
        ObjectId _id PK
        ObjectId appointmentId FK
        ObjectId patientId FK
        ObjectId doctorId FK
        String diagnosis
        Array dietRecommended
        Array dietRestricted
        Array activityRecommended
        Date followUpDate
    }

    accessgrants {
        ObjectId _id PK
        ObjectId patientId FK
        ObjectId doctorId FK
        String scope
        ObjectId appointmentId FK
        Date grantedAt
        Date revokedAt
    }

    accesslogs {
        ObjectId _id PK
        ObjectId patientId FK
        ObjectId doctorId FK
        Date accessedAt
        String resource
        ObjectId resourceId
    }

    users ||--o| patientprofiles : "has"
    users ||--o| doctorprofiles : "has"
    patientprofiles ||--o{ appointments : "books"
    doctorprofiles ||--o{ appointments : "receives"
    appointments ||--o| tokens : "links to"
    appointments ||--o{ prescriptions : "has"
    appointments ||--o{ testorders : "has"
    appointments ||--o| careplans : "has"
    appointments ||--o| medicalhistoryentries : "generates"
    appointments ||--o| ratings : "enables"
    prescriptions ||--o{ reminderschedules : "generates"
    patientprofiles ||--o{ accessgrants : "controls"
    doctorprofiles ||--o{ accessgrants : "receives"
```

### 4.2 Key Indexes (New Models)

| Model | Index | Type | Reason |
|---|---|---|---|
| users | email | unique | Login lookup |
| patientprofiles | userId | unique | One profile per user |
| doctorprofiles | userId | unique | One profile per user |
| doctorprofiles | specialty + avgRating | compound | Search + sort |
| doctorprofiles | location | 2dsphere | Geospatial queries (or Haversine JS) |
| appointments | patientId + date | compound | Patient's appointments by date |
| appointments | doctorId + date + slotTime | unique | Prevent double-booking |
| appointments | tokenId | sparse | Look up appointment from token |
| reminderschedules | patientId + scheduledAt + status | compound | Poller query |
| accessgrants | patientId + doctorId + revokedAt | compound | Access check |
| accesslogs | patientId + accessedAt | compound | Patient audit log view |

---

## 5. Authentication Architecture

```mermaid
sequenceDiagram
    actor U as User (any role)
    participant C as Client
    participant S as Server

    U->>C: POST /api/auth/signup {role, name, email, phone, password}
    C->>S: POST /api/auth/signup
    S->>S: bcrypt.hash(password, 10)
    S->>S: User.create({...passwordHash})
    S-->>C: {success:true, user:{id, role, name, email}}

    U->>C: POST /api/auth/login {email, password}
    C->>S: POST /api/auth/login
    S->>S: User.findOne({email})
    S->>S: bcrypt.compare(password, user.passwordHash)
    S->>S: jwt.sign({userId, role}, JWT_SECRET, {expiresIn:'7d'})
    S-->>C: {success:true, token, user:{id,role,name}}
    C->>C: localStorage.setItem('mq_token', token)
    C->>C: axios interceptor: Authorization: Bearer {token}

    U->>C: GET /api/auth/me
    C->>S: GET /api/auth/me [Authorization: Bearer {token}]
    S->>S: requireAuth: jwt.verify(token, JWT_SECRET)
    S->>S: attach req.user = {userId, role}
    S-->>C: {success:true, data: user}
```

**Middleware chain for protected routes:**
```
requireAuth → validates JWT, attaches req.user
requireRole(['doctor']) → checks req.user.role
```

**Existing routes stay completely unguarded.** No auth on:
- `/api/tokens/*`
- `/api/doctor/*`
- `/api/summary/*`
- `/api/emergency/*`

---

## 6. Authorization Architecture

```mermaid
flowchart LR
    REQ["Incoming Request"] --> RA["requireAuth\nverify JWT\nattach req.user"]
    RA --> RR{"requireRole\ncheck?"}
    RR -- "role=patient" --> PAT_ROUTES["patientRoutes\nappointmentRoutes (patient view)\nreminderRoutes"]
    RR -- "role=doctor" --> DOC_ROUTES["doctorProfileRoutes\nappointmentRoutes (doctor view)\nprescriptionRoutes\ntestOrderRoutes\ncarePlanRoutes"]
    RR -- "patient or doctor" --> BOTH["videoRoutes\naccessRoutes"]
    RR -- "no role check" --> AUTH_ONLY["authRoutes /me\nratingRoutes GET"]
```

---

## 7. Consent & Access Control Architecture

```mermaid
flowchart TD
    DOC_REQ["Doctor requests patient data\nGET /api/prescriptions/patient/:patientId\nGET /api/test-orders/patient/:patientId\nGET /api/care-plans/patient/:patientId\nGET /api/patients/:id/history (doctor view)"]

    DOC_REQ --> CA["checkAccess middleware\ncheckAccess(patientId, doctorId, appointmentId?)"]

    CA --> Q1{"AccessGrant exists?\nscope='ongoing' + no revokedAt\nOR scope='appointment' matching this appt"}

    Q1 -- YES --> LOG["Write AccessLog entry\n{patientId, doctorId, resource, resourceId, accessedAt}"]
    LOG --> FULL["Return FULL patient data\n(history, prescriptions, tests, care plans)"]

    Q1 -- NO --> MINIMAL["Return MINIMAL data only\n{name, age, gender, chiefComplaint}\nfrom Appointment document\nNever a 403 — doctor still sees basic info"]

    PAT_VIEW["GET /api/access/log/mine\n(patient sees their audit log)"] --> AL["AccessLog.find({patientId})"]
    AL --> AUDIT["'Dr. Mehta viewed your\nprescriptions on Sep 8 at 3:04 PM'"]
```

**Grant model:**
```
Patient grants access:
  scope='appointment' → valid only for one specific appointment
  scope='ongoing'     → valid until patient revokes
  revokedAt=null      → active grant
  revokedAt=Date      → revoked
```

---

## 8. Queue Integration Architecture

```mermaid
sequenceDiagram
    participant PAT as Patient (browser)
    participant SRV as Server
    participant QS as queueService.js
    participant SOCK as Socket.IO
    participant AI as AI Service

    PAT->>SRV: POST /api/appointments {doctorId, date=today, slotTime, priority='critical'}
    SRV->>SRV: Map priority: critical → emergency
    SRV->>QS: generateToken({patientName, priority:'emergency', department:'OPD'})
    QS->>QS: Atomic QueueState $inc currentTokenNumber
    QS->>QS: Token.create({tokenNumber, priority:'emergency', status:'waiting'})
    QS->>SOCK: io.to('queue-room').emit('token_created', token)
    QS->>SOCK: emitQueueUpdate() — existing display board updates
    QS-->>SRV: token
    SRV->>SRV: Appointment.create({..., tokenId: token._id})
    SRV-->>PAT: appointment + tokenId

    PAT->>SOCK: emit join_room('patient-room:{patientId}')

    loop Every time doctor calls next
        SRV->>QS: callNextToken() (existing, unchanged)
        QS->>SOCK: emit patient_called (existing, to queue-room)
        QS->>SOCK: emitQueueUpdate() (existing)
        SRV->>SRV: compute new positions for each waiting patient
        SRV->>SOCK: emit queue:position-update to each patient-room:{id}
    end

    PAT->>SRV: GET /api/appointments/:id/queue-position
    SRV->>AI: POST /priority-score [{tokenId, priority, arrivalTime}...]
    AI-->>SRV: reordered list with reasons
    SRV->>AI: GET /wait-estimate/patient/{tokenId}
    AI-->>SRV: {position:4, estimatedTime:"14:45 ±8min"}
    SRV-->>PAT: {position:4, estimatedTime:"14:45 ±8min", reason:null}
```

---

## 9. Recommendation Architecture

```mermaid
flowchart TD
    PAT["Patient visits /find-doctors"]
    FILTER["Query params:\nspecialty, lat?, lng?, radiusKm?,\nfeeMin?, feeMax?, sortBy=rating|distance|fee,\ndate?"]

    PAT --> FILTER
    FILTER --> SRV["GET /api/doctors"]

    SRV --> MONGO["DoctorProfile.find(specialty filter, fee filter)"]
    MONGO --> CANDS["Candidate doctor list"]

    CANDS --> LATCHECK{"lat+lng\nprovided?"}

    LATCHECK -- YES --> AIRANK["POST /rank-doctors\n(AI service)\nInput: candidates + patientLat/Lng"]
    AIRANK --> SCORE["Composite score:\nw1×normalizedRating\n- w2×normalizedDistance\n- w3×normalizedFee\n(weights: 0.33 each by default)"]
    SCORE --> RERANK["Ranked list with\ndistance in km"]

    LATCHECK -- NO --> SORT["Sort by sortBy param\nrating (default) / fee"]

    RERANK --> RESP["Response to client"]
    SORT --> RESP

    RESP --> CARDS["Doctor cards:\nname, specialty, hospital,\ndistance (km), fee, ⭐avgRating (N reviews),\ntoday's open slots"]
```

**AI `/rank-doctors` input/output contract:**
```json
Input:  { "patient_lat": 28.61, "patient_lng": 77.20,
          "doctors": [{ "id", "avg_rating", "fee", "lat", "lng" }],
          "weights": { "rating": 0.33, "distance": 0.33, "fee": 0.33 } }
Output: [{ "id", "score", "distance_km" }]  // sorted desc by score
```

---

## 10. Notification Architecture

```mermaid
flowchart TD
    PRE["Doctor POSTs /api/prescriptions"]
    GEN["reminderService.generateReminders(prescription)"]
    PRE --> GEN

    GEN --> DOCS["Create N ReminderSchedule documents\nOne per (medicine × time × day)\nschedule.scheduledAt = exact UTC Date"]
    DOCS --> DB[(reminderschedules)]

    CRON["node-cron: every 1 minute\n'* * * * *'"]
    CRON --> QUERY["ReminderSchedule.find({\n  status:'pending',\n  scheduledAt: {$lte: now}\n})"]
    QUERY --> MARK["Mark status='sent'"]
    MARK --> EMIT["io.to('patient-room:{patientId}')\n.emit('reminder:due', reminder)"]
    EMIT --> CLIENT_PUSH["Browser Notifications API\nor in-app toast"]

    CLIENT_ACK["Patient marks Taken/Skipped"] --> PATCH["PATCH /api/reminders/:id\n{status:'taken'|'skipped'}"]
```

**near-turn notification (queue):**
```
In emitQueueUpdate() extension:
  For each waiting token with a linked appointmentId:
    compute new position
    emit queue:position-update to patient-room:{patientId}
    if position <= NEAR_TURN_THRESHOLD (default 5) AND not yet notified:
      emit queue:near-turn once (use Redis or in-process Set to track)
```

---

## 11. Telemedicine Architecture

```mermaid
sequenceDiagram
    participant P as Patient Browser
    participant D as Doctor Browser
    participant SRV as Server
    participant SOCK as Socket.IO

    Note over SRV: Appointment.mode='video' + status becomes 'in-progress'
    SRV->>SOCK: emit video:call-ready to patient-room:{patientId}
    SRV->>SOCK: emit video:call-ready to doctor-room (existing)

    P->>SRV: POST /api/video/:appointmentId/token
    SRV->>SRV: Verify requester is patient or doctor of this appointment
    SRV-->>P: { roomId: appointmentId }

    P->>SOCK: emit join_room('video-{appointmentId}')
    D->>SOCK: emit join_room('video-{appointmentId}')

    P->>P: RTCPeerConnection(stunServers)
    P->>P: createOffer()
    P->>SOCK: emit video:offer {sdp, appointmentId}
    SOCK->>D: relay video:offer to other peer in video-{appointmentId}
    D->>D: setRemoteDescription(offer)
    D->>D: createAnswer()
    D->>SOCK: emit video:answer {sdp, appointmentId}
    SOCK->>P: relay video:answer
    P->>P: setRemoteDescription(answer)

    loop ICE candidates
        P->>SOCK: emit video:ice-candidate {candidate}
        SOCK->>D: relay to other peer
        D->>SOCK: emit video:ice-candidate {candidate}
        SOCK->>P: relay to other peer
    end

    Note over P,D: P2P video stream established via STUN
    Note over SOCK: Server never handles media — signaling relay only
```

**STUN server:** `stun:stun.l.google.com:19302` (free, no infra needed)
**Signaling:** Existing Socket.IO server extended with `video-{appointmentId}` rooms.
**Media:** P2P via WebRTC — server handles zero media traffic.

---

## 12. AI Architecture Extension

### 12.1 New Endpoints Required

```mermaid
flowchart LR
    subgraph EXISTING_AI["Existing (untouched)"]
        PRED["/predict"]
        UPD["/update-data"]
        EMRDIR["/emergency/redirect"]
        HN["/hospitals/nearby"]
    end

    subgraph NEW_AI["New Endpoints"]
        RD["/rank-doctors\nPOST\ncomposite score ranking"]
        PS["/priority-score\nPOST\nanti-starvation queue reorder"]
        WE["/wait-estimate/patient/{tokenId}\nGET\nper-token ETA from Poisson model"]
    end

    HAVE["haversine()\ndetect_specialization()\nshared utilities"]

    HAVE --> EMRDIR
    HAVE --> RD

    WE --> PRED_LOGIC["Reuses Poisson logic\nfrom existing /predict"]
```

### 12.2 `/priority-score` Algorithm

```
Input: [{ token_id, priority, arrival_time }]

Priority weights:
  critical → weight 3
  urgent   → weight 2
  routine  → weight 1

Anti-starvation rule:
  No more than 2 consecutive routine patients skipped for a critical/urgent patient.
  Track skip_count per routine patient; if skip_count >= 2, insert them next.

Output: [{ token_id, effective_position, reason }]
  reason examples: null (no change), "moved up: Critical priority",
                   "held: max skips reached for routine patient"
```

### 12.3 `/rank-doctors` Algorithm

```
score = w1 × normalize(avgRating, 0, 5)
      - w2 × normalize(distance_km, 0, maxRadius)
      - w3 × normalize(fee, feeMin, feeMax)

Default weights: w1=w2=w3=0.33 (equal weighting)
Configurable per request.
Output: ranked list sorted by score DESC.
```

---

## 13. Pre-Migration Fixes (Must Do First)

Before any new feature is written, these fixes must be applied:

```
FIX-1: client/vite.config.js
  Change proxy target from Render URL to http://localhost:5000

FIX-2: server/server.js
  Keep server.js as canonical entry.
  Delete server.ts (or rename to server.ts.bak).

FIX-3: server/models/QueueState.js
  Add `waitingCount: { type: Number, default: 0 }` to schema.

FIX-4: server/.env.example
  Add: CORS_ORIGIN=http://localhost:5173
  Add: JWT_SECRET=changeme_in_production

FIX-5: server/package.json
  Add dependencies: bcrypt, jsonwebtoken, node-cron
```

---

## 14. Technology Additions

| Package | Type | Where | Purpose |
|---|---|---|---|
| `bcrypt` | npm dependency | server | Password hashing for auth |
| `jsonwebtoken` | npm dependency | server | JWT issuance + verification |
| `node-cron` | npm dependency | server | Reminder scheduler (every 1 min) |
| No new npm packages | — | client | All UI libraries already installed |
| No new Python packages | — | ai | FastAPI + Pydantic already sufficient |
| No new Docker services | — | infra | All new code fits in existing containers |
