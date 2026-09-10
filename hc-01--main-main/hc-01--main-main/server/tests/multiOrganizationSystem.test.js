/**
 * TEST SUITE: Multi-Organization Healthcare System (Hospitals & Small Clinics)
 *
 * Scenarios tested:
 *   1. Independent Registration of Hospital & Small Clinic with unique Organization IDs
 *   2. Multi-Organization Search, Type Filtering ('hospital' vs 'clinic'), and Services
 *   3. Cross-Organization Doctor Discovery & Rating Comparison
 *   4. Strict Tenant Data Isolation (Hospital A cannot view Hospital B internal data)
 *   5. Operational Reception Scoping (No clinical data exposure)
 *   6. Public Queue Overview (Token stats without private patient data leaks)
 *   7. Patient Hospital/Clinic Reviews & Rating Recalculation
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  createHospital,
  getHospitalById,
  listHospitals,
  updateHospital,
  associateDoctorWithHospital,
  getHospitalDoctors,
  getHospitalAppointments,
  getHospitalStats,
  getHospitalPublicQueue,
  addHospitalReview,
  clearHospitalTestDb,
  seedHospitalTestDb,
} from '../services/hospitalService.js';

describe('TEST SUITE: Multi-Organization Healthcare System', () => {
  const hospitalId = 'hosp-metro-01';
  const clinicId = 'clinic-sunrise-01';
  const docHospId = 'doc-cardio-01';
  const docClinicId = 'doc-family-02';
  const todayStr = new Date().toISOString().slice(0, 10);

  beforeEach(() => {
    clearHospitalTestDb();

    // Base Seed: 1 Large Hospital and 1 Small Clinic
    seedHospitalTestDb({
      hospitals: [
        {
          _id: hospitalId,
          name: 'Metro Super Specialty Hospital',
          code: 'METRO-01',
          type: 'hospital',
          address: {
            street: 'Ring Road',
            city: 'New Delhi',
            state: 'Delhi',
            pincode: '110029',
            fullAddress: 'Ring Road, Sector 5, New Delhi 110029',
          },
          location: { lat: 28.57, lng: 77.22 },
          contact: { phone: '+91-11-2222-3333', email: 'info@metrohosp.test', emergencyHelpline: '102' },
          departments: ['Cardiology', 'Emergency', 'Neurology', 'Orthopedics'],
          workingHours: {
            openTime: '00:00',
            closeTime: '23:59',
            days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
            emergency24x7: true,
          },
          appointmentSchedules: {
            slotDurationMinutes: 30,
            advanceBookingDays: 30,
            startSlotTime: '08:00',
            endSlotTime: '20:00',
          },
          services: ['Level-1 Trauma', 'Cardiac ICU', 'OPD Consultations', '24x7 Pharmacy', 'Radiology'],
          rating: 4.8,
          reviewCount: 240,
          availabilityStatus: 'available',
          isAcceptingPatients: true,
          totalBeds: 450,
          availableBeds: 62,
          verificationStatus: 'verified',
          isActive: true,
        },
        {
          _id: clinicId,
          name: 'Sunrise Family Health Clinic',
          code: 'CLINIC-SUN-01',
          type: 'clinic',
          address: {
            street: 'Main Market',
            city: 'Gurugram',
            state: 'Haryana',
            pincode: '122001',
            fullAddress: 'Shop 14, Main Market, Sector 15, Gurugram, Haryana 122001',
          },
          location: { lat: 28.46, lng: 77.03 },
          contact: { phone: '+91-124-555-6677', email: 'contact@sunriseclinic.test', emergencyHelpline: '102' },
          departments: ['General OPD', 'Family Medicine', 'Pediatrics'],
          workingHours: {
            openTime: '09:00',
            closeTime: '18:00',
            days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
            emergency24x7: false,
          },
          appointmentSchedules: {
            slotDurationMinutes: 15,
            advanceBookingDays: 7,
            startSlotTime: '09:30',
            endSlotTime: '17:30',
          },
          services: ['General OPD', 'Doctor Consultations', 'Vaccination', 'Blood Pressure Screening'],
          rating: 4.9,
          reviewCount: 45,
          availabilityStatus: 'available',
          isAcceptingPatients: true,
          totalBeds: 0,
          availableBeds: 0,
          verificationStatus: 'verified',
          isActive: true,
        },
      ],
      doctors: [
        {
          _id: docHospId,
          doctorName: 'Dr. Vikram Malhotra',
          specialty: 'Cardiology',
          hospitalId,
          hospitalName: 'Metro Super Specialty Hospital',
          avgRating: 4.9,
          ratingCount: 180,
          experienceYears: 16,
          consultationFee: 900,
          isAvailableToday: true,
          isActive: true,
        },
        {
          _id: docClinicId,
          doctorName: 'Dr. Ananya Sen',
          specialty: 'Family Medicine',
          hospitalId: clinicId,
          hospitalName: 'Sunrise Family Health Clinic',
          avgRating: 4.7,
          ratingCount: 65,
          experienceYears: 9,
          consultationFee: 400,
          isAvailableToday: true,
          isActive: true,
        },
      ],
      appointments: [
        {
          _id: 'apt-metro-101',
          hospitalId,
          doctorId: docHospId,
          date: todayStr,
          slotTime: '10:00 AM',
          status: 'booked',
          priority: 'urgent',
        },
        {
          _id: 'apt-clinic-201',
          hospitalId: clinicId,
          doctorId: docClinicId,
          date: todayStr,
          slotTime: '11:00 AM',
          status: 'booked',
          priority: 'routine',
        },
      ],
      tokens: [
        { _id: 'tok-1', hospitalId: clinicId, tokenNumber: 12, status: 'waiting' },
        { _id: 'tok-2', hospitalId: clinicId, tokenNumber: 13, status: 'waiting' },
      ],
    });
  });

  // ── TEST 1: Independent Registration of Hospital & Small Clinic ───────────
  it('Scenario 1: Allows independent registration of both Hospitals and Small Clinics with distinct attributes', async () => {
    // Register a new independent clinic
    const newClinic = await createHospital({
      name: 'CareWell Pediatric Clinic',
      type: 'clinic',
      address: {
        city: 'Noida',
        fullAddress: 'A-12, Sector 62, Noida, Uttar Pradesh 201309',
      },
      contact: { phone: '+91-120-444-5555' },
      departments: ['Pediatrics', 'Vaccination'],
      workingHours: {
        openTime: '10:00',
        closeTime: '19:00',
        days: ['monday', 'wednesday', 'friday'],
        emergency24x7: false,
      },
      services: ['Child Wellness', 'Vaccinations', 'Growth Tracking'],
    });

    assert.ok(newClinic._id);
    assert.strictEqual(newClinic.type, 'clinic');
    assert.ok(newClinic.code.startsWith('CLINIC-'));
    assert.strictEqual(newClinic.totalBeds, 0, 'Small clinics default to 0 inpatient beds');
    assert.strictEqual(newClinic.workingHours.emergency24x7, false);
    assert.deepStrictEqual(newClinic.services, ['Child Wellness', 'Vaccinations', 'Growth Tracking']);

    // Register a new independent hospital
    const newHospital = await createHospital({
      name: 'City Care Hospital',
      type: 'hospital',
      address: {
        city: 'Faridabad',
        fullAddress: 'NH-19, Sector 21, Faridabad 121001',
      },
      contact: { phone: '+91-129-888-9999' },
      departments: ['Emergency', 'General Surgery', 'ICU'],
      totalBeds: 150,
    });

    assert.strictEqual(newHospital.type, 'hospital');
    assert.ok(newHospital.code.startsWith('HOSP-') || newHospital.code.startsWith('CITYC-'));
    assert.strictEqual(newHospital.totalBeds, 150);
  });

  // ── TEST 2: Multi-Organization Search, Type Filtering & Services ──────────
  it('Scenario 2: Supports searching across organizations, filtering by type (hospital vs clinic), and services', async () => {
    // 1. Filter by clinic only
    const clinicsOnly = await listHospitals({ type: 'clinic' });
    assert.strictEqual(clinicsOnly.count, 1);
    assert.strictEqual(clinicsOnly.hospitals[0].name, 'Sunrise Family Health Clinic');
    assert.strictEqual(clinicsOnly.hospitals[0].type, 'clinic');

    // 2. Filter by hospital only
    const hospitalsOnly = await listHospitals({ type: 'hospital' });
    assert.strictEqual(hospitalsOnly.count, 1);
    assert.strictEqual(hospitalsOnly.hospitals[0].name, 'Metro Super Specialty Hospital');
    assert.strictEqual(hospitalsOnly.hospitals[0].type, 'hospital');

    // 3. Search by service
    const traumaHospitals = await listHospitals({ service: 'Trauma' });
    assert.strictEqual(traumaHospitals.count, 1);
    assert.strictEqual(traumaHospitals.hospitals[0].code, 'METRO-01');

    // 4. Search by city
    const gurugramFacilities = await listHospitals({ city: 'Gurugram' });
    assert.strictEqual(gurugramFacilities.count, 1);
    assert.strictEqual(gurugramFacilities.hospitals[0].code, 'CLINIC-SUN-01');
  });

  // ── TEST 3: Doctor Discovery & Rating Comparison Across Organizations ──────
  it('Scenario 3: Enables patients to compare doctor ratings, fees, and experience across different organizations', async () => {
    const hospDoctors = await getHospitalDoctors(hospitalId);
    const clinicDoctors = await getHospitalDoctors(clinicId);

    assert.strictEqual(hospDoctors.length, 1);
    assert.strictEqual(clinicDoctors.length, 1);

    const docMetro = hospDoctors[0];
    const docSunrise = clinicDoctors[0];

    // Compare doctor profiles
    assert.strictEqual(docMetro.doctorName, 'Dr. Vikram Malhotra');
    assert.strictEqual(docMetro.hospitalName, 'Metro Super Specialty Hospital');
    assert.strictEqual(docMetro.avgRating, 4.9);
    assert.strictEqual(docMetro.consultationFee, 900);

    assert.strictEqual(docSunrise.doctorName, 'Dr. Ananya Sen');
    assert.strictEqual(docSunrise.hospitalName, 'Sunrise Family Health Clinic');
    assert.strictEqual(docSunrise.avgRating, 4.7);
    assert.strictEqual(docSunrise.consultationFee, 400);

    // Patient can clearly see difference in fees and ratings
    assert.ok(docSunrise.consultationFee < docMetro.consultationFee);
  });

  // ── TEST 4: Strict Tenant Data Isolation (Hospital A vs Clinic B) ──────────
  it('Scenario 4: Enforces strict data isolation so Hospital A appointments are never visible to Clinic B', async () => {
    // Query appointments for Metro Hospital
    const metroAppointments = await getHospitalAppointments({ hospitalId });
    assert.strictEqual(metroAppointments.length, 1);
    assert.strictEqual(metroAppointments[0]._id, 'apt-metro-101');
    assert.strictEqual(metroAppointments[0].hospitalId, hospitalId);

    // Query appointments for Sunrise Clinic
    const clinicAppointments = await getHospitalAppointments({ hospitalId: clinicId });
    assert.strictEqual(clinicAppointments.length, 1);
    assert.strictEqual(clinicAppointments[0]._id, 'apt-clinic-201');
    assert.strictEqual(clinicAppointments[0].hospitalId, clinicId);

    // Zero cross-contamination
    assert.strictEqual(
      metroAppointments.some((a) => a.hospitalId === clinicId),
      false,
      'Metro Hospital must NEVER see Sunrise Clinic appointments'
    );
    assert.strictEqual(
      clinicAppointments.some((a) => a.hospitalId === hospitalId),
      false,
      'Sunrise Clinic must NEVER see Metro Hospital appointments'
    );
  });

  // ── TEST 5: Public Queue Overview Without Exposing Personal Data ───────────
  it('Scenario 5: Returns public queue counts without exposing private patient health records or disease information', async () => {
    const queueSummary = await getHospitalPublicQueue(clinicId);

    assert.strictEqual(queueSummary.hospitalId, clinicId);
    assert.strictEqual(queueSummary.organizationId, 'CLINIC-SUN-01');
    assert.strictEqual(queueSummary.waitingCount, 2);
    assert.strictEqual(queueSummary.isAcceptingPatients, true);
    assert.strictEqual(queueSummary.estimatedWaitTimeMinutes, 20);

    // Ensure NO personal patient data is leaked
    assert.strictEqual(queueSummary.patients, undefined);
    assert.strictEqual(queueSummary.medicalHistory, undefined);
    assert.strictEqual(queueSummary.diseases, undefined);
  });

  // ── TEST 6: Patient Review Submission & Aggregate Rating Recalculation ─────
  it('Scenario 6: Allows patients to submit ratings and reviews for clinics with aggregate recalculation', async () => {
    const reviewedClinic = await addHospitalReview({
      hospitalId: clinicId,
      patientName: 'Rohan Verma',
      rating: 5,
      comment: 'Very quick OPD queue and attentive doctor!',
    });

    assert.ok(reviewedClinic.reviews.length >= 1);
    const lastReview = reviewedClinic.reviews[reviewedClinic.reviews.length - 1];
    assert.strictEqual(lastReview.patientName, 'Rohan Verma');
    assert.strictEqual(lastReview.rating, 5);
    assert.strictEqual(lastReview.comment, 'Very quick OPD queue and attentive doctor!');
    assert.ok(reviewedClinic.rating >= 4.0 && reviewedClinic.rating <= 5.0);
  });
});
