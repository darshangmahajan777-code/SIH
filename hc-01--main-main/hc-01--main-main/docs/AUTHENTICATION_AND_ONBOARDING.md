# MediQueue+ — Patient + Doctor/Business Login & Onboarding Architecture

This document specifies the authentication, onboarding, role-based authorization, and protected routing architecture implemented in MediQueue+ (Prompt 37).

---

## 1. Architectural Overview

MediQueue+ provides two primary entry options:
1. **Patient / User Portal**: Tailored for patients to register with clinical vitals (blood group, height, weight, allergies, emergency contact), calculate live BMI, log in, and access their appointments and smart virtual queue.
2. **Doctor / Business Portal**: Tailored for individual medical practitioners and clinical enterprises to complete professional onboarding (specialty, qualifications, experience, license number, consultation and follow-up fees, location, clinic/practice details, offered services, consultation modes, and weekly schedule).

In addition, an authorized **Hospital Staff & Administration Portal** is preserved for Receptionists, Hospital Administrators, Clinic Managers, and Triage Nurses.

```
                     ┌──────────────────────────────────────────────┐
                     │          MediQueue+ Auth Gateway             │
                     │          (/auth, /login, /signup)            │
                     └──────────────────────┬───────────────────────┘
                                            │
               ┌────────────────────────────┼────────────────────────────┐
               ▼                            ▼                            ▼
   ┌───────────────────────┐   ┌──────────────────────────┐   ┌───────────────────────┐
   │    Patient / User     │   │    Doctor / Business     │   │  Staff & Admin Desk   │
   │  - Login / Signup     │   │  - Login                 │   │  - Receptionist       │
   │  - Vitals & Allergies │   │  - Onboarding & Profile  │   │  - Hospital Admin     │
   │  - Emergency Contact  │   │  - Clinic & Fees         │   │  - Clinic Manager     │
   │  - Live BMI Calc      │   │  - Modes (In-Person/Vid) │   │  - Triage Nurse       │
   └───────────┬───────────┘   └────────────┬─────────────┘   └───────────┬───────────┘
               │                            │                             │
               ▼                            ▼                             ▼
   ┌───────────────────────┐   ┌──────────────────────────┐   ┌───────────────────────┐
   │ Patient Hub & Tracker │   │ Doctor Clinical Workspace│   │ Reception & Hospitals │
   │ (/patient-dashboard)  │   │ (/doctor, /doctor-opd)   │   │ (/reception,/hospitals│
   └───────────────────────┘   └──────────────────────────┘   └───────────────────────┘
```

---

## 2. Authentication System & Cryptography

### 2.1 Password Security
- Passwords are encrypted using Node.js native `crypto.scryptSync` keyed with a 16-byte cryptographically secure random salt (`crypto.randomBytes(16)`).
- Storage format: `<salt_hex>:<derived_key_hex>`.
- Constant-time verification is enforced using `crypto.timingSafeEqual` to eliminate timing attacks.
- Backward compatibility is maintained for pre-seeded Hackathon demonstration accounts with synthetic password `demo123`.

### 2.2 Standard HMAC-SHA256 JWT
- Tokens are standard three-part dot-separated JSON Web Tokens (`<header>.<payload>.<signature>`) signed with HMAC-SHA256 using `JWT_SECRET`.
- Payloads carry `userId`, `email`, `role`, `name`, `hospitalId`, and expiration timestamp (`exp`).
- Tampered payloads or signatures are safely rejected via constant-time signature comparison (`timingSafeEqual`).
- Tokens have a 7-day validity period.

---

## 3. Endpoints & API Contract

All authentication routes are mounted at `/api/auth`:

### 3.1 Patient Signup
- **Route**: `POST /api/auth/patient/signup`
- **Access**: Public
- **Request Body**:
  ```json
  {
    "name": "Anil Kapoor",
    "email": "anil.kapoor@example.com",
    "password": "Password@123",
    "phone": "+91-9876543210",
    "age": 35,
    "gender": "male",
    "bloodGroup": "B+",
    "height": 178,
    "weight": 74,
    "allergies": ["Dust", "Pollen"],
    "emergencyContact": {
      "name": "Sunita Kapoor",
      "phone": "+91-9876500000",
      "relation": "Spouse"
    }
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "Patient account created successfully",
    "data": {
      "user": {
        "_id": "65f0...",
        "name": "Anil Kapoor",
        "email": "anil.kapoor@example.com",
        "role": "patient",
        "bloodGroup": "B+",
        "height": 178,
        "weight": 74,
        "allergies": ["Dust", "Pollen"]
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
  ```

