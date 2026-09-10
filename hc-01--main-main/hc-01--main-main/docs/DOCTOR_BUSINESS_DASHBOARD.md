# MediQueue+ — Professional Doctor & Business Dashboard (Prompt 40)

This document specifies the architecture, authoritative data contracts, queue integration, business summary calculations, quick actions, and end-to-end verification workflows for the **Doctor / Business Dashboard** in MediQueue+.

---

## 1. Architectural Principles & Queue Rule

> [!IMPORTANT]
> **QUEUE RULE — DO NOT CREATE ANOTHER QUEUE**:
> The Doctor / Business Dashboard directly interfaces with the existing HC-01 queue engine (`Token`, `QueueState`, `queueService.js`, `socketHandler.js`).
> The canonical flow:
> $$\text{Appointment} \longrightarrow \text{Token} \longrightarrow \text{Queue} \longrightarrow \text{Socket.IO} \longrightarrow \text{Patient / Doctor / Reception / Display}$$
> remains the **single authoritative source of truth**. No secondary or shadow queue exists.
> The existing HC-01 Reception → Token → Queue → Doctor → Display pipeline remains 100% functional.

```
                    ┌────────────────────────────────────────────────────────┐
                    │          Doctor / Business Practice Dashboard          │
                    │             (/doctor, /doctor/dashboard)               │
                    └──────────────────────────┬─────────────────────────────┘
                                               │
         ┌─────────────────────────────────────┼─────────────────────────────────────┐
         ▼                                     ▼                                     ▼
┌─────────────────────────┐        ┌─────────────────────────┐         ┌─────────────────────────┐
│  8 Core Top Metrics     │        │ Authoritative HC-01     │         │   11 Interactive Quick  │
│ - Today's Appointments  │        │     Queue Controller    │         │         Actions         │
│ - Today's Patients      │        │ - In-Progress Token     │         │ 1. Appointments         │
│ - Current Queue         │        │ - Call Next Patient     │         │ 2. Queue (OPD Caller)   │
│ - Waiting Patients      │        │ - Complete Consultation │         │ 3. Patients Roster      │
│ - Completed Encounters  │        │ - Real-time Socket.IO   │         │ 4. Digital Rx           │
│ - Upcoming Bookings     │        │ - Priority Routing      │         │ 5. Diagnostic Tests     │
│ - Notifications Alerts  │        │ - Waiting ETA Broadcast │         │ 6. Care Plans           │
│ - Subscription Tier     │        └────────────┬────────────┘         │ 7. Telemedicine Video   │
└─────────────────────────┘                     │                      │ 8. Staff Management     │
                                                ▼                      │ 9. Revenue Analytics    │
                                   ┌─────────────────────────┐         │ 10. Practice Settings   │
                                   │  Authoritative Database │         │ 11. Subscription Tier   │
                                   │     & Token Engine      │         └─────────────────────────┘
                                   └────────────┬────────────┘
                                                │
         ┌──────────────────────────────────────┴──────────────────────────────────────┐
         ▼                                                                             ▼
┌───────────────────────────────────────────────┐               ┌──────────────────────────────────────────────┐
│       Practice Business Summary (Real Data)   │               │       Unified Multichannel Consumers         │
│ - Today's Consultation Count (active + done)  │               │ - Patient Mobile Status Tracker              │
│ - Waiting Patients (appointments + tokens)    │               │ - Waiting Hall Large Screen TV Display       │
│ - Completed Consultations Count               │               │ - Reception Desk OPD Token Management        │
│ - Cancellation & No-Show Detailed Records     │               │ - Attending Doctor Consultation Room         │
│ - Real Average Waiting Time (live tokens)     │               └──────────────────────────────────────────────┘
│ - Verified Patient Rating & Review Count      │
│ - Estimated Revenue (completed * fee)         │
└───────────────────────────────────────────────┘
```

---

## 2. The 8 Core Dashboard Metrics

Mounted at `GET /api/doctor/dashboard` (protected with `authenticateUser` and `requireRole('doctor', 'admin', 'clinic_manager')`):

