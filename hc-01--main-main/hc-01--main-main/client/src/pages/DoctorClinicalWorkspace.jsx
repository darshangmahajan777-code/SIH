import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import QueueList from '../components/QueueList';
import ConsultationTimer from '../components/ConsultationTimer';
import StatsCard from '../components/StatsCard';
import { useQueue } from '../context/QueueContext';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';

const DEFAULT_DOCTOR_ID = '65f000000000000000000002';

export default function DoctorClinicalWorkspace({ initialDoctorId = DEFAULT_DOCTOR_ID }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlAppointmentId = searchParams.get('appointmentId');
  const urlTab = searchParams.get('tab');

  const { user, role, isAuthenticated, loginWithRole } = useAuth();
  const [doctorId, setDoctorId] = useState(user?._id || user?.id || initialDoctorId);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState('clinical'); // 'clinical' | 'queue'
  const [scheduleFilter, setScheduleFilter] = useState('all'); // 'all' | 'video' | 'checked-in' | 'in-progress' | 'completed'

  // Queue context from existing OPD engine
  const { queue, callNext, completeToken, currentToken, stats, loading: queueLoading, connected } = useQueue();

  // Doctor session state
  const [session, setSession] = useState(null);
  const [sessionDoctorName, setSessionDoctorName] = useState(user?.name || 'Dr. Sarah Patel');
  const [sessionError, setSessionError] = useState('');

  // Workspace summary state
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(null);

  // Patient Encounter Dossier state (Longitudinal Patient Record)
  const [activeEncounterId, setActiveEncounterId] = useState(urlAppointmentId || null);
  const [encounterData, setEncounterData] = useState(null);
  const [encounterLoading, setEncounterLoading] = useState(false);
  const [encounterError, setEncounterError] = useState(null);
  const [activeClinicalSection, setActiveClinicalSection] = useState(urlTab || 'overview');
  // Sections: 'overview' | 'current_visit' | 'medical_history' | 'previous_visits' | 'prescriptions' | 'tests' | 'care_plan' | 'timeline'

  // Current Visit Editable State
  const [currentVisitForm, setCurrentVisitForm] = useState({
    chiefComplaint: '',
    symptoms: '',
    duration: '',
    bp: '',
    heartRate: '',
    temperature: '',
    spO2: '',
    respiratoryRate: '',
    currentObservations: '',
    clinicalNotes: '',
    diagnosis: '',
    treatment: '',
  });
  const [savingCurrentVisit, setSavingCurrentVisit] = useState(false);

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
  const [historyForm, setHistoryForm] = useState({
    condition: '',
    conditionDate: new Date().toISOString().slice(0, 10),
    category: 'diagnosis',
    notes: '',
  });
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

  // Sync doctorId if user logs in
  useEffect(() => {
    if (user?._id || user?.id) {
      setDoctorId(user._id || user.id);
      if (user.name) setSessionDoctorName(user.name);
    }
  }, [user]);

  // Security guard check
  const isExplicitlyForbidden = isAuthenticated && (role === 'reception' || role === 'patient');

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
      const token = localStorage.getItem('mediqueue_auth_token');
      const res = await fetch(`/api/doctor/workspace-summary?doctorId=${doctorId}`, {
        headers: {
          'x-doctor-id': doctorId,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const json = await res.json();
      if (json.success) {
        setSummary(json.data);
      } else {
        setSummaryError(json.error || 'Failed to load doctor workspace summary');
      }
    } catch {
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
      const token = localStorage.getItem('mediqueue_auth_token');
      const res = await fetch(`/api/doctor/encounter/${appointmentId}?doctorId=${doctorId}`, {
        headers: {
          'x-doctor-id': doctorId,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const json = await res.json();
      if (json.success) {
        const data = json.data;
        setEncounterData(data);
        setActiveEncounterId(appointmentId);

        // Populate Current Visit Form
        const cv = data.currentVisit || {};
        setCurrentVisitForm({
          chiefComplaint: cv.chiefComplaint || data.appointment?.chiefComplaint || '',
          symptoms: Array.isArray(cv.symptoms) ? cv.symptoms.join(', ') : (cv.symptoms || ''),
          duration: cv.duration || '',
          bp: cv.vitals?.bp || '',
          heartRate: cv.vitals?.heartRate !== undefined && cv.vitals?.heartRate !== null ? String(cv.vitals.heartRate) : '',
          temperature: cv.vitals?.temperature || '',
          spO2: cv.vitals?.spO2 || '',
          respiratoryRate: cv.vitals?.respiratoryRate !== undefined && cv.vitals?.respiratoryRate !== null ? String(cv.vitals.respiratoryRate) : '',
          currentObservations: cv.currentObservations || '',
          clinicalNotes: cv.doctorNotes || cv.clinicalNotes || data.appointment?.clinicalNotes || '',
          diagnosis: cv.diagnosis || data.appointment?.diagnosis || '',
          treatment: cv.treatment || data.appointment?.treatment || '',
        });

        // Pre-fill diagnosis from chief complaint
        setRxDiagnosis(cv.diagnosis || data.appointment?.chiefComplaint || '');
        setCarePlanForm((prev) => ({
          ...prev,
          diagnosis: cv.diagnosis || data.appointment?.chiefComplaint || 'Clinical Consultation',
          followUpDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        }));
        setHistoryForm((prev) => ({
          ...prev,
          condition: cv.diagnosis || data.appointment?.chiefComplaint || '',
          conditionDate: new Date().toISOString().slice(0, 10),
        }));
      } else {
        setEncounterError(json.error || 'Failed to load patient encounter');
      }
    } catch {
      setEncounterError('Network error opening patient encounter');
    } finally {
      setEncounterLoading(false);
    }
  }, [doctorId]);

  useEffect(() => {
    refetchSession();
    fetchWorkspaceSummary();
  }, [refetchSession, fetchWorkspaceSummary]);

  // Handle URL search params on mount
  useEffect(() => {
    if (urlAppointmentId) {
      fetchPatientEncounter(urlAppointmentId);
    }
    if (urlTab) {
      setActiveClinicalSection(urlTab);
    }
  }, [urlAppointmentId, urlTab, fetchPatientEncounter]);

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

  // Encounter Actions: Start Consultation
  const handleStartConsultation = async (appointmentId) => {
    try {
      const token = localStorage.getItem('mediqueue_auth_token');
      const res = await fetch(`/api/doctor/encounter/${appointmentId}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-doctor-id': doctorId,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
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

  // Encounter Actions: Complete Consultation
  const handleCompleteConsultation = async (appointmentId) => {
    try {
      const token = localStorage.getItem('mediqueue_auth_token');
      const res = await fetch(`/api/doctor/encounter/${appointmentId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-doctor-id': doctorId,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          doctorId,
          diagnosis: currentVisitForm.diagnosis || encounterData?.appointment?.chiefComplaint || rxDiagnosis || 'Clinical Consultation',
          notes: currentVisitForm.clinicalNotes || 'Consultation successfully completed by attending clinician',
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

  // Encounter Actions: Save Current Visit Vitals & Notes
  const handleSaveCurrentVisit = async (e) => {
    e?.preventDefault();
    if (!activeEncounterId) return;
    setSavingCurrentVisit(true);
    try {
      const symptomsArr = currentVisitForm.symptoms
        ? currentVisitForm.symptoms.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      await api.updateEncounterCurrentVisit(activeEncounterId, {
        doctorId,
        chiefComplaint: currentVisitForm.chiefComplaint,
        symptoms: symptomsArr,
        duration: currentVisitForm.duration,
        vitals: {
          bp: currentVisitForm.bp,
          heartRate: currentVisitForm.heartRate ? Number(currentVisitForm.heartRate) : null,
          temperature: currentVisitForm.temperature,
          spO2: currentVisitForm.spO2,
          respiratoryRate: currentVisitForm.respiratoryRate ? Number(currentVisitForm.respiratoryRate) : null,
        },
        currentObservations: currentVisitForm.currentObservations,
        clinicalNotes: currentVisitForm.clinicalNotes,
        diagnosis: currentVisitForm.diagnosis,
        treatment: currentVisitForm.treatment,
      });

      showToast('✓ Current visit vitals and clinical observations saved.');
      fetchPatientEncounter(activeEncounterId);
    } catch (err) {
      showToast(err.message || 'Failed to update current visit', 'error');
    } finally {
      setSavingCurrentVisit(false);
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
      const token = localStorage.getItem('mediqueue_auth_token');
      const res = await fetch(`/api/doctor/encounter/${activeEncounterId}/prescription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-doctor-id': doctorId,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          patientId,
          doctorId,
          doctorName: summary?.doctor?.doctorName || sessionDoctorName,
          diagnosis: rxDiagnosis || currentVisitForm.diagnosis || encounterData.appointment.chiefComplaint,
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
      const token = localStorage.getItem('mediqueue_auth_token');
      const res = await fetch(`/api/doctor/encounter/${activeEncounterId}/order-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-doctor-id': doctorId,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
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
      const token = localStorage.getItem('mediqueue_auth_token');
      const res = await fetch(`/api/doctor/encounter/${activeEncounterId}/care-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-doctor-id': doctorId,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
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
        showToast('Doctor care plan established successfully.');
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
      const token = localStorage.getItem('mediqueue_auth_token');
      const res = await fetch(`/api/doctor/encounter/${activeEncounterId}/verified-history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-doctor-id': doctorId,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          patientId,
          doctorId,
          doctorName: summary?.doctor?.doctorName || sessionDoctorName,
          condition: historyForm.condition.trim(),
          conditionDate: historyForm.conditionDate || new Date().toISOString().slice(0, 10),
          category: historyForm.category || 'diagnosis',
          notes: historyForm.notes.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast('Medical history record added.');
        setHistoryModalOpen(false);
        fetchPatientEncounter(activeEncounterId);
      } else {
        showToast(json.error || 'Failed to record history', 'error');
      }
    } catch {
      showToast('Network error recording history', 'error');
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

  // Request Patient Consent Trigger
  const handleRequestConsent = async () => {
    if (!activeEncounterId) return;
    try {
      await api.requestEncounterConsent(activeEncounterId, { doctorId });
      showToast('Consent request dispatched to patient.');
      fetchPatientEncounter(activeEncounterId);
    } catch (err) {
      showToast(err.message || 'Failed to send consent request', 'error');
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

  // ── STRICT SECURITY GUARD: BLOCK RECEPTION AND PATIENTS ──
  if (isExplicitlyForbidden) {
    return (
      <div className="max-w-3xl mx-auto my-16 p-8 bg-white border border-rose-200 rounded-3xl shadow-xl text-center space-y-6">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-rose-50 border border-rose-200 flex items-center justify-center text-4xl shadow-inner">
          🔒
        </div>
        <div className="space-y-2">
          <span className="text-[11px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 px-3 py-1 rounded-full border border-rose-300">
            403 Forbidden • Doctor-Only Clinical Zone
          </span>
          <h2 className="text-2xl font-black text-slate-900">
            Doctor Clinical Workspace Access Restricted
          </h2>
          <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
            This workspace provides unrestricted access to confidential longitudinal patient medical records, active diagnoses, clinical vitals, and surgical histories. Reception staff and standard patient accounts are strictly prevented from accessing this clinical portal under hospital privacy policy.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            onClick={() => loginWithRole('doctor')}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-2xl shadow-md transition"
          >
            Switch to Doctor Session (Demo)
          </button>
          <Link
            to="/"
            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-2xl border border-slate-200 transition"
          >
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

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
              {summary?.doctor?.specialty || 'General Medicine'} • {summary?.doctor?.hospitalName || 'Apex Heart & Multispecialty Hospital'}
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
            to="/doctor/dashboard"
            className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition"
          >
            📊 Doctor Dashboard
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

      {/* WORKSPACE VIEW: CLINICAL (Doctor Home & Longitudinal Patient Encounter) */}
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
              <span className="text-[11px] font-bold text-emerald-700 block uppercase">Care Plans</span>
              <span className="text-2xl font-black text-emerald-700 mt-0.5 block">
                {summary?.stats?.activeCarePlansCount ?? 0}
              </span>
              <span className="text-[10px] text-emerald-600 font-medium">Active Monitoring</span>
            </div>
          </div>

          {/* ACTIVE PATIENT ENCOUNTER DOSSIER (LONGITUDINAL PATIENT RECORD) */}
          {activeEncounterId && encounterLoading && (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm space-y-3">
              <div className="inline-block animate-spin text-3xl">🩺</div>
              <p className="text-sm font-bold text-slate-700">Loading complete longitudinal patient record...</p>
              <p className="text-xs text-slate-400">Synthesizing past visits, vitals, medical history, prescriptions, and lab tests</p>
            </div>
          )}

          {activeEncounterId && encounterError && (
            <div className="bg-rose-50 border border-rose-200 rounded-3xl p-6 text-center space-y-3">
              <span className="text-2xl">⚠️</span>
              <h3 className="text-sm font-bold text-rose-900">{encounterError}</h3>
              <button
                type="button"
                onClick={() => setActiveEncounterId(null)}
                className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold"
              >
                Close Encounter View
              </button>
            </div>
          )}

          {activeEncounterId && !encounterLoading && encounterData && (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-md space-y-6 animate-fade-in">
              {/* PATIENT BANNER (Demographics, ABHA ID, Blood Group, Allergies, BMI) */}
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-500 text-white flex items-center justify-center font-black text-2xl shadow-inner shrink-0">
                    {encounterData.patient.name ? encounterData.patient.name.charAt(0).toUpperCase() : 'P'}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-black text-white">{encounterData.patient.name}</h2>
                      <span className="text-[11px] font-black uppercase tracking-wider bg-white/20 text-white px-2.5 py-0.5 rounded-full backdrop-blur-sm border border-white/20">
                        ID: {encounterData.patient.id || encounterData.patientOverview?.patientId || 'ABHA-PAT-901'}
                      </span>
                      {encounterData.patient.bloodGroup && (
                        <span className="text-[11px] font-black uppercase tracking-wider bg-rose-500/80 text-white px-2.5 py-0.5 rounded-full">
                          🩸 {encounterData.patient.bloodGroup}
                        </span>
                      )}
                      {encounterData.patient.bmi && (
                        <span className={`text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                          encounterData.patient.bmiCategory === 'Normal'
                            ? 'bg-emerald-500/80 text-white'
                            : 'bg-amber-500/80 text-white'
                        }`}>
                          BMI: {encounterData.patient.bmi} ({encounterData.patient.bmiCategory})
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
                      <span>Age: <strong className="text-white">{encounterData.patient.age || 'N/A'}</strong></span>
                      <span>Gender: <strong className="text-white capitalize">{encounterData.patient.gender || 'Not specified'}</strong></span>
                      <span>Phone: <strong className="text-white">{encounterData.patient.phone || 'N/A'}</strong></span>
                      {encounterData.patient.emergencyContact && (
                        <span>Emergency: <strong className="text-white">{encounterData.patient.emergencyContact}</strong></span>
                      )}
                    </div>

                    {/* Prominent Allergies Alert Badge */}
                    {encounterData.patient.allergies && encounterData.patient.allergies.length > 0 ? (
                      <div className="inline-flex items-center gap-1.5 bg-rose-500/90 text-white px-3 py-1 rounded-xl text-xs font-black shadow-sm mt-1">
                        <span>⚠️ ALLERGIES:</span>
                        <span>{encounterData.patient.allergies.join(', ')}</span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 px-3 py-0.5 rounded-xl text-xs font-semibold mt-1">
                        <span>✓ No Known Drug Allergies (NKDA)</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Encounter Quick Controls & Close */}
                <div className="flex flex-col items-end gap-2.5 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-black uppercase px-3 py-1 rounded-full ${
                      encounterData.appointment.status === 'completed'
                        ? 'bg-emerald-500 text-white'
                        : encounterData.appointment.status === 'in-progress'
                        ? 'bg-blue-500 text-white animate-pulse'
                        : 'bg-indigo-500 text-white'
                    }`}>
                      {encounterData.appointment.status}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveEncounterId(null)}
                      className="text-xs text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1 rounded-xl transition"
                    >
                      ✕ Close Dossier
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {['booked', 'checked-in'].includes(encounterData.appointment.status) && (
                      <button
                        type="button"
                        id="btn-start-consult"
                        onClick={() => handleStartConsultation(activeEncounterId)}
                        className="bg-blue-500 hover:bg-blue-400 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-sm"
                      >
                        ▶ Start Consultation
                      </button>
                    )}

                    {encounterData.appointment.status === 'in-progress' && (
                      <button
                        type="button"
                        id="btn-complete-consult"
                        onClick={() => handleCompleteConsultation(activeEncounterId)}
                        className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-sm"
                      >
                        ✓ Complete Consultation
                      </button>
                    )}

                    {encounterData.appointment.mode === 'video' && (
                      <Link
                        to={`/telemedicine/${encounterData.appointment.id}?role=doctor`}
                        id="btn-video-consult"
                        className="bg-teal-500 hover:bg-teal-400 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5"
                      >
                        <span>📹</span> Video Consult
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              {/* ACTION TOOLBAR: QUICK MODAL TRIGGERS */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <span>⚡ Quick Clinical Interventions:</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    id="btn-issue-rx"
                    onClick={() => setRxModalOpen(true)}
                    className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-sm"
                  >
                    <span>💊</span> Issue Prescription
                  </button>

                  <button
                    type="button"
                    id="btn-order-test"
                    onClick={() => setTestModalOpen(true)}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-sm"
                  >
                    <span>🧪</span> Order Lab Test
                  </button>

                  <button
                    type="button"
                    id="btn-issue-careplan"
                    onClick={() => setCarePlanModalOpen(true)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-sm"
                  >
                    <span>📋</span> Establish Care Plan
                  </button>

                  <button
                    type="button"
                    id="btn-add-history"
                    onClick={() => setHistoryModalOpen(true)}
                    className="bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-sm"
                  >
                    <span>🩺</span> Record History
                  </button>

                  {!encounterData.consent.isAuthorized && (
                    <button
                      type="button"
                      onClick={handleRequestConsent}
                      className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-sm"
                    >
                      <span>🔐</span> Request Patient Consent
                    </button>
                  )}
                </div>
              </div>

              {/* 8 DEDICATED LONGITUDINAL RECORD TABS */}
              <div className="space-y-4">
                <div className="flex items-center gap-1 overflow-x-auto pb-2 border-b border-slate-200 scrollbar-none">
                  {[
                    { id: 'overview', label: '👤 Patient Overview' },
                    { id: 'current_visit', label: '🩺 Current Visit' },
                    { id: 'medical_history', label: '📜 Medical History' },
                    { id: 'previous_visits', label: `🏥 Previous Visits (${encounterData.previousVisits?.length || 0})` },
                    { id: 'prescriptions', label: `💊 Prescriptions (${(encounterData.prescriptions?.currentMedicines?.length || 0) + (encounterData.prescriptions?.previousMedicines?.length || 0)})` },
                    { id: 'tests', label: `🧪 Tests & Reports (${encounterData.testReports?.length || 0})` },
                    { id: 'care_plan', label: `📋 Care Plan (${encounterData.carePlan?.length || 0})` },
                    { id: 'timeline', label: `⏳ Medical Timeline (${encounterData.timeline?.length || 0})` },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      id={`tab-longitudinal-${tab.id}`}
                      onClick={() => setActiveClinicalSection(tab.id)}
                      className={`text-xs font-bold px-3.5 py-2 rounded-xl whitespace-nowrap transition ${
                        activeClinicalSection === tab.id
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* CONSENT SHIELD WARNING (If consent not verified, shield history while allowing Current Visit & Demographics) */}
                {!encounterData.consent.isAuthorized && !['overview', 'current_visit'].includes(activeClinicalSection) ? (
                  <div className="bg-amber-50/80 border-2 border-dashed border-amber-300 rounded-3xl p-8 text-center space-y-4">
                    <div className="w-16 h-16 mx-auto bg-amber-100 text-amber-900 rounded-2xl flex items-center justify-center text-3xl font-black shadow-inner">
                      🔐
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-base font-black text-slate-900">
                        Longitudinal Medical History Shielded — Patient Consent Not Granted
                      </h4>
                      <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                        Under hospital patient privacy governance, historical diagnostic records, past prescriptions, and surgeries are securely encrypted. The patient must approve consent from their consent dashboard.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRequestConsent}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition shadow-md"
                    >
                      Request Patient Consent Now
                    </button>
                  </div>
                ) : (
                  <div>
                    {/* 1. PATIENT OVERVIEW TAB */}
                    {activeClinicalSection === 'overview' && (
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* Demographics Details */}
                          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-3">
                            <span className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                              Core Demographics & Identifiers
                            </span>
                            <div className="space-y-2 text-xs">
                              <div className="flex justify-between py-1 border-b border-slate-200">
                                <span className="text-slate-500">Full Name</span>
                                <strong className="text-slate-900">{encounterData.patientOverview?.name || encounterData.patient?.name}</strong>
                              </div>
                              <div className="flex justify-between py-1 border-b border-slate-200">
                                <span className="text-slate-500">Patient ABHA / ID</span>
                                <strong className="text-slate-900 font-mono">{encounterData.patientOverview?.patientId || encounterData.patient?.id}</strong>
                              </div>
                              <div className="flex justify-between py-1 border-b border-slate-200">
                                <span className="text-slate-500">Age & Gender</span>
                                <strong className="text-slate-900 capitalize">
                                  {encounterData.patientOverview?.age} yrs • {encounterData.patientOverview?.gender}
                                </strong>
                              </div>
                              <div className="flex justify-between py-1 border-b border-slate-200">
                                <span className="text-slate-500">Blood Group</span>
                                <strong className="text-rose-700">{encounterData.patientOverview?.bloodGroup || 'Not Tested'}</strong>
                              </div>
                              <div className="flex justify-between py-1 border-b border-slate-200">
                                <span className="text-slate-500">Phone Number</span>
                                <strong className="text-slate-900">{encounterData.patientOverview?.phone || 'N/A'}</strong>
                              </div>
                              <div className="flex justify-between py-1">
                                <span className="text-slate-500">Emergency Contact</span>
                                <strong className="text-slate-900">{encounterData.patientOverview?.emergencyContact || 'None on file'}</strong>
                              </div>
                            </div>
                          </div>

                          {/* Vitals & Anthropometrics */}
                          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-3">
                            <span className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                              Biometrics & Body Mass Index (BMI)
                            </span>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="bg-white p-3 rounded-xl border border-slate-200">
                                <span className="text-[10px] font-bold text-slate-400 block uppercase">Height</span>
                                <span className="text-lg font-black text-slate-900">{encounterData.patientOverview?.height ? `${encounterData.patientOverview.height} cm` : '--'}</span>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-slate-200">
                                <span className="text-[10px] font-bold text-slate-400 block uppercase">Weight</span>
                                <span className="text-lg font-black text-slate-900">{encounterData.patientOverview?.weight ? `${encounterData.patientOverview.weight} kg` : '--'}</span>
                              </div>
                            </div>
                            <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1">
                              <span className="text-[10px] font-bold text-slate-400 block uppercase">Calculated Body Mass Index (BMI)</span>
                              <div className="flex items-center gap-2">
                                <span className="text-2xl font-black text-slate-900">
                                  {encounterData.patientOverview?.bmi ?? '--'}
                                </span>
                                {encounterData.patientOverview?.bmiCategory && (
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                                    encounterData.patientOverview.bmiCategory === 'Normal'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}>
                                    {encounterData.patientOverview.bmiCategory}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Longitudinal Snapshot Stats */}
                          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-3">
                            <span className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                              Longitudinal Clinical Snapshot
                            </span>
                            <div className="grid grid-cols-2 gap-2 text-center">
                              <div className="bg-white p-3 rounded-xl border border-slate-200">
                                <span className="text-2xl font-black text-blue-600 block">{encounterData.previousVisits?.length || 0}</span>
                                <span className="text-[10px] text-slate-500 font-bold uppercase">Past Visits</span>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-slate-200">
                                <span className="text-2xl font-black text-purple-600 block">{encounterData.prescriptions?.currentMedicines?.length || 0}</span>
                                <span className="text-[10px] text-slate-500 font-bold uppercase">Active Meds</span>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-slate-200">
                                <span className="text-2xl font-black text-amber-600 block">{encounterData.medicalHistory?.chronicConditions?.length || 0}</span>
                                <span className="text-[10px] text-slate-500 font-bold uppercase">Chronic Cond.</span>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-slate-200">
                                <span className="text-2xl font-black text-cyan-600 block">{encounterData.testReports?.length || 0}</span>
                                <span className="text-[10px] text-slate-500 font-bold uppercase">Diagnostic Tests</span>
                              </div>
                            </div>
                            <div className="text-[11px] text-slate-500 pt-1">
                              Consent status: <strong className="text-emerald-700 capitalize">{encounterData.consent?.status || 'Active'}</strong>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 2. CURRENT VISIT TAB */}
                    {activeClinicalSection === 'current_visit' && (
                      <div className="space-y-6">
                        {/* Visit Status & Timer Header */}
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-xs font-bold text-slate-500 uppercase">Consultation Timer:</span>
                            <ConsultationTimer
                              isActive={encounterData.appointment.status === 'in-progress'}
                              startTime={encounterData.appointment.token?.calledAt || new Date()}
                            />
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-500 font-semibold">Slot:</span>
                            <span className="bg-white px-2.5 py-1 rounded-lg border border-slate-200 font-bold text-slate-900">
                              ⏰ {encounterData.currentVisit?.slotTime || encounterData.appointment?.slotTime}
                            </span>
                            <span className="text-slate-500 font-semibold">Token:</span>
                            <span className="bg-white px-2.5 py-1 rounded-lg border border-slate-200 font-bold text-slate-900">
                              #{encounterData.currentVisit?.tokenNumber || encounterData.appointment?.token?.tokenNumber || 'Walk-in'}
                            </span>
                          </div>
                        </div>

                        {/* Interactive Current Visit Vitals & Notes Form */}
                        <form onSubmit={handleSaveCurrentVisit} className="space-y-5">
                          {/* Chief Complaint, Symptoms & Duration */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-2">
                              <label className="block text-xs font-bold text-slate-700 mb-1">Chief Complaint *</label>
                              <input
                                type="text"
                                required
                                value={currentVisitForm.chiefComplaint}
                                onChange={(e) => setCurrentVisitForm({ ...currentVisitForm, chiefComplaint: e.target.value })}
                                placeholder="e.g. Chest tightness, exertional dyspnea"
                                className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white font-medium focus:ring-2 focus:ring-blue-400"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Duration</label>
                              <input
                                type="text"
                                value={currentVisitForm.duration}
                                onChange={(e) => setCurrentVisitForm({ ...currentVisitForm, duration: e.target.value })}
                                placeholder="e.g. 3 days, 2 weeks"
                                className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white font-medium focus:ring-2 focus:ring-blue-400"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Symptoms (Comma Separated)</label>
                            <input
                              type="text"
                              value={currentVisitForm.symptoms}
                              onChange={(e) => setCurrentVisitForm({ ...currentVisitForm, symptoms: e.target.value })}
                              placeholder="e.g. Chest tightness, Exertional dyspnea, Fatigue"
                              className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white font-medium focus:ring-2 focus:ring-blue-400"
                            />
                          </div>

                          {/* 5 Core Clinical Vitals Grid */}
                          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                            <span className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                              Clinical Vitals & Physiological Measurements
                            </span>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-xs">
                              <div>
                                <label className="block font-bold text-slate-600 mb-1">Blood Pressure</label>
                                <input
                                  type="text"
                                  value={currentVisitForm.bp}
                                  onChange={(e) => setCurrentVisitForm({ ...currentVisitForm, bp: e.target.value })}
                                  placeholder="120/80 mmHg"
                                  className="w-full rounded-xl border border-slate-300 p-2 bg-white font-semibold"
                                />
                              </div>
                              <div>
                                <label className="block font-bold text-slate-600 mb-1">Heart Rate (bpm)</label>
                                <input
                                  type="number"
                                  value={currentVisitForm.heartRate}
                                  onChange={(e) => setCurrentVisitForm({ ...currentVisitForm, heartRate: e.target.value })}
                                  placeholder="72"
                                  className="w-full rounded-xl border border-slate-300 p-2 bg-white font-semibold"
                                />
                              </div>
                              <div>
                                <label className="block font-bold text-slate-600 mb-1">Temperature</label>
                                <input
                                  type="text"
                                  value={currentVisitForm.temperature}
                                  onChange={(e) => setCurrentVisitForm({ ...currentVisitForm, temperature: e.target.value })}
                                  placeholder="98.6 °F"
                                  className="w-full rounded-xl border border-slate-300 p-2 bg-white font-semibold"
                                />
                              </div>
                              <div>
                                <label className="block font-bold text-slate-600 mb-1">SpO2 Oxygen (%)</label>
                                <input
                                  type="text"
                                  value={currentVisitForm.spO2}
                                  onChange={(e) => setCurrentVisitForm({ ...currentVisitForm, spO2: e.target.value })}
                                  placeholder="98%"
                                  className="w-full rounded-xl border border-slate-300 p-2 bg-white font-semibold"
                                />
                              </div>
                              <div>
                                <label className="block font-bold text-slate-600 mb-1">Respiratory Rate</label>
                                <input
                                  type="number"
                                  value={currentVisitForm.respiratoryRate}
                                  onChange={(e) => setCurrentVisitForm({ ...currentVisitForm, respiratoryRate: e.target.value })}
                                  placeholder="16 /min"
                                  className="w-full rounded-xl border border-slate-300 p-2 bg-white font-semibold"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Current Observations & Physical Exam */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Current Physical Observations</label>
                              <textarea
                                rows={3}
                                value={currentVisitForm.currentObservations}
                                onChange={(e) => setCurrentVisitForm({ ...currentVisitForm, currentObservations: e.target.value })}
                                placeholder="e.g. Mild bilateral crackles, normal heart sounds, no peripheral edema"
                                className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white font-medium focus:ring-2 focus:ring-blue-400"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Doctor Clinical Notes</label>
                              <textarea
                                rows={3}
                                value={currentVisitForm.clinicalNotes}
                                onChange={(e) => setCurrentVisitForm({ ...currentVisitForm, clinicalNotes: e.target.value })}
                                placeholder="e.g. Advised resting ECG, initiate cardiac workup, follow up with blood panel"
                                className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white font-medium focus:ring-2 focus:ring-blue-400"
                              />
                            </div>
                          </div>

                          {/* Diagnosis & Treatment Plan */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Working Diagnosis</label>
                              <input
                                type="text"
                                value={currentVisitForm.diagnosis}
                                onChange={(e) => setCurrentVisitForm({ ...currentVisitForm, diagnosis: e.target.value })}
                                placeholder="e.g. Suspected Angina Pectoris / CAD evaluation"
                                className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white font-medium"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Prescribed Treatment / Intervention</label>
                              <input
                                type="text"
                                value={currentVisitForm.treatment}
                                onChange={(e) => setCurrentVisitForm({ ...currentVisitForm, treatment: e.target.value })}
                                placeholder="e.g. Sublingual nitrate standby, oral beta-blocker titration"
                                className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white font-medium"
                              />
                            </div>
                          </div>

                          {/* Save Visit Button */}
                          <div className="flex justify-end gap-3 pt-2">
                            <button
                              type="submit"
                              id="btn-save-current-visit"
                              disabled={savingCurrentVisit}
                              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-md transition disabled:opacity-50 flex items-center gap-2"
                            >
                              <span>💾</span>
                              {savingCurrentVisit ? 'Saving Vitals & Notes...' : 'Save Current Visit Records'}
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* 3. MEDICAL HISTORY TAB */}
                    {activeClinicalSection === 'medical_history' && (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                            Categorized Medical History & Risk Profile
                          </h3>
                          <button
                            type="button"
                            onClick={() => setHistoryModalOpen(true)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl shadow-sm transition"
                          >
                            + Add Medical Record
                          </button>
                        </div>

                        {/* Chronic Conditions */}
                        <div className="space-y-2">
                          <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 inline-block uppercase">
                            Chronic Conditions ({encounterData.medicalHistory?.chronicConditions?.length || 0})
                          </span>
                          {encounterData.medicalHistory?.chronicConditions?.length === 0 ? (
                            <div className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl border border-slate-200">No chronic conditions recorded</div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {encounterData.medicalHistory.chronicConditions.map((c) => (
                                <div key={c._id} className="bg-amber-50/40 border border-amber-200 rounded-xl p-3.5 text-xs space-y-1">
                                  <div className="flex justify-between font-bold text-slate-900">
                                    <span>🩺 {c.condition}</span>
                                    <span className="text-slate-500 font-normal">{c.conditionDate}</span>
                                  </div>
                                  {c.notes && <p className="text-slate-600">{c.notes}</p>}
                                  <div className="text-[10px] text-slate-400">
                                    Source: <span className="capitalize">{c.source?.replace(/_/g, ' ')}</span>
                                    {c.doctorName && ` • Dr. ${c.doctorName}`}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Previous Illnesses & Diagnoses */}
                        <div className="space-y-2">
                          <span className="text-xs font-bold text-blue-800 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 inline-block uppercase">
                            Previous Illnesses & Diagnoses ({encounterData.medicalHistory?.previousIllnesses?.length || 0})
                          </span>
                          {encounterData.medicalHistory?.previousIllnesses?.length === 0 ? (
                            <div className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl border border-slate-200">No previous illnesses recorded</div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {encounterData.medicalHistory.previousIllnesses.map((ill) => (
                                <div key={ill._id} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs space-y-1">
                                  <div className="flex justify-between font-bold text-slate-900">
                                    <span>🌡️ {ill.condition}</span>
                                    <span className="text-slate-500 font-normal">{ill.conditionDate}</span>
                                  </div>
                                  {ill.notes && <p className="text-slate-600">{ill.notes}</p>}
                                  <div className="text-[10px] text-slate-400">
                                    Source: <span className="capitalize">{ill.source?.replace(/_/g, ' ')}</span>
                                    {ill.doctorName && ` • Dr. ${ill.doctorName}`}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Previous Surgeries */}
                        <div className="space-y-2">
                          <span className="text-xs font-bold text-purple-800 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200 inline-block uppercase">
                            Previous Surgeries & Procedures ({encounterData.medicalHistory?.previousSurgeries?.length || 0})
                          </span>
                          {encounterData.medicalHistory?.previousSurgeries?.length === 0 ? (
                            <div className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl border border-slate-200">No surgical history recorded</div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {encounterData.medicalHistory.previousSurgeries.map((s) => (
                                <div key={s._id} className="bg-purple-50/40 border border-purple-200 rounded-xl p-3.5 text-xs space-y-1">
                                  <div className="flex justify-between font-bold text-slate-900">
                                    <span>🔪 {s.condition}</span>
                                    <span className="text-slate-500 font-normal">{s.conditionDate}</span>
                                  </div>
                                  {s.notes && <p className="text-slate-600">{s.notes}</p>}
                                  <div className="text-[10px] text-slate-400">
                                    Recorded: <span className="capitalize">{s.source?.replace(/_/g, ' ')}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 4. PREVIOUS VISITS TAB */}
                    {activeClinicalSection === 'previous_visits' && (
                      <div className="space-y-4">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                          Historical Outpatient & Inpatient Consultations
                        </h3>

                        {encounterData.previousVisits?.length === 0 ? (
                          <div className="text-center py-12 text-slate-400 text-xs font-medium border-2 border-dashed border-slate-200 rounded-2xl">
                            No previous visits on record. This is the patient's first registered consultation.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {encounterData.previousVisits.map((v) => (
                              <div key={v.appointmentId} className="bg-slate-50 rounded-2xl border border-slate-200 p-4 text-xs space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="bg-white px-2.5 py-1 rounded-lg border border-slate-200 font-bold text-slate-900">
                                      📅 {v.date}
                                    </span>
                                    <strong className="text-slate-900 text-sm">{v.doctor}</strong>
                                    <span className="text-slate-500 font-medium">({v.specialty})</span>
                                  </div>
                                  <span className="text-slate-500 font-bold bg-white px-2 py-0.5 rounded-md border border-slate-200">
                                    🏥 {v.hospitalName}
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                                  <div>
                                    <span className="text-slate-400 font-bold uppercase block text-[10px]">Reason for Visit</span>
                                    <p className="font-semibold text-slate-800 mt-0.5">{v.reasonForVisit}</p>
                                  </div>
                                  <div>
                                    <span className="text-slate-400 font-bold uppercase block text-[10px]">Diagnosis</span>
                                    <p className="font-semibold text-slate-800 mt-0.5">{v.diagnosis}</p>
                                  </div>
                                  <div>
                                    <span className="text-slate-400 font-bold uppercase block text-[10px]">Treatment & Prescriptions</span>
                                    <p className="font-semibold text-purple-700 mt-0.5">{v.treatment || v.prescriptionsSummary}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 5. PRESCRIPTIONS TAB (Current vs Previous Medicines) */}
                    {activeClinicalSection === 'prescriptions' && (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                            Longitudinal Medication Profile & Prescriptions
                          </h3>
                          <button
                            type="button"
                            onClick={() => setRxModalOpen(true)}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl shadow-sm transition"
                          >
                            + Issue Prescription
                          </button>
                        </div>

                        {/* Current Active Medicines */}
                        <div className="space-y-3">
                          <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200 inline-block uppercase">
                            🟢 Current Active Medicines ({encounterData.prescriptions?.currentMedicines?.length || 0})
                          </span>

                          {encounterData.prescriptions?.currentMedicines?.length === 0 ? (
                            <div className="text-xs text-slate-400 italic bg-slate-50 p-4 rounded-xl border border-slate-200">
                              No active medications on record.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {encounterData.prescriptions.currentMedicines.map((med, idx) => (
                                <div key={idx} className="bg-emerald-50/30 border border-emerald-200 rounded-2xl p-4 text-xs space-y-1.5 shadow-sm">
                                  <div className="flex justify-between items-center">
                                    <h4 className="font-black text-slate-900 text-sm">{med.medicineName}</h4>
                                    <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full text-[10px] uppercase">
                                      Active
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-slate-600">
                                    <div><strong>Dosage:</strong> {med.dosage}</div>
                                    <div><strong>Frequency:</strong> {med.frequency}</div>
                                    <div><strong>Duration:</strong> {med.duration}</div>
                                    <div><strong>Meal:</strong> <span className="capitalize">{med.mealRelation?.replace(/_/g, ' ')}</span></div>
                                  </div>
                                  {med.instructions && (
                                    <p className="text-[11px] text-slate-500 italic bg-white p-2 rounded-lg border border-emerald-100 mt-1">
                                      Instructions: {med.instructions}
                                    </p>
                                  )}
                                  <div className="text-[10px] text-slate-400 pt-1">
                                    Prescribed by: {med.doctorName || 'Attending Physician'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Previous / Completed Medicines */}
                        <div className="space-y-3">
                          <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200 inline-block uppercase">
                            ⚪ Past / Completed Courses ({encounterData.prescriptions?.previousMedicines?.length || 0})
                          </span>

                          {encounterData.prescriptions?.previousMedicines?.length === 0 ? (
                            <div className="text-xs text-slate-400 italic bg-slate-50 p-4 rounded-xl border border-slate-200">
                              No previous completed courses recorded.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {encounterData.prescriptions.previousMedicines.map((med, idx) => (
                                <div key={idx} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-1.5 opacity-80">
                                  <div className="flex justify-between items-center">
                                    <h4 className="font-bold text-slate-800 text-sm">{med.medicineName}</h4>
                                    <span className="bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded-full text-[10px] uppercase">
                                      Completed
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-slate-500">
                                    <div><strong>Dosage:</strong> {med.dosage}</div>
                                    <div><strong>Duration:</strong> {med.duration}</div>
                                  </div>
                                  {med.instructions && <p className="text-[11px] text-slate-400 italic">{med.instructions}</p>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 6. TESTS & REPORTS TAB */}
                    {activeClinicalSection === 'tests' && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                            Diagnostic Test Orders & Lab Reports
                          </h3>
                          <button
                            type="button"
                            onClick={() => setTestModalOpen(true)}
                            className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl shadow-sm transition"
                          >
                            + Order Diagnostic Test
                          </button>
                        </div>

                        {encounterData.testReports?.length === 0 ? (
                          <div className="text-center py-12 text-slate-400 text-xs font-medium border-2 border-dashed border-slate-200 rounded-2xl">
                            No diagnostic lab orders on record.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {encounterData.testReports.map((t) => (
                              <div key={t.id || t._id} className="bg-slate-50 rounded-2xl border border-slate-200 p-4 text-xs space-y-2">
                                <div className="flex justify-between items-start gap-2">
                                  <div>
                                    <h4 className="font-black text-slate-900 text-sm">{t.testName}</h4>
                                    <p className="text-[11px] text-slate-500 mt-0.5">Reason: {t.reason}</p>
                                  </div>
                                  <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                                    t.status === 'completed'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}>
                                    {t.status}
                                  </span>
                                </div>

                                <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase">Reported Result</span>
                                  <p className="text-sm font-black text-slate-900">{t.result || 'Pending Lab Verification'}</p>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400 pt-1">
                                  <span>Ordered by: <strong>{t.orderedBy}</strong></span>
                                  <span>Lab: <strong>{t.labName || 'Apex Diagnostic Services'}</strong></span>
                                  {t.hasReport && (
                                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold border border-blue-200">
                                      📄 PDF Attached
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 7. CARE PLAN TAB */}
                    {activeClinicalSection === 'care_plan' && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                            Longitudinal Care & Recovery Plans
                          </h3>
                          <button
                            type="button"
                            onClick={() => setCarePlanModalOpen(true)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl shadow-sm transition"
                          >
                            + Establish Care Plan
                          </button>
                        </div>

                        {encounterData.carePlan?.length === 0 ? (
                          <div className="text-center py-12 text-slate-400 text-xs font-medium border-2 border-dashed border-slate-200 rounded-2xl">
                            No active care plans on record.
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {encounterData.carePlan.map((cp) => (
                              <div key={cp._id || cp.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 text-xs">
                                <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                                  <div>
                                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 uppercase">
                                      Clinical Care Plan
                                    </span>
                                    <h4 className="text-base font-black text-slate-900 mt-1">{cp.diagnosis}</h4>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-slate-400 block text-[10px]">Follow-Up Date</span>
                                    <strong className="text-indigo-700 text-xs font-bold">{cp.followUpDate || 'In 2 weeks'}</strong>
                                  </div>
                                </div>

                                {cp.treatmentPlan && (
                                  <div className="bg-white p-3 rounded-xl border border-slate-200">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Treatment Strategy</span>
                                    <p className="font-semibold text-slate-800 mt-0.5">{cp.treatmentPlan}</p>
                                  </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-3.5 space-y-1">
                                    <strong className="text-emerald-900 font-bold block uppercase text-[11px]">✓ Recommended Diet & Lifestyle</strong>
                                    <p className="text-slate-700">
                                      {Array.isArray(cp.dietRecommended) ? cp.dietRecommended.join(', ') : cp.dietRecommended || 'Balanced nutrition'}
                                    </p>
                                  </div>
                                  <div className="bg-rose-50/50 border border-rose-200 rounded-xl p-3.5 space-y-1">
                                    <strong className="text-rose-900 font-bold block uppercase text-[11px]">✕ Dietary & Activity Restrictions</strong>
                                    <p className="text-slate-700">
                                      {Array.isArray(cp.dietRestricted) ? cp.dietRestricted.join(', ') : cp.dietRestricted || 'Avoid high sodium/trans-fats'}
                                    </p>
                                  </div>
                                </div>

                                {cp.instructions && (
                                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-900 font-medium text-[11px]">
                                    <strong>Physician Instructions & Red Flags:</strong> {cp.instructions}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 8. TIMELINE TAB (Chronological Patient Medical Timeline) */}
                    {activeClinicalSection === 'timeline' && (
                      <div className="space-y-4">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                          Chronological Patient Medical Timeline
                        </h3>

                        {encounterData.timeline?.length === 0 ? (
                          <div className="text-center py-12 text-slate-400 text-xs font-medium border-2 border-dashed border-slate-200 rounded-2xl">
                            No timeline entries recorded yet.
                          </div>
                        ) : (
                          <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                            {encounterData.timeline.map((event) => (
                              <div key={event.id} className="relative space-y-1 text-xs">
                                <div className="absolute -left-[23px] top-1.5 w-3.5 h-3.5 rounded-full bg-blue-600 ring-4 ring-white" />
                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1 hover:bg-slate-100/60 transition">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="bg-white px-2.5 py-0.5 rounded-md border border-slate-200 font-bold text-slate-900 text-[11px]">
                                      📅 {event.date || 'Past Event'}
                                    </span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-blue-100 text-blue-800">
                                      {event.badge || event.type}
                                    </span>
                                  </div>
                                  <h4 className="font-bold text-slate-900 text-sm mt-1">{event.title}</h4>
                                  <p className="text-slate-600 font-medium">{event.subtitle}</p>
                                  {event.details && <p className="text-slate-500 text-[11px] mt-1">{event.details}</p>}
                                </div>
                              </div>
                            ))}
                          </div>
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
                <p className="text-xs text-slate-500">Live operational synchronization with hospital reception & queue engine</p>
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
                        🩺 Open Longitudinal Record
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

      {/* WORKSPACE VIEW: OPD QUEUE ENGINE (Enhanced Doctor Panel) */}
      {activeWorkspaceTab === 'queue' && (
        <div className="space-y-6">
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
                  placeholder="e.g. Essential Hypertension, Angina Prophylaxis"
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
                          placeholder="e.g. Once daily morning"
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
                  placeholder="e.g. Take with water. Keep sublingual nitrate handy for emergencies."
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
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Quick Presets</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    '12-Lead Resting Electrocardiogram (ECG)',
                    'Serum Troponin I (High Sensitivity)',
                    'Complete Blood Count (CBC)',
                    'Comprehensive Lipid Profile',
                    'Fasting Blood Sugar & HbA1c',
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
                  placeholder="e.g. 12-Lead Electrocardiogram"
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
                  placeholder="e.g. Rule out myocardial ischemia, evaluate ST-T changes"
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
                  <span>📋</span> Establish Doctor Care Plan
                </h3>
                <p className="text-xs text-slate-500">
                  Patient: <strong>{encounterData?.patient.name}</strong> • Structured Longitudinal Guidance
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
                <label className="block font-bold text-slate-700 mb-1">Diagnosis / Clinical Focus *</label>
                <input
                  type="text"
                  required
                  value={carePlanForm.diagnosis}
                  onChange={(e) => setCarePlanForm({ ...carePlanForm, diagnosis: e.target.value })}
                  placeholder="e.g. Cardiovascular Risk Management"
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
                    placeholder="e.g. DASH low-sodium diet, high soluble fiber, hydration"
                    className="w-full rounded-xl border border-slate-300 p-2 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Activities Recommended</label>
                  <textarea
                    rows={2}
                    value={carePlanForm.activitiesRecommended}
                    onChange={(e) => setCarePlanForm({ ...carePlanForm, activitiesRecommended: e.target.value })}
                    placeholder="e.g. 30 minutes brisk walking 5 days/week as tolerated"
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
                    placeholder="e.g. Heavy weightlifting, high-intensity exertion pending stress test"
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

              <div>
                <label className="block font-bold text-slate-700 mb-1">Physician Warning Signs / Emergency Triggers</label>
                <textarea
                  rows={2}
                  value={carePlanForm.notes}
                  onChange={(e) => setCarePlanForm({ ...carePlanForm, notes: e.target.value })}
                  placeholder="e.g. Seek emergency attention if chest pain lasts >15 mins or radiates to arm."
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
                  {submittingCarePlan ? 'Establishing...' : 'Establish Care Plan'}
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
                  <span>🩺</span> Record Medical History
                </h3>
                <p className="text-xs text-slate-500">
                  Patient: <strong>{encounterData?.patient.name}</strong> • Categorized Clinical Record
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
                <label className="block font-bold text-slate-700 mb-1">Record Category *</label>
                <select
                  value={historyForm.category}
                  onChange={(e) => setHistoryForm({ ...historyForm, category: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2 bg-white"
                >
                  <option value="chronic_condition">Chronic Condition (e.g. Hypertension, Diabetes)</option>
                  <option value="illness">Previous Illness (e.g. Bronchitis, Infection)</option>
                  <option value="surgery">Previous Surgery (e.g. Appendectomy)</option>
                  <option value="diagnosis">Clinical Diagnosis</option>
                  <option value="allergy">Allergy / Drug Sensitivity</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Diagnosed Condition / Procedure *</label>
                <input
                  type="text"
                  required
                  value={historyForm.condition}
                  onChange={(e) => setHistoryForm({ ...historyForm, condition: e.target.value })}
                  placeholder="e.g. Essential Hypertension"
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
                  placeholder="Document clinical exam findings, severity, and treatment."
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
