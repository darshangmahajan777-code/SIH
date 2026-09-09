import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import QueueList from '../components/QueueList';
import ConsultationTimer from '../components/ConsultationTimer';
import StatsCard from '../components/StatsCard';
import HistoryTimeline from '../components/HistoryTimeline';
import TestRecordsTimeline from '../components/TestRecordsTimeline';
import CarePlanCard from '../components/CarePlanCard';
import { useQueue } from '../context/QueueContext';
import * as api from '../services/api';

const DEFAULT_DOCTOR_ID = '65f000000000000000000002';

export default function DoctorClinicalWorkspace({ initialDoctorId = DEFAULT_DOCTOR_ID }) {
  const [doctorId, setDoctorId] = useState(initialDoctorId);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState('clinical'); // 'clinical' | 'queue'
  const [scheduleFilter, setScheduleFilter] = useState('all'); // 'all' | 'video' | 'checked-in' | 'in-progress' | 'completed'

  // Queue context from existing OPD engine
  const { queue, callNext, completeToken, currentToken, stats, loading: queueLoading, connected } = useQueue();

  // Doctor session state
  const [session, setSession] = useState(null);
  const [sessionDoctorName, setSessionDoctorName] = useState('Dr. Sarah Patel');
  const [sessionError, setSessionError] = useState('');

  // Workspace summary state
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(null);

  // Patient Encounter Dossier state (Patient View)
  const [activeEncounterId, setActiveEncounterId] = useState(null);
  const [encounterData, setEncounterData] = useState(null);
  const [encounterLoading, setEncounterLoading] = useState(false);
  const [encounterError, setEncounterError] = useState(null);
  const [activeClinicalSection, setActiveClinicalSection] = useState('overview'); // 'overview' | 'history' | 'tests' | 'prescriptions' | 'care_plans'

  // Clinical Actions Modal States
  // 1. Prescription Modal
  const [rxModalOpen, setRxModalOpen] = useState(false);
  const [rxDiagnosis, setRxDiagnosis] = useState('');
  const [rxInstructions, setRxInstructions] = useState('');
  const [rxMedications, setRxMedications] = useState([
    {
      medicineName: '',
      dosage: '500mg',
      frequency: 'Twice daily',
      doseTimes: ['09:00', '21:00'],
      mealRelation: 'after_meal',
      durationDays: 7,
      instructions: '',
    },
  ]);
  const [submittingRx, setSubmittingRx] = useState(false);

  // 2. Test Order Modal
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testOrderForm, setTestOrderForm] = useState({ testName: 'Complete Blood Count (CBC)', reason: '' });
  const [submittingTest, setSubmittingTest] = useState(false);

  // 3. Care Plan Modal
  const [carePlanModalOpen, setCarePlanModalOpen] = useState(false);
  const [carePlanForm, setCarePlanForm] = useState({
    diagnosis: '',
    dietRecommended: '',
    dietRestricted: '',
    activitiesRecommended: '',
    activitiesRestricted: '',
    followUpDate: '',
    notes: '',
  });
  const [submittingCarePlan, setSubmittingCarePlan] = useState(false);

  // 4. Doctor-Verified History Modal
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyForm, setHistoryForm] = useState({ condition: '', conditionDate: '', notes: '' });
  const [submittingHistory, setSubmittingHistory] = useState(false);

  // 5. Priority Override Modal (Existing Queue engine feature)
  const [overrideToken, setOverrideToken] = useState(null);
  const [overridePriorityVal, setOverridePriorityVal] = useState('critical');
  const [overrideReasonText, setOverrideReasonText] = useState('');
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [overrideFeedback, setOverrideFeedback] = useState('');

  // Toast / feedback message
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToastMessage({ text: msg, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Fetch session
  const refetchSession = useCallback(async () => {
    try {
      const activeSession = await api.getDoctorSession();
      if (activeSession) {
        setSession(activeSession);
        if (activeSession.doctorName) setSessionDoctorName(activeSession.doctorName);
      }
    } catch {
      // session fetch optional
    }
  }, []);

  // Fetch workspace summary
  const fetchWorkspaceSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await fetch(`/api/doctor/workspace-summary?doctorId=${doctorId}`, {
        headers: { 'x-doctor-id': doctorId },
      });
      const json = await res.json();
      if (json.success) {
        setSummary(json.data);
      } else {
        setSummaryError(json.error || 'Failed to load doctor workspace summary');
      }
    } catch (err) {
      setSummaryError('Network error loading doctor workspace');
    } finally {
      setSummaryLoading(false);
    }
  }, [doctorId]);

  // Fetch active patient encounter dossier
  const fetchPatientEncounter = useCallback(async (appointmentId) => {
    if (!appointmentId) return;
    setEncounterLoading(true);
    setEncounterError(null);
    try {
      const res = await fetch(`/api/doctor/encounter/${appointmentId}?doctorId=${doctorId}`, {
        headers: { 'x-doctor-id': doctorId },
      });
      const json = await res.json();
      if (json.success) {
        setEncounterData(json.data);
        setActiveEncounterId(appointmentId);
        // Pre-fill diagnosis from chief complaint
        setRxDiagnosis(json.data.appointment?.chiefComplaint || '');
        setCarePlanForm((prev) => ({
          ...prev,
          diagnosis: json.data.appointment?.chiefComplaint || 'Clinical Consultation',
          followUpDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        }));
        setHistoryForm((prev) => ({
          ...prev,
          condition: json.data.appointment?.chiefComplaint || '',
          conditionDate: new Date().toISOString().slice(0, 10),
        }));
      } else {
        setEncounterError(json.error || 'Failed to load patient encounter');
      }
    } catch (err) {
      setEncounterError('Network error opening patient encounter');
    } finally {
      setEncounterLoading(false);
    }
  }, [doctorId]);

  useEffect(() => {
    refetchSession();
    fetchWorkspaceSummary();
  }, [refetchSession, fetchWorkspaceSummary]);

  // Handle start session
  const handleStartSession = async () => {
    if (!sessionDoctorName.trim()) {
      setSessionError('Doctor name is required.');
      return;
    }
    try {
      const started = await api.startDoctorSession({ doctorName: sessionDoctorName.trim() });
      setSession(started);
      setSessionError('');
      showToast(`Session active for ${sessionDoctorName.trim()}`);
    } catch (err) {
      setSessionError(err.message || 'Failed to start doctor session.');
    }
  };

  // Handle end session
  const handleEndSession = async () => {
    try {
      await api.endDoctorSession();
      setSession(null);
      showToast('Doctor session ended');
    } catch (err) {
      showToast(err.message || 'Failed to end session', 'error');
    }
  };

  // Encounter Actions
  const handleStartConsultation = async (appointmentId) => {
    try {
      const res = await fetch(`/api/doctor/encounter/${appointmentId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-doctor-id': doctorId },
        body: JSON.stringify({ doctorId }),
      });
      const json = await res.json();
      if (json.success) {
        showToast('Consultation started. Status is now in-progress.');
        fetchWorkspaceSummary();
        fetchPatientEncounter(appointmentId);
      } else {
        showToast(json.error || 'Failed to start consultation', 'error');
      }
    } catch {
      showToast('Network error starting consultation', 'error');
    }
  };

  const handleCompleteConsultation = async (appointmentId) => {
    try {
      const res = await fetch(`/api/doctor/encounter/${appointmentId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-doctor-id': doctorId },
        body: JSON.stringify({
          doctorId,
          diagnosis: encounterData?.appointment?.chiefComplaint || rxDiagnosis || 'Clinical Consultation',
          notes: 'Consultation successfully completed by attending clinician',
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast('✓ Consultation completed. Verified history recorded and token closed.');
        fetchWorkspaceSummary();
        fetchPatientEncounter(appointmentId);
      } else {
        showToast(json.error || 'Failed to complete consultation', 'error');
      }
    } catch {
      showToast('Network error completing consultation', 'error');
    }
  };

  // Issue Prescription
  const handlePrescriptionSubmit = async (e) => {
    e.preventDefault();
    if (!rxMedications[0]?.medicineName.trim()) {
      showToast('Please enter at least one medicine name', 'error');
      return;
    }
    setSubmittingRx(true);
    try {
      const patientId = encounterData.patient.id;
      const res = await fetch(`/api/doctor/encounter/${activeEncounterId}/prescription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-doctor-id': doctorId },
        body: JSON.stringify({
          patientId,
          doctorId,
          doctorName: summary?.doctor?.doctorName || sessionDoctorName,
          diagnosis: rxDiagnosis || encounterData.appointment.chiefComplaint,
          medications: rxMedications,
          instructions: rxInstructions,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast('Digital prescription issued and scheduled for reminders.');
        setRxModalOpen(false);
        fetchPatientEncounter(activeEncounterId);
      } else {
        showToast(json.error || 'Failed to issue prescription', 'error');
      }
    } catch {
      showToast('Network error issuing prescription', 'error');
    } finally {
      setSubmittingRx(false);
    }
  };

  // Order Lab Test
  const handleOrderTestSubmit = async (e) => {
    e.preventDefault();
    if (!testOrderForm.testName.trim() || !testOrderForm.reason.trim()) {
      showToast('Test name and clinical reason are required', 'error');
      return;
    }
    setSubmittingTest(true);
    try {
      const patientId = encounterData.patient.id;
      const res = await fetch(`/api/doctor/encounter/${activeEncounterId}/order-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-doctor-id': doctorId },
        body: JSON.stringify({
          patientId,
          doctorId,
          doctorName: summary?.doctor?.doctorName || sessionDoctorName,
          testName: testOrderForm.testName.trim(),
          reason: testOrderForm.reason.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Diagnostic test "${testOrderForm.testName}" ordered.`);
        setTestModalOpen(false);
        setTestOrderForm({ testName: 'Complete Blood Count (CBC)', reason: '' });
        fetchWorkspaceSummary();
        fetchPatientEncounter(activeEncounterId);
      } else {
        showToast(json.error || 'Failed to order test', 'error');
      }
    } catch {
      showToast('Network error ordering test', 'error');
    } finally {
      setSubmittingTest(false);
    }
  };

  // Issue Care Plan
  const handleCarePlanSubmit = async (e) => {
    e.preventDefault();
    if (!carePlanForm.diagnosis.trim()) {
      showToast('Diagnosis is required for care plan', 'error');
      return;
    }
    setSubmittingCarePlan(true);
    try {
      const patientId = encounterData.patient.id;
      const res = await fetch(`/api/doctor/encounter/${activeEncounterId}/care-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-doctor-id': doctorId },
        body: JSON.stringify({
          patientId,
          doctorId,
          doctorName: summary?.doctor?.doctorName || sessionDoctorName,
          diagnosis: carePlanForm.diagnosis.trim(),
          dietRecommended: carePlanForm.dietRecommended,
          dietRestricted: carePlanForm.dietRestricted,
          activitiesRecommended: carePlanForm.activitiesRecommended,
          activitiesRestricted: carePlanForm.activitiesRestricted,
          followUpDate: carePlanForm.followUpDate || null,
          notes: carePlanForm.notes.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast('Doctor care plan issued successfully.');
        setCarePlanModalOpen(false);
        fetchPatientEncounter(activeEncounterId);
      } else {
        showToast(json.error || 'Failed to issue care plan', 'error');
      }
    } catch {
      showToast('Network error issuing care plan', 'error');
    } finally {
      setSubmittingCarePlan(false);
    }
  };

  // Doctor-Verified History Entry
  const handleVerifiedHistorySubmit = async (e) => {
    e.preventDefault();
    if (!historyForm.condition.trim()) {
      showToast('Condition name is required', 'error');
      return;
    }
    setSubmittingHistory(true);
    try {
      const patientId = encounterData.patient.id;
      const res = await fetch(`/api/doctor/encounter/${activeEncounterId}/verified-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-doctor-id': doctorId },
        body: JSON.stringify({
          patientId,
          doctorId,
          doctorName: summary?.doctor?.doctorName || sessionDoctorName,
          condition: historyForm.condition.trim(),
          conditionDate: historyForm.conditionDate || new Date().toISOString().slice(0, 10),
          notes: historyForm.notes.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast('Doctor-verified medical history record added.');
        setHistoryModalOpen(false);
        fetchPatientEncounter(activeEncounterId);
      } else {
        showToast(json.error || 'Failed to record verified history', 'error');
      }
    } catch {
      showToast('Network error recording verified history', 'error');
    } finally {
      setSubmittingHistory(false);
    }
  };

  // Priority Override (Existing Queue Engine)
  const handleOpenOverride = (token) => {
    setOverrideToken(token);
    setOverridePriorityVal(token.priority || 'urgent');
    setOverrideReasonText('');
    setOverrideFeedback('');
  };

  const handleSubmitOverride = async (e) => {
    e?.preventDefault();
    if (!overrideToken) return;
    setOverrideLoading(true);
    setOverrideFeedback('');
    try {
      const res = await fetch('/api/priority/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId: overrideToken._id,
          newPriority: overridePriorityVal,
          overrideReason: overrideReasonText.trim() || 'Clinical direct assessment by physician',
          doctorName: session?.doctorName || sessionDoctorName || 'Attending Physician',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setOverrideFeedback(`Priority successfully updated to ${overridePriorityVal.toUpperCase()}`);
        setTimeout(() => {
          setOverrideToken(null);
          setOverrideFeedback('');
          fetchWorkspaceSummary();
        }, 1200);
      } else {
        alert(data.error || 'Failed to override priority');
      }
    } catch {
      alert('Network error submitting clinical override');
    } finally {
      setOverrideLoading(false);
    }
  };

  // Filtered Appointments
  const filteredAppointments = useMemo(() => {
    if (!summary?.todayAppointments) return [];
    if (scheduleFilter === 'all') return summary.todayAppointments;
    if (scheduleFilter === 'video') return summary.todayAppointments.filter((a) => a.mode === 'video');
    return summary.todayAppointments.filter((a) => a.status === scheduleFilter);
  }, [summary, scheduleFilter]);

  const waitingQueue = useMemo(
    () => queue.filter((token) => token.status === 'waiting'),
    [queue]
  );

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-20 right-6 z-50 px-4 py-3 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 animate-slide-up border ${
            toastMessage.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <span>{toastMessage.type === 'error' ? '⚠️' : '✓'}</span>
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* TOP HEADER: Doctor Clinical Workspace */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-black text-xl shadow-md shadow-blue-500/20">
            🩺
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full border border-blue-200">
                Attending Clinician Workspace
              </span>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  connected ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                {connected ? 'Live Sync' : 'Offline'}
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">
              {summary?.doctor?.doctorName || sessionDoctorName}
            </h1>
            <p className="text-xs text-slate-500">
              {summary?.doctor?.specialty || 'General Medicine'} • {summary?.doctor?.hospitalName || 'MediQueue Hospital'}
            </p>
          </div>
        </div>

        {/* View Switcher & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="bg-slate-100 p-1 rounded-2xl flex items-center gap-1 border border-slate-200">
            <button
              type="button"
              id="tab-clinical-workspace"
              onClick={() => {
                setActiveWorkspaceTab('clinical');
              }}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
                activeWorkspaceTab === 'clinical'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🏥 Clinical Workspace
            </button>
            <button
              type="button"
              id="tab-opd-queue"
              onClick={() => {
                setActiveWorkspaceTab('queue');
                setActiveEncounterId(null);
              }}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
                activeWorkspaceTab === 'queue'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ⏱️ OPD Queue Engine ({waitingQueue.length})
            </button>
          </div>

          <Link
            to="/doctor-schedule"
            className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition"
          >
            📅 Schedule
          </Link>

          {session ? (
            <button
              type="button"
              onClick={handleEndSession}
              className="px-3.5 py-2 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition"
            >
              End Session
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartSession}
              className="px-3.5 py-2 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition"
            >
              Start Session
            </button>
          )}
        </div>
      </div>

      {/* WORKSPACE VIEW: CLINICAL (Doctor Home & Patient Encounter) */}
      {activeWorkspaceTab === 'clinical' && (
        <div className="space-y-6">
          {/* STATS METRIC BAR */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <span className="text-[11px] font-bold text-slate-400 block uppercase">Today's Visits</span>
              <span className="text-2xl font-black text-slate-900 mt-0.5 block">
                {summary?.stats?.totalAppointments ?? '--'}
              </span>
              <span className="text-[10px] text-slate-500 font-medium">
                {summary?.stats?.completedCount ?? 0} Completed
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <span className="text-[11px] font-bold text-slate-400 block uppercase">In-Progress</span>
              <span className="text-2xl font-black text-blue-600 mt-0.5 block">
                {summary?.stats?.inProgressCount ?? 0}
              </span>
              <span className="text-[10px] text-blue-600 font-medium">Currently Attending</span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <span className="text-[11px] font-bold text-slate-400 block uppercase">In Queue</span>
              <span className="text-2xl font-black text-indigo-600 mt-0.5 block">
                {summary?.stats?.queueWaitingCount ?? waitingQueue.length}
              </span>
              <span className="text-[10px] text-indigo-600 font-medium">Tokens Waiting</span>
            </div>

            <div className="bg-white rounded-2xl border border-rose-200 bg-rose-50/40 p-4 shadow-sm">
              <span className="text-[11px] font-bold text-rose-700 block uppercase">Urgent / Critical</span>
              <span className="text-2xl font-black text-rose-700 mt-0.5 block">
                {summary?.stats?.urgentCount ?? 0}
              </span>
              <span className="text-[10px] text-rose-600 font-medium">Acuity Priority</span>
            </div>

            <div className="bg-white rounded-2xl border border-purple-200 bg-purple-50/40 p-4 shadow-sm">
              <span className="text-[11px] font-bold text-purple-700 block uppercase">Pending Tests</span>
              <span className="text-2xl font-black text-purple-700 mt-0.5 block">
                {summary?.stats?.pendingTestsCount ?? 0}
              </span>
              <span className="text-[10px] text-purple-600 font-medium">Diagnostic Orders</span>
            </div>

            <div className="bg-white rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
              <span className="text-[11px] font-bold text-emerald-700 block uppercase">Video Consults</span>
              <span className="text-2xl font-black text-emerald-700 mt-0.5 block">
                {summary?.stats?.videoCount ?? 0}
              </span>
              <span className="text-[10px] text-emerald-600 font-medium">Telemedicine</span>
            </div>
          </div>

          {/* NEXT PATIENT / ACTIVE CONSULTATION SPOTLIGHT */}
          {summary?.nextPatient && (
            <div className="bg-gradient-to-r from-blue-900 to-indigo-950 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="bg-blue-500/30 text-blue-200 text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border border-blue-400/30">
                    {summary.nextPatient.status === 'in-progress' ? '⚡ CURRENTLY SERVING' : '▶ NEXT PATIENT IN LINE'}
                  </span>
                  {summary.nextPatient.priority && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        ['critical', 'emergency'].includes(summary.nextPatient.priority)
                          ? 'bg-rose-500 text-white animate-pulse'
                          : 'bg-amber-400 text-slate-900'
                      }`}
                    >
                      {summary.nextPatient.priority} Priority
                    </span>
                  )}
                  <span className="text-xs text-blue-200">
                    {summary.nextPatient.mode === 'video' ? '📹 Video' : '🏥 In-Person'}
                  </span>
                </div>

                <div className="flex items-baseline gap-3">
                  <h2 className="text-2xl font-black">{summary.nextPatient.patientName}</h2>
                  {summary.nextPatient.tokenNumber && (
                    <span className="text-blue-300 font-bold text-sm bg-white/10 px-2.5 py-0.5 rounded-lg">
                      Token #{summary.nextPatient.tokenNumber}
                    </span>
                  )}
                  <span className="text-blue-200 text-xs font-semibold">⏰ {summary.nextPatient.slotTime}</span>
                </div>

                {summary.nextPatient.chiefComplaint && (
                  <p className="text-xs text-blue-100 max-w-xl bg-white/5 p-2 rounded-xl border border-white/10">
                    <strong>Chief Complaint:</strong> {summary.nextPatient.chiefComplaint}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {summary.nextPatient.appointmentId ? (
                  <button
                    type="button"
                    id="btn-open-spotlight-dossier"
                    onClick={() => fetchPatientEncounter(summary.nextPatient.appointmentId)}
                    className="bg-white hover:bg-blue-50 text-blue-950 font-black text-xs px-5 py-3 rounded-2xl shadow-lg transition flex items-center gap-2"
                  >
                    <span>🩺</span> Open Patient Clinical Dossier
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => callNext()}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-black text-xs px-5 py-3 rounded-2xl shadow-lg transition"
                  >
                    Call Next Token
                  </button>
                )}
              </div>
            </div>
          )}

          {/* URGENT / CRITICAL PATIENT TRIAGE ALERT */}
          {summary?.urgentPatients && summary.urgentPatients.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🚨</span>
                  <h3 className="font-black text-rose-950 text-sm">
                    Acuity Alert: High Priority / Emergent Patients Waiting ({summary.urgentPatients.length})
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-rose-700 uppercase bg-rose-100 px-2.5 py-0.5 rounded-full">
                  Clinical Action Required
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {summary.urgentPatients.map((apt) => (
                  <div
                    key={apt._id}
                    className="bg-white rounded-2xl border border-rose-200 p-4 shadow-sm flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-black text-slate-900 text-sm">{apt.patientId?.name || 'Patient'}</span>
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-600 text-white animate-pulse">
                          {apt.priority}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">⏰ {apt.slotTime} • {apt.mode === 'video' ? '📹 Video' : '🏥 In-Person'}</p>
                      {apt.chiefComplaint && (
                        <p className="text-xs text-rose-900 font-medium bg-rose-50 p-2 rounded-lg mt-2 border border-rose-100">
                          {apt.chiefComplaint}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => fetchPatientEncounter(apt._id)}
                      className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2 rounded-xl transition"
                    >
                      Prioritize & Open Dossier
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PATIENT ENCOUNTER VIEW (When a patient is opened) */}
          {activeEncounterId && encounterData && (
            <div id="patient-encounter-dossier" className="bg-white rounded-3xl border-2 border-blue-500 p-6 sm:p-8 shadow-2xl space-y-6">
              {/* Dossier Header */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase">
                      Clinical Encounter Active
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      Encounter Date: {encounterData.appointment.date} at {encounterData.appointment.slotTime}
                    </span>
                  </div>
                  <h2 className="text-3xl font-black text-slate-900 mt-1">
                    {encounterData.patient.name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 mt-1">
                    <span>Age: <strong>{encounterData.patient.age}</strong></span>
                    <span>Gender: <strong className="capitalize">{encounterData.patient.gender}</strong></span>
                    <span>Blood Group: <strong className="text-rose-600">{encounterData.patient.bloodGroup}</strong></span>
                    <span>Phone: {encounterData.patient.phone}</span>
                    {encounterData.patient.allergies?.length > 0 && (
                      <span className="bg-rose-50 text-rose-700 px-2 py-0.5 rounded-md font-bold border border-rose-200">
                        ⚠️ Allergies: {encounterData.patient.allergies.join(', ')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveEncounterId(null);
                      setEncounterData(null);
                    }}
                    className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
                  >
                    ✕ Close Dossier
                  </button>
                </div>
              </div>

              {/* CONSENT STATUS BADGE (SECURITY CRITICAL) */}
              <div
                id="consent-status-banner"
                className={`rounded-2xl p-5 border transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  encounterData.consent.isAuthorized
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                    : 'bg-amber-50 border-amber-300 text-amber-950'
                }`}
              >
                <div className="flex items-start sm:items-center gap-3">
                  <span className="text-3xl">
                    {encounterData.consent.isAuthorized ? '🛡️' : '🔒'}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                          encounterData.consent.isAuthorized
                            ? 'bg-emerald-600 text-white border-emerald-700'
                            : 'bg-amber-600 text-white border-amber-700'
                        }`}
                      >
                        {encounterData.consent.status}
                      </span>
                      {encounterData.consent.scope && (
                        <span className="text-[11px] font-bold text-slate-600 bg-white/70 px-2 py-0.5 rounded-full">
                          Scope: {encounterData.consent.scope}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-medium mt-1 leading-relaxed">
                      {encounterData.consent.message}
                    </p>
                  </div>
                </div>

                {!encounterData.consent.isAuthorized && (
                  <div className="shrink-0 text-right">
                    <span className="text-[11px] font-bold text-amber-900 bg-amber-100 px-3 py-1.5 rounded-xl border border-amber-200 block">
                      Protected Data Shielded
                    </span>
                  </div>
                )}
              </div>

              {/* CURRENT ENCOUNTER STATUS & CHIEF COMPLAINT */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Encounter Reason & Chief Complaint</span>
                  <p className="text-sm font-semibold text-slate-900">
                    {encounterData.appointment.chiefComplaint}
                  </p>
                  <div className="flex items-center gap-3 pt-1 text-xs text-slate-600">
                    <span>Mode: <strong className="capitalize">{encounterData.appointment.mode}</strong></span>
                    <span>Priority: <strong className="capitalize">{encounterData.appointment.priority}</strong></span>
                    <span>Status: <strong className="capitalize text-blue-700">{encounterData.appointment.status}</strong></span>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Consultation State</span>
                  <div>
                    <span className={`text-sm font-black uppercase px-3 py-1 rounded-full ${
                      encounterData.appointment.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-800'
                        : encounterData.appointment.status === 'in-progress'
                        ? 'bg-blue-100 text-blue-800 animate-pulse'
                        : 'bg-indigo-100 text-indigo-800'
                    }`}>
                      {encounterData.appointment.status}
                    </span>
                  </div>
                  <ConsultationTimer
                    isActive={encounterData.appointment.status === 'in-progress'}
                    startTime={encounterData.appointment.token?.calledAt || new Date()}
                  />
                </div>
              </div>

              {/* CLINICAL ACTION BAR */}
              <div className="bg-slate-900 text-white rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
                <span className="text-xs font-bold text-slate-300">Clinician Encounter Actions:</span>
                <div className="flex flex-wrap items-center gap-2">
                  {encounterData.appointment.status === 'booked' && (
                    <button
                      type="button"
                      id="btn-start-consult"
                      onClick={() => handleStartConsultation(activeEncounterId)}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition"
                    >
                      ▶ Start Consultation
                    </button>
                  )}

                  {encounterData.appointment.status === 'checked-in' && (
                    <button
                      type="button"
                      id="btn-start-consult"
                      onClick={() => handleStartConsultation(activeEncounterId)}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-sm"
                    >
                      ▶ Start Consultation
                    </button>
                  )}

                  {encounterData.appointment.status === 'in-progress' && (
                    <button
                      type="button"
                      id="btn-complete-consult"
                      onClick={() => handleCompleteConsultation(activeEncounterId)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-sm"
                    >
                      ✓ Complete Consultation
                    </button>
                  )}

                  <button
                    type="button"
                    id="btn-issue-rx"
                    onClick={() => setRxModalOpen(true)}
                    className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5"
                  >
                    <span>💊</span> Issue Prescription
                  </button>

                  <button
                    type="button"
                    id="btn-order-test"
                    onClick={() => setTestModalOpen(true)}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5"
                  >
                    <span>🧪</span> Order Test
                  </button>

                  <button
                    type="button"
                    id="btn-issue-careplan"
                    onClick={() => setCarePlanModalOpen(true)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5"
                  >
                    <span>📋</span> Issue Care Plan
                  </button>

                  <button
                    type="button"
                    id="btn-add-history"
                    onClick={() => setHistoryModalOpen(true)}
                    className="bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5"
                  >
                    <span>🩺</span> Record History
                  </button>

                  {encounterData.appointment.mode === 'video' && (
                    <Link
                      to={`/telemedicine/${encounterData.appointment.id}?role=doctor`}
                      id="btn-video-consult"
                      className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5"
                    >
                      <span>📹</span> Video Consult
                    </Link>
                  )}
                </div>
              </div>

              {/* SHARED CLINICAL RECORDS (Only if AUTHORIZED) */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h3 className="text-base font-black text-slate-900">
                    Patient Clinical Dossier & Records
                  </h3>
                  <div className="flex items-center gap-2">
                    {['overview', 'history', 'tests', 'prescriptions', 'care_plans'].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setActiveClinicalSection(sec)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-xl capitalize transition ${
                          activeClinicalSection === sec
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {sec.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* LIMITED ACCESS FALLBACK SHIELD */}
                {!encounterData.consent.isAuthorized ? (
                  <div className="bg-amber-50/70 border-2 border-dashed border-amber-300 rounded-3xl p-8 text-center space-y-3">
                    <div className="text-4xl">🔐</div>
                    <h4 className="text-base font-black text-slate-800">
                      Medical Records Shielded — Patient Consent Not Granted
                    </h4>
                    <p className="text-xs text-slate-600 max-w-md mx-auto">
                      Under the MediQueue+ Patient Data Ownership architecture, patient health data is privately encrypted.
                      To inspect past medical conditions, diagnostic test results, and care plans, the patient must grant access from their Data &amp; Privacy dashboard.
                    </p>
                    <p className="text-[11px] font-bold text-amber-800">
                      You may still proceed with physical examination, prescription creation, and diagnostic ordering for this consultation.
                    </p>
                  </div>
                ) : (
                  <div>
                    {/* AUTHORIZED: Section Details */}
                    {activeClinicalSection === 'overview' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-2">
                          <span className="text-xs font-bold text-slate-700 uppercase">Recent Medical History</span>
                          {encounterData.sharedRecords.medicalHistory.length === 0 ? (
                            <p className="text-xs text-slate-400">No medical history on record</p>
                          ) : (
                            <div className="space-y-2">
                              {encounterData.sharedRecords.medicalHistory.slice(0, 3).map((h) => (
                                <div key={h._id || h.id} className="bg-white p-2.5 rounded-xl border border-slate-200 text-xs">
                                  <div className="flex justify-between font-bold text-slate-900">
                                    <span>{h.condition}</span>
                                    <span className="text-[10px] text-slate-500">{h.conditionDate}</span>
                                  </div>
                                  <div className="text-[10px] text-slate-500 mt-0.5">
                                    Source: <strong className="capitalize">{h.source?.replace(/_/g, ' ')}</strong>
                                    {h.doctorName && ` • Dr. ${h.doctorName}`}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-2">
                          <span className="text-xs font-bold text-slate-700 uppercase">Diagnostic Test Orders</span>
                          {encounterData.sharedRecords.testResults.length === 0 ? (
                            <p className="text-xs text-slate-400">No diagnostic tests on record</p>
                          ) : (
                            <div className="space-y-2">
                              {encounterData.sharedRecords.testResults.slice(0, 3).map((t) => (
                                <div key={t._id || t.id} className="bg-white p-2.5 rounded-xl border border-slate-200 text-xs">
                                  <div className="flex justify-between font-bold text-slate-900">
                                    <span>{t.testName}</span>
                                    <span className="text-purple-600 font-bold">{t.result}</span>
                                  </div>
                                  <div className="text-[10px] text-slate-500 mt-0.5">
                                    Status: <strong className="capitalize">{t.status}</strong> • Lab: {t.labName || 'Clinical Diagnostics'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {activeClinicalSection === 'history' && (
                      <HistoryTimeline
                        entries={encounterData.sharedRecords.medicalHistory}
                        isPatientView={false}
                        consentVerified={true}
                        loading={false}
                      />
                    )}

                    {activeClinicalSection === 'tests' && (
                      <TestRecordsTimeline
                        orders={encounterData.sharedRecords.testResults}
                        isPatientView={false}
                        doctorTokenId={doctorId}
                      />
                    )}

                    {activeClinicalSection === 'prescriptions' && (
                      <div className="space-y-3">
                        {encounterData.sharedRecords.prescriptions.length === 0 ? (
                          <div className="text-center py-8 text-slate-400 text-xs">No prescriptions on record</div>
                        ) : (
                          encounterData.sharedRecords.prescriptions.map((rx) => (
                            <div key={rx._id || rx.id} className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-2">
                              <div className="flex justify-between text-xs font-bold text-slate-800">
                                <span>Diagnosis: {rx.diagnosis || 'Clinical Prescription'}</span>
                                <span className="text-slate-500">{new Date(rx.startDate || rx.createdAt).toISOString().slice(0, 10)}</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                {(rx.medications || []).map((m, idx) => (
                                  <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 text-xs space-y-1">
                                    <div className="font-black text-slate-900">{m.medicineName} ({m.dosage})</div>
                                    <div className="text-slate-500">{m.frequency} • {m.mealRelation?.replace(/_/g, ' ')} • {m.durationDays} days</div>
                                    {m.instructions && <div className="text-slate-400 text-[11px] italic">{m.instructions}</div>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {activeClinicalSection === 'care_plans' && (
                      <div className="space-y-4">
                        {encounterData.sharedRecords.carePlans.length === 0 ? (
                          <div className="text-center py-8 text-slate-400 text-xs">No active care plans on record</div>
                        ) : (
                          encounterData.sharedRecords.carePlans.map((plan) => (
                            <CarePlanCard key={plan._id || plan.id} plan={plan} isPatientView={false} />
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TODAY'S APPOINTMENTS TABLE */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">Today's Appointment Schedule</h3>
                <p className="text-xs text-slate-500">Live synchronization with hospital reception & token engine</p>
              </div>

              {/* Schedule Filter Tabs */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'all', label: 'All Visits' },
                  { id: 'video', label: '📹 Video' },
                  { id: 'checked-in', label: 'Checked In' },
                  { id: 'in-progress', label: 'In Progress' },
                  { id: 'completed', label: 'Completed' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setScheduleFilter(tab.id)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition ${
                      scheduleFilter === tab.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {summaryLoading && (
              <div className="text-center py-12 text-slate-400 text-xs font-medium">
                Loading clinical appointments...
              </div>
            )}

            {!summaryLoading && filteredAppointments.length === 0 && (
              <div className="text-center py-12 text-slate-400 text-xs font-medium border-2 border-dashed border-slate-200 rounded-2xl">
                No appointments found matching "{scheduleFilter}".
              </div>
            )}

            {!summaryLoading && filteredAppointments.length > 0 && (
              <div className="space-y-3">
                {filteredAppointments.map((apt) => (
                  <div
                    key={apt._id}
                    className="bg-slate-50/70 hover:bg-slate-50 border border-slate-200 rounded-2xl p-4 transition flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-black text-slate-900 text-xs bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                          ⏰ {apt.slotTime}
                        </span>
                        <h4 className="font-bold text-slate-900 text-sm">
                          {apt.patientId?.name || 'Walk-in Patient'}
                        </h4>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            ['critical', 'emergency'].includes(apt.priority)
                              ? 'bg-rose-100 text-rose-800'
                              : ['urgent', 'senior'].includes(apt.priority)
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {apt.priority}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                            apt.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : apt.status === 'in-progress'
                              ? 'bg-blue-100 text-blue-800 animate-pulse'
                              : apt.status === 'checked-in'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {apt.status}
                        </span>
                        <span className="text-xs text-slate-500 font-medium">
                          {apt.mode === 'video' ? '📹 Video' : '🏥 In-Person'}
                        </span>
                      </div>

                      {apt.chiefComplaint && (
                        <p className="text-xs text-slate-600 bg-white p-2 rounded-xl border border-slate-150 mt-1 max-w-2xl">
                          <strong className="text-slate-800">Complaint:</strong> {apt.chiefComplaint}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        id={`btn-open-dossier-${apt._id}`}
                        onClick={() => fetchPatientEncounter(apt._id)}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition shadow-sm"
                      >
                        🩺 Open Patient Dossier
                      </button>

                      {apt.status === 'booked' && (
                        <button
                          type="button"
                          onClick={() => handleStartConsultation(apt._id)}
                          className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs px-3 py-2 rounded-xl transition"
                        >
                          Check In & Start
                        </button>
                      )}

                      {apt.status === 'in-progress' && (
                        <button
                          type="button"
                          onClick={() => handleCompleteConsultation(apt._id)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-2 rounded-xl transition"
                        >
                          ✓ Complete Visit
                        </button>
                      )}

                      {apt.mode === 'video' && (
                        <Link
                          to={`/telemedicine/${apt._id}?role=doctor`}
                          className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 font-bold text-xs px-3 py-2 rounded-xl transition flex items-center gap-1"
                        >
                          <span>📹</span> Call
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* WORKSPACE VIEW: OPD QUEUE ENGINE (Enhanced Existing Doctor Panel) */}
      {activeWorkspaceTab === 'queue' && (
        <div className="space-y-6">
          {/* Clinical Decision Support (CDS) Advisory Banner */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-3xl p-5 text-xs text-indigo-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🛡️</span>
              <div>
                <strong className="font-bold text-sm">Clinical Decision Support (CDS) Active:</strong> Queue priorities are dynamically proposed to expedite emergent cases.
                <span className="text-indigo-800 ml-1 block sm:inline">Attending physician holds sole clinical authority to override priority acuity.</span>
              </div>
            </div>
            <span className="text-[11px] font-bold bg-indigo-100 text-indigo-800 px-3 py-1.5 rounded-full border border-indigo-200 shrink-0">
              Physician Override Active
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatsCard icon="Q" label="Waiting Queue" value={waitingQueue.length} color="sky" />
            <StatsCard icon="P" label="In Progress" value={currentToken ? 1 : 0} color="emerald" />
            <StatsCard icon="H" label="Handled" value={session?.tokensHandled ?? '--'} color="purple" />
            <StatsCard
              icon="A"
              label="Avg Consult"
              value={stats?.avgConsultTime !== undefined ? `${stats.avgConsultTime}m` : '--'}
              color="amber"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Now Serving Card */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/40">
              <h2 className="text-xl font-black text-slate-900">Now Serving</h2>
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
                <p className="text-5xl font-black text-slate-900">
                  {currentToken ? `A${String(currentToken.tokenNumber).padStart(3, '0')}` : '--'}
                </p>
                <p className="mt-2 text-sm text-slate-700 font-bold">{currentToken?.patientName || 'No active patient'}</p>
                {currentToken?.priority ? (
                  <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                    ['critical', 'emergency'].includes(currentToken.priority)
                      ? 'bg-rose-600 text-white animate-pulse'
                      : ['urgent', 'senior'].includes(currentToken.priority)
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-900 text-white'
                  }`}>
                    {currentToken.priority}
                  </span>
                ) : null}
              </div>

              <ConsultationTimer
                isActive={Boolean(currentToken)}
                startTime={currentToken?.calledAt}
                onComplete={currentToken ? () => completeToken(currentToken.tokenNumber) : undefined}
              />

              <button
                type="button"
                onClick={() => callNext()}
                disabled={queueLoading || waitingQueue.length === 0}
                className="btn-primary mt-4 w-full py-4 text-base font-bold disabled:opacity-50"
              >
                {queueLoading ? 'Processing...' : waitingQueue.length === 0 ? 'No waiting patients' : 'Call Next Patient'}
              </button>
            </div>

            {/* Waiting Queue List */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/40">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black text-slate-900">Waiting OPD Queue</h2>
                <span className="text-xs text-slate-500 font-medium">Sorted by Acuity Policy</span>
              </div>
              <div className="mt-4">
                <QueueList queue={waitingQueue} onOverride={handleOpenOverride} isDoctorView={true} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Issue Digital Prescription */}
      {rxModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <span>💊</span> Issue Digital Prescription
                </h3>
                <p className="text-xs text-slate-500">
                  Patient: <strong>{encounterData?.patient.name}</strong> • Generates reminder schedules automatically
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRxModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePrescriptionSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Diagnosis / Indication *</label>
                <input
                  type="text"
                  required
                  value={rxDiagnosis}
                  onChange={(e) => setRxDiagnosis(e.target.value)}
                  placeholder="e.g. Essential Hypertension, Acute Bronchitis"
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-purple-400"
                />
              </div>

              {/* Medication Items */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase">Medications</span>
                  <button
                    type="button"
                    onClick={() =>
                      setRxMedications((prev) => [
                        ...prev,
                        {
                          medicineName: '',
                          dosage: '500mg',
                          frequency: 'Once daily',
                          doseTimes: ['09:00'],
                          mealRelation: 'after_meal',
                          durationDays: 7,
                          instructions: '',
                        },
                      ])
                    }
                    className="text-[11px] font-bold text-purple-600 hover:text-purple-800"
                  >
                    + Add Medication
                  </button>
                </div>

                {rxMedications.map((med, i) => (
                  <div key={i} className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 space-y-2 text-xs">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block font-semibold text-slate-600 mb-1">Medicine Name *</label>
                        <input
                          type="text"
                          required
                          value={med.medicineName}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRxMedications((prev) => prev.map((m, idx) => (idx === i ? { ...m, medicineName: val } : m)));
                          }}
                          placeholder="e.g. Amlodipine"
                          className="w-full rounded-lg border border-slate-300 p-1.5 text-xs bg-white"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">Dosage *</label>
                        <input
                          type="text"
                          required
                          value={med.dosage}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRxMedications((prev) => prev.map((m, idx) => (idx === i ? { ...m, dosage: val } : m)));
                          }}
                          placeholder="e.g. 5mg"
                          className="w-full rounded-lg border border-slate-300 p-1.5 text-xs bg-white"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">Meal Relation</label>
                        <select
                          value={med.mealRelation}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRxMedications((prev) => prev.map((m, idx) => (idx === i ? { ...m, mealRelation: val } : m)));
                          }}
                          className="w-full rounded-lg border border-slate-300 p-1.5 text-xs bg-white"
                        >
                          <option value="after_meal">After Meal</option>
                          <option value="before_meal">Before Meal</option>
                          <option value="with_meal">With Meal</option>
                          <option value="anytime">Anytime</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">Frequency</label>
                        <input
                          type="text"
                          value={med.frequency}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRxMedications((prev) => prev.map((m, idx) => (idx === i ? { ...m, frequency: val } : m)));
                          }}
                          placeholder="e.g. Twice daily"
                          className="w-full rounded-lg border border-slate-300 p-1.5 text-xs bg-white"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">Duration (Days)</label>
                        <input
                          type="number"
                          min="1"
                          max="90"
                          value={med.durationDays}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setRxMedications((prev) => prev.map((m, idx) => (idx === i ? { ...m, durationDays: val } : m)));
                          }}
                          className="w-full rounded-lg border border-slate-300 p-1.5 text-xs bg-white"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Special Instructions</label>
                <textarea
                  rows={2}
                  value={rxInstructions}
                  onChange={(e) => setRxInstructions(e.target.value)}
                  placeholder="e.g. Take with full glass of water. Report any swelling or dizziness."
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-purple-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRxModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRx}
                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-5 py-2 rounded-xl transition disabled:opacity-50"
                >
                  {submittingRx ? 'Issuing...' : 'Issue Prescription'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Order Diagnostic Lab Test */}
      {testModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <span>🧪</span> Order Diagnostic Test
                </h3>
                <p className="text-xs text-slate-500">
                  Patient: <strong>{encounterData?.patient.name}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTestModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleOrderTestSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Common Tests Quick Select</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Complete Blood Count (CBC)',
                    'Comprehensive Lipid Profile',
                    'Fasting Blood Sugar & HbA1c',
                    'Kidney Panel (KFT)',
                    'Liver Panel (LFT)',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setTestOrderForm((f) => ({ ...f, testName: preset }))}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition ${
                        testOrderForm.testName === preset
                          ? 'bg-cyan-600 text-white border-cyan-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-cyan-50'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Test Name *</label>
                <input
                  type="text"
                  required
                  value={testOrderForm.testName}
                  onChange={(e) => setTestOrderForm({ ...testOrderForm, testName: e.target.value })}
                  placeholder="e.g. Complete Blood Count (CBC)"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Clinical Indication / Reason *</label>
                <textarea
                  rows={3}
                  required
                  value={testOrderForm.reason}
                  onChange={(e) => setTestOrderForm({ ...testOrderForm, reason: e.target.value })}
                  placeholder="e.g. Evaluate dyspnea, check hemoglobin and platelet count"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-cyan-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setTestModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingTest}
                  className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition disabled:opacity-50"
                >
                  {submittingTest ? 'Ordering...' : 'Confirm Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Issue Care Plan */}
      {carePlanModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <span>📋</span> Issue Doctor Care Plan
                </h3>
                <p className="text-xs text-slate-500">
                  Patient: <strong>{encounterData?.patient.name}</strong> • Structured Guidance
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCarePlanModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCarePlanSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Diagnosis / Clinical Context *</label>
                <input
                  type="text"
                  required
                  value={carePlanForm.diagnosis}
                  onChange={(e) => setCarePlanForm({ ...carePlanForm, diagnosis: e.target.value })}
                  placeholder="e.g. Essential Hypertension"
                  className="w-full rounded-xl border border-slate-300 p-2 focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              {/* DO Guidance */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 space-y-2">
                <span className="font-bold text-emerald-900 uppercase flex items-center gap-1">
                  <span className="bg-emerald-600 text-white px-1.5 py-0.5 rounded text-[10px]">DO</span> Recommended Guidance
                </span>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Diet Recommended</label>
                  <textarea
                    rows={2}
                    value={carePlanForm.dietRecommended}
                    onChange={(e) => setCarePlanForm({ ...carePlanForm, dietRecommended: e.target.value })}
                    placeholder="e.g. DASH diet, leafy greens, 2.5L daily hydration"
                    className="w-full rounded-xl border border-slate-300 p-2 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Activities Recommended</label>
                  <textarea
                    rows={2}
                    value={carePlanForm.activitiesRecommended}
                    onChange={(e) => setCarePlanForm({ ...carePlanForm, activitiesRecommended: e.target.value })}
                    placeholder="e.g. 30 minutes brisk walking 5 days/week"
                    className="w-full rounded-xl border border-slate-300 p-2 bg-white"
                  />
                </div>
              </div>

              {/* AVOID Guidance */}
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 space-y-2">
                <span className="font-bold text-rose-900 uppercase flex items-center gap-1">
                  <span className="bg-rose-600 text-white px-1.5 py-0.5 rounded text-[10px]">AVOID</span> Restrictions
                </span>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Diet Restricted</label>
                  <textarea
                    rows={2}
                    value={carePlanForm.dietRestricted}
                    onChange={(e) => setCarePlanForm({ ...carePlanForm, dietRestricted: e.target.value })}
                    placeholder="e.g. High-sodium foods (>2g/day), deep-fried trans-fats"
                    className="w-full rounded-xl border border-slate-300 p-2 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Activities Restricted</label>
                  <textarea
                    rows={2}
                    value={carePlanForm.activitiesRestricted}
                    onChange={(e) => setCarePlanForm({ ...carePlanForm, activitiesRestricted: e.target.value })}
                    placeholder="e.g. Heavy lifting, high-strain cardiovascular overload"
                    className="w-full rounded-xl border border-slate-300 p-2 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Follow-up Date</label>
                <input
                  type="date"
                  value={carePlanForm.followUpDate}
                  onChange={(e) => setCarePlanForm({ ...carePlanForm, followUpDate: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCarePlanModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCarePlan}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2 rounded-xl transition disabled:opacity-50"
                >
                  {submittingCarePlan ? 'Issuing...' : 'Issue Care Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Doctor-Verified History Entry */}
      {historyModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <span>🩺</span> Record Doctor-Verified Condition
                </h3>
                <p className="text-xs text-slate-500">
                  Patient: <strong>{encounterData?.patient.name}</strong> • Immutable Clinical Attribution
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleVerifiedHistorySubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Diagnosed Condition *</label>
                <input
                  type="text"
                  required
                  value={historyForm.condition}
                  onChange={(e) => setHistoryForm({ ...historyForm, condition: e.target.value })}
                  placeholder="e.g. Coronary Artery Disease"
                  className="w-full rounded-xl border border-slate-300 p-2 focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Diagnosis Date</label>
                <input
                  type="date"
                  value={historyForm.conditionDate}
                  onChange={(e) => setHistoryForm({ ...historyForm, conditionDate: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Clinical Notes & Observations</label>
                <textarea
                  rows={3}
                  value={historyForm.notes}
                  onChange={(e) => setHistoryForm({ ...historyForm, notes: e.target.value })}
                  placeholder="Document clinical exam findings and treatment considerations."
                  className="w-full rounded-xl border border-slate-300 p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setHistoryModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingHistory}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition disabled:opacity-50"
                >
                  {submittingHistory ? 'Recording...' : 'Record Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Clinical Priority Override (From Queue Engine) */}
      {overrideToken && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-slate-900 text-lg">Clinical Priority Override</h3>
                <p className="text-xs text-slate-500">Authorized Physician Action</p>
              </div>
              <button
                onClick={() => setOverrideToken(null)}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs space-y-1.5">
              <div>
                <strong className="text-slate-700">Patient:</strong> {overrideToken.patientName} (Token #{overrideToken.tokenNumber})
              </div>
              <div>
                <strong className="text-slate-700">Chief Complaint:</strong> {overrideToken.condition || 'None specified'}
              </div>
              <div>
                <strong className="text-slate-700">Current Priority:</strong>{' '}
                <span className="capitalize font-bold text-slate-900">{overrideToken.priority}</span>
              </div>
            </div>

            <form onSubmit={handleSubmitOverride} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-2">
                  Select New Priority
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'critical', label: 'CRITICAL', color: 'border-rose-500 bg-rose-50 text-rose-800' },
                    { id: 'urgent', label: 'URGENT', color: 'border-amber-500 bg-amber-50 text-amber-800' },
                    { id: 'routine', label: 'ROUTINE', color: 'border-sky-500 bg-sky-50 text-sky-800' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setOverridePriorityVal(p.id)}
                      className={`py-2 px-2 text-xs font-black rounded-xl border-2 transition text-center ${
                        overridePriorityVal === p.id
                          ? `${p.color} ring-2 ring-offset-1 ring-slate-400`
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                  Clinical Override Reason (Required for Audit Trail)
                </label>
                <textarea
                  required
                  rows={3}
                  value={overrideReasonText}
                  onChange={(e) => setOverrideReasonText(e.target.value)}
                  placeholder="e.g. Physical exam shows acute distress / SpO2 dropping"
                  className="w-full text-xs rounded-xl border border-slate-300 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {overrideFeedback && (
                <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold text-center">
                  ✓ {overrideFeedback}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOverrideToken(null)}
                  className="btn-outline py-2.5 px-4 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={overrideLoading}
                  className="btn-primary py-2.5 px-5 text-xs font-bold shadow-md disabled:opacity-50"
                >
                  {overrideLoading ? 'Applying...' : 'Confirm Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
