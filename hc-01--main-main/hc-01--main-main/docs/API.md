# MediQueue+ REST API Reference Manual

**Base URL:** `http://localhost:5000/api`  
**Authentication Scheme:** Bearer JWT Token (`Authorization: Bearer <token>`) or `x-patient-id` / `x-doctor-id` session headers.  
**Content-Type:** `application/json`

---

## 1. Authentication & Identity (`/api/auth`)

### POST `/api/auth/signup`
Creates a new user account with hashed credentials.
- **Request Body:**
  ```json
  {
    "name": "Rahul Sharma",
    "email": "rahul.demo@mediqueue.test",
    "password": "Password123!",
    "role": "patient",
    "phone": "+91 98765 43210"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": { "id": "65f...", "name": "Rahul Sharma", "email": "...", "role": "patient" }
  }
  ```

### POST `/api/auth/login`
Authenticates credentials and returns a signed JWT.
- **Request Body:**
  ```json
  { "email": "rahul.demo@mediqueue.test", "password": "Password123!" }
  ```
- **Response (200 OK):**
  ```json
  { "success": true, "token": "...", "user": { "id": "...", "name": "...", "role": "patient" } }
  ```

### GET `/api/auth/me`
Fetches current authenticated user context.
- **Headers:** `Authorization: Bearer <token>`
- **Response (200 OK):** `{ "success": true, "user": { ... } }`

---

## 2. Patient Experience & Clinical Aggregation (`/api/patient`)

### GET `/api/patient/dashboard-summary`
Single cohesive aggregation endpoint returning patient vitals, live queue, next appointment, today's medication schedule, health snapshot, and doctor recommendations.
- **Query Params:** `patientId=<ObjectId>` (or inferred from JWT)
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "patient": { "id": "...", "name": "Rahul Sharma", "bloodGroup": "O+", "height": 172, "weight": 68, "bmi": { "value": 23.0, "category": "Normal weight" }, "profileCompletion": { "percentage": 100 } },
      "primaryActions": {
        "activeQueue": { "isLiveQueue": true, "tokenNumber": 31, "position": 31, "patientsAhead": 30, "estimatedWindow": "4:30–4:50 PM", "recommendedArrivalTime": "4:15 PM" },
        "nextAppointment": { "_id": "...", "date": "2026-09-09", "slotTime": "16:30", "mode": "in-person", "doctorId": { "doctorName": "Dr. Priya Sharma", "specialty": "Cardiology", "hospitalName": "AIIMS Super Specialty" } },
        "upcomingCount": 1
      },
      "medicineSchedule": { "takenCount": 0, "totalToday": 2, "nextDose": { "medicineName": "Amlodipine 5mg", "scheduledTime": "09:00", "mealRelation": "after_meal" }, "doses": [ ... ] },
      "healthSnapshot": { "recentHistory": [ ... ], "recentTests": [ ... ], "activeCarePlan": { ... } },
      "discovery": { "recommendedDoctors": [ ... ] }
    }
  }
  ```

### PUT `/api/patient/profile`
Updates patient clinical vitals and recalculates BMI.
- **Request Body:**
  ```json
  { "patientId": "...", "height": 175, "weight": 70, "bloodGroup": "B+", "allergies": ["Penicillin"] }
  ```

### PATCH `/api/patient/medicines/dose/:doseId`
Records patient dose adherence.
- **Request Body:**
  ```json
  { "patientId": "...", "prescriptionId": "...", "status": "taken" }
  ```

---

## 3. Doctor Directory & Slot Scheduling (`/api/doctors`, `/api/appointments`)

### GET `/api/doctors`
Searches doctors with filtering, distance sorting, and Bayesian ranking.
- **Query Params:** `specialty=Cardiology`, `lat=28.567`, `lng=77.210`, `radiusKm=15`, `sortBy=rating`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "count": 5,
    "data": [
      {
        "_id": "...",
        "doctorName": "Dr. Priya Sharma",
        "specialty": "Cardiology",
        "hospitalName": "AIIMS Super Specialty",
        "consultationFee": 600,
        "avgRating": 4.8,
        "ratingCount": 500,
        "score": 94.2,
        "explanation": "Top specialty match • Exceptional 4.8★ rating with 500 verified reviews • Close proximity"
      }
    ]
  }
  ```

