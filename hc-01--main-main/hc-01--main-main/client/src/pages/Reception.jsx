import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { gsap } from 'gsap';
import {
  Stethoscope,
  Clock,
  Calendar,
  Users,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Building2,
  UserCheck,
  Ticket,
  Activity,
  Phone,
  ArrowRight,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { useQueue } from '../context/QueueContext';
import { useAuth } from '../context/AuthContext';
import {
  getReceptionDoctorsAvailability,
  getReceptionAppointments,
  checkInAppointmentAtReception,
} from '../services/api';
import { getSocket } from '../services/socket';
import toast from 'react-hot-toast';

const priorities = [
  { value: 'general', label: 'General OPD', desc: 'Standard queue sequence' },
  { value: 'senior', label: 'Senior Citizen', desc: 'Priority queue placement' },
  { value: 'emergency', label: 'Emergency / Triage', desc: 'Immediate clinical review' },
];

export default function Reception() {
  const containerRef = useRef(null);
  const { queue, createToken, stats, refreshAll, connected } = useQueue();
  const { user } = useAuth();

  // Operational State
  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loadingOps, setLoadingOps] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedHospitalId, setSelectedHospitalId] = useState('');

  // Walk-in Registration Form (STRICTLY OPERATIONAL - ZERO CLINICAL/DIAGNOSIS FIELDS)
  const [walkInForm, setWalkInForm] = useState({
    patientName: '',
    age: '',
    phone: '',
    selectedDoctorId: '',
    priority: 'general',
  });
  const [issuedToken, setIssuedToken] = useState(null);

  // Search filter for appointments
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'not-arrived' | 'checked-in'

  // Fetch Reception Operational Data
  const fetchOperationalData = useCallback(async () => {
    try {
      setLoadingOps(true);
      const [docsData, aptsData] = await Promise.all([
        getReceptionDoctorsAvailability(selectedHospitalId).catch(() => []),
        getReceptionAppointments({ hospitalId: selectedHospitalId }).catch(() => []),
      ]);
      setDoctors(Array.isArray(docsData) ? docsData : []);
      setAppointments(Array.isArray(aptsData) ? aptsData : []);
    } catch (err) {
      console.error('Failed to load reception operational data:', err);
      toast.error('Could not refresh reception data');
    } finally {
      setLoadingOps(false);
    }
  }, [selectedHospitalId]);

  // Initial Load & GSAP Entry Animations
  useEffect(() => {
    fetchOperationalData();
    refreshAll();

    if (containerRef.current) {
      const ctx = gsap.context(() => {
        gsap.from('[data-reception-card]', {
          y: 20,
          opacity: 0,
          duration: 0.5,
          stagger: 0.08,
          ease: 'power2.out',
        });
      }, containerRef);
      return () => ctx.revert();
    }
  }, [fetchOperationalData, refreshAll]);

  // Real-Time Socket.IO Synchronization with Doctors & Clinic Queue
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const joinRooms = () => {
      socket.emit('join_room', 'queue-room');
      socket.emit('join_room', 'reception-room');
      if (selectedHospitalId) {
        socket.emit('join_room', `hospital-room:${selectedHospitalId}`);
        socket.emit('join_room', `reception-room:${selectedHospitalId}`);
      }
    };

    joinRooms();
    socket.on('connect', joinRooms);

    // 1. Doctor Availability Changed
    const handleDoctorAvailability = (data) => {
      console.log('[Reception Socket] Doctor availability update:', data);
      setDoctors((prevDocs) => {
        const found = prevDocs.some((d) => String(d.doctorId) === String(data.doctorId));
        if (found) {
          return prevDocs.map((d) =>
            String(d.doctorId) === String(data.doctorId)
              ? {
                  ...d,
                  availabilityStatus: data.availabilityStatus,
                  isAvailableToday: data.isAvailableToday,
                }
              : d
          );
        }
        return [...prevDocs, data];
      });
      toast(
        `Dr. ${data.doctorName || 'Doctor'} is now ${(data.availabilityStatus || 'available').toUpperCase().replace('_', ' ')}`,
        {
          icon: '👨‍⚕️',
          duration: 3500,
        }
      );
    };

    // 2. Doctor Called Next Patient / Started Consultation
    const handlePatientCalled = (data) => {
      console.log('[Reception Socket] Patient called:', data);
      setDoctors((prevDocs) =>
        prevDocs.map((d) =>
          String(d.doctorId) === String(data.doctorId)
            ? { ...d, currentServingToken: data.tokenNumber || d.currentServingToken, availabilityStatus: 'busy' }
            : d
        )
      );
      refreshAll();
      fetchOperationalData();
    };

    // 3. Doctor Completed Consultation
    const handleConsultationComplete = (data) => {
      console.log('[Reception Socket] Consultation complete:', data);
      setDoctors((prevDocs) =>
        prevDocs.map((d) =>
          d.currentServingToken === data.tokenNumber ? { ...d, currentServingToken: null, availabilityStatus: 'available' } : d
        )
      );
      refreshAll();
      fetchOperationalData();
    };

    // 4. Patient Checked In (From another desk or online check-in)
    const handlePatientCheckedIn = (data) => {
      console.log('[Reception Socket] Patient checked in:', data);
      setAppointments((prevApts) =>
        prevApts.map((a) =>
          String(a._id) === String(data.appointmentId)
            ? {
                ...a,
                status: 'checked-in',
                checkInStatus: 'Checked-In',
                checkInTime: data.checkInTime || new Date().toISOString(),
                tokenNumber: data.tokenNumber || a.tokenNumber,
              }
            : a
        )
      );
      refreshAll();
    };

    // 5. New Appointment Booked
    const handleAppointmentBooked = () => {
      fetchOperationalData();
    };

    // 6. Token Created / Queue Updated
    const handleQueueUpdate = () => {
      refreshAll();
    };

    socket.on('doctor:availability_updated', handleDoctorAvailability);
    socket.on('patient_called', handlePatientCalled);
    socket.on('consultation_complete', handleConsultationComplete);
    socket.on('patient_checked_in', handlePatientCheckedIn);
    socket.on('appointment_booked', handleAppointmentBooked);
    socket.on('token_created', handleQueueUpdate);
    socket.on('queue_updated', handleQueueUpdate);

    return () => {
      socket.off('connect', joinRooms);
      socket.off('doctor:availability_updated', handleDoctorAvailability);
      socket.off('patient_called', handlePatientCalled);
      socket.off('consultation_complete', handleConsultationComplete);
      socket.off('patient_checked_in', handlePatientCheckedIn);
      socket.off('appointment_booked', handleAppointmentBooked);
      socket.off('token_created', handleQueueUpdate);
      socket.off('queue_updated', handleQueueUpdate);
    };
  }, [selectedHospitalId, refreshAll, fetchOperationalData]);

  // Handle Front-Desk Patient Arrival Check-In
  const handleCheckInPatient = async (appointmentId, patientName) => {
    try {
      setActionLoading(true);
      const updated = await checkInAppointmentAtReception(appointmentId, selectedHospitalId);

      setAppointments((prev) =>
        prev.map((apt) =>
          apt._id === appointmentId
            ? {
                ...apt,
                status: 'checked-in',
                checkInStatus: 'Checked-In',
                checkInTime: updated.checkInTime || new Date().toISOString(),
                tokenNumber: updated.tokenNumber || apt.tokenNumber,
              }
            : apt
        )
      );

      toast.success(`✓ Checked in ${patientName}! Doctor notified in real-time.`, {
        icon: '🏥',
        duration: 4000,
      });

      await Promise.all([refreshAll(), fetchOperationalData()]);
    } catch (err) {
      console.error('Check-in error:', err);
      toast.error(err.message || 'Failed to check in patient');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Walk-In Token Generation (Strictly Operational - Zero Condition Input)
  const handleWalkInSubmit = async (e) => {
    e.preventDefault();
    if (!walkInForm.patientName.trim()) {
      toast.error('Patient full name is required');
      return;
    }

    try {
      setActionLoading(true);
      const token = await createToken({
        patientName: walkInForm.patientName.trim(),
        age: walkInForm.age ? Number(walkInForm.age) : undefined,
        priority: walkInForm.priority,
        doctorId: walkInForm.selectedDoctorId || undefined,
        department: 'OPD',
      });

      setIssuedToken(token);
      toast.success(`Generated Token #${token.tokenNumber || token.tokenId} for ${walkInForm.patientName}!`);

      setWalkInForm({
        patientName: '',
        age: '',
        phone: '',
        selectedDoctorId: '',
        priority: 'general',
      });

      await Promise.all([refreshAll(), fetchOperationalData()]);
    } catch (err) {
      console.error('Walk-in token generation error:', err);
      toast.error(err.message || 'Failed to issue token');
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered Appointments
  const filteredAppointments = useMemo(() => {
    return appointments.filter((apt) => {
      const matchesSearch =
        !searchTerm.trim() ||
        apt.patientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        apt.patientPhone?.includes(searchTerm) ||
        apt.doctorName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(apt.tokenNumber || '').includes(searchTerm);

      if (!matchesSearch) return false;

      if (filterMode === 'not-arrived') {
        return apt.checkInStatus !== 'Checked-In' && apt.status !== 'checked-in';
      }
      if (filterMode === 'checked-in') {
        return apt.checkInStatus === 'Checked-In' || apt.status === 'checked-in';
      }
      return true;
    });
  }, [appointments, searchTerm, filterMode]);

  // Derived Waiting Queue
  const waitingTokens = useMemo(() => {
    return (Array.isArray(queue) ? queue : []).filter(
      (t) => t.status === 'waiting' || t.status === 'in-progress'
    );
  }, [queue]);

  const checkedInCount = appointments.filter(
    (a) => a.checkInStatus === 'Checked-In' || a.status === 'checked-in'
  ).length;

  const availableDoctorsCount = doctors.filter((d) => d.availabilityStatus === 'available').length;

  return (
    <div ref={containerRef} className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      {/* ─────────────────────────────────────────────────────────────────────────────
          1. HEADER & OPERATIONAL CONTEXT BANNER
      ───────────────────────────────────────────────────────────────────────────── */}
      <div
        data-reception-card
        className="rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 text-white shadow-xl"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-emerald-500/20 px-2.5 py-0.5 text-xs font-black tracking-wider uppercase text-emerald-300 border border-emerald-400/30 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Hospital Reception Desk
              </span>
              <span className="rounded-md bg-white/10 px-2.5 py-0.5 text-xs font-bold text-slate-300 border border-white/10">
                🏥 Front Desk Operations
              </span>
              <span className="rounded-md bg-white/10 px-2.5 py-0.5 text-xs font-mono text-cyan-200">
                Staff: {user?.name || 'Reception Officer'}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Patient Arrival & Operational Dispatch Desk
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl">
              Real-time synchronization between front-desk arrivals and attending doctors. Zero private
              clinical diagnoses exposed; strictly operational queues, tokens, and check-in workflows.
            </p>
          </div>

          {/* Sync Status & Quick Refresh */}
          <div className="flex flex-wrap items-center gap-3">
            <div
              className={`rounded-2xl border px-4 py-2 text-xs font-bold flex items-center gap-2 ${
                connected
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  connected ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'
                }`}
              ></span>
              <span>{connected ? 'Socket.IO Real-Time Active' : 'Disconnected'}</span>
            </div>

            <button
              type="button"
              onClick={() => {
                fetchOperationalData();
                refreshAll();
                toast.success('Refreshed reception desks');
              }}
              className="rounded-2xl border border-white/20 bg-white/10 p-2.5 text-slate-200 hover:bg-white/20 transition"
              title="Refresh All Desks"
            >
              <RefreshCw className={`h-4 w-4 ${loadingOps ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          2. OPERATIONAL KPI SUMMARY CARDS
      ───────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Doctors Available */}
        <div data-reception-card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold truncate">Doctors On-Duty</span>
            <Stethoscope className="h-4 w-4 text-cyan-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{availableDoctorsCount}</span>
            <span className="text-xs font-bold text-slate-400">/ {doctors.length || 0} Available</span>
          </div>
          <span className="text-[11px] font-semibold text-cyan-600">Active consultation rooms</span>
        </div>

        {/* Today's Booked Appointments */}
        <div data-reception-card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold truncate">Today's Appointments</span>
            <Calendar className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black text-blue-600">{appointments.length}</span>
            <span className="text-xs font-bold text-slate-400">Booked Slots</span>
          </div>
          <span className="text-[11px] font-semibold text-blue-600">Scheduled for today</span>
        </div>

        {/* Arrived & Checked-In */}
        <div data-reception-card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold truncate">Checked In / Arrived</span>
            <UserCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600">{checkedInCount}</span>
            <span className="text-xs font-bold text-slate-400">Arrived</span>
          </div>
          <span className="text-[11px] font-semibold text-emerald-600">Patients at clinic</span>
        </div>

        {/* Live Queue Waiting */}
        <div data-reception-card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold truncate">Live Queue Waiting</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-600">{waitingTokens.length}</span>
            <span className="text-xs font-bold text-slate-400">In Line</span>
          </div>
          <span className="text-[11px] font-semibold text-amber-600">Waiting for doctor call</span>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          3. LIVE DOCTOR AVAILABILITY & OPD STATUS BAR
      ───────────────────────────────────────────────────────────────────────────── */}
      <div data-reception-card className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-indigo-600" />
              <span>Attending Doctor Availability & Room Status</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live consultation room telemetry automatically synchronized with doctors' dashboards.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500"></span> Available</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500"></span> Busy</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-indigo-500"></span> On Leave</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-400"></span> Offline</span>
          </div>
        </div>

        {/* Doctors Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {doctors.length > 0 ? (
            doctors.map((doc, idx) => {
              const status = doc.availabilityStatus || (doc.isAvailableToday ? 'available' : 'offline');
              const statusConfig = {
                available: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', dot: 'bg-emerald-500', label: 'Available' },
                busy: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', dot: 'bg-amber-500', label: 'In Consultation' },
                on_leave: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-800', dot: 'bg-indigo-500', label: 'On Leave' },
                offline: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', dot: 'bg-slate-400', label: 'Offline' },
              }[status] || { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', dot: 'bg-slate-400', label: status };

              return (
                <div
                  key={doc.doctorId || idx}
                  className={`rounded-2xl border p-4 transition hover:shadow-md ${statusConfig.bg} ${statusConfig.border}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800 truncate">{doc.doctorName}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${statusConfig.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${statusConfig.dot}`}></span>
                      {statusConfig.label}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 font-semibold mt-1">
                    {doc.specialty || 'General Medicine'}
                  </p>

                  <div className="mt-3 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Now Serving:</span>
                    {doc.currentServingToken ? (
                      <span className="font-mono font-black text-cyan-700 bg-white px-2 py-0.5 rounded-md border border-cyan-200 shadow-sm">
                        TOKEN #{doc.currentServingToken}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-semibold italic">Room Idle</span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-4 py-6 text-center text-xs font-semibold text-slate-400">
              No doctors currently listed for this practice campus.
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          4. MAIN SECTION: APPOINTMENTS ARRIVAL DESK & WALK-IN TOKEN GENERATOR
      ───────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: TODAY'S APPOINTMENTS & ARRIVAL CHECK-IN (8 COLS) */}
        <div data-reception-card className="lg:col-span-8 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-emerald-600" />
                <span>Scheduled Appointments & Arrival Check-In</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Front desk arrival check-in. Zero clinical diagnoses exposed.
              </p>
            </div>

            {/* Filter Buttons */}
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`rounded-lg px-2.5 py-1 font-bold transition ${
                  filterMode === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({appointments.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('not-arrived')}
                className={`rounded-lg px-2.5 py-1 font-bold transition ${
                  filterMode === 'not-arrived' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Awaiting Arrival
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('checked-in')}
                className={`rounded-lg px-2.5 py-1 font-bold transition ${
                  filterMode === 'checked-in' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Checked-In ({checkedInCount})
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by patient name, phone, doctor, or token #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Appointments Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 uppercase font-black tracking-wider">
                  <th className="py-2.5 px-3">Slot Time</th>
                  <th className="py-2.5 px-3">Patient Name</th>
                  <th className="py-2.5 px-3">Doctor Assigned</th>
                  <th className="py-2.5 px-3">Token #</th>
                  <th className="py-2.5 px-3">Est. Wait</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAppointments.length > 0 ? (
                  filteredAppointments.map((apt) => {
                    const isArrived =
                      apt.checkInStatus === 'Checked-In' ||
                      apt.status === 'checked-in' ||
                      apt.status === 'in-progress' ||
                      apt.status === 'completed';

                    return (
                      <tr key={apt._id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-3 font-bold text-slate-900">
                          {apt.slotTime}
                          <span className="text-[10px] block text-slate-400 font-normal">Today</span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{apt.patientName}</div>
                          <span className="text-[10px] text-slate-500">{apt.patientPhone || '—'}</span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-800">{apt.doctorName}</div>
                          <span className="text-[10px] text-indigo-600 font-bold">{apt.doctorSpecialty}</span>
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-slate-900">
                          {apt.tokenNumber ? `#${apt.tokenNumber}` : '—'}
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-600">
                          ~{apt.estimatedWaitTime || 15} min
                        </td>
                        <td className="py-3 px-3">
                          {isArrived ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black text-emerald-800 border border-emerald-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              ✓ Checked-In
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                              ⏳ Awaiting Arrival
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {!isArrived ? (
                            <button
                              type="button"
                              onClick={() => handleCheckInPatient(apt._id, apt.patientName)}
                              disabled={actionLoading}
                              className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-black text-white shadow-sm hover:bg-emerald-700 transition disabled:opacity-50 inline-flex items-center gap-1"
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                              <span>Check-In</span>
                            </button>
                          ) : (
                            <span className="text-[11px] font-bold text-slate-400 italic">
                              Arrived
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                      No appointments matching current search or filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT COLUMN: WALK-IN TOKEN GENERATOR (4 COLS) */}
        <div data-reception-card className="lg:col-span-4 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Ticket className="h-5 w-5 text-indigo-600" />
              <span>Walk-In Token Generator</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Issue an instant token for arriving walk-in patients without pre-booking.
            </p>
          </div>

          <form onSubmit={handleWalkInSubmit} className="space-y-3.5 text-xs">
            {/* Patient Name */}
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Patient Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Priya Sharma"
                value={walkInForm.patientName}
                onChange={(e) => setWalkInForm({ ...walkInForm, patientName: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Age & Phone */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Age</label>
                <input
                  type="number"
                  min="0"
                  max="130"
                  placeholder="e.g. 42"
                  value={walkInForm.age}
                  onChange={(e) => setWalkInForm({ ...walkInForm, age: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Phone</label>
                <input
                  type="tel"
                  placeholder="+91..."
                  value={walkInForm.phone}
                  onChange={(e) => setWalkInForm({ ...walkInForm, phone: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Assigned Doctor (Optional) */}
            <div>
              <label className="font-bold text-slate-700 block mb-1">Assigned Doctor (Optional)</label>
              <select
                value={walkInForm.selectedDoctorId}
                onChange={(e) => setWalkInForm({ ...walkInForm, selectedDoctorId: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">General OPD / Next Available</option>
                {doctors.map((doc) => (
                  <option key={doc.doctorId} value={doc.doctorId}>
                    {doc.doctorName} ({doc.specialty}) — {doc.availabilityStatus?.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority Level */}
            <div>
              <label className="font-bold text-slate-700 block mb-1">Queue Priority</label>
              <div className="space-y-1.5">
                {priorities.map((p) => (
                  <label
                    key={p.value}
                    className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition ${
                      walkInForm.priority === p.value
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 font-bold'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div>
                      <span className="block font-bold">{p.label}</span>
                      <span className="block text-[10px] text-slate-500">{p.desc}</span>
                    </div>
                    <input
                      type="radio"
                      name="priority"
                      value={p.value}
                      checked={walkInForm.priority === p.value}
                      onChange={(e) => setWalkInForm({ ...walkInForm, priority: e.target.value })}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                  </label>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={actionLoading}
              className="w-full rounded-2xl bg-indigo-600 py-3 text-xs font-black text-white shadow-lg hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Ticket className="h-4 w-4" />
              <span>{actionLoading ? 'Issuing Token...' : 'Generate & Print Token'}</span>
            </button>
          </form>

          {/* Newly Issued Token Display Card */}
          {issuedToken && (
            <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/60 p-4 space-y-2 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
                  🎟️ Latest Token Issued
                </span>
                <span className="rounded bg-emerald-200 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-900">
                  {issuedToken.priority?.toUpperCase()}
                </span>
              </div>
              <div className="text-3xl font-black text-emerald-900 font-mono">
                #{issuedToken.tokenNumber || issuedToken.tokenId}
              </div>
              <div className="text-xs text-emerald-800 font-semibold">
                Patient: <span className="font-black">{issuedToken.patientName}</span>
              </div>
              <div className="text-[11px] text-emerald-700">
                Est. Waiting Time: ~{issuedToken.estimatedWaitTime || 15} minutes
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          5. LIVE CLINIC WAITING QUEUE MONITOR
      ───────────────────────────────────────────────────────────────────────────── */}
      <div data-reception-card className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600" />
              <span>Live Waiting Queue Monitor</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Authoritative clinic-wide queue order. Synchronized across all reception and doctor consoles.
            </p>
          </div>
          <span className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-black text-amber-800">
            {waitingTokens.length} Patients in Waiting Area
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 uppercase font-black tracking-wider">
                <th className="py-2.5 px-3">Queue #</th>
                <th className="py-2.5 px-3">Token</th>
                <th className="py-2.5 px-3">Patient Name</th>
                <th className="py-2.5 px-3">Priority Level</th>
                <th className="py-2.5 px-3">Assigned Department</th>
                <th className="py-2.5 px-3">Est. Wait</th>
                <th className="py-2.5 px-3 text-right">Queue Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {waitingTokens.length > 0 ? (
                waitingTokens.map((token, index) => (
                  <tr key={token._id || index} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-3 font-mono font-bold text-slate-500">#{index + 1}</td>
                    <td className="py-3 px-3 font-mono font-black text-slate-900 text-sm">
                      #{token.tokenNumber || '—'}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{token.patientName}</div>
                      {token.age && <span className="text-[10px] text-slate-400">{token.age} yrs</span>}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-black uppercase ${
                          ['critical', 'urgent', 'emergency'].includes(token.priority)
                            ? 'bg-rose-100 text-rose-800'
                            : token.priority === 'senior'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {token.priority || 'general'}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-700">
                      {token.department || 'OPD'}
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-600">
                      ~{token.estimatedWaitTime || (index + 1) * 10} min
                    </td>
                    <td className="py-3 px-3 text-right">
                      {token.status === 'in-progress' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2.5 py-0.5 text-[10px] font-black text-cyan-800 animate-pulse">
                          Now Consulting
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                          Waiting in Lobby
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                    Waiting lobby is currently empty.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
