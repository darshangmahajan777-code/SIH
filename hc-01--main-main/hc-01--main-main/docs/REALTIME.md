# MediQueue+ Real-Time Event Architecture (Socket.IO & WebRTC)

**Engine:** Socket.IO v4.x & WebRTC Peer-to-Peer Signaling  
**Server File:** `server/socket/index.js`, `server/socket/telemedicineSignaling.js`  
**Client Service:** `client/src/services/socket.js`  

---

## 1. Socket.IO Room Topology & Strict Isolation

To prevent medical privacy leakage (e.g. Patient A receiving Patient B's queue position or telemedicine signals), MediQueue+ enforces strict room segmentation:

```
                            ┌────────────────────────┐
                            │    Socket.IO Server    │
                            └───────────┬────────────┘
                                        │
        ┌───────────────────┬───────────┴───────────┬───────────────────┐
        ▼                   ▼                       ▼                   ▼
┌──────────────┐    ┌──────────────┐        ┌──────────────┐    ┌──────────────┐
│  queue-room  │    │ doctor-room  │        │ patient-room │    │ telemedicine │
│ (Public OPD  │    │  (Attending  │        │  :{patientId}│    │:{appointment}│
│   Display)   │    │  Physicians) │        │ (Private ETA)│    │(WebRTC P2P)  │
└──────────────┘    └──────────────┘        └──────────────┘    └──────────────┘
```

| Room Pattern | Access Scope | Broadcast Events | Security Enforcement |
|---|---|---|---|
| `queue-room` | Public / OPD Displays | `queue:updated`, `token:called`, `token:completed` | Anonymized token numbers only; zero PII. |
| `doctor-room` | Authenticated Clinicians | `queue:updated`, `session:started`, `session:ended` | Restricted to doctor role. |
| `patient-room:${patientId}` | Isolated Patient | `queue:position-update`, `queue:near-turn` | Only matching authenticated `patientId` can join. |
| `user:${userId}` | Specific User | `notification:new`, `notification:unread-count` | Private notification delivery. |
| `telemedicine:${appointmentId}` | Assigned Patient & Doctor | `signal:offer`, `signal:answer`, `signal:ice-candidate` | Verified against cryptographic HMAC token. |

---

## 2. Complete Event Catalog

### 2.1 Virtual Queue & OPD Display Events

#### `token:issued` (Client $\to$ Server)
Receptionist issues a new token.
- **Payload:** `{ tokenNumber: 31, department: "Cardiology", isEmergency: false }`

#### `token:called` (Server $\to$ `queue-room`, `doctor-room`)
Doctor calls the next patient.
- **Payload:** `{ tokenNumber: 31, department: "Cardiology", calledAt: "2026-09-09T16:30:00.000Z" }`

#### `queue:position-update` (Server $\to$ `patient-room:${patientId}`)
Emitted whenever queue advances, patient ahead cancels, or consultation duration shifts.
- **Payload:**
  ```json
  {
    "tokenNumber": 31,
    "position": 31,
    "patientsAhead": 30,
    "estimatedTime": "4:30–4:50 PM",
    "recommendedArrivalTime": "4:15 PM",
    "status": "waiting",
    "priority": "normal"
  }
  ```

#### `queue:near-turn` (Server $\to$ `patient-room:${patientId}`)
High-priority alert triggered when $\text{patientsAhead} \le 3$ or $\text{waitMinutes} \le 15$.
- **Payload:**
  ```json
  {
    "tokenNumber": 31,
    "patientsAhead": 2,
    "message": "You are 2nd in line. Please head towards OPD Consultation Room 204 now."
  }
  ```

---

### 2.2 Telemedicine WebRTC Signaling Events

Scoped strictly to room `telemedicine:${appointmentId}`.

#### `telemedicine:join` (Client $\to$ Server)
Client joins the video consultation room with cryptographic authentication.
- **Payload:** `{ appointmentId: "...", sessionToken: "hmac...", role: "patient" }`

#### `telemedicine:offer` & `telemedicine:answer` (Client $\leftrightarrow$ Server)
Exchanges WebRTC Session Description Protocol (SDP) offers and answers between doctor and patient.
- **Payload:** `{ appointmentId: "...", sdp: { type: "offer|answer", sdp: "v=0..." } }`

#### `telemedicine:ice-candidate` (Client $\leftrightarrow$ Server)
Exchanges ICE candidates for NAT traversal and P2P connection establishment.
- **Payload:** `{ appointmentId: "...", candidate: { candidate: "...", sdpMid: "0" } }`

#### `telemedicine:peer-left` (Server $\to$ Client)
Notifies remote peer when a participant closes the video call tab or navigates away.

---

## 3. Disconnect Handling & State Recovery

Network interruptions in Indian hospital environments are common. MediQueue+ handles reconnection automatically:

1. **Client Configuration (`client/src/services/socket.js`)**:
   - `reconnection: true`
   - `reconnectionAttempts: 10`
   - `reconnectionDelay: 1000` (exponential backoff up to 5000ms)
2. **State Resynchronization**:
   - On `connect` event (fires upon initial connection and every reconnection), the client automatically re-emits `join_room` for `user:${patientId}` and `patient-room:${patientId}`.
   - The client immediately fetches `/api/patient/dashboard-summary` or `/api/doctor/workspace-summary` to eliminate any stale UI state.