### GET `/api/appointments/available-slots`
Generates real-time daily slots excluding breaks, leaves, and already booked appointments.
- **Query Params:** `doctorId=<id>`, `date=2026-09-09`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "date": "2026-09-09",
    "slots": [
      { "slotTime": "09:00", "available": false },
      { "slotTime": "09:15", "available": true }
    ]
  }
  ```

### POST `/api/appointments`
Books an appointment with concurrency conflict detection.
- **Request Body:**
  ```json
  { "patientId": "...", "doctorId": "...", "date": "2026-09-09", "slotTime": "10:30", "mode": "in-person", "chiefComplaint": "Chest tightness" }
  ```
- **Error Response on Double Booking (409 Conflict):**
  ```json
  { "success": false, "error": "This slot has already been booked by another patient" }
  ```

---

## 4. Patient Consent & Sovereign Access Control (`/api/consent`)

### GET `/api/consent/grants`
Returns active and historical access grants for a patient.
- **Query Params:** `patientId=<ObjectId>`

### POST `/api/consent/grant`
Explicitly authorizes a doctor to access records.
- **Request Body:**
  ```json
  { "patientId": "...", "doctorId": "...", "scope": "full" }
  ```

### POST `/api/consent/revoke/:grantId`
Immediately terminates doctor access.
- **Request Body:** `{ "patientId": "..." }`
- **Response (200 OK):** `{ "success": true, "message": "Access grant revoked successfully" }`

### GET `/api/consent/access-log`
Returns the immutable audit log of who accessed patient records.
- **Query Params:** `patientId=<ObjectId>`, `limit=50`

---

## 5. Doctor Clinical Workspace (`/api/doctor`)

### GET `/api/doctor/workspace-summary`
Aggregates today's appointments, queue stats, next patient in line, and urgent acuity alerts for the attending physician.
- **Query Params:** `doctorId=<ObjectId>`
- **Headers:** `x-doctor-id: <ObjectId>`

### GET `/api/doctor/encounter/:appointmentId/patient-view`
Encounter dossier view with zero-trust consent enforcement.
- **Headers:** `x-doctor-id: <ObjectId>`
- **Response (Authorized):**
  ```json
  {
    "success": true,
    "consent": { "isAuthorized": true, "status": "AUTHORIZED", "scope": "full" },
    "patient": { "name": "Rahul Sharma", "age": 32, "bloodGroup": "O+" },
    "sharedRecords": { "medicalHistory": [ ... ], "testResults": [ ... ], "prescriptions": [ ... ], "carePlans": [ ... ] }
  }
  ```
- **Response (Unauthorized / Consent Revoked):**
  ```json
  {
    "success": true,
    "consent": { "isAuthorized": false, "status": "LIMITED ACCESS", "message": "Patient has shielded past medical records." },
    "patient": { "name": "Rahul Sharma", "age": 32, "bloodGroup": "O+" },
    "sharedRecords": { "medicalHistory": [], "testResults": [], "prescriptions": [], "carePlans": [] }
  }
  ```

---

## 6. Telemedicine WebRTC Session (`/api/telemedicine`)

### GET `/api/telemedicine/:appointmentId/token`
Issues cryptographic HMAC session token for video signaling.
- **Query Params:** `userId=<id>`, `role=patient|doctor`
- **Response (200 OK):**
  ```json
  { "success": true, "sessionToken": "hmac.eyJhcHBvaW50bWVudElkIjoiLi4uIn0=...", "roomName": "telemedicine:..." }
  ```

### POST `/api/telemedicine/:appointmentId/complete`
Marks telemedicine encounter as completed.
- **Headers:** `x-doctor-id: <ObjectId>`