| Metric | Source / Authoritative Calculation | Clinical Purpose |
|---|---|---|
| **Today's Appointments** | `Appointment.find({ doctorId, date: todayStr })` | Total volume of scheduled visits across all statuses for today |
| **Today's Patients** | Unique `patientId` records from today's appointments | Distinct individual patient roster: age, gender, blood group, allergies |
| **Current Queue** | Active in-progress token (`status: 'in-progress'`) + waiting count | Active consultation chair token number and remaining queue depth |
| **Waiting Patients** | Booked/checked-in appointments + unserviced waiting tokens | Total number of patients currently physically or virtually in waiting line |
| **Completed Consultations** | Appointments with `status: 'completed'` today | Total successfully concluded patient clinical encounters |
| **Upcoming Appointments** | Appointments with `date > todayStr` | Forward-looking clinical appointment schedule |
| **Notifications** | Unread `Notification` records for doctor | Triage alerts, patient arrival pings, and access grant changes |
| **Subscription Status** | `DoctorProfile.subscription` | Current SaaS tier (`starter`, `professional`, `enterprise`), validity days, staff seat allocation |

---

## 3. Practice Business Summary (Strict Real Data Guarantee)

> [!NOTE]
> **No Invented Data Guarantee**: Every business summary figure is computed directly from actual appointments, active tokens, and doctor profile data. If no patients are waiting, average wait time defaults to 0 minutes rather than a fabricated static estimate. If no rating is recorded, it reflects 0.0 with 0 reviews.

| Summary Field | Authoritative Source / Computation | Fallback / Zero State |
|---|---|---|
| **Today's Consultation Count** | `completedAppointments.length + inProgressAppointments.length` | `0` |
| **Waiting Patients** | `waitingAppointments.length + waitingTokens.length` | `0` |
| **Completed Consultations** | `appointments.filter(a => a.status === 'completed').length` | `0` |
| **Cancellations Count** | `appointments.filter(a => a.status === 'cancelled').length` | `0` |
| **No-Show Count** | `appointments.filter(a => a.status === 'no-show').length` | `0` |
| **Total Cancelled or No-Show** | `cancellationsCount + noShowCount` | `0` |
| **Cancelled / No-Show Records** | List of appointments with status `'cancelled'` or `'no-show'` | `[]` |
| **Average Waiting Time** | `Math.round(sum(waitingTokens.estimatedWaitTime) / waitingTokens.length)` | `0 min` (strictly dynamic, no static values) |
| **Rating** | `{ avgRating: doctorProfile.avgRating, ratingCount: doctorProfile.ratingCount }` | `0.0 (0 reviews)` |
| **Estimated Revenue** | `completedConsultationsCount * doctorProfile.consultationFee` | `₹0` |

---

## 4. The 11 Quick Actions

The dashboard features 11 quick action buttons with dedicated interactive tabs:

1. 📅 **Appointments**: Inspect today's complete schedule, filter by status (`booked`, `checked-in`, `in-progress`, `completed`), view slot timings, consultation mode (`in-person`, `video`), and clinical priority.
2. 🎫 **Queue**: Dedicated OPD Queue controller showing the exact sequence of waiting tokens, live estimated wait times, and a one-click **Call Next Patient** button that invokes `callNextToken()` and broadcasts real-time Socket.IO events to hospital displays and patient devices.
3. 👥 **Patients**: Clinical roster of all patients with visits scheduled today, showing blood group, known drug/food allergies, age, gender, and contact phone.
4. 💊 **Prescription**: Digital prescription viewer and encounter generator with medication names, dosages, frequencies, and clinical instructions.
5. 🧪 **Lab Reports**: Diagnostic test ordering interface and tracker displaying status (`ordered`, `pending`, `completed`), structured values, units, and laboratory attribution.
6. 📋 **Care Plans**: Protocol creator for chronic disease management (Hypertension, Diabetes, Cardiac Rehab) with exercise and dietary goals.
7. 📹 **Telemedicine**: Video consultation suite launcher utilizing WebRTC peer-to-peer media encryption and HMAC-SHA256 appointment tokens.
8. 🧑‍⚕️ **Staff**: Practice team roster showing assigned receptionists, nurses, and clinic managers, with seat quota tracking against subscription plan limits.
9. 📊 **Analytics**: Financial and clinical productivity metrics including estimated daily revenue (`completedConsultations * consultationFee`), average consultation duration, in-person vs video breakdown, and triage priority distribution.
10. ⚙️ **Business Settings**: Practice configuration editor to modify consultation fee, follow-up fee, offered clinical services, consultation modes (`in-person`, `video`), clinic street address, and contact details.
11. 💳 **Subscription**: Clinic SaaS tier viewer displaying active plan benefits (unlimited queue, telemedicine, AI decision support, staff seats) and renewal timeline.

