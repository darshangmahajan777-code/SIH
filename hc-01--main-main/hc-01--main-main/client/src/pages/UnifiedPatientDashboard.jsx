import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getSocket } from '../services/socket';
import HistoryTimeline from '../components/HistoryTimeline';
import TestRecordsTimeline from '../components/TestRecordsTimeline';
import CarePlanCard from '../components/CarePlanCard';

export default function UnifiedPatientDashboard({ patientId = '65f000000000000000000001' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // overview, appointments, queue, history, medicines, tests, care_plans, profile, privacy
  const [vitalsModalOpen, setVitalsModalOpen] = useState(false);
  const [vitalsForm, setVitalsForm] = useState({
    height: '',
    weight: '',
    bloodGroup: 'O+',
    allergies: '',
    age: '',
    phone: '',
    emergencyName: '',
    emergencyPhone: '',
  });
  const [savingVitals, setSavingVitals] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);
  const [walkInInput, setWalkInInput] = useState('');
  const [walkInLoading, setWalkInLoading] = useState(false);
  const [grants, setGrants] = useState([]);
  const [accessLogs, setAccessLogs] = useState([]);
  const [grantsLoading, setGrantsLoading] = useState(false);

  // Fetch full dashboard summary
  const fetchDashboardData = async () => {
    try {
      const res = await fetch(`/api/patient/dashboard-summary?patientId=${patientId}`);
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
        const p = json.data.patient;
        setVitalsForm({
          height: p.height || '',
          weight: p.weight || '',
          bloodGroup: p.bloodGroup !== 'unknown' ? p.bloodGroup : 'O+',
          allergies: (p.allergies || []).join(', '),
          age: p.age || '',
          phone: p.phone || '',
          emergencyName: p.emergencyContact?.name || '',
          emergencyPhone: p.emergencyContact?.phone || '',
        });
      } else {
        setError(json.error || 'Failed to load patient dashboard');
      }
    } catch {
      setError('Network error connecting to healthcare service');
    } finally {
      setLoading(false);
    }
  };

  const fetchGrantsAndLogs = async () => {
    setGrantsLoading(true);
    try {
      const [gRes, lRes] = await Promise.all([
        fetch(`/api/consent/grants?patientId=${patientId}`).then((r) => r.json()).catch(() => ({})),
        fetch(`/api/consent/access-log?patientId=${patientId}&limit=50`).then((r) => r.json()).catch(() => ({})),
      ]);
      if (gRes.success) setGrants(gRes.data || []);
      if (lRes.success) setAccessLogs(lRes.data || []);
    } catch {
      // ignore
    } finally {
      setGrantsLoading(false);
    }
  };

  const handleRevokeGrant = async (grantId) => {
    try {
      const res = await fetch(`/api/consent/revoke/${grantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId }),
      });
      const json = await res.json();
      if (json.success) {
        setActionNotice({
          type: 'success',
          title: '🔒 Access Revoked',
          message: 'Doctor access revoked immediately. Protected medical data is now shielded.',
        });
        fetchGrantsAndLogs();
      } else {
        setActionNotice({ type: 'urgent', title: 'Revoke Failed', message: json.error });
      }
    } catch {
      setActionNotice({ type: 'urgent', title: 'Network Error', message: 'Could not revoke access' });
    }
  };

  useEffect(() => {
    fetchDashboardData();
    fetchGrantsAndLogs();
  }, [patientId]);

  // Real-time Socket.IO subscriptions
  useEffect(() => {
    const socket = getSocket();
    const userRoom = `user:${patientId}`;
    const patientRoom = `patient-room:${patientId}`;

    const joinRooms = () => {
      socket.emit('join_room', userRoom);
      socket.emit('join_room', patientRoom);
      socket.emit('notification:subscribe', { userId: patientId });
    };

    joinRooms();
    socket.on('connect', joinRooms);

    const handlePositionUpdate = (pos) => {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          primaryActions: {
            ...prev.primaryActions,
            activeQueue: {
              ...(prev.primaryActions?.activeQueue || {}),
              isLiveQueue: true,
              tokenNumber: pos.tokenNumber,
              position: pos.position,
              patientsAhead: pos.patientsAhead,
              estimatedTime: pos.estimatedTime,
              estimatedWindow: pos.estimatedWindow,
              recommendedArrivalTime: pos.recommendedArrivalTime,
              status: pos.status,
              priority: pos.priority,
            },
          },
        };
      });
    };

    const handleNearTurn = (alert) => {
      setActionNotice({
        type: 'urgent',
        title: '🚨 Almost Your Turn in Queue!',
        message: alert.message,
      });
    };

    const handleNewNotif = (notif) => {
      setActionNotice({
        type: 'info',
        title: `🔔 ${notif.title}`,
        message: notif.message,
      });
    };

    socket.on('queue:position-update', handlePositionUpdate);
    socket.on('queue:near-turn', handleNearTurn);
    socket.on('notification:new', handleNewNotif);

    return () => {
      socket.off('connect', joinRooms);
      socket.off('queue:position-update', handlePositionUpdate);
      socket.off('queue:near-turn', handleNearTurn);
      socket.off('notification:new', handleNewNotif);
    };
  }, [patientId]);

  // Toggle dose taken/skipped
  const handleToggleDose = async (doseId, prescriptionId, status) => {
    try {
      const res = await fetch(`/api/patient/medicines/dose/${doseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId, prescriptionId, status }),
      });
      const json = await res.json();
      if (json.success) {
        setActionNotice({
          type: 'success',
          title: 'Medication Updated',
          message: `Dose marked as ${status}.`,
        });
        fetchDashboardData();
      }
    } catch {
      alert('Error updating dose status');
    }
  };

  // Save updated vitals
  const handleSaveVitals = async (e) => {
    e.preventDefault();
    setSavingVitals(true);
    try {
      const allergiesList = vitalsForm.allergies
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);

      const res = await fetch('/api/patient/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          height: Number(vitalsForm.height) || null,
          weight: Number(vitalsForm.weight) || null,
          bloodGroup: vitalsForm.bloodGroup,
          age: Number(vitalsForm.age) || null,
          phone: vitalsForm.phone,
          allergies: allergiesList,
          emergencyContact: {
            name: vitalsForm.emergencyName,
            phone: vitalsForm.emergencyPhone,
          },
        }),
      });
      const json = await res.json();
      if (json.success) {
        setActionNotice({
          type: 'success',
          title: 'Medical Snapshot Updated',
          message: 'Vitals, blood group, and BMI re-calculated successfully.',
        });
        setVitalsModalOpen(false);
        fetchDashboardData();
      }
    } catch {
      alert('Error saving vitals');
    } finally {
      setSavingVitals(false);
    }
  };

  // Track walk-in token
  const handleTrackWalkIn = async (e) => {
    e.preventDefault();
    if (!walkInInput.trim()) return;
    setWalkInLoading(true);
    try {
      const res = await fetch(`/api/tokens/track/${encodeURIComponent(walkInInput.trim())}/queue-position`);
      const json = await res.json();
      if (json.success && json.position !== undefined) {
        setData((prev) => ({
          ...prev,
          primaryActions: {
            ...prev.primaryActions,
            activeQueue: json,
          },
        }));
        setActionNotice({
          type: 'info',
          title: `Tracking Walk-in Token #${json.tokenNumber}`,
          message: `Position ${json.position} in today's active OPD queue.`,
        });
      } else {
        alert(json.error || `Token #${walkInInput} not found in today's queue`);
      }
    } catch {
      alert('Network error tracking token');
    } finally {
      setWalkInLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center space-y-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-bold text-slate-600">Loading your comprehensive health dashboard...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-xl mx-auto my-12 p-6 bg-rose-50 border border-rose-200 rounded-3xl text-center space-y-3">
        <div className="text-3xl">⚠️</div>
        <h2 className="text-base font-bold text-rose-800">Healthcare Service Disconnected</h2>
        <p className="text-xs text-rose-600">{error || 'Unable to load patient records'}</p>
        <button
          type="button"
          onClick={fetchDashboardData}
          className="bg-rose-600 text-white font-bold text-xs px-4 py-2 rounded-xl"
        >
          Try Again
        </button>
      </div>
    );
  }

  const { patient, primaryActions, healthSnapshot, discovery, meta } = data;
  const activeQueue = primaryActions?.activeQueue;
  const nextAppointment = primaryActions?.nextAppointment;
  const medicineSchedule = primaryActions?.medicineSchedule || { doses: [], totalToday: 0, takenCount: 0, nextDose: null };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16 px-2 sm:px-4">
      {/* ── Action Notice Banner (Real-time toast / alerts) ────────────────── */}
      {actionNotice && (
        <div
          className={`p-4 rounded-2xl border shadow-md flex items-center justify-between transition-all ${
            actionNotice.type === 'urgent'
              ? 'bg-amber-500 text-white border-amber-600 animate-bounce'
              : actionNotice.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-blue-900 text-white border-blue-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">
              {actionNotice.type === 'urgent' ? '🚨' : actionNotice.type === 'success' ? '✓' : 'ℹ️'}
            </span>
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider">{actionNotice.title}</h4>
              <p className="text-xs font-medium opacity-90">{actionNotice.message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            className="text-xs font-bold px-2 py-1 rounded-lg hover:bg-black/10"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── TOP: Patient Header, Vitals Summary, Profile Completion ─────────── */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-sm flex items-center justify-center shadow-xs">
                {patient.name?.[0] || 'P'}
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Welcome back, {patient.name}!
              </h1>
              <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                Active Patient
              </span>
            </div>

            <p className="text-xs text-slate-500 font-medium">
              Health ID: <span className="font-mono font-bold text-slate-700">{patient.id}</span> • Phone: {patient.phone} • Age: {patient.age ? `${patient.age} yrs` : 'Not recorded'}
            </p>

            {/* Health Snapshot Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 px-3 py-1 rounded-xl">
                🩸 Blood: <span className="text-rose-600">{patient.bloodGroup}</span>
              </span>
              <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 px-3 py-1 rounded-xl">
                📏 {patient.height ? `${patient.height} cm` : 'Height: N/A'}
              </span>
              <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 px-3 py-1 rounded-xl">
                ⚖️ {patient.weight ? `${patient.weight} kg` : 'Weight: N/A'}
              </span>
              <span
                className={`inline-flex items-center gap-1 text-xs font-extrabold px-3 py-1 rounded-xl border ${
                  patient.bmi?.color === 'emerald'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : patient.bmi?.color === 'amber'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                BMI: {patient.bmi?.value || 'N/A'} ({patient.bmi?.category})
              </span>
              <button
                type="button"
                id="btn-edit-vitals"
                onClick={() => setVitalsModalOpen(true)}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline px-2 py-1"
              >
                ✏️ Edit Vitals
              </button>
            </div>
          </div>

          {/* Profile Completion Meter */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 min-w-[260px] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">Health Profile Completion</span>
              <span className="font-black text-blue-600">{patient.profileCompletion?.percentage}%</span>
            </div>
            <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${patient.profileCompletion?.percentage}%` }}
              />
            </div>
            {patient.profileCompletion?.missingFields?.length > 0 ? (
              <p className="text-[11px] text-slate-500 truncate">
                Add: {patient.profileCompletion.missingFields.slice(0, 2).join(', ')}
              </p>
            ) : (
              <p className="text-[11px] text-emerald-600 font-bold">✓ Profile 100% complete</p>
            )}
          </div>
        </div>

        {/* ── Cohesive Sub-Navigation Strip ─────────────────────────────────── */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto text-xs font-bold">
          {[
            { id: 'overview', label: '📊 Command Center' },
            { id: 'queue', label: `⏱️ Queue ${activeQueue ? '(#1)' : ''}` },
            { id: 'appointments', label: `📅 Appointments (${primaryActions.upcomingCount})` },
            { id: 'medicines', label: `💊 Today's Medicines (${medicineSchedule.totalToday})` },
            { id: 'history', label: '📜 Medical History' },
            { id: 'tests', label: '🧪 Lab Reports' },
            { id: 'care_plans', label: '📋 Care Plans' },
            { id: 'discovery', label: '🔍 Find Doctors' },
            { id: 'privacy', label: '🔒 Data Sharing & Consent' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              id={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 rounded-xl whitespace-nowrap transition ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── PRIMARY SECTION: "WHAT DOES THE PATIENT NEED TO DO NOW?" ───────── */}
      {(activeTab === 'overview' || activeTab === 'queue' || activeTab === 'appointments' || activeTab === 'medicines') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping"></span>
              Immediate Actions &amp; Live Status
            </h2>
            <span className="text-[11px] text-slate-400">Auto-updating via Socket.IO</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* 1. CURRENT LIVE QUEUE */}
            <div
              className={`rounded-3xl p-6 border transition flex flex-col justify-between ${
                activeQueue
                  ? 'bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950 text-white border-indigo-500/30 shadow-xl'
                  : 'bg-white text-slate-800 border-slate-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                    Live Queue
                  </span>
                  {activeQueue && (
                    <span className="text-xs font-extrabold text-amber-400">
                      Token #{activeQueue.tokenNumber}
                    </span>
                  )}
                </div>

                {activeQueue ? (
                  <div className="space-y-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black text-white">{activeQueue.position}</span>
                      <span className="text-xs text-slate-300 font-semibold">in queue</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                      <div className="bg-white/10 p-2.5 rounded-xl">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Queue Position</span>
                        <span className="text-amber-300 font-bold text-sm truncate block">
                          #{activeQueue.position} ({activeQueue.patientsAhead} ahead)
                        </span>
                      </div>
                      <div className="bg-white/10 p-2.5 rounded-xl">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">When to Arrive</span>
                        <span className="text-emerald-300 font-bold text-xs truncate block">
                          {activeQueue.recommendedArrivalTime || '15 min prior'}
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-300 leading-tight">
                      Est. Window: <strong>{activeQueue.estimatedWindow || activeQueue.estimatedTime}</strong>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 py-1">
                    <p className="text-xs text-slate-500">
                      No live token active for today yet. Have a walk-in kiosk token?
                    </p>
                    <form onSubmit={handleTrackWalkIn} className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Token # (e.g. 14)"
                        value={walkInInput}
                        onChange={(e) => setWalkInInput(e.target.value)}
                        className="w-full text-xs px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 font-bold"
                      />
                      <button
                        type="submit"
                        disabled={walkInLoading}
                        className="bg-slate-900 text-white text-xs font-bold px-3 py-2 rounded-xl whitespace-nowrap"
                      >
                        {walkInLoading ? '...' : 'Track'}
                      </button>
                    </form>
                  </div>
                )}
              </div>

              <div className="pt-4 mt-3 border-t border-white/10 flex items-center justify-between text-xs">
                <Link to="/display" className="text-blue-300 font-bold hover:underline">
                  Public Board →
                </Link>
                {activeQueue && (
                  <span className="text-[11px] text-slate-400 capitalize">
                    Priority: {activeQueue.priority}
                  </span>
                )}
              </div>
            </div>

            {/* 2. NEXT APPOINTMENT */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Next Appointment
                  </span>
                  {nextAppointment && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                      {nextAppointment.mode === 'video' ? '📹 Video' : '🏥 In-Person'}
                    </span>
                  )}
                </div>

                {nextAppointment ? (
                  <div className="space-y-2">
                    <h3 className="font-extrabold text-slate-900 text-base">
                      Dr. {nextAppointment.doctorId?.doctorName || 'Attending Clinician'}
                    </h3>
                    <p className="text-xs text-blue-600 font-semibold">
                      {nextAppointment.doctorId?.specialty || 'General OPD'}
                    </p>

                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs space-y-1.5">
                      <div className="flex justify-between items-start">
                        <span className="text-slate-500 font-semibold">📍 Doctor Location:</span>
                        <span className="text-slate-900 font-bold text-right">
                          {nextAppointment.doctorId?.hospitalName || 'MediQueue General Hospital'}
                          <span className="block text-[11px] text-blue-600 font-medium">OPD Wing • Room 204</span>
                        </span>
                      </div>
                      <div className="flex justify-between font-semibold pt-1 border-t border-slate-200/50">
                        <span className="text-slate-500">Scheduled Date:</span>
                        <span className="text-slate-800">{nextAppointment.date}</span>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <span className="text-slate-500">Slot Time:</span>
                        <span className="text-blue-700 font-bold">{nextAppointment.slotTime}</span>
                      </div>
                    </div>

                    {/* Prominent Video Join Button if video appointment */}
                    {nextAppointment.mode === 'video' && ['booked', 'checked-in', 'in-progress'].includes(nextAppointment.status) && (
                      <Link
                        to={`/telemedicine/${nextAppointment._id}`}
                        id="btn-join-telemedicine-next"
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-2 shadow-sm animate-pulse mt-2"
                      >
                        <span>📹</span> Join Video Call Room
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="py-4 text-center space-y-2">
                    <div className="text-3xl">🗓️</div>
                    <p className="text-xs text-slate-500">No appointments scheduled right now.</p>
                    <Link
                      to="/find-doctors"
                      className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-xs"
                    >
                      + Book a Specialist Slot
                    </Link>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                <Link to="/my-appointments" className="text-blue-600 font-bold hover:underline">
                  View All Visits ({primaryActions.upcomingCount}) →
                </Link>
              </div>
            </div>

            {/* 3. TODAY'S MEDICINES & NEXT DOSE */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                    Today's Medicines
                  </span>
                  <span className="text-xs font-bold text-slate-600">
                    {medicineSchedule.takenCount}/{medicineSchedule.totalToday} Taken
                  </span>
                </div>

                {medicineSchedule.nextDose ? (
                  <div className="space-y-3">
                    <div className="bg-purple-50/70 border border-purple-200 rounded-2xl p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 bg-purple-200/60 px-2 py-0.5 rounded">
                          💊 Take Now • Due: {medicineSchedule.nextDose.scheduledTime}
                        </span>
                        <span className="text-[11px] font-bold capitalize text-slate-600">
                          {medicineSchedule.nextDose.mealRelation.replace('_', ' ')}
                        </span>
                      </div>
                      <h4 className="font-black text-slate-900 text-sm">
                        {medicineSchedule.nextDose.medicineName}
                      </h4>
                      <p className="text-xs text-slate-600 font-medium">
                        Dosage: <strong>{medicineSchedule.nextDose.dosage}</strong>
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleDose(
                            medicineSchedule.nextDose.doseId,
                            medicineSchedule.nextDose.prescriptionId,
                            'taken'
                          )
                        }
                        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs py-2 rounded-xl transition shadow-xs"
                      >
                        ✓ Mark Taken
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleDose(
                            medicineSchedule.nextDose.doseId,
                            medicineSchedule.nextDose.prescriptionId,
                            'skipped'
                          )
                        }
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs px-3 py-2 rounded-xl transition"
                      >
                        Skip
                      </button>
                    </div>
                  </div>
                ) : medicineSchedule.totalToday > 0 ? (
                  <div className="py-4 text-center space-y-1">
                    <div className="text-3xl">🎉</div>
                    <h4 className="font-bold text-slate-800 text-xs">All Today's Doses Completed!</h4>
                    <p className="text-[11px] text-slate-500">Great job staying on track with your prescription.</p>
                  </div>
                ) : (
                  <div className="py-4 text-center space-y-1.5">
                    <div className="text-3xl">💊</div>
                    <p className="text-xs text-slate-500">No active medication reminders today.</p>
                    <p className="text-[11px] text-slate-400">Doctor digital prescriptions will automatically populate schedules.</p>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('medicines')}
                  className="text-purple-700 font-bold hover:underline"
                >
                  View Medication Schedule →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PRIVACY & CONSENT INDICATOR STRIP (COMMAND CENTER) ─────────────── */}
      {activeTab === 'overview' && (
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center text-xl shrink-0">
              🛡️
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                  Who can access my records?
                </span>
                {grants.filter((g) => g.status === 'active').length > 0 ? (
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase border border-emerald-300">
                    ACCESS GRANTED ({grants.filter((g) => g.status === 'active').length} Doctor)
                  </span>
                ) : (
                  <span className="bg-slate-100 text-slate-700 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase border border-slate-200">
                    🔒 Protected &amp; Shielded
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {grants.filter((g) => g.status === 'active').length > 0
                  ? `Authorized Clinicians: ${grants
                      .filter((g) => g.status === 'active')
                      .map((g) => g.doctorId?.doctorName || g.doctorId?.name || 'Dr. Sarah Patel')
                      .join(', ')}. Scoped for history, tests, and care plans.`
                  : 'Zero external doctors currently have access to your health history. Data is strictly patient-sovereign.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl whitespace-nowrap transition shadow-xs text-center"
          >
            Manage Consent &amp; Audit Logs →
          </button>
        </div>
      )}

      {/* ── HEALTH SNAPSHOT & CLINICAL RECORDS (OVERVIEW) ────────────────────── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Medical History Snippet */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">📜</span>
                <h3 className="font-black text-slate-900 text-sm">Medical History</h3>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                grants.some(g => g.status === 'active') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
              }`}>
                {grants.some(g => g.status === 'active') ? '● Shared' : '🔒 Not Shared'}
              </span>
            </div>

            {healthSnapshot.recentHistory?.length > 0 ? (
              <div className="space-y-3">
                {healthSnapshot.recentHistory.map((item) => (
                  <div key={item._id} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">{item.condition}</span>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                          item.source === 'doctor_verified'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {item.source === 'doctor_verified' ? 'Verified' : 'Self-Reported'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Date: {item.conditionDate} • {item.doctorName || 'Patient Self'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-slate-400 text-xs">
                No past conditions logged.
              </div>
            )}

            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className="text-xs font-bold text-blue-600 hover:underline"
              >
                View Full Timeline →
              </button>
            </div>
          </div>

          {/* Diagnostic Test Orders & Lab Results */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🧪</span>
                <h3 className="font-black text-slate-900 text-sm">Diagnostic Lab Tests</h3>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                grants.some(g => g.status === 'active') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
              }`}>
                {grants.some(g => g.status === 'active') ? '● Shared' : '🔒 Not Shared'}
              </span>
            </div>

            {healthSnapshot.recentTests?.length > 0 ? (
              <div className="space-y-3">
                {healthSnapshot.recentTests.map((test) => (
                  <div key={test._id} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">{test.testName}</span>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                          test.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {test.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {test.doctorName ? `Ordered by Dr. ${test.doctorName}` : 'Clinical Diagnostics'}
                      {test.result?.value ? ` • Result: ${test.result.value} ${test.result.unit || ''}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-slate-400 text-xs">
                No lab tests ordered yet.
              </div>
            )}

            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveTab('tests')}
                className="text-xs font-bold text-indigo-600 hover:underline"
              >
                View All Test Orders →
              </button>
            </div>
          </div>

          {/* Doctor Care Plan Snippet */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">📋</span>
                <h3 className="font-black text-slate-900 text-sm">Doctor Care Plan</h3>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                grants.some(g => g.status === 'active') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
              }`}>
                {grants.some(g => g.status === 'active') ? '● Shared' : '🔒 Not Shared'}
              </span>
            </div>

            {healthSnapshot.activeCarePlan ? (
              <div className="space-y-2">
                <div className="text-xs font-extrabold text-slate-900">
                  {healthSnapshot.activeCarePlan.diagnosis}
                </div>
                <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-100 text-[11px] text-emerald-900">
                  <strong className="block text-emerald-800">DO:</strong>
                  {(healthSnapshot.activeCarePlan.dietRecommended || []).slice(0, 2).join(', ')}
                </div>
                <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-100 text-[11px] text-rose-900">
                  <strong className="block text-rose-800">AVOID:</strong>
                  {(healthSnapshot.activeCarePlan.dietRestricted || []).slice(0, 2).join(', ')}
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-slate-400 text-xs">
                No active care plan on file.
              </div>
            )}

            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveTab('care_plans')}
                className="text-xs font-bold text-indigo-600 hover:underline"
              >
                View Full Care Plan Details →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DEDICATED TAB: DATA SHARING & PRIVACY MANAGEMENT ───────────────── */}
      {activeTab === 'privacy' && (
        <div className="space-y-6">
          {/* Sovereign Data Declaration Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🛡️</span>
              <span className="text-xs font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full border border-blue-400/30">
                Patient-Sovereign Data Security
              </span>
            </div>
            <h2 className="text-2xl font-black">Medical Data Privacy &amp; Consent Controls</h2>
            <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
              Under MediQueue+, you maintain sovereign ownership of your health records. Attending clinicians cannot view your past consultations, lab results, or care plans without an explicit, active consent grant. You can grant, inspect, or revoke access at any time with immediate effect.
            </p>
          </div>

          {/* Record Sharing Status Matrix */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              Health Record Sharing Matrix
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { title: 'Medical History', icon: '📜', scopeKey: 'history', desc: 'Past diagnoses, chronic conditions, and verified clinical notes' },
                { title: 'Diagnostic Lab Tests', icon: '🧪', scopeKey: 'tests', desc: 'Blood panels, pathology reports, and radiology summaries' },
                { title: 'Digital Prescriptions', icon: '💊', scopeKey: 'prescriptions', desc: 'Medication dosages, refill history, and meal relations' },
                { title: 'Doctor Care Plans', icon: '📋', scopeKey: 'care_plans', desc: 'Dietary guidance, restricted activities, and follow-up schedules' },
              ].map((res) => {
                const isShared = grants.some((g) => g.status === 'active');
                return (
                  <div
                    key={res.title}
                    className={`rounded-2xl p-4 border flex flex-col justify-between space-y-3 transition ${
                      isShared
                        ? 'bg-emerald-50/50 border-emerald-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xl">{res.icon}</span>
                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase border ${
                            isShared
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-slate-200 text-slate-700 border-slate-300'
                          }`}
                        >
                          {isShared ? '● Shared' : '🔒 Not Shared'}
                        </span>
                      </div>
                      <h4 className="font-extrabold text-slate-900 text-xs">{res.title}</h4>
                      <p className="text-[11px] text-slate-500 mt-1 leading-snug">{res.desc}</p>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400">
                      {isShared ? 'Protected under active grant' : 'Shielded from external access'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Clinician Access Grants */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Doctor Access Permissions
                </h3>
                <p className="text-xs text-slate-500">
                  Clinicians who currently have or previously had access to view your medical dossier.
                </p>
              </div>
              <Link
                to="/consent"
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition text-center shadow-xs"
              >
                + Grant Doctor Access
              </Link>
            </div>

            {grantsLoading ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading access grants...</div>
            ) : grants.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <div className="text-3xl">🔒</div>
                <h4 className="font-bold text-slate-800 text-sm">No Doctor Access Grants</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Your medical data is completely shielded. You can grant access to an attending physician whenever you book an appointment.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {grants.map((grant) => (
                  <div
                    key={grant._id}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-slate-900 text-sm">
                          Dr. {grant.doctorId?.doctorName || grant.doctorId?.name || 'Sarah Patel'}
                        </h4>
                        <span
                          className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase border ${
                            grant.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-rose-100 text-rose-800 border-rose-300'
                          }`}
                        >
                          {grant.status === 'active' ? 'ACCESS GRANTED' : 'ACCESS REVOKED'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        Hospital: {grant.doctorId?.hospitalName || 'MediQueue General Hospital'} • Specialty: {grant.doctorId?.specialty || 'Attending Physician'}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-600">
                        <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                          Scope: <strong>{grant.scope || 'Full Dossier'}</strong>
                        </span>
                        <span className="text-slate-400">
                          Granted: {new Date(grant.createdAt || Date.now()).toLocaleDateString()}
                        </span>
                        {grant.status === 'revoked' && (
                          <span className="text-rose-600 font-bold">
                            Revoked: {new Date(grant.revokedAt || Date.now()).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    {grant.status === 'active' && (
                      <button
                        type="button"
                        id={`btn-revoke-grant-${grant._id}`}
                        onClick={() => handleRevokeGrant(grant._id)}
                        className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-xs whitespace-nowrap self-start sm:self-center"
                      >
                        Revoke Access
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Access Audit Log: "Who accessed a record" */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-4">
            <div>
              <h3 className="text-base font-black text-slate-900">
                Access Audit Trail ("Who Accessed My Records")
              </h3>
              <p className="text-xs text-slate-500">
                Immutable, real-time audit entries recorded every time a clinician or system queries your protected medical dossier.
              </p>
            </div>

            {accessLogs.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No access events recorded yet. Entries will appear automatically when doctors view records.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                      <th className="py-2.5 px-3">Clinician / Actor</th>
                      <th className="py-2.5 px-3">Resource Accessed</th>
                      <th className="py-2.5 px-3">Action</th>
                      <th className="py-2.5 px-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {accessLogs.map((log) => (
                      <tr key={log._id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          {log.doctorId?.name || log.doctorId?.doctorName || log.authorizedBy || 'Attending Physician'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 capitalize">
                          {log.resource?.replace(/_/g, ' ') || 'Clinical Dossier'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded font-black text-[10px] uppercase ${
                            log.action === 'read' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">
                          {new Date(log.accessedAt || Date.now()).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DEDICATED TAB: APPOINTMENTS ────────────────────────────────────── */}
      {activeTab === 'appointments' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-black text-slate-900">
                Scheduled Appointments &amp; Consultations
              </h2>
              <p className="text-xs text-slate-500">
                All upcoming OPD visits and video telemedicine slots.
              </p>
            </div>
            <Link
              to="/find-doctors"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition text-center shadow-xs"
            >
              + Book New Appointment
            </Link>
          </div>

          {(primaryActions.upcomingAppointments || []).length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="text-4xl">🗓️</div>
              <h3 className="font-bold text-slate-800 text-sm">No Appointments Scheduled</h3>
              <p className="text-xs text-slate-500">Find doctors and book available time slots in a few clicks.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(primaryActions.upcomingAppointments || []).map((apt) => (
                <div
                  key={apt._id}
                  className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-extrabold text-slate-900 text-sm">
                        Dr. {apt.doctorId?.doctorName || 'Attending Specialist'}
                      </h4>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                        {apt.mode === 'video' ? '📹 Video' : '🏥 In-Person'}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700 capitalize">
                        {apt.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      {apt.doctorId?.specialty || 'Specialist'} • {apt.doctorId?.hospitalName || 'MediQueue Hospital'} (OPD Room 204)
                    </p>
                    <p className="text-xs font-semibold text-slate-700">
                      Date: {apt.date} • Slot Time: <strong className="text-blue-700">{apt.slotTime}</strong>
                    </p>
                  </div>

                  {apt.mode === 'video' && ['booked', 'checked-in', 'in-progress'].includes(apt.status) && (
                    <Link
                      to={`/telemedicine/${apt._id}`}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition shadow-xs text-center whitespace-nowrap"
                    >
                      📹 Join Video Call
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── DEDICATED TAB: MEDICINES SCHEDULE ──────────────────────────────── */}
      {activeTab === 'medicines' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-black text-slate-900">
                Today's Medication Dosing Schedule
              </h2>
              <p className="text-xs text-slate-500">
                Timely reminders synced automatically from your doctor's digital prescriptions.
              </p>
            </div>
            <span className="text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 px-3 py-1 rounded-xl self-start sm:self-center">
              {medicineSchedule.takenCount}/{medicineSchedule.totalToday} Completed Today
            </span>
          </div>

          {(medicineSchedule.doses || []).length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="text-4xl">💊</div>
              <h3 className="font-bold text-slate-800 text-sm">No Active Medication Doses Today</h3>
              <p className="text-xs text-slate-500">Digital prescriptions issued during consultations will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {medicineSchedule.doses.map((dose) => (
                <div
                  key={dose.doseId}
                  className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition ${
                    dose.status === 'taken'
                      ? 'bg-emerald-50/50 border-emerald-200'
                      : dose.status === 'skipped'
                      ? 'bg-slate-100 border-slate-200'
                      : 'bg-purple-50/50 border-purple-200'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black px-2 py-0.5 rounded bg-purple-200/70 text-purple-800">
                        {dose.scheduledTime}
                      </span>
                      <h4 className="font-black text-slate-900 text-sm">{dose.medicineName}</h4>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        dose.status === 'taken' ? 'bg-emerald-100 text-emerald-800' : dose.status === 'skipped' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {dose.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 font-medium">
                      Dosage: <strong>{dose.dosage}</strong> • Meal: <span className="capitalize">{dose.mealRelation?.replace('_', ' ')}</span>
                    </p>
                    {dose.instructions && (
                      <p className="text-[11px] text-slate-500 italic">{dose.instructions}</p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleDose(dose.doseId, dose.prescriptionId, 'taken')}
                      className={`text-xs font-bold px-3 py-1.5 rounded-xl transition ${
                        dose.status === 'taken' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                      }`}
                    >
                      ✓ Taken
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleDose(dose.doseId, dose.prescriptionId, 'skipped')}
                      className={`text-xs font-bold px-3 py-1.5 rounded-xl transition ${
                        dose.status === 'skipped' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Skip
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── DEDICATED TAB: MEDICAL HISTORY ─────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-black text-slate-900">
              Complete Medical History Timeline
            </h2>
            <p className="text-xs text-slate-500">
              Verified clinical diagnoses from attending physicians and self-reported medical events.
            </p>
          </div>
          <HistoryTimeline
            entries={healthSnapshot.recentHistory || []}
            isPatientView={true}
            consentVerified={true}
            loading={false}
          />
        </div>
      )}

      {/* ── DEDICATED TAB: LAB TESTS ───────────────────────────────────────── */}
      {activeTab === 'tests' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-black text-slate-900">
              Diagnostic Lab Orders &amp; Test Results
            </h2>
            <p className="text-xs text-slate-500">
              Blood tests, pathology orders, and verified diagnostic laboratory results.
            </p>
          </div>
          <TestRecordsTimeline
            orders={healthSnapshot.recentTests || []}
            isPatientView={true}
          />
        </div>
      )}

      {/* ── DEDICATED TAB: CARE PLANS ──────────────────────────────────────── */}
      {activeTab === 'care_plans' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-black text-slate-900">
              Doctor Care Plans &amp; Lifestyle Guidance
            </h2>
            <p className="text-xs text-slate-500">
              Prescribed lifestyle, dietary habits, restricted activities, and follow-up consultation dates.
            </p>
          </div>
          {healthSnapshot.activeCarePlan ? (
            <CarePlanCard
              plan={healthSnapshot.activeCarePlan}
              isDoctorView={false}
            />
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs">
              No active doctor care plans on file.
            </div>
          )}
        </div>
      )}

      {/* ── DISCOVERY: RECOMMENDED SPECIALISTS ─────────────────────────────── */}
      {(activeTab === 'overview' || activeTab === 'discovery') && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span>🔍</span> Find &amp; Consult Available Doctors
              </h2>
              <p className="text-xs text-slate-500">
                Top rated hospital specialists available for immediate in-person and video consultations.
              </p>
            </div>
            <Link
              to="/find-doctors"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition text-center shadow-xs"
            >
              Browse All Doctors →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(discovery.recommendedDoctors || []).map((doc) => (
              <div
                key={doc._id}
                className="bg-slate-50 rounded-2xl p-4 border border-slate-200 hover:border-blue-300 transition flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-extrabold text-blue-600 bg-blue-100/60 px-2 py-0.5 rounded">
                      {doc.specialty}
                    </span>
                    <span className="text-amber-500 font-bold">★ {doc.avgRating}</span>
                  </div>
                  <h4 className="font-black text-slate-900 text-sm">{doc.doctorName}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{doc.hospitalName}</p>
                </div>

                <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
                  <span className="text-xs font-black text-slate-900">₹{doc.consultationFee}</span>
                  <Link
                    to="/find-doctors"
                    className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-3 py-1.5 rounded-xl transition"
                  >
                    Book Slot
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── EDIT VITALS MODAL ──────────────────────────────────────────────── */}
      {vitalsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span>✏️</span> Update Medical Snapshot &amp; Vitals
              </h3>
              <button
                type="button"
                onClick={() => setVitalsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveVitals} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Height (cm)</label>
                  <input
                    type="number"
                    value={vitalsForm.height}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, height: e.target.value })}
                    placeholder="e.g. 172"
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Weight (kg)</label>
                  <input
                    type="number"
                    value={vitalsForm.weight}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, weight: e.target.value })}
                    placeholder="e.g. 68"
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Blood Group</label>
                  <select
                    value={vitalsForm.bloodGroup}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, bloodGroup: e.target.value })}
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 font-bold bg-white"
                  >
                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'].map((bg) => (
                      <option key={bg} value={bg}>
                        {bg}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Age</label>
                  <input
                    type="number"
                    value={vitalsForm.age}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, age: e.target.value })}
                    placeholder="e.g. 32"
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Known Allergies (comma separated)
                </label>
                <input
                  type="text"
                  value={vitalsForm.allergies}
                  onChange={(e) => setVitalsForm({ ...vitalsForm, allergies: e.target.value })}
                  placeholder="e.g. Penicillin, Pollen, Peanuts"
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Emergency Contact Name</label>
                  <input
                    type="text"
                    value={vitalsForm.emergencyName}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, emergencyName: e.target.value })}
                    placeholder="e.g. John Doe"
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Emergency Phone</label>
                  <input
                    type="text"
                    value={vitalsForm.emergencyPhone}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, emergencyPhone: e.target.value })}
                    placeholder="e.g. +91 98765 00000"
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setVitalsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingVitals}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-xs disabled:opacity-50"
                >
                  {savingVitals ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
