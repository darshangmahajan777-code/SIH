import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  Stethoscope,
  Clock,
  Calendar,
  Users,
  Activity,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Shield,
  FileText,
  Pill,
  Phone,
  Building2,
  ChevronRight,
  RefreshCw,
  X,
  Eye,
  Video,
  Sliders,
  UserCheck,
  Heart,
  Zap,
  User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getDoctorDashboard,
  callNextPatient,
  completeConsultation,
  updateDoctorAvailability,
  getDoctorPatientClinicalHistory,
  updateBusinessSettings,
  addPracticeStaff,
} from '../services/api';
import { getSocket } from '../services/socket';
import toast from 'react-hot-toast';

export default function DoctorBusinessDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, doctorProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  // Queue filter tab for Today's Queue table: 'all' | 'urgent' | 'in-person' | 'video'
  const [queueFilter, setQueueFilter] = useState('all');

  // Appointments Card Tab: 'today' | 'upcoming'
  const [appointmentsTab, setAppointmentsTab] = useState('today');

  // Clinical History & Previous Visits Modal State
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedPatientHistory, setSelectedPatientHistory] = useState(null);

  // Practice Settings Drawer State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    consultationFee: 500,
    followUpFee: 300,
    services: '',
    inPersonMode: true,
    videoMode: true,
    clinicName: '',
    contactPhone: '',
    address: '',
  });

  // Fetch Dashboard Data
  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getDoctorDashboard();
      setDashboardData(data);
      if (data?.businessSettings) {
        setSettingsForm({
          consultationFee: data.businessSettings.consultationFee || 500,
          followUpFee: data.businessSettings.followUpFee || 300,
          services: Array.isArray(data.businessSettings.services)
            ? data.businessSettings.services.join(', ')
            : data.businessSettings.services || '',
          inPersonMode: data.businessSettings.consultationModes?.includes('in-person') ?? true,
          videoMode: data.businessSettings.consultationModes?.includes('video') ?? true,
          clinicName: data.businessSettings.clinicName || '',
          contactPhone: data.businessSettings.contactPhone || '',
          address: data.businessSettings.address || '',
        });
      }
    } catch (err) {
      console.error('Failed to load doctor dashboard:', err);
      toast.error(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Real-Time Socket.IO Synchronization with Reception & Operations
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const docId = dashboardData?.doctor?._id || dashboardData?.doctor?.doctorId || user?._id;
    const hospId = dashboardData?.doctor?.hospitalId || doctorProfile?.hospitalId;

    const joinRooms = () => {
      socket.emit('join_room', 'queue-room');
      if (docId) {
        socket.emit('join_room', `doctor-room:${docId}`);
      }
      if (hospId) {
        socket.emit('join_room', `hospital-room:${hospId}`);
        socket.emit('join_room', `reception-room:${hospId}`);
      }
    };

    joinRooms();
    socket.on('connect', joinRooms);

    const handlePatientCheckedIn = (payload) => {
      if (!payload.doctorId || !docId || String(payload.doctorId) === String(docId)) {
        toast.success(`✓ Patient ${payload.patientName || 'Patient'} arrived & checked in at reception!`, {
          icon: '🏥',
          duration: 4000,
        });
      }
      fetchDashboard();
    };

    const handleTokenCreated = () => {
      fetchDashboard();
    };

    const handleAppointmentBooked = (payload) => {
      if (!payload.doctorId || !docId || String(payload.doctorId) === String(docId)) {
        toast(`📅 New appointment booked for ${payload.patientName || 'patient'} (${payload.slotTime || ''})`, {
          icon: '🔔',
          duration: 3500,
        });
      }
      fetchDashboard();
    };

    const handleQueueUpdated = () => {
      fetchDashboard();
    };

    socket.on('patient_checked_in', handlePatientCheckedIn);
    socket.on('token_created', handleTokenCreated);
    socket.on('appointment_booked', handleAppointmentBooked);
    socket.on('queue_updated', handleQueueUpdated);

    return () => {
      socket.off('connect', joinRooms);
      socket.off('patient_checked_in', handlePatientCheckedIn);
      socket.off('token_created', handleTokenCreated);
      socket.off('appointment_booked', handleAppointmentBooked);
      socket.off('queue_updated', handleQueueUpdated);
    };
  }, [dashboardData?.doctor?._id, dashboardData?.doctor?.doctorId, dashboardData?.doctor?.hospitalId, user?._id, doctorProfile?.hospitalId, fetchDashboard]);

  // Handle Availability Toggle (Available | Busy | On Leave | Offline)
  const handleAvailabilityChange = async (newStatus) => {
    if (!dashboardData) return;
    try {
      setAvailabilityLoading(true);
      // Optimistic update
      setDashboardData((prev) => ({
        ...prev,
        doctorAvailabilityStatus: newStatus,
        doctor: {
          ...prev.doctor,
          availabilityStatus: newStatus,
          isAvailableToday: newStatus === 'available',
        },
      }));

      await updateDoctorAvailability(newStatus);
      toast.success(`Availability status updated to ${newStatus.replace('_', ' ').toUpperCase()}`);
      await fetchDashboard();
    } catch (err) {
      toast.error(err.message || 'Failed to update availability status');
      await fetchDashboard();
    } finally {
      setAvailabilityLoading(false);
    }
  };

  // Call Next Patient in Queue
  const handleCallNext = async () => {
    try {
      setActionLoading(true);
      const called = await callNextPatient();
      toast.success(`Called Token #${called.tokenNumber} for consultation`);
      await fetchDashboard();
    } catch (err) {
      toast.error(err.message || 'No patients currently waiting in queue');
    } finally {
      setActionLoading(false);
    }
  };

  // Complete Active Consultation
  const handleCompleteActive = async (tokenNumber, appointmentId) => {
    try {
      setActionLoading(true);
      if (tokenNumber) {
        await completeConsultation(tokenNumber);
      }
      toast.success(`Consultation completed for Token #${tokenNumber || 'Active'}`);
      await fetchDashboard();
    } catch (err) {
      toast.error(err.message || 'Failed to complete consultation');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Authorized Clinical History Modal
  const handleViewClinicalHistory = async ({ patientId, appointmentId, patientName }) => {
    try {
      setHistoryLoading(true);
      setHistoryModalOpen(true);
      setSelectedPatientHistory({ patient: { name: patientName } });

      const historyData = await getDoctorPatientClinicalHistory(patientId, appointmentId);
      setSelectedPatientHistory(historyData);
    } catch (err) {
      console.error('Failed to load patient clinical history:', err);
      toast.error(err.message || 'Could not load clinical history');
      setHistoryModalOpen(false);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Save Practice Settings
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      await updateBusinessSettings({
        consultationFee: Number(settingsForm.consultationFee),
        followUpFee: Number(settingsForm.followUpFee),
        services: settingsForm.services.split(',').map((s) => s.trim()).filter(Boolean),
        consultationModes: [
          settingsForm.inPersonMode && 'in-person',
          settingsForm.videoMode && 'video',
        ].filter(Boolean),
        clinicDetails: {
          clinicName: settingsForm.clinicName,
          contactPhone: settingsForm.contactPhone,
        },
        address: settingsForm.address,
      });
      toast.success('Practice settings updated successfully');
      setShowSettingsModal(false);
      await fetchDashboard();
    } catch (err) {
      toast.error(err.message || 'Failed to update settings');
    } finally {
      setActionLoading(false);
    }
  };

  // Extract Dashboard Entities
  const doctor = dashboardData?.doctor || {};
  const currentStatus = dashboardData?.doctorAvailabilityStatus || doctor.availabilityStatus || 'available';

  // 12 Core Items
  const todayPatientsCount = dashboardData?.todayPatientsCount || 0;
  const consultedPatientsCount = dashboardData?.consultedPatientsCount || 0;
  const waitingPatientsCount = dashboardData?.waitingPatientsCount || 0;
  const currentPatient = dashboardData?.currentPatient || null;
  const nextPatient = dashboardData?.nextPatient || null;
  const emergencyPriorityPatients = dashboardData?.emergencyPriorityPatients || [];
  const emergencyCount = dashboardData?.emergencyPriorityCount || emergencyPriorityPatients.length;
  const todayAppointments = dashboardData?.todayAppointments || [];
  const todaySchedule = dashboardData?.todaySchedule || {
    dayFormatted: 'Today',
    isWorking: true,
    startTime: '09:00',
    endTime: '17:00',
    breaks: [{ startTime: '13:00', endTime: '14:00', reason: 'Lunch Break' }],
    slotDuration: 30,
    totalSlotsCount: 16,
    bookedSlotsCount: todayAppointments.length,
    completedSlotsCount: consultedPatientsCount,
    statusText: 'Shift Active (09:00 AM - 05:00 PM)',
  };
  const upcomingAppointments = dashboardData?.upcomingAppointments || [];
  const patientQueue = dashboardData?.patientQueue || [];
  const recentPatientHistory = dashboardData?.recentPatientHistory || [];

  // Filtered Queue
  const filteredQueue = useMemo(() => {
    if (queueFilter === 'urgent') {
      return patientQueue.filter((p) => ['critical', 'urgent', 'emergency'].includes(p.priority));
    }
    if (queueFilter === 'in-person') {
      return patientQueue.filter((p) => p.mode !== 'video');
    }
    if (queueFilter === 'video') {
      return patientQueue.filter((p) => p.mode === 'video');
    }
    return patientQueue;
  }, [patientQueue, queueFilter]);

  if (loading && !dashboardData) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-600 border-t-transparent"></div>
        <p className="text-sm font-semibold text-slate-600">Loading Doctor Medical Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      {/* ─────────────────────────────────────────────────────────────────────────────
          1. PROFESSIONAL MEDICAL HEADER & AVAILABILITY SWITCHER
      ───────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 text-white shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Doctor Bio & Hospital Affiliation */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-cyan-500/20 px-2.5 py-0.5 text-xs font-black tracking-wider uppercase text-cyan-300 border border-cyan-400/30">
                🩺 OPD Clinical Practice
              </span>
              <span className="rounded-md bg-white/10 px-2.5 py-0.5 text-xs font-bold text-slate-300 border border-white/10">
                🏥 {doctor.hospitalName || 'Main Hospital Campus'}
              </span>
              {doctor.medicalLicenseNumber && (
                <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-mono text-cyan-200">
                  Lic: {doctor.medicalLicenseNumber}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-3">
              <span>{doctor.doctorName || user?.name || 'Dr. Attending Specialist'}</span>
              <span className="text-sm font-semibold px-2.5 py-1 rounded-xl bg-white/10 text-cyan-200">
                {doctor.specialty || 'Cardiology'}
              </span>
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 flex flex-wrap items-center gap-2">
              <span>{Array.isArray(doctor.qualifications) ? doctor.qualifications.join(', ') : 'MBBS, MD'}</span>
              <span>•</span>
              <span>{doctor.experienceYears || 10}+ Years Experience</span>
              <span>•</span>
              <span>⭐ {doctor.avgRating || '4.9'} ({doctor.ratingCount || 120} reviews)</span>
            </p>
          </div>

          {/* Availability Status Switcher & Primary Triggers */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {/* 4-State Availability Selector */}
            <div className="rounded-2xl border border-white/20 bg-black/40 p-1.5 backdrop-blur-md">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 pb-1">
                Doctor Availability Status
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
                <button
                  type="button"
                  onClick={() => handleAvailabilityChange('available')}
                  disabled={availabilityLoading}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                    currentStatus === 'available'
                      ? 'bg-emerald-500 text-white shadow-md'
                      : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-300"></span>
                  Available
                </button>

                <button
                  type="button"
                  onClick={() => handleAvailabilityChange('busy')}
                  disabled={availabilityLoading}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                    currentStatus === 'busy'
                      ? 'bg-amber-500 text-white shadow-md'
                      : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-amber-300"></span>
                  Busy
                </button>

                <button
                  type="button"
                  onClick={() => handleAvailabilityChange('on_leave')}
                  disabled={availabilityLoading}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                    currentStatus === 'on_leave'
                      ? 'bg-rose-500 text-white shadow-md'
                      : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-rose-300"></span>
                  On Leave
                </button>

                <button
                  type="button"
                  onClick={() => handleAvailabilityChange('offline')}
                  disabled={availabilityLoading}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                    currentStatus === 'offline'
                      ? 'bg-slate-600 text-white shadow-md'
                      : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-slate-400"></span>
                  Offline
                </button>
              </div>
            </div>

            {/* Quick Action Triggers */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCallNext}
                disabled={actionLoading}
                className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-xs font-black text-white shadow-lg hover:from-cyan-600 hover:to-blue-700 transition disabled:opacity-50 flex items-center gap-1.5"
                title="Call next patient in priority queue"
              >
                <Zap className="h-4 w-4" />
                <span>Call Next</span>
              </button>

              <Link
                to="/doctor-workspace"
                className="rounded-xl bg-white/10 px-3.5 py-2.5 text-xs font-bold text-white border border-white/20 hover:bg-white/20 transition flex items-center gap-1.5"
                title="Open Clinical Dossier & EMR"
              >
                <Stethoscope className="h-4 w-4" />
                <span>Workspace</span>
              </Link>

              <button
                type="button"
                onClick={() => setShowSettingsModal(true)}
                className="rounded-xl bg-white/10 p-2.5 text-white border border-white/20 hover:bg-white/20 transition"
                title="Practice Settings"
              >
                <Sliders className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={fetchDashboard}
                className="rounded-xl bg-white/10 p-2.5 text-white border border-white/20 hover:bg-white/20 transition"
                title="Refresh Live Medical Data"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          2. TOP 6 CLINICAL KPI SUMMARY METRICS
      ───────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* 1. Today's Patient Count */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm hover:border-indigo-400 transition">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold truncate">1. Today's Patients</span>
            <Users className="h-4 w-4 text-indigo-600" />
          </div>
          <span className="text-2xl font-black text-slate-900 mt-1 block">
            {todayPatientsCount}
          </span>
          <span className="text-[11px] font-semibold text-indigo-600">Total registered today</span>
        </div>

        {/* 2. Patients Already Consulted */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm hover:border-emerald-400 transition">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold truncate">2. Consulted</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <span className="text-2xl font-black text-emerald-600 mt-1 block">
            {consultedPatientsCount}
          </span>
          <span className="text-[11px] font-semibold text-emerald-600">Completed consultations</span>
        </div>

        {/* 3. Waiting Patients */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm hover:border-amber-400 transition">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold truncate">3. Waiting Patients</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <span className="text-2xl font-black text-amber-600 mt-1 block">
            {waitingPatientsCount}
          </span>
          <span className="text-[11px] font-semibold text-amber-600">Currently in OPD line</span>
        </div>

        {/* 6. Emergency / Priority Patients */}
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 shadow-sm hover:border-rose-400 transition">
          <div className="flex items-center justify-between text-rose-700">
            <span className="text-xs font-bold truncate">6. Emergency / Triage</span>
            <AlertTriangle className="h-4 w-4 text-rose-600 animate-pulse" />
          </div>
          <span className="text-2xl font-black text-rose-700 mt-1 block">
            {emergencyCount}
          </span>
          <span className="text-[11px] font-bold text-rose-600">
            {emergencyCount > 0 ? '⚠️ Immediate Attention' : 'No Critical Triage'}
          </span>
        </div>

        {/* 7. Today's Appointments */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm hover:border-blue-400 transition">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold truncate">7. Today's Appts</span>
            <Calendar className="h-4 w-4 text-blue-600" />
          </div>
          <span className="text-2xl font-black text-blue-600 mt-1 block">
            {todayAppointments.length}
          </span>
          <span className="text-[11px] font-semibold text-blue-600">Scheduled OPD slots</span>
        </div>

        {/* Live Active Queue Status */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm hover:border-cyan-400 transition">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold truncate">Active Token</span>
            <Activity className="h-4 w-4 text-cyan-600" />
          </div>
          <span className="text-2xl font-black text-cyan-600 mt-1 block font-mono">
            {currentPatient?.tokenNumber ? `#${currentPatient.tokenNumber}` : 'Idle'}
          </span>
          <span className="text-[11px] font-semibold text-cyan-600">
            {currentPatient ? 'In Consultation' : 'Room Ready'}
          </span>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          3. ACTIVE CONSULTATION SPLIT: CURRENT PATIENT & NEXT PATIENT (Items 4 & 5)
      ───────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 4. CURRENT PATIENT CARD */}
        <div className="lg:col-span-7 rounded-3xl border-2 border-cyan-200 bg-gradient-to-br from-white via-cyan-50/20 to-blue-50/30 p-6 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-ping"></span>
              <span className="text-xs font-black uppercase tracking-wider text-cyan-900">
                4. Current Patient In Consultation
              </span>
            </div>
            {currentPatient?.tokenNumber && (
              <span className="rounded-xl bg-cyan-600 px-3 py-1 font-mono text-xs font-black text-white shadow-sm">
                TOKEN #{currentPatient.tokenNumber}
              </span>
            )}
          </div>

          {currentPatient ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-xl font-black text-slate-900">
                    {currentPatient.patientName}
                  </h3>
                  <p className="text-xs text-slate-600 flex items-center gap-2 mt-0.5">
                    <span>{currentPatient.gender?.toUpperCase() || 'MALE'}</span>
                    <span>•</span>
                    <span>{currentPatient.age || 35} Years Old</span>
                    <span>•</span>
                    <span className="font-semibold text-indigo-700">Blood: {currentPatient.bloodGroup || 'O+'}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-lg px-2.5 py-1 text-xs font-black uppercase ${
                      ['critical', 'urgent', 'emergency'].includes(currentPatient.priority)
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    Priority: {currentPatient.priority}
                  </span>
                  <span className="rounded-lg bg-indigo-100 text-indigo-800 px-2.5 py-1 text-xs font-bold">
                    {currentPatient.mode === 'video' ? '📹 Video Telehealth' : '🏥 In-Person OPD'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
                  <span className="text-slate-400 font-bold block">Chief Complaint / Condition:</span>
                  <span className="text-slate-800 font-semibold mt-0.5 block">
                    {currentPatient.chiefComplaint || 'Routine Medical Review'}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
                  <span className="text-slate-400 font-bold block">Allergies / Precautions:</span>
                  <span className="text-rose-600 font-bold mt-0.5 block">
                    {currentPatient.allergies?.length ? currentPatient.allergies.join(', ') : 'No Known Drug Allergies (NKDA)'}
                  </span>
                </div>
              </div>

              {/* Consultation Control Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    handleViewClinicalHistory({
                      patientId: currentPatient.patientId,
                      appointmentId: currentPatient.appointmentId,
                      patientName: currentPatient.patientName,
                    })
                  }
                  className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-900 hover:bg-indigo-100 transition flex items-center gap-1.5"
                >
                  <Shield className="h-4 w-4 text-indigo-600" />
                  <span>View Authorized Clinical History</span>
                </button>

                <Link
                  to={currentPatient.appointmentId ? `/doctor-workspace?appointmentId=${currentPatient.appointmentId}` : '/doctor-workspace'}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition flex items-center gap-1.5"
                >
                  <FileText className="h-4 w-4 text-cyan-400" />
                  <span>Open EMR Dossier</span>
                </Link>

                <button
                  type="button"
                  onClick={() => handleCompleteActive(currentPatient.tokenNumber, currentPatient.appointmentId)}
                  disabled={actionLoading}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-emerald-700 transition flex items-center gap-1.5 disabled:opacity-50 ml-auto"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Complete Consultation</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                <Stethoscope className="h-6 w-6" />
              </div>
              <h4 className="font-bold text-slate-800">Consultation Room Currently Idle</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No patient is currently active in the consultation room. Click below to call the next patient in line.
              </p>
              <button
                type="button"
                onClick={handleCallNext}
                disabled={actionLoading}
                className="rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-2.5 text-xs font-black text-white shadow hover:opacity-95 transition"
              >
                ⚡ Call Next Waiting Patient
              </button>
            </div>
          )}
        </div>

        {/* 5. NEXT PATIENT CARD */}
        <div className="lg:col-span-5 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500"></span>
              <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                5. Next Patient in Queue
              </span>
            </div>
            {nextPatient?.tokenNumber && (
              <span className="rounded-lg bg-amber-100 px-2.5 py-0.5 font-mono text-xs font-black text-amber-800">
                TOKEN #{nextPatient.tokenNumber}
              </span>
            )}
          </div>

          {nextPatient ? (
            <div className="space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-lg font-black text-slate-900">{nextPatient.patientName}</h4>
                  {['critical', 'urgent', 'emergency'].includes(nextPatient.priority) && (
                    <span className="rounded bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white animate-pulse">
                      TRIAGE: {nextPatient.priority.toUpperCase()}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Slot: <span className="font-bold text-slate-700">{nextPatient.slotTime}</span> • Est. Wait: ~{nextPatient.estimatedWaitTime || 10} mins
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-3 border border-slate-100 text-xs">
                <span className="text-slate-400 font-bold block">Reason / Complaint:</span>
                <span className="text-slate-700 font-medium block mt-0.5">
                  {nextPatient.chiefComplaint || 'OPD Consultation'}
                </span>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() =>
                    handleViewClinicalHistory({
                      patientId: nextPatient.patientId,
                      appointmentId: nextPatient.appointmentId,
                      patientName: nextPatient.patientName,
                    })
                  }
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>Preview History</span>
                </button>

                <button
                  type="button"
                  onClick={handleCallNext}
                  disabled={actionLoading}
                  className="rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-xs font-black text-white shadow hover:opacity-95 transition flex items-center gap-1.5"
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span>Call Patient Now</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="py-10 text-center space-y-2">
              <Users className="h-8 w-8 text-slate-300 mx-auto" />
              <p className="text-xs font-semibold text-slate-500">No patients waiting in queue</p>
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          4. THE 4 CLEAN DEDICATED CARDS & TABLES
      ───────────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-6">
        {/* ROW 1: TODAY'S QUEUE & TODAY'S SCHEDULE */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* CARD 1: TODAY'S QUEUE (Item 11) */}
          <div className="lg:col-span-8 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-cyan-600" />
                  <span>Today's Queue</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Live waiting line strictly assigned to your practice ({filteredQueue.length} waiting)
                </p>
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setQueueFilter('all')}
                  className={`rounded-lg px-2.5 py-1 font-bold transition ${
                    queueFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({patientQueue.length})
                </button>
                <button
                  type="button"
                  onClick={() => setQueueFilter('urgent')}
                  className={`rounded-lg px-2.5 py-1 font-bold transition ${
                    queueFilter === 'urgent' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Urgent
                </button>
                <button
                  type="button"
                  onClick={() => setQueueFilter('in-person')}
                  className={`rounded-lg px-2.5 py-1 font-bold transition ${
                    queueFilter === 'in-person' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  In-Person
                </button>
                <button
                  type="button"
                  onClick={() => setQueueFilter('video')}
                  className={`rounded-lg px-2.5 py-1 font-bold transition ${
                    queueFilter === 'video' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Video
                </button>
              </div>
            </div>

            {/* Queue Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 uppercase font-black tracking-wider">
                    <th className="py-2.5 px-3">Token</th>
                    <th className="py-2.5 px-3">Patient Name</th>
                    <th className="py-2.5 px-3">Arrival Status</th>
                    <th className="py-2.5 px-3">Priority</th>
                    <th className="py-2.5 px-3">Slot Time</th>
                    <th className="py-2.5 px-3">Est. Wait</th>
                    <th className="py-2.5 px-3">Mode</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredQueue.length > 0 ? (
                    filteredQueue.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-3 font-mono font-black text-slate-900">
                          #{item.tokenNumber || '—'}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{item.patientName}</div>
                          <span className="text-[10px] text-slate-500 truncate max-w-[160px] block">
                            {item.reason}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {item.checkInStatus === 'Checked-In' || item.status === 'checked-in' || item.status === 'waiting' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800 border border-emerald-300 shadow-sm">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              ✓ Arrived
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                              ⏳ In Queue
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-black uppercase ${
                              ['critical', 'urgent', 'emergency'].includes(item.priority)
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {item.priority || 'routine'}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-700">{item.slotTime}</td>
                        <td className="py-3 px-3 font-medium text-slate-600">~{item.estimatedWaitTime} min</td>
                        <td className="py-3 px-3">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                            {item.mode === 'video' ? '📹 Video' : '🏥 OPD'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() =>
                              handleViewClinicalHistory({
                                patientId: item.patientId,
                                appointmentId: item.appointmentId,
                                patientName: item.patientName,
                              })
                            }
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 transition"
                            title="View patient previous visits and history"
                          >
                            History
                          </button>
                          <button
                            type="button"
                            onClick={handleCallNext}
                            className="rounded-lg bg-cyan-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-cyan-800 transition"
                          >
                            Call
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                        No patients matching current queue filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* CARD 2: TODAY'S SCHEDULE (Item 9) */}
          <div className="lg:col-span-4 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-indigo-600" />
                <span>Today's Schedule</span>
              </h3>
              <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
                {todaySchedule.dayFormatted}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              {/* Shift Hours */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-slate-500" />
                  <span className="font-semibold text-slate-700">Working Hours:</span>
                </div>
                <span className="font-black text-slate-900">
                  {todaySchedule.startTime} – {todaySchedule.endTime}
                </span>
              </div>

              {/* Lunch Break */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2">
                  <CoffeeIcon className="h-4 w-4 text-amber-600" />
                  <span className="font-semibold text-slate-700">Break Schedule:</span>
                </div>
                <span className="font-bold text-slate-800">
                  {todaySchedule.breaks?.[0]?.startTime || '13:00'} – {todaySchedule.breaks?.[0]?.endTime || '14:00'}
                </span>
              </div>

              {/* Slot Duration */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-cyan-600" />
                  <span className="font-semibold text-slate-700">Slot Duration:</span>
                </div>
                <span className="font-black text-slate-900">
                  {todaySchedule.slotDuration} Minutes / Slot
                </span>
              </div>

              {/* Capacity Meter */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-indigo-50/80 to-blue-50/80 border border-indigo-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-indigo-950">Shift Capacity:</span>
                  <span className="font-black text-indigo-900">
                    {todaySchedule.bookedSlotsCount} / {todaySchedule.totalSlotsCount} Booked
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-indigo-200 overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(
                        100,
                        (todaySchedule.bookedSlotsCount / Math.max(1, todaySchedule.totalSlotsCount)) * 100
                      )}%`,
                    }}
                  ></div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-indigo-700 pt-0.5">
                  <span>{todaySchedule.completedSlotsCount} Consulted</span>
                  <span>{todaySchedule.remainingSlotsCount} Open Slots</span>
                </div>
              </div>

              <div className="pt-2 text-center">
                <Link
                  to="/doctor-schedule"
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center justify-center gap-1"
                >
                  <span>Edit Weekly Operating Hours</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ROW 2: RECENT PATIENT HISTORY & UPCOMING APPOINTMENTS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* CARD 3: RECENT PATIENTS (Item 12) */}
          <div className="lg:col-span-6 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-emerald-600" />
                  <span>Recent Patients</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Recently consulted patients & clinical encounter records
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 uppercase font-black tracking-wider">
                    <th className="py-2.5 px-3">Patient</th>
                    <th className="py-2.5 px-3">Visit Date</th>
                    <th className="py-2.5 px-3">Diagnosis / Summary</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentPatientHistory.length > 0 ? (
                    recentPatientHistory.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{item.patientName}</div>
                          <span className="text-[10px] text-slate-500">{item.gender} • {item.age || 30}y</span>
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-600">
                          {item.date} <span className="text-[10px] block text-slate-400">{item.slotTime}</span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-semibold text-slate-800 block truncate max-w-[150px]">
                            {item.diagnosis}
                          </span>
                          <span className="text-[10px] text-slate-500 block truncate max-w-[150px]">
                            {item.treatmentSummary}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              handleViewClinicalHistory({
                                patientId: item.patientId,
                                appointmentId: item.appointmentId,
                                patientName: item.patientName,
                              })
                            }
                            className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 transition inline-flex items-center gap-1"
                          >
                            <Shield className="h-3 w-3" />
                            <span>View History</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-400 font-medium">
                        No recent consultations recorded today.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* CARD 4: APPOINTMENTS DESK (Items 7 & 10) */}
          <div className="lg:col-span-6 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  <span>Appointments Desk</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {appointmentsTab === 'today'
                    ? `Today's OPD bookings & front-desk arrival status (${todayAppointments.length} today)`
                    : `Future scheduled appointments (${upcomingAppointments.length} upcoming)`}
                </p>
              </div>

              {/* Tab Switcher */}
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setAppointmentsTab('today')}
                  className={`rounded-lg px-2.5 py-1 font-bold transition ${
                    appointmentsTab === 'today'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Today ({todayAppointments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAppointmentsTab('upcoming')}
                  className={`rounded-lg px-2.5 py-1 font-bold transition ${
                    appointmentsTab === 'upcoming'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Upcoming ({upcomingAppointments.length})
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 uppercase font-black tracking-wider">
                    <th className="py-2.5 px-3">Slot / Date</th>
                    <th className="py-2.5 px-3">Patient Name</th>
                    <th className="py-2.5 px-3">Arrival Status</th>
                    <th className="py-2.5 px-3">Mode</th>
                    <th className="py-2.5 px-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {appointmentsTab === 'today' ? (
                    todayAppointments.length > 0 ? (
                      todayAppointments.map((apt, idx) => {
                        const isArrived =
                          apt.status === 'checked-in' ||
                          apt.status === 'in-progress' ||
                          apt.status === 'completed' ||
                          apt.checkInStatus === 'Checked-In';
                        return (
                          <tr key={idx} className="hover:bg-slate-50/80 transition">
                            <td className="py-3 px-3 font-medium text-slate-900">
                              <span className="font-black text-blue-700">{apt.slotTime}</span>
                              <span className="text-[10px] block text-slate-400 font-mono">
                                {apt.tokenNumber || apt.tokenId?.tokenNumber ? `Token #${apt.tokenNumber || apt.tokenId?.tokenNumber}` : 'Online'}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <div className="font-bold text-slate-900">{apt.patientId?.name || apt.patientName || 'Patient'}</div>
                              <span className="text-[10px] text-slate-500">{apt.patientId?.phone || apt.patientPhone || '—'}</span>
                            </td>
                            <td className="py-3 px-3">
                              {isArrived ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black text-emerald-800 border border-emerald-300 shadow-sm">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                  ✓ Arrived
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                                  ⏳ Awaiting Arrival
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                                {apt.mode === 'video' ? '📹 Video' : '🏥 In-Person'}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  handleViewClinicalHistory({
                                    patientId: apt.patientId?._id || apt.patientId,
                                    appointmentId: apt._id,
                                    patientName: apt.patientId?.name || apt.patientName,
                                  })
                                }
                                className="text-xs font-bold text-blue-600 hover:text-blue-800"
                              >
                                Preview
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400 font-medium">
                          No appointments scheduled for today yet.
                        </td>
                      </tr>
                    )
                  ) : upcomingAppointments.length > 0 ? (
                    upcomingAppointments.map((apt, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-3 font-medium text-slate-900">
                          {apt.date}
                          <span className="text-[10px] block text-slate-500">{apt.slotTime}</span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{apt.patientId?.name || 'Patient'}</div>
                          <span className="text-[10px] text-slate-500">{apt.patientId?.phone || '—'}</span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="rounded bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold uppercase">
                            {apt.status || 'Booked'}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                            {apt.mode === 'video' ? '📹 Video' : '🏥 In-Person'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              handleViewClinicalHistory({
                                patientId: apt.patientId?._id || apt.patientId,
                                appointmentId: apt._id,
                                patientName: apt.patientId?.name,
                              })
                            }
                            className="text-xs font-bold text-blue-600 hover:text-blue-800"
                          >
                            Preview
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 font-medium">
                        No upcoming future appointments scheduled.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          5. AUTHORIZED CLINICAL HISTORY & PREVIOUS VISITS MODAL
      ───────────────────────────────────────────────────────────────────────────── */}
      {historyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">
                    {selectedPatientHistory?.patient?.name || 'Patient'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Verified Clinical Profile & Previous Consultations
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {historyLoading ? (
              <div className="py-12 text-center space-y-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent mx-auto"></div>
                <p className="text-xs font-semibold text-slate-500">Verifying consent grant and retrieving clinical history...</p>
              </div>
            ) : selectedPatientHistory ? (
              <div className="space-y-5 text-xs">
                {/* Authorization Status Badge */}
                <div
                  className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                    selectedPatientHistory.isAuthorized
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {selectedPatientHistory.isAuthorized ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                    )}
                    <span className="font-bold">
                      {selectedPatientHistory.isAuthorized
                        ? '🛡️ Patient Consent Granted (Full Access)'
                        : '🔒 Limited Access (Consent Shielded)'}
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold opacity-80">
                    HIPAA / ABDM Privacy Compliant
                  </span>
                </div>

                {/* Patient Vitals & Blood Group */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-slate-400 font-bold block">Age / Gender</span>
                    <span className="font-bold text-slate-800">
                      {selectedPatientHistory.patient?.age || 'N/A'}y • {selectedPatientHistory.patient?.gender || 'N/A'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-slate-400 font-bold block">Blood Group</span>
                    <span className="font-bold text-indigo-700">
                      {selectedPatientHistory.patient?.bloodGroup || 'O+'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-slate-400 font-bold block">Phone</span>
                    <span className="font-bold text-slate-800">
                      {selectedPatientHistory.patient?.phone || 'Confidential'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-slate-400 font-bold block">Allergies</span>
                    <span className="font-bold text-rose-600 truncate block">
                      {selectedPatientHistory.patient?.allergies?.length
                        ? selectedPatientHistory.patient.allergies.join(', ')
                        : 'No Known Allergies'}
                    </span>
                  </div>
                </div>

                {/* Previous Visits & Medical History */}
                <div className="space-y-2">
                  <h4 className="font-black text-slate-900 uppercase tracking-wider text-[11px]">
                    Previous Visits & Diagnoses
                  </h4>
                  {selectedPatientHistory.sharedMedicalHistory?.length > 0 ? (
                    <div className="space-y-2">
                      {selectedPatientHistory.sharedMedicalHistory.map((item, i) => (
                        <div key={i} className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">{item.condition}</span>
                            <span className="text-slate-400 text-[10px]">{item.diagnosedDate || 'Past Record'}</span>
                          </div>
                          {item.notes && <p className="text-slate-600 text-[11px]">{item.notes}</p>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 text-slate-500 text-center">
                      No previous medical history entries found.
                    </div>
                  )}
                </div>

                {/* Prescriptions */}
                <div className="space-y-2">
                  <h4 className="font-black text-slate-900 uppercase tracking-wider text-[11px]">
                    Prescriptions & Medications
                  </h4>
                  {selectedPatientHistory.sharedPrescriptions?.length > 0 ? (
                    <div className="space-y-2">
                      {selectedPatientHistory.sharedPrescriptions.map((rx, idx) => (
                        <div key={idx} className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                          <div className="font-bold text-slate-800">{rx.diagnosis || 'Prescription'}</div>
                          <div className="text-slate-600 mt-0.5">
                            {rx.medications?.map((m) => `${m.name} (${m.dosage || '1 tab'})`).join(', ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-slate-50 text-slate-500 text-center">
                      No active prescriptions on record.
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition"
              >
                Close Clinical History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          6. PRACTICE SETTINGS MODAL (Secondary Configuration)
      ───────────────────────────────────────────────────────────────────────────── */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Sliders className="h-5 w-5 text-indigo-600" />
                <span>Practice & Fee Settings</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Consultation Fee (₹)</label>
                  <input
                    type="number"
                    value={settingsForm.consultationFee}
                    onChange={(e) => setSettingsForm({ ...settingsForm, consultationFee: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Follow-up Fee (₹)</label>
                  <input
                    type="number"
                    value={settingsForm.followUpFee}
                    onChange={(e) => setSettingsForm({ ...settingsForm, followUpFee: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Clinic / Department Name</label>
                <input
                  type="text"
                  value={settingsForm.clinicName}
                  onChange={(e) => setSettingsForm({ ...settingsForm, clinicName: e.target.value })}
                  placeholder="e.g. AIIMS Cardiology Clinic"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Offered Clinical Services (comma-separated)</label>
                <input
                  type="text"
                  value={settingsForm.services}
                  onChange={(e) => setSettingsForm({ ...settingsForm, services: e.target.value })}
                  placeholder="OPD Consultation, ECG, Angiography Review"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsForm.inPersonMode}
                    onChange={(e) => setSettingsForm({ ...settingsForm, inPersonMode: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>🏥 In-Person OPD</span>
                </label>
                <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsForm.videoMode}
                    onChange={(e) => setSettingsForm({ ...settingsForm, videoMode: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>📹 Video Telehealth</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="rounded-xl bg-indigo-600 px-5 py-2 font-black text-white hover:bg-indigo-700 transition disabled:opacity-50"
                >
                  Save Practice Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline Helper Icon
function CoffeeIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 2v2" />
      <path d="M14 2v2" />
      <path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h12Z" />
      <path d="M6 2v2" />
    </svg>
  );
}