---

## 5. API Endpoints Contract

Mounted on `/api/doctor`:

### 5.1 Get Aggregated Dashboard
- **Route**: `GET /api/doctor/dashboard`
- **Access**: Private (`doctor`, `admin`, `clinic_manager`)
- **Query Params**: `doctorId` (optional, defaults to authenticated user), `date` (optional, defaults to today)
- **Response Shape**:
  ```json
  {
    "success": true,
    "data": {
      "doctor": {
        "doctorName": "Dr. Priya Sharma",
        "specialty": "Cardiology",
        "hospitalName": "AIIMS New Delhi",
        "medicalLicenseNumber": "DMC-2014-43210",
        "avgRating": 4.8,
        "ratingCount": 36
      },
      "todayAppointments": [...],
      "todayPatientsCount": 3,
      "todayPatients": [...],
      "currentQueue": {
        "activeToken": 2,
        "inProgressToken": { "tokenNumber": 2, "patientName": "Anita Roy" },
        "waitingCount": 2,
        "waitingTokens": [...],
        "totalQueueLength": 3
      },
      "waitingPatients": [...],
      "completedConsultationsCount": 1,
      "completedConsultations": [...],
      "upcomingAppointments": [...],
      "upcomingCount": 1,
      "notifications": [...],
      "unreadNotificationsCount": 1,
      "subscriptionStatus": {
        "plan": "professional",
        "status": "active",
        "validUntil": "2026-10-07T00:00:00.000Z",
        "daysRemaining": 28,
        "maxStaffSeats": 5,
        "seatsUsed": 1,
        "telemedicineEnabled": true,
        "analyticsEnabled": true
      },
      "businessSummary": {
        "todayConsultationCount": 2,
        "waitingPatientsCount": 3,
        "completedConsultationsCount": 1,
        "cancellationsCount": 0,
        "noShowCount": 0,
        "totalCancelledOrNoShow": 0,
        "cancelledOrNoShowAppointments": [],
        "averageWaitingTimeMinutes": 10,
        "rating": {
          "avgRating": 4.8,
          "ratingCount": 36
        },
        "estimatedRevenue": 800
      },
      "analytics": {
        "totalAppointmentsToday": 3,
        "completedConsultationsCount": 1,
        "estimatedRevenue": 800,
        "avgWaitMinutes": 10,
        "modeBreakdown": { "inPerson": 2, "video": 1 }
      },
      "staff": [...],
      "businessSettings": {
        "clinicName": "AIIMS Cardiac Outpatient Clinic",
        "consultationFee": 800,
        "followUpFee": 400,
        "services": ["General Consultation", "ECG", "Echocardiogram"],
        "consultationModes": ["in-person", "video"]
      }
    }
  }
  ```

### 5.2 Update Business Settings
- **Route**: `PATCH /api/doctor/business-settings`
- **Access**: Private (`doctor`, `admin`, `clinic_manager`)
- **Body**:
  ```json
  {
    "consultationFee": 1000,
    "followUpFee": 500,
    "services": ["Cardiology Consultation", "ECG", "Echocardiogram", "Stress Test"],
    "consultationModes": ["in-person", "video"],
    "clinicDetails": { "clinicName": "Premier Heart Clinic" }
  }
  ```

