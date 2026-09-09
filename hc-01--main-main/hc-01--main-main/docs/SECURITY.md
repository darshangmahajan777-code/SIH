# MediQueue+ Security, Privacy & Compliance Architecture

**System:** MediQueue+ (Enterprise Extension of HC-01)  
**Security Standard:** Zero-Trust Clinical Access & Sovereign Health Data Architecture  
**Audit Scope:** Authentication, RBAC, Patient Isolation, Consent Enforcement, IDOR Protection, Socket.IO Room Security, and Audit Logging.

---

## 1. Authentication & Session Security

- **Password Hashing**: Passwords are never stored in plaintext. They are salted and hashed using `bcrypt` (10 salt rounds) via `server/models/User.js`.
- **JWT Token Management**: Stateless JWT tokens signed with `JWT_SECRET` containing `{ id, role, email }`. Tokens expire automatically and are verified via `server/middleware/auth.js` (`requireAuth`).
- **Sanitized Authentication Payloads**: User password hashes and salt rounds are explicitly stripped from JSON serialization in all API responses.
- **Session Headers & Fallback Identification**: Internal services accept verified identity headers (`x-patient-id`, `x-doctor-id`) only when authenticated by the upstream gateway or validated against session tokens.

---

## 2. Role-Based Access Control (RBAC) & Hierarchy

MediQueue+ strictly enforces 4 distinct operational roles:

| Role | Permitted Access Scope | Prohibited Actions |
|---|---|---|
| `patient` | Own profile, personal queue token, appointment booking, sovereign consent management, medicine reminders, personal test results. | Accessing other patients' data, calling tokens, creating doctor-verified diagnoses, viewing public display administrative controls. |
| `doctor` | Assigned clinic workspace, active consultations, calling tokens, ordering tests, issuing prescriptions, viewing authorized patient dossiers. | Accessing unconsented patient history, impersonating other clinicians, modifying hospital administration records. |
| `receptionist`| Issuing OPD tokens, registering walk-in patients, viewing public queue counters. | Viewing protected clinical records, reading doctor consultation notes, prescribing medications. |
| `admin` | Managing hospital registry, approving verified doctors, viewing aggregated throughput statistics. | Reading private patient clinical diagnoses or telemedicine sessions without clinical justification. |

Middleware enforcement: `requireRole(['doctor', 'admin'])` returns `403 Forbidden` if unauthorized roles attempt privileged operations.

---

## 3. Patient Data Sovereignty & Zero-Trust Medical Consent

Medical data privacy is fundamentally sovereign in MediQueue+:

1. **Explicit Consent Required**: Attending clinicians cannot silently inspect past medical conditions, diagnostic test results, or doctor care plans.
2. **Granular Scopes**: Patients can grant access with specific scopes (`full`, `history`, `tests`, `prescriptions`, `care_plans`).
3. **Instant Revocation**: When a patient revokes a grant via `POST /api/consent/revoke/:grantId`, all subsequent queries by that doctor are immediately blocked (`403 Forbidden`).
4. **Data Shielding Fallback**: When an unauthorized doctor opens a patient encounter dossier, the API strips all protected health records and returns `consent: { isAuthorized: false, status: 'LIMITED ACCESS' }`, completely shielding past medical history.
5. **Immutable Access Audit Trail (`AccessLog`)**: Every access event is permanently recorded with `patientId`, `doctorId`, `resource`, `action` (`read`, `write`, `grant`, `revoke`), and timestamp. Patients can audit exactly who viewed their records at any time.

---

## 4. Insecure Direct Object Reference (IDOR) Prevention

MediQueue+ prevents IDOR across all sensitive endpoints:

- **Patient Isolation**: Endpoints like `/api/patient/profile`, `/api/history/mine`, `/api/notifications/mine`, and `/api/care-plans/patient/:patientId` resolve identity directly from the authenticated session or reject requests where a patient attempts to query another patient's ID with `403 Forbidden`.
- **Doctor Isolation**: Doctors cannot listen to or complete other doctors' sessions or appointments.
- **Lab Report Download Guard**: Diagnostic laboratory PDF and report attachments are not exposed via public S3 or web URLs. Reports require authentication and are served through `/api/test-orders/:id/report-meta` with consent verification.

---

## 5. Real-Time Socket.IO & Telemedicine Security

### 5.1 Room Isolation & Leakage Prevention
To ensure patients never receive another patient's queue position, near-turn alert, or telemedicine stream:

- **Isolated Patient Rooms**: Real-time position updates and arrival notices are emitted strictly to `patient-room:${patientId}` and `user:${userId}`. Sockets cannot join rooms belonging to other patients.
- **Doctor Room Boundaries**: Queue notifications for clinicians are scoped strictly to `doctor-room` or `doctor-room:${doctorId}`.
- **Public Display Anonymization**: The public OPD board (`queue-room`) receives only token numbers, department names, and room numbers. Zero patient names, phone numbers, or clinical diagnoses are broadcast.

### 5.2 Telemedicine WebRTC Security
- **Cryptographic Session Tokens**: Video rooms require an HMAC-signed token generated via `GET /api/telemedicine/:appointmentId/token`.
- **Participant Verification**: The token verifies that the caller is strictly either the assigned patient or the assigned doctor for that specific appointment. Third-party interlopers receive `403 Forbidden`.
- **Cross-Appointment Isolation**: Sockets in appointment room `A` cannot receive SDP offers, answers, or ICE candidates from appointment room `B`.

---

## 6. Network Security, CORS & Secrets

- **CORS Whitelisting**: Restricted via `CORS_ORIGIN` environment variable (defaults to `http://localhost:5173` in development).
- **Environment Isolation**: All secrets (`JWT_SECRET`, `MONGO_URI`, `PORT`, `AI_URL`) are loaded via `.env` and documented in `.env.example`.
- **Sensitive Log Sanitization**: Password hashes, JWT tokens, and private clinical notes are excluded from server stdout and debug logging.