### 3.2 Patient Login
- **Route**: `POST /api/auth/patient/login`
- **Access**: Public
- **Request Body**: `{ "email": "anil.kapoor@example.com", "password": "Password@123" }`
- **Response (200 OK)**: Returns `{ success: true, data: { user, token } }`
- **Security Check**: Enforces role `patient`. If a doctor attempts login through this portal, returns `403 Forbidden`.

### 3.3 Doctor / Business Onboarding & Signup
- **Route**: `POST /api/auth/doctor/signup`
- **Access**: Public
- **Request Body**:
  ```json
  {
    "name": "Dr. Vikram Malhotra",
    "email": "dr.vikram@delhicardio.test",
    "password": "DocPassword@2026",
    "phone": "+91-9811223344",
    "specialty": "Cardiology",
    "qualifications": ["MBBS", "MD (Cardiology)", "DM"],
    "experienceYears": 14,
    "medicalLicenseNumber": "DMC-2012-98765",
    "consultationFee": 1200,
    "followUpFee": 600,
    "hospitalName": "Delhi Heart & Vascular Institute",
    "clinicDetails": {
      "clinicName": "Delhi Heart Clinic",
      "registrationNumber": "REG-DMC-98765",
      "contactPhone": "+91-11-23456789",
      "taxId": "GSTIN-07AAACD1234F1Z5"
    },
    "services": ["ECG", "Echocardiogram", "Cardiac Consultation"],
    "consultationModes": ["in-person", "video"],
    "location": { "address": "Ring Road, Lajpat Nagar-IV, New Delhi" },
    "videoEnabled": true
  }
  ```
- **Response (201 Created)**: Returns `{ success: true, data: { user, doctorProfile, token } }`

### 3.4 Doctor Login
- **Route**: `POST /api/auth/doctor/login`
- **Access**: Public
- **Request Body**: `{ "email": "dr.vikram@delhicardio.test", "password": "DocPassword@2026" }`
- **Response (200 OK)**: Returns `{ success: true, data: { user, doctorProfile, token } }`
- **Security Check**: Enforces role `doctor`. If a patient attempts login through this portal, returns `403 Forbidden`.

### 3.5 Unified Login (Staff & Administrators)
- **Route**: `POST /api/auth/login`
- **Access**: Public
- **Request Body**: `{ "email": "reception.demo@mediqueue.test", "password": "demo123", "role": "receptionist" }`
- **Response (200 OK)**: Returns `{ success: true, data: { user, token } }`

### 3.6 Current Profile
- **Route**: `GET /api/auth/me`
- **Access**: Private (`authenticateUser` Bearer Token required)
- **Response (200 OK)**: Returns `{ success: true, data: { user, doctorProfile } }`

---

## 4. Role-Based Routing & Protected Pages

### 4.1 Role Hierarchy & Permissions
| Role | Primary Purpose | Protected Paths |
|---|---|---|
| `patient` | General User & Care Seeker | `/patient-dashboard`, `/my-appointments`, `/appointments-tracker`, `/my-data` |
| `doctor` | Medical Practitioner / Specialist | `/doctor`, `/doctor-workspace`, `/doctor-opd`, `/doctor-schedule`, `/doctor-appointments` |
| `receptionist` | Hospital Front Desk | `/reception` |
| `hospital_admin`| Hospital-scoped Manager | `/hospitals`, `/hospital-admin`, `/reception` |
| `clinic_manager`| Outpatient Clinic Manager | `/hospitals`, `/hospital-admin` |
| `nurse` | Clinical Triage Staff | Ward & triage endpoints |
| `admin` | Universal Platform Administrator | Universal access across all routes and hospitals |

### 4.2 Frontend Route Protection (`ProtectedRoute.jsx`)
- Automatically inspects the current user session from `AuthContext`.
- If unauthenticated: redirects to `/auth` with the target route stored in `location.state.from`.
- If role does not match: displays an interactive **Access Restricted** card with buttons to switch account or navigate to their home portal.

---

## 5. Verification & Test Suite

The authentication system is covered by 27 automated unit and integration tests in `server/tests/authAndOnboarding.test.js`:
- `npm test` runs 138 passing tests across 18 test suites.
- Validates password hashing, constant-time checks, JWT signature verification, tampering detection, patient signup with vitals, doctor/business onboarding with fees/modes/schedule, portal role separation, and middleware enforcement.