### 5.3 Add Practice Staff
- **Route**: `POST /api/doctor/staff`
- **Access**: Private (`doctor`, `admin`, `clinic_manager`)
- **Body**: `{ "name": "Pooja Triage", "email": "pooja.nurse@mediqueue.test", "role": "nurse", "phone": "+91-9844455566" }`
- **Enforcement**: Checks `maxStaffSeats` on subscription; returns `400 Bad Request` if seat quota is reached.

### 5.4 Call Next Patient
- **Route**: `POST /api/doctor/call-next`
- **Access**: Private (`doctor`, `admin`)
- **Logic**: Directly invokes authoritative `callNextToken()`, advances active token number, emits `token_called` via Socket.IO, and recalculates wait times for remaining patients.

---

## 6. End-to-End Verification Test Flow

The complete operational flow is verified by automated integration tests in `server/tests/doctorBusinessDashboard.test.js`:

```
┌─────────────────┐       ┌────────────────────────┐       ┌────────────────────┐
│  Doctor Login   │ ───►  │   Business Dashboard   │ ───►  │    Appointments    │
│  & Token Auth   │       │   Overview & Summary   │       │    Roster Review   │
└─────────────────┘       └────────────────────────┘       └─────────┬──────────┘
                                                                     │
         ┌───────────────────────────────────────────────────────────┘
         ▼
┌─────────────────┐       ┌────────────────────────┐       ┌────────────────────┐
│      Queue      │ ───►  │        Patient         │ ───►  │    Prescription    │
│  Call Next Pat  │       │     Clinical Profile   │       │    Digital Issuance│
└─────────────────┘       └────────────────────────┘       └────────────────────┘
```

1. **Doctor Login & Credential Verification**: Doctor authenticates via email/password; receives signed JWT with `role: 'doctor'`. Token passes cryptographic HMAC verification and route role guards (`requireRole`).
2. **Business Dashboard**: Loads aggregated clinical and practice data (`GET /api/doctor/dashboard`), verifying doctor credentials, active Pro tier subscription, 8 top metrics, and authoritative business summary.
3. **Appointments Inspection**: Doctor reviews today's appointments schedule, confirming booking details, patient identities, slot times, and consultation modes.
4. **Authoritative Queue Controller**: Interacts with the active queue. Calls `callNextToken()`, transitioning the previous token to completed and the next waiting token to in-progress. Verifies zero duplicate queues are created.
5. **Patient Examination**: Doctor accesses the clinical profile of the active patient (e.g. Suresh Patel: age 58, blood group A+, allergy alerts for 'Sulfa drugs').
6. **Digital Prescription Issuance**: Doctor issues a verified digital prescription (`issueEncounterPrescription`), detailing medication names, dosages, frequencies, and instructions. The prescription is stored with doctor attribution and patient linking.
7. **HC-01 Functionality Preservation**: Verifies that Reception (token registration) → Token Queue → Doctor Session → Display Boards pipeline remains 100% intact and synchronous.

---

## 7. Automated Test Suite Results

Automated tests in `server/tests/doctorBusinessDashboard.test.js` verify:

- **14 Passed Tests across 9 Sub-Suites**:
  1. Core metrics aggregation (today's appointments, patients, queue, waiting, completed, upcoming, notifications).
  2. Subscription status, active state, days remaining, and staff seat quotas.
  3. Practice settings updates (fees, services, clinic details).
  4. Staff seat quota enforcement and over-limit rejection (`400 Bad Request`).
  5. Authoritative queue continuity (reusing existing tokens, zero duplicate queues).
  6. Role-based access control (Doctor & Admin allowed, Patient blocked with `403`, Unauthenticated blocked with `401`).
  7. Business summary metrics verification (consultation counts, waiting counts, completed counts, cancellation/no-show tracking, dynamic wait time calculation, verified ratings, zero invented data).
  8. End-to-End Workflow verification: Doctor login → Business Dashboard → Appointments → Queue → Patient → Prescription.
  9. Preservation of original HC-01 Reception → Token → Queue → Doctor → Display architecture.

**Full Server Test Suite Status**:
```
ℹ tests 152
ℹ suites 27
ℹ pass 152
ℹ fail 0
```
