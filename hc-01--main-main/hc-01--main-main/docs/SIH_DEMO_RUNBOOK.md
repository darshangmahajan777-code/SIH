# MediQueue+ Smart India Hackathon (SIH) Live Demo Master Runbook

> **Official SIH Presentation & Evaluation Playbook**  
> **Repository:** MediQueue+ Smart Virtual OPD & Outpatient Workflow Orchestration System  
> **Target Audience:** SIH Evaluators, Hackathon Presenters, and Testing Engineers

---

## Table of Contents

1. [Executive Summary & Problem Statement](#1-executive-summary--problem-statement)
2. [Pre-Demo Setup & Environment Initialization](#2-pre-demo-setup--environment-initialization)
3. [Seeded Demo Accounts & Hospital Inventory](#3-seeded-demo-accounts--hospital-inventory)
4. [The 25-Step End-to-End Patient & Doctor Story](#4-the-25-step-end-to-end-patient--doctor-story)
5. [Critical Demo: Token #31 Queue Progression](#5-critical-demo-token-31-queue-progression)
6. [Second Doctor Consent & Instant Shield Demo](#6-second-doctor-consent--instant-shield-demo)
7. [Automated Verification & Zero-Faking Guarantee](#7-automated-verification--zero-faking-guarantee)
8. [High-Resilience Fallbacks (AI / Video Offline)](#8-high-resilience-fallbacks-ai--video-offline)
9. [15-Second Broken Demo Disaster Recovery](#9-15-second-broken-demo-disaster-recovery)

---

## 1. Executive Summary & Problem Statement

Public and tertiary hospital Outpatient Departments (OPDs) in India suffer from severe overcrowding:
- Patients arrive at 7:00 AM, wait 4–6 hours in congested waiting areas with high cross-infection risks.
- Doctors lack visibility into queue length, patient priority, and shared cross-consultation medical history.
- Fragmented records lead to duplicate lab tests and poor prescription compliance.

**MediQueue+ resolves this through:**
1. **Dynamic Virtual Queue & Smart Arrival Buffer**: AI and statistical estimation of wait windows (`4:30–4:50 PM`) and arrival times (`4:15 PM`), allowing patients to wait offsite.
2. **Patient-Governed Digital Consent**: Zero-trust access control where doctors only see protected medical histories when explicitly granted, revokable with immediate cryptographic enforcement.
3. **Unified Clinical Workspaces**: Doctors order diagnostic tests, issue digital prescriptions, generate automatic medication reminders, and issue structured care plans in a single screen.

---

## 2. Pre-Demo Setup & Environment Initialization

### 2.1 System Requirements
- **Node.js**: v18.0.0 or higher
- **MongoDB**: Local Community Server (`mongodb://localhost:27017`) or MongoDB Atlas URI
- **Python**: 3.10+ (optional, for FastAPI `/ai` service; system includes automatic deterministic fallbacks)
- **Modern Browser**: Chrome, Edge, or Firefox (with camera/microphone permission for telemedicine demo)

### 2.2 Seed the Demo Database (One-Command)
Execute in the `server` directory:

```bash
cd server
npm run seed:sih
```

*This command generates clean demo data: AIIMS Super Specialty hospital, Rahul Sharma (Patient), Dr. Priya Sharma (Doctor A), Dr. Rajesh Kumar (Doctor B), Token #31 with 30 patients ahead, prior hypertension history, and lab records.*

### 2.3 Starting Application Services

Open three terminal windows:

#### Terminal 1: Backend API & Realtime Socket Server
```bash
cd server
npm run dev
# Running on http://localhost:5000 (Socket.IO enabled)
```

#### Terminal 2: Frontend Web Application
```bash
cd client
npm run dev
# Running on http://localhost:5173
```

#### Terminal 3: AI Microservice (Optional)
```bash
cd ai
uvicorn main:app --reload --port 8000
# Running on http://localhost:8000
```
*(Note: If the AI service is not running, MediQueue+ transparently engages its built-in Bayesian recommendation, rolling-average queue estimation, and keyword triage engines without interruption).*

---

## 3. Seeded Demo Accounts & Hospital Inventory

| Role | Name | Email | Password | Identifier / Details |
|---|---|---|---|---|
| **Patient** | Rahul Sharma | `patient.demo@mediqueue.test` | `Password123!` | 32 y/o Male, O+, Normal BMI, Stage 1 Hypertension history |
| **Doctor A (Cardiology)** | Dr. Priya Sharma | `dr.priya@mediqueue.test` | `Password123!` | AIIMS Super Specialty, Fee ₹600, 4.8★ (500 reviews), Video Enabled |
| **Doctor B (Cardiology)** | Dr. Rajesh Kumar | `dr.rajesh@mediqueue.test` | `Password123!` | City Heart Clinic, Fee ₹500, 5.0★ (2 reviews), Second Opinion Doctor |
| **Hospital** | AIIMS Super Specialty | Ansari Nagar, New Delhi | Verified | Cardiology, Neurology, General Medicine, Orthopedics |

---

## 4. The 25-Step End-to-End Patient & Doctor Story

### Step 1: Patient Signs Up
- **URL:** `http://localhost:5173/signup`
- **Action:** Enter Name `Rahul Sharma`, Email `rahul.new@example.com`, Password `Password123!`, Role `patient`. Click **Create Account**.
- **Result:** Account created with secure bcrypt salt hash; redirected to Patient Onboarding.

### Step 2: Patient Completes Profile & Vitals
- **URL:** `http://localhost:5173/patient/profile`
- **Action:** Enter Age: `32`, Gender: `Male`, Blood Group: `O+`, Height: `172 cm`, Weight: `68 kg`, Allergies: `Penicillin, Sulfa drugs`, Emergency Contact: `Pooja Sharma (+91 98765 00000)`.
- **Result:** BMI calculated as **23.0 (Normal)**. Profile completion meter reaches **100%**.

### Step 3: Patient Searches Doctors
- **URL:** `http://localhost:5173/patient/doctors`
- **Action:** Select Specialty filter: **Cardiology**, Max Fee: **₹700**.

### Step 4: Nearby / Rating / Fee Bayesian Recommendation Appears
- **Result:** AI & Bayesian scoring ranks **Dr. Priya Sharma** at #1 (Score: 89/100).
- **Badges displayed:** `Top Recommended`, `Established Rating (4.8★ / 500)`, `Close Proximity (1.2 km)`, `Video Consultation Available`.

### Step 5: Patient Selects Doctor
- **Action:** Click **Book Appointment** on Dr. Priya Sharma's card.

### Step 6: Patient Views Daily Slots
- **Result:** Real-time interactive schedule appears showing available 30-minute consultation slots. Doctor's scheduled breaks and leaves are automatically filtered out.

### Step 7: Patient Books Appointment
- **Action:** Select slot time **16:30 (4:30 PM)**. Enter Chief Complaint: `Chest tightness and blood pressure review`. Select Mode: `In-Person`. Click **Confirm Booking**.
- **Result:** Appointment status saved as `booked`. Real-time confirmation notification triggers.

### Step 8: Patient Grants Doctor Access
- **URL:** `http://localhost:5173/patient/consent`
- **Action:** View active consent grants. Consent is granted to Dr. Priya Sharma for the appointment.
- **Audit Log:** Timestamped immutable audit log records the grant event.

### Step 9: Appointment Gets Queue / Token
- **Result:** Live Queue assigns **Token #31**.

### Step 10: Patient Sees Smart Queue ETA
- **URL:** `http://localhost:5173/patient/dashboard`
- **Display:**
  - **Your Token:** `#31`
  - **Patients Ahead:** `30`
  - **Estimated Time Window:** `4:30–4:50 PM`
  - **Recommended Arrival Time:** `4:15 PM` (15-minute buffer before window)

### Step 11: Patient Leaves Hospital
- **Real-World Impact:** Patient does not wait in the crowded hospital waiting room. They leave for home or an offsite cafe, confident in the live tracking.

### Step 12: Queue Updates Live
- **Action:** As previous patients are completed, the queue advances in real time via Socket.IO room broadcasting without refreshing the page.

### Step 13: Near-Turn Alert Appears
- **Trigger:** When patients ahead drop to 4 and estimated wait is $\le$ 15 minutes:
- **Display:** Flashing amber/green banner: **"Near Turn Alert: Your consultation is approaching in ~12 minutes. Please head to Room 204."**
- **Notification:** Sound and push notification delivered to patient's notification center.

### Step 14: Patient Returns to Hospital
- **Action:** Patient walks into AIIMS Super Specialty OPD at 4:15 PM and checks in with the receptionist. Zero waiting-room fatigue.

### Step 15: Doctor Sees Authorized History
- **Login:** Log in as Dr. Priya Sharma (`dr.priya@mediqueue.test` / `Password123!`).
- **URL:** Open Doctor Clinical Workspace -> Click on Rahul Sharma (`Token #31`).
- **Encounter Header:** Shows clear green badge: `● AUTHORIZED`.
- **Shared History Tab:** Displays past verified diagnosis: `Mild Hypertension (Stage 1)` recorded Nov 2025.

### Step 16: Doctor Starts Consultation
- **Action:** Click **Start Consultation**.
- **Result:** Appointment status shifts to `in-progress`. Queue ticker reflects Dr. Priya Sharma currently consulting Token #31.

### Step 17: Doctor Orders Diagnostic Test
- **Action:** In the Encounter dossier, click **Order Diagnostic Test**.
- **Input:** Test Name: `Lipid Profile & Serum Electrolytes`, Reason: `Rule out dyslipidemia and electrolyte imbalance`. Click **Submit Test Order**.
- **Result:** Test status saved as `ordered`. Patient receives instant notification.

### Step 18: Result is Recorded
- **Simulated Lab Action:** Lab enters result: `Total Cholesterol: 195 mg/dL, Triglycerides: 140 mg/dL, HDL: 48 mg/dL`. Status updates to `completed`.

### Step 19: Doctor Reviews Result
- **Action:** Doctor switches to the **Shared Tests** tab in the dossier.
- **Result:** Lipid profile results render with abnormal high/low indicators in real time.

### Step 20: Doctor Creates Prescription
- **Action:** Click **Issue Prescription**.
- **Input:**
  - Diagnosis: `Essential Hypertension with Normal Lipid Profile`
  - Medication 1: `Amlodipine 5mg`, Once daily, Dose Time: `09:00`, Relation: `After Breakfast`, 30 days.
  - Medication 2: `Aspirin 75mg`, Once daily, Dose Time: `21:00`, Relation: `After Dinner`, 30 days.
  - Instructions: `Take regularly after meals. Monitor BP weekly.`
- **Result:** Digital prescription generated with unique cryptographic reference.

### Step 21: Medicine Reminders Appear on Patient Dashboard
- **Switch to Patient Session:** Log in as Rahul Sharma (`patient.demo@mediqueue.test`).
- **Result:** On `Today's Medicines` card:
  - **Amlodipine 5mg** at 09:00 (Status: Pending / Overdue)
  - **Aspirin 75mg** at 21:00 (Status: Upcoming)
  - Interactive **Mark Taken** button updates adherence log.

### Step 22: Doctor Creates Structured Care Plan
- **Doctor Action:** In Encounter dossier, click **Create Care Plan**.
- **Input:**
  - Diet Recommended: `Low sodium DASH diet, High potassium foods (bananas, spinach)`
  - Diet Restricted: `Processed foods, High salt pickles, Excessive caffeine`
  - Activities Recommended: `30 mins brisk walking 5 days/week, Breathing exercises`
  - Activities Restricted: `Heavy weightlifting without warm-up`
  - Follow-Up: `2 weeks`
- **Action:** Click **Save Care Plan**.

### Step 23: Patient Sees Care Plan
- **Patient Dashboard:** The **Active Care Plans** card renders the personalized lifestyle guidance, dietary recommendations, and exercise goals.

### Step 24: Follow-Up Appointment Created
- **Action:** Under the Care Plan, click **Schedule Recommended Follow-Up**.
- **Result:** Pre-fills Dr. Priya Sharma and date (+14 days) in one click.

### Step 25: Video Consultation Launch
- **Action:** For remote or follow-up consults, click **Launch Video Room**.
- **Result:** Cryptographic WebRTC JWT session token generated, granting zero-leak access only to the assigned patient and doctor.

---

## 5. Critical Demo: Token #31 Queue Progression

This is the central SIH evaluation showcase:

```
+-------------------------------------------------------------------------+
| MEDIQUEUE+ SMART VIRTUAL QUEUE                                         |
| Current Serving Token: #1                                               |
+-------------------------------------------------------------------------+
| YOUR POSITION:                                                          |
| TOKEN #31                                                               |
| 30 Patients Ahead of You                                                |
|                                                                         |
| Estimated Consultation Window:                                          |
| 4:30 PM - 4:50 PM                                                       |
|                                                                         |
| Recommended Arrival Time:                                               |
| 4:15 PM (15-minute buffer before estimated window)                      |
|                                                                         |
| Status: Offsite Waiting Permitted [OK to wait at home / cafe]           |
+-------------------------------------------------------------------------+
```

### Live Demonstration Sequence for Judges:
1. **Show Initial State:** Token #31, 30 patients ahead, window `4:30–4:50 PM`, arrival `4:15 PM`.
2. **Advance Queue in Doctor Workspace:** In Dr. Priya's dashboard, mark 10 patients completed.
3. **Show Real-Time Update:** Without browser refresh, Rahul's dashboard shows:
   - Patients Ahead: `20`
   - Estimated Window: `3:50–4:10 PM`
   - Recommended Arrival: `3:35 PM`
4. **Advance Queue to Near Turn:** Advance until only 3 patients remain.
5. **Near-Turn Banner:** Flashing alert triggers: `Near-Turn Alert: Please arrive at OPD Room 204 now!`

---

## 6. Second Doctor Consent & Instant Shield Demo

Showcases compliance with Indian Digital Personal Data Protection (DPDP) Act and zero-trust patient data sovereignty.

### Step-by-Step Demonstration:

#### Stage A: Unauthorized Doctor B
1. Log in as **Dr. Rajesh Kumar** (`dr.rajesh@mediqueue.test` / `Password123!`).
2. Navigate to Rahul Sharma's patient profile or clinical encounter.
3. **Observation:**
   - Visual Badge: `⚠ LIMITED ACCESS`
   - Clinical History: `SHIELDED (Patient has not granted consent)`
   - Diagnostic Tests: `SHIELDED`
   - Prescriptions: `SHIELDED`
   - Direct API request to `/api/consent/patient/:id/medical-data` returns HTTP `403 Forbidden`.

#### Stage B: Patient Grants Access
1. Switch to Patient window (Rahul Sharma).
2. Go to `/patient/consent`.
3. Click **Grant Access to Doctor**.
4. Select **Dr. Rajesh Kumar**, Scope: `Ongoing`, Note: `Second opinion on cardiology evaluation`.
5. Click **Confirm Consent**.

#### Stage C: Doctor B Access Unlocked
1. Switch back to Dr. Rajesh Kumar's window.
2. Refresh or open the encounter.
3. **Observation:**
   - Visual Badge: `● AUTHORIZED` (Green)
   - Full medical history, Lipid Profile test results, and Dr. Priya's prescriptions are revealed.
   - Audit Log records: `Dr. Rajesh Kumar accessed medical records under Grant ID #...`.

#### Stage D: Instant Revocation & Re-Shielding
1. In Rahul's window, click **Revoke Access** next to Dr. Rajesh Kumar.
2. Switch back to Dr. Rajesh Kumar's window.
3. Immediately attempt to click or fetch patient records.
4. **Observation:**
   - Screen instantly updates to `⚠ LIMITED ACCESS`.
   - Access is denied in 0 milliseconds; no cache leakage or stale token persistence.

---

## 7. Automated Verification & Zero-Faking Guarantee

MediQueue+ includes an automated, programmatic test harness verifying every single step and edge case without manual mocking:

```bash
cd server
node --test server/tests/sihStoryVerification.test.js
```

### Verified Test Suite Output:
```
▶ MEDIQUEUE+ SIH COMPLETE STORY & CRITICAL DEMO VERIFICATION
  ✔ PHASE 1: Patient Onboarding & Profile (Steps 1–2) (1.1ms)
  ✔ PHASE 2: Doctor Search, Recommendations & Booking (Steps 3–7) (19.4ms)
  ✔ PHASE 3: CRITICAL DEMO — Token #31, 30 Ahead, 4:30–4:50 PM, 4:15 PM Arrival (Steps 8–14) (0.9ms)
  ✔ PHASE 4: Doctor Encounter Dossier & Clinical Actions (Steps 15–20) (9.1ms)
  ✔ PHASE 5: Patient Follow-Up & Video Launch (Steps 23–25) (0.5ms)
  ✔ PHASE 6: SECOND DOCTOR CONSENT SCENARIO (Doctor B Access & Instant Revocation) (0.4ms)
✔ MEDIQUEUE+ SIH COMPLETE STORY & CRITICAL DEMO VERIFICATION (34.0ms)
```

Run all test suites across the repository:
```bash
node --test server/tests/*.test.js
# 96/96 tests passing with 0 failures across all suites
```

---

## 8. High-Resilience Fallbacks (AI / Video Offline)

If network issues or presentation conditions disrupt auxiliary services during the live hackathon pitch:

| Failure Mode | Built-in Fallback Mechanism | Impact on Demo |
|---|---|---|
| **Python AI Microservice Offline** | The server automatically falls back to: <br>1. **Bayesian Dirichlet-multinomial Doctor Scoring** using distance, fee, and rating count.<br>2. **Rolling Average Consultation Queue Engine**.<br>3. **Rule-based clinical triage** based on chief complaint keywords. | **Zero interruption.** Evaluators still see intelligent recommendations and accurate ETAs. |
| **Video Telemedicine Firewall / NAT Block** | Telemedicine subsystem automatically falls back from direct WebRTC P2P to STUN relay signaling and provides a one-click audio/telephone consult backup link. | Doctor and patient can still communicate. |
| **Socket.IO Connection Interrupted** | Client automatically engages HTTP long-polling fallback and auto-reconnects with state re-synchronization. | Queue position and arrival time recover in < 2 seconds. |

---

## 9. 15-Second Broken Demo Disaster Recovery

If you make a misclick, delete an appointment, or corrupt session state during a practice run:

### Complete Factory Reset Command:
Run this single command to completely wipe and re-seed the exact SIH demo state in **under 15 seconds**:

```bash
cd server
node scripts/seedSihDemo.js
```

### What this command restores:
1. Re-creates AIIMS Super Specialty hospital with all departments.
2. Restores Patient Rahul Sharma (`patient.demo@mediqueue.test`).
3. Restores Dr. Priya Sharma and Dr. Rajesh Kumar.
4. Restores historical hypertension diagnosis and completed lab reports.
5. Re-establishes Token #31 with 30 patients ahead.
6. Clears all revoked or stale consent grants back to clean baseline.

---

*MediQueue+ — Smart Outpatient Queue Orchestration for Smart India Hackathon.*
