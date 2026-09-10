import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function AuthPortal() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginAsPatient, loginAsDoctor, loginWithRole, registerPatientUser, registerDoctorUser } = useAuth();

  // Active portal tab: 'patient' | 'doctor' | 'staff'
  const [activePortal, setActivePortal] = useState('patient');
  // Form mode: 'login' | 'signup'
  const [authMode, setAuthMode] = useState('login');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // ── Patient State ──
  const [patientForm, setPatientForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    age: '',
    gender: 'prefer_not_to_say',
    bloodGroup: 'unknown',
    height: '',
    weight: '',
    allergies: '',
    emergencyName: '',
    emergencyPhone: '',
    emergencyRelation: '',
  });

  // ── Doctor / Business State ──
  const [doctorForm, setDoctorForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    specialty: 'General Medicine',
    qualifications: 'MBBS, MD',
    experienceYears: 5,
    medicalLicenseNumber: '',
    consultationFee: 500,
    followUpFee: 300,
    hospitalName: '',
    clinicName: '',
    clinicPhone: '',
    taxId: '',
    clinicAddress: '',
    services: 'General Consultation, Routine Checkup',
    inPersonMode: true,
    videoMode: true,
  });

  // ── Staff Login State ──
  const [staffForm, setStaffForm] = useState({
    email: '',
    password: '',
    role: 'receptionist',
  });

  const from = location.state?.from?.pathname || null;

  // Live BMI computation for patient signup
  const bmi =
    patientForm.height && patientForm.weight && Number(patientForm.height) > 0
      ? (Number(patientForm.weight) / Math.pow(Number(patientForm.height) / 100, 2)).toFixed(1)
      : null;

  // ── Quick Fill Demo Accounts ──
  const fillDemoAccount = (roleType) => {
    setErrorMsg('');
    if (roleType === 'patient') {
      setActivePortal('patient');
      setAuthMode('login');
      setPatientForm((prev) => ({
        ...prev,
        email: 'patient.demo@mediqueue.test',
        password: 'demo123',
      }));
      toast.success('Loaded Demo Patient credentials');
    } else if (roleType === 'doctor') {
      setActivePortal('doctor');
      setAuthMode('login');
      setDoctorForm((prev) => ({
        ...prev,
        email: 'dr.priya@mediqueue.test',
        password: 'demo123',
      }));
      toast.success('Loaded Demo Doctor (Dr. Priya Sharma) credentials');
    } else if (roleType === 'receptionist') {
      setActivePortal('staff');
      setStaffForm({
        email: 'reception.demo@mediqueue.test',
        password: 'demo123',
        role: 'receptionist',
      });
      toast.success('Loaded Demo Receptionist credentials');
    } else if (roleType === 'admin') {
      setActivePortal('staff');
      setStaffForm({
        email: 'admin.demo@mediqueue.test',
        password: 'demo123',
        role: 'admin',
      });
      toast.success('Loaded Demo Hospital Admin credentials');
    }
  };

  // ── Submit Handlers ──
  const handlePatientSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');

    try {
      if (authMode === 'login') {
        await loginAsPatient({
          email: patientForm.email,
          password: patientForm.password,
        });
        toast.success('Welcome back to your Health Hub!');
        navigate(from || '/patient-dashboard');
      } else {
        await registerPatientUser({
          name: patientForm.name,
          email: patientForm.email,
          password: patientForm.password,
          phone: patientForm.phone,
          age: patientForm.age ? Number(patientForm.age) : null,
          gender: patientForm.gender,
          bloodGroup: patientForm.bloodGroup,
          height: patientForm.height ? Number(patientForm.height) : null,
          weight: patientForm.weight ? Number(patientForm.weight) : null,
          allergies: patientForm.allergies,
          emergencyContact: {
            name: patientForm.emergencyName,
            phone: patientForm.emergencyPhone,
            relation: patientForm.emergencyRelation,
          },
        });
        toast.success('Account created! Welcome to MediQueue+');
        navigate(from || '/patient-dashboard');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Authentication failed');
      toast.error(err.message || 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDoctorSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');

    try {
      if (authMode === 'login') {
        await loginAsDoctor({
          email: doctorForm.email,
          password: doctorForm.password,
        });
        toast.success('Welcome back to your Clinical Workspace!');
        navigate(from || '/doctor');
      } else {
        const consultationModes = [];
        if (doctorForm.inPersonMode) consultationModes.push('in-person');
        if (doctorForm.videoMode) consultationModes.push('video');

        await registerDoctorUser({
          name: doctorForm.name,
          email: doctorForm.email,
          password: doctorForm.password,
          phone: doctorForm.phone,
          specialty: doctorForm.specialty,
          qualifications: doctorForm.qualifications,
          experienceYears: Number(doctorForm.experienceYears) || 1,
          medicalLicenseNumber: doctorForm.medicalLicenseNumber,
          consultationFee: Number(doctorForm.consultationFee) || 500,
          followUpFee: Number(doctorForm.followUpFee) || 300,
          hospitalName: doctorForm.hospitalName || doctorForm.clinicName || 'Clinic Practice',
          clinicDetails: {
            clinicName: doctorForm.clinicName || doctorForm.hospitalName || 'Clinic Practice',
            contactPhone: doctorForm.clinicPhone || doctorForm.phone,
            taxId: doctorForm.taxId,
            fullAddress: doctorForm.clinicAddress,
          },
          services: doctorForm.services,
          consultationModes,
          videoEnabled: doctorForm.videoMode,
          location: {
            address: doctorForm.clinicAddress || 'New Delhi',
          },
        });
        toast.success('Onboarding complete! Clinic & profile registered.');
        navigate(from || '/doctor');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Doctor onboarding failed');
      toast.error(err.message || 'Doctor onboarding failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStaffSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');

    try {
      await loginWithRole({
        email: staffForm.email,
        password: staffForm.password,
        role: staffForm.role,
      });
      toast.success(`Signed in as ${staffForm.role.replace('_', ' ')}`);
      if (staffForm.role === 'receptionist') {
        navigate(from || '/reception');
      } else {
        navigate(from || '/hospitals');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Staff login failed');
      toast.error(err.message || 'Staff login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl py-6 px-4">
      {/* ── Page Header ── */}
      <div className="text-center mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-100 px-3 py-1 text-xs font-bold text-cyan-800 tracking-wide uppercase">
          Unified Access & Onboarding
        </span>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900 md:text-4xl">
          Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 to-blue-600">MediQueue+</span>
        </h1>
        <p className="mt-2 text-sm text-slate-600 max-w-xl mx-auto">
          Please select your portal to securely sign in or onboard your clinical practice.
        </p>
      </div>

      {/* ── Demo Credentials Bar ── */}
      <div className="mb-8 rounded-2xl border border-blue-200/80 bg-blue-50/60 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-left">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1">
              ⚡ SIH Quick-Fill Demo Credentials
            </span>
            <p className="text-xs text-blue-700">Click any demo persona to automatically populate test credentials (password: demo123)</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fillDemoAccount('patient')}
              className="rounded-lg bg-white px-3 py-1 text-xs font-bold text-slate-800 shadow-sm border border-slate-200 hover:bg-slate-50 transition"
            >
              👤 Demo Patient
            </button>
            <button
              type="button"
              onClick={() => fillDemoAccount('doctor')}
              className="rounded-lg bg-white px-3 py-1 text-xs font-bold text-cyan-800 shadow-sm border border-cyan-200 hover:bg-cyan-50 transition"
            >
              🩺 Demo Doctor A
            </button>
            <button
              type="button"
              onClick={() => fillDemoAccount('receptionist')}
              className="rounded-lg bg-white px-3 py-1 text-xs font-bold text-indigo-800 shadow-sm border border-indigo-200 hover:bg-indigo-50 transition"
            >
              🎫 Demo Reception
            </button>
            <button
              type="button"
              onClick={() => fillDemoAccount('admin')}
              className="rounded-lg bg-white px-3 py-1 text-xs font-bold text-purple-800 shadow-sm border border-purple-200 hover:bg-purple-50 transition"
            >
              🏛️ Demo Admin
            </button>
          </div>
        </div>
      </div>

      {/* ── Two Primary Entry Options: Patient vs. Doctor / Business ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {/* Option 1: Patient / User Card */}
        <button
          type="button"
          onClick={() => {
            setActivePortal('patient');
            setErrorMsg('');
          }}
          className={`flex flex-col items-start text-left p-6 rounded-2xl border-2 transition-all shadow-sm ${
            activePortal === 'patient'
              ? 'border-cyan-500 bg-white ring-4 ring-cyan-100 shadow-md'
              : 'border-slate-200 bg-white/70 hover:border-slate-300 hover:bg-white'
          }`}
        >
          <div className="flex items-center justify-between w-full mb-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-100 text-2xl">
              👤
            </div>
            {activePortal === 'patient' && (
              <span className="rounded-full bg-cyan-600 px-2.5 py-0.5 text-xs font-bold text-white">
                Selected
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold text-slate-900">1. Patient / User</h2>
          <p className="mt-1 text-xs text-slate-500">
            Book appointments, track live queue wait-times, manage prescriptions, view lab results & health vitals.
          </p>
          <div className="mt-4 flex gap-2">
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Smart Queue</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Appointments</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Health Hub</span>
          </div>
        </button>

        {/* Option 2: Doctor / Business Card */}
        <button
          type="button"
          onClick={() => {
            setActivePortal('doctor');
            setErrorMsg('');
          }}
          className={`flex flex-col items-start text-left p-6 rounded-2xl border-2 transition-all shadow-sm ${
            activePortal === 'doctor'
              ? 'border-indigo-500 bg-white ring-4 ring-indigo-100 shadow-md'
              : 'border-slate-200 bg-white/70 hover:border-slate-300 hover:bg-white'
          }`}
        >
          <div className="flex items-center justify-between w-full mb-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-2xl">
              🩺
            </div>
            {activePortal === 'doctor' && (
              <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-bold text-white">
                Selected
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold text-slate-900">2. Doctor / Business</h2>
          <p className="mt-1 text-xs text-slate-500">
            Professional onboarding, clinic registration, OPD queue caller, telemedicine suite, fees & schedule.
          </p>
          <div className="mt-4 flex gap-2">
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Clinic Onboarding</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">OPD Caller</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Telemedicine</span>
          </div>
        </button>
      </div>

      {/* Discrete Secondary Link for Staff / Admin */}
      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={() => {
            setActivePortal('staff');
            setErrorMsg('');
          }}
          className={`text-xs font-semibold hover:underline flex items-center gap-1 ${
            activePortal === 'staff' ? 'text-purple-700 font-bold' : 'text-slate-500'
          }`}
        >
          🏢 Hospital Staff / Admin Login Portal &rarr;
        </button>
      </div>

      {/* ── Error Banner ── */}
      {errorMsg && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 font-medium text-center">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* ── Form Container ── */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-xl">
        {/* Toggle Login / Signup (for Patient & Doctor) */}
        {activePortal !== 'staff' && (
          <div className="flex justify-center mb-6">
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className={`rounded-lg px-6 py-2 text-sm font-bold transition ${
                  authMode === 'login'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('signup')}
                className={`rounded-lg px-6 py-2 text-sm font-bold transition ${
                  authMode === 'signup'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {activePortal === 'patient' ? 'Create Patient Account' : 'Doctor / Business Onboarding'}
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            PORTAL 1: PATIENT / USER
            ══════════════════════════════════════════════════════ */}
        {activePortal === 'patient' && (
          <form onSubmit={handlePatientSubmit} className="space-y-4">
            <div className="border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-lg font-black text-slate-900">
                {authMode === 'login' ? 'Patient Portal Sign In' : 'New Patient Registration & Health Profile'}
              </h3>
              <p className="text-xs text-slate-500">
                {authMode === 'login'
                  ? 'Access your appointment schedule, queue tokens, and digital health records.'
                  : 'Complete your profile to track BMI, allergies, vitals, and emergency contacts.'}
              </p>
            </div>

            {/* If Signup: Name */}
            {authMode === 'signup' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={patientForm.name}
                  onChange={(e) => setPatientForm({ ...patientForm, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-cyan-500 focus:outline-none"
                />
              </div>
            )}

            {/* Email & Password */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={patientForm.email}
                  onChange={(e) => setPatientForm({ ...patientForm, email: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Password *</label>
                <input
                  type="password"
                  required
                  placeholder="Min. 6 characters"
                  value={patientForm.password}
                  onChange={(e) => setPatientForm({ ...patientForm, password: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Signup Only Fields */}
            {authMode === 'signup' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                    <input
                      type="tel"
                      placeholder="+91-9876543210"
                      value={patientForm.phone}
                      onChange={(e) => setPatientForm({ ...patientForm, phone: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-cyan-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Age</label>
                    <input
                      type="number"
                      min="0"
                      max="130"
                      placeholder="e.g. 32"
                      value={patientForm.age}
                      onChange={(e) => setPatientForm({ ...patientForm, age: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-cyan-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Gender</label>
                    <select
                      value={patientForm.gender}
                      onChange={(e) => setPatientForm({ ...patientForm, gender: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-cyan-500 focus:outline-none"
                    >
                      <option value="prefer_not_to_say">Prefer not to say</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                {/* Vitals & Live BMI */}
                <div className="rounded-2xl bg-cyan-50/50 border border-cyan-100 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-cyan-900 uppercase tracking-wider">
                      🩺 Health Vitals & Live BMI
                    </span>
                    {bmi && (
                      <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-cyan-600 text-white">
                        BMI: {bmi}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-cyan-800 mb-1">Blood Group</label>
                      <select
                        value={patientForm.bloodGroup}
                        onChange={(e) => setPatientForm({ ...patientForm, bloodGroup: e.target.value })}
                        className="w-full rounded-lg border border-cyan-200 bg-white px-3 py-2 text-xs focus:outline-none"
                      >
                        <option value="unknown">Unknown</option>
                        <option value="A+">A+</option>
                        <option value="A-">A-</option>
                        <option value="B+">B+</option>
                        <option value="B-">B-</option>
                        <option value="AB+">AB+</option>
                        <option value="AB-">AB-</option>
                        <option value="O+">O+</option>
                        <option value="O-">O-</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-cyan-800 mb-1">Height (cm)</label>
                      <input
                        type="number"
                        placeholder="e.g. 175"
                        value={patientForm.height}
                        onChange={(e) => setPatientForm({ ...patientForm, height: e.target.value })}
                        className="w-full rounded-lg border border-cyan-200 bg-white px-3 py-2 text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-cyan-800 mb-1">Weight (kg)</label>
                      <input
                        type="number"
                        placeholder="e.g. 70"
                        value={patientForm.weight}
                        onChange={(e) => setPatientForm({ ...patientForm, weight: e.target.value })}
                        className="w-full rounded-lg border border-cyan-200 bg-white px-3 py-2 text-xs focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Allergies */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Known Drug or Food Allergies</label>
                  <input
                    type="text"
                    placeholder="e.g. Penicillin, Sulfa drugs, Peanuts (comma-separated)"
                    value={patientForm.allergies}
                    onChange={(e) => setPatientForm({ ...patientForm, allergies: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                {/* Emergency Contact */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Emergency Contact Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Pooja Sharma"
                      value={patientForm.emergencyName}
                      onChange={(e) => setPatientForm({ ...patientForm, emergencyName: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Emergency Contact Phone</label>
                    <input
                      type="tel"
                      placeholder="+91-9876500000"
                      value={patientForm.emergencyPhone}
                      onChange={(e) => setPatientForm({ ...patientForm, emergencyPhone: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Relation</label>
                    <input
                      type="text"
                      placeholder="e.g. Spouse / Parent"
                      value={patientForm.emergencyRelation}
                      onChange={(e) => setPatientForm({ ...patientForm, emergencyRelation: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none"
                    />
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 py-3 text-sm font-black text-white shadow-md hover:from-cyan-700 hover:to-blue-700 transition disabled:opacity-60"
            >
              {submitting
                ? 'Processing...'
                : authMode === 'login'
                ? 'Sign In to Patient Portal'
                : 'Complete Registration & Open Dashboard'}
            </button>
          </form>
        )}

        {/* ══════════════════════════════════════════════════════
            PORTAL 2: DOCTOR / BUSINESS ONBOARDING & LOGIN
            ══════════════════════════════════════════════════════ */}
        {activePortal === 'doctor' && (
          <form onSubmit={handleDoctorSubmit} className="space-y-4">
            <div className="border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-lg font-black text-slate-900">
                {authMode === 'login' ? 'Doctor / Practice Sign In' : 'Doctor & Clinical Business Onboarding'}
              </h3>
              <p className="text-xs text-slate-500">
                {authMode === 'login'
                  ? 'Access your clinical workspace, active patient queue, and telemedicine suite.'
                  : 'Register your professional credentials, consultation fees, clinic details, and schedule.'}
              </p>
            </div>

            {/* Basic Login Credentials */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Doctor Email *</label>
                <input
                  type="email"
                  required
                  placeholder="doctor@hospital.org"
                  value={doctorForm.email}
                  onChange={(e) => setDoctorForm({ ...doctorForm, email: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Password *</label>
                <input
                  type="password"
                  required
                  placeholder="Min. 6 characters"
                  value={doctorForm.password}
                  onChange={(e) => setDoctorForm({ ...doctorForm, password: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Doctor Onboarding Specifics */}
            {authMode === 'signup' && (
              <>
                {/* 1. Professional Identity */}
                <div className="rounded-2xl bg-indigo-50/50 border border-indigo-100 p-4 space-y-3">
                  <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider block">
                    👨‍⚕️ Professional Credentials
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-indigo-900 mb-1">Full Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Dr. Priya Sharma"
                        value={doctorForm.name}
                        onChange={(e) => setDoctorForm({ ...doctorForm, name: e.target.value })}
                        className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-indigo-900 mb-1">Specialty *</label>
                      <select
                        value={doctorForm.specialty}
                        onChange={(e) => setDoctorForm({ ...doctorForm, specialty: e.target.value })}
                        className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs focus:outline-none"
                      >
                        <option value="General Medicine">General Medicine</option>
                        <option value="Cardiology">Cardiology</option>
                        <option value="Pediatrics">Pediatrics</option>
                        <option value="Orthopedics">Orthopedics</option>
                        <option value="Dermatology">Dermatology</option>
                        <option value="Neurology">Neurology</option>
                        <option value="ENT">ENT</option>
                        <option value="Gynecology">Gynecology</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-indigo-900 mb-1">Qualifications</label>
                      <input
                        type="text"
                        placeholder="e.g. MBBS, MD, DM"
                        value={doctorForm.qualifications}
                        onChange={(e) => setDoctorForm({ ...doctorForm, qualifications: e.target.value })}
                        className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-indigo-900 mb-1">Experience (Years)</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="e.g. 8"
                        value={doctorForm.experienceYears}
                        onChange={(e) => setDoctorForm({ ...doctorForm, experienceYears: e.target.value })}
                        className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-indigo-900 mb-1">Registration / License No. *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. MCI-2015-12345"
                        value={doctorForm.medicalLicenseNumber}
                        onChange={(e) => setDoctorForm({ ...doctorForm, medicalLicenseNumber: e.target.value })}
                        className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Clinic / Business Details */}
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                    🏥 Clinic / Business Practice Details
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Hospital or Clinic Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. AIIMS Delhi or City Heart Clinic"
                        value={doctorForm.clinicName}
                        onChange={(e) => setDoctorForm({ ...doctorForm, clinicName: e.target.value, hospitalName: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Practice Contact Phone</label>
                      <input
                        type="tel"
                        placeholder="+91-11-23456789"
                        value={doctorForm.clinicPhone}
                        onChange={(e) => setDoctorForm({ ...doctorForm, clinicPhone: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Clinic Address</label>
                      <input
                        type="text"
                        placeholder="e.g. Ansari Nagar, New Delhi - 110029"
                        value={doctorForm.clinicAddress}
                        onChange={(e) => setDoctorForm({ ...doctorForm, clinicAddress: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Tax ID / Business Registration (GST)</label>
                      <input
                        type="text"
                        placeholder="e.g. GSTIN-07AAAAA0000A1Z5"
                        value={doctorForm.taxId}
                        onChange={(e) => setDoctorForm({ ...doctorForm, taxId: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Fees, Consultation Modes & Services */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-2xl bg-amber-50/50 border border-amber-200/80 p-4 space-y-2">
                    <span className="text-xs font-bold text-amber-900 uppercase tracking-wider block">
                      💰 Consultation Fees
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-amber-800 mb-1">First Visit (₹)</label>
                        <input
                          type="number"
                          min="0"
                          value={doctorForm.consultationFee}
                          onChange={(e) => setDoctorForm({ ...doctorForm, consultationFee: e.target.value })}
                          className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-amber-800 mb-1">Follow-up (₹)</label>
                        <input
                          type="number"
                          min="0"
                          value={doctorForm.followUpFee}
                          onChange={(e) => setDoctorForm({ ...doctorForm, followUpFee: e.target.value })}
                          className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-emerald-50/50 border border-emerald-200/80 p-4 space-y-2">
                    <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider block">
                      📹 Consultation Modes
                    </span>
                    <div className="flex flex-col gap-2 pt-1">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={doctorForm.inPersonMode}
                          onChange={(e) => setDoctorForm({ ...doctorForm, inPersonMode: e.target.checked })}
                          className="h-4 w-4 rounded text-indigo-600"
                        />
                        In-Person OPD Clinic Visit
                      </label>
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={doctorForm.videoMode}
                          onChange={(e) => setDoctorForm({ ...doctorForm, videoMode: e.target.checked })}
                          className="h-4 w-4 rounded text-indigo-600"
                        />
                        WebRTC Video Consultation
                      </label>
                    </div>
                  </div>
                </div>

                {/* Services */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Clinical Services Offered</label>
                  <input
                    type="text"
                    placeholder="e.g. Cardiac Consultation, ECG, Echocardiogram (comma-separated)"
                    value={doctorForm.services}
                    onChange={(e) => setDoctorForm({ ...doctorForm, services: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-3 text-sm font-black text-white shadow-md hover:from-indigo-700 hover:to-purple-700 transition disabled:opacity-60"
            >
              {submitting
                ? 'Processing...'
                : authMode === 'login'
                ? 'Sign In to Doctor Workspace'
                : 'Complete Onboarding & Launch Practice'}
            </button>
          </form>
        )}

        {/* ══════════════════════════════════════════════════════
            PORTAL 3: HOSPITAL STAFF / ADMIN LOGIN
            ══════════════════════════════════════════════════════ */}
        {activePortal === 'staff' && (
          <form onSubmit={handleStaffSubmit} className="space-y-4">
            <div className="border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-lg font-black text-slate-900">Hospital Administration & Reception Sign In</h3>
              <p className="text-xs text-slate-500">
                Authorized access for Hospital Desk Receptionists, Ward Staff, and Hospital Administrators.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Staff Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="reception.demo@mediqueue.test"
                  value={staffForm.email}
                  onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Password *</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={staffForm.password}
                  onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-purple-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Role Permission Context</label>
              <select
                value={staffForm.role}
                onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-purple-500 focus:outline-none"
              >
                <option value="receptionist">Receptionist (OPD Token Dispatch & Queue)</option>
                <option value="admin">Hospital Administrator / Platform Admin</option>
                <option value="clinic_manager">Clinic / Practice Manager</option>
                <option value="nurse">Nurse / Triage Staff</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-gradient-to-r from-purple-700 to-indigo-800 py-3 text-sm font-black text-white shadow-md hover:from-purple-800 hover:to-indigo-900 transition disabled:opacity-60"
            >
              {submitting ? 'Verifying...' : 'Sign In as Staff / Administrator'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
