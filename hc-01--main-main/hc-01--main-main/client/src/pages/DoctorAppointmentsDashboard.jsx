import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import HistoryTimeline from '../components/HistoryTimeline';
import TestRecordsTimeline from '../components/TestRecordsTimeline';
import CarePlanCard from '../components/CarePlanCard';

const RESOURCE_LABELS = {
  medical_history: 'Medical History',
  prescriptions: 'Prescriptions',
  test_results: 'Test Results',
  care_plans: 'Care Plans',
  medical_reports: 'Medical Reports',
};

export default function DoctorAppointmentsDashboard({ doctorId = '65f000000000000000000002' }) {
  const [activeTab, setActiveTab] = useState('today');
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedAptDetails, setSelectedAptDetails] = useState(null);

  // Order Lab Test modal state
  const [orderTestModalApt, setOrderTestModalApt] = useState(null);
  const [testOrderForm, setTestOrderForm] = useState({ testName: '', reason: '' });
  const [submittingTestOrder, setSubmittingTestOrder] = useState(false);

  // Care Plan modal state
  const [createCarePlanApt, setCreateCarePlanApt] = useState(null);
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

  // Consent-gated medical data panel state
  const [medicalDataPanel, setMedicalDataPanel] = useState(null);
  // { patientId, patientName, status: 'loading'|'granted'|'denied'|'error', data, resource }

  const todayStr = new Date().toISOString().slice(0, 10);

  const fetchAppointments = async (tab) => {
    setLoading(true);
    setError(null);
    try {
      const query = tab === 'today' ? `date=${todayStr}` : `tab=upcoming`;
      const res = await fetch(`/api/appointments/mine?${query}&doctorId=${doctorId}`);
      const data = await res.json();
      if (data.success) {
        setAppointments(data.data || []);
      } else {
        setError(data.error || 'Failed to fetch doctor appointments');
      }
    } catch (e) {
      setError('Network error fetching schedule');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments(activeTab);
  }, [activeTab]);

  const handleStatusChange = async (aptId, newStatus) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/appointments/${aptId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (res.ok) {
        fetchAppointments(activeTab);
      } else {
        alert(data.error || 'Failed to update status');
      }
    } catch (e) {
      alert('Error updating status');
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Fetch consent-gated medical data for a patient.
   * Security: server verifies AccessGrant on every request.
   * 403 = no consent => renders explicit "not shared" message.
   */
  const handleViewMedicalData = async (apt, resource = 'medical_history') => {
    const patientId = apt.patientId?._id || apt.patientId;
    const patientName = apt.patientId?.name || 'Patient';
    setMedicalDataPanel({ patientId, patientName, status: 'loading', resource });
    try {
      // medical_history, test_results, and care_plans use dedicated endpoints
      const url =
        resource === 'medical_history'
          ? `/api/history/patient/${patientId}`
          : resource === 'test_results'
          ? `/api/test-orders/patient/${patientId}`
          : resource === 'care_plans'
          ? `/api/care-plans/patient/${patientId}`
          : `/api/consent/patient/${patientId}/${resource.replace(/_/g, '-')}`;

      const res = await fetch(url, {
        headers: { 'x-doctor-id': doctorId },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMedicalDataPanel({ patientId, patientName, status: 'granted', data: data.data, resource });
      } else if (res.status === 403) {
        setMedicalDataPanel({ patientId, patientName, status: 'denied', resource });
      } else {
        setMedicalDataPanel({ patientId, patientName, status: 'error', error: data.error, resource });
      }
    } catch (e) {
      setMedicalDataPanel({ patientId, patientName, status: 'error', error: 'Network error', resource });
    }
  };

  const handleOrderTestSubmit = async (e) => {
    e.preventDefault();
    if (!testOrderForm.testName.trim() || !testOrderForm.reason.trim()) {
      alert("Please enter a test name and clinical reason");
      return;
    }
    setSubmittingTestOrder(true);
    try {
      const patientId = orderTestModalApt.patientId?._id || orderTestModalApt.patientId;
      const res = await fetch('/api/test-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-doctor-id': doctorId,
        },
        body: JSON.stringify({
          appointmentId: orderTestModalApt._id,
          patientId,
          doctorId,
          doctorName: 'Dr. Attending Clinician',
          testName: testOrderForm.testName.trim(),
          reason: testOrderForm.reason.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Test "${testOrderForm.testName}" ordered successfully.`);
        setOrderTestModalApt(null);
        setTestOrderForm({ testName: '', reason: '' });
      } else {
        alert(data.error || 'Failed to order test');
      }
    } catch {
      alert('Network error ordering test');
    } finally {
      setSubmittingTestOrder(false);
    }
  };

  const handleCreateCarePlanSubmit = async (e) => {
    e.preventDefault();
    if (!carePlanForm.diagnosis.trim()) {
      alert("Diagnosis / clinical context is required");
      return;
    }
    setSubmittingCarePlan(true);
    try {
      const patientId = createCarePlanApt.patientId?._id || createCarePlanApt.patientId;
      const res = await fetch('/api/care-plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-doctor-id': doctorId,
        },
        body: JSON.stringify({
          appointmentId: createCarePlanApt._id,
          patientId,
          doctorId,
          doctorName: 'Dr. Attending Clinician',
          diagnosis: carePlanForm.diagnosis.trim(),
          dietRecommended: carePlanForm.dietRecommended,
          dietRestricted: carePlanForm.dietRestricted,
          activitiesRecommended: carePlanForm.activitiesRecommended,
          activitiesRestricted: carePlanForm.activitiesRestricted,
          followUpDate: carePlanForm.followUpDate || null,
          notes: carePlanForm.notes.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        alert('Doctor care plan issued successfully!');
        setCreateCarePlanApt(null);
        setCarePlanForm({
          diagnosis: '',
          dietRecommended: '',
          dietRestricted: '',
          activitiesRecommended: '',
          activitiesRestricted: '',
          followUpDate: '',
          notes: '',
        });
      } else {
        alert(data.error || 'Failed to issue care plan');
      }
    } catch {
      alert('Network error issuing care plan');
    } finally {
      setSubmittingCarePlan(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
            Clinical Schedule
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-2">
            Doctor Appointments & OPD Queue
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Synchronized with the HC-01 Token engine. Manage patient visits, advance statuses, and view upcoming slots.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold text-slate-500">Today's Date</div>
          <div className="text-base font-bold text-slate-800">{todayStr}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-3 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('today')}
          className={`pb-3 text-xs font-bold border-b-2 transition ${
            activeTab === 'today'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Today's OPD Schedule
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('upcoming')}
          className={`pb-3 text-xs font-bold border-b-2 transition ${
            activeTab === 'upcoming'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Upcoming Bookings
        </button>
      </div>

      {loading && (
        <div className="py-12 text-center text-slate-400 text-sm font-medium">
          Loading clinical schedule...
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 text-red-700 text-xs rounded-xl font-medium">
          {error}
        </div>
      )}

      {!loading && appointments.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
          <p className="font-semibold text-sm">No appointments scheduled for {activeTab === 'today' ? 'today' : 'upcoming dates'}.</p>
        </div>
      )}

      {/* Appointment Cards / Table */}
      {!loading && appointments.length > 0 && (
        <div className="space-y-3">
          {appointments.map((apt) => {
            const token = apt.tokenId;

            return (
              <div
                key={apt._id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:border-slate-300 transition flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                {/* Info block */}
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-slate-900 text-sm bg-slate-100 px-2.5 py-1 rounded-lg">
                      ⏰ {apt.slotTime}
                    </span>
                    <h3 className="font-bold text-slate-900 text-base">
                      {apt.patientId?.name || 'Walk-in Patient'}
                    </h3>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                        apt.priority === 'critical'
                          ? 'bg-red-100 text-red-800'
                          : apt.priority === 'urgent'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {apt.priority} Priority
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                        apt.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : apt.status === 'in-progress'
                          ? 'bg-blue-100 text-blue-800 animate-pulse'
                          : apt.status === 'checked-in'
                          ? 'bg-indigo-100 text-indigo-800'
                          : apt.status === 'no-show'
                          ? 'bg-slate-200 text-slate-600'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {apt.status}
                    </span>
                    <span className="text-[11px] font-medium text-slate-500">
                      {apt.mode === 'video' ? '📹 Video Consult' : '🏥 In-Person'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                    <span>Date: <strong className="text-slate-700 font-semibold">{apt.date}</strong></span>
                    {apt.patientId?.phone && <span>Phone: {apt.patientId.phone}</span>}
                  </div>

                  {apt.chiefComplaint && (
                    <p className="text-xs text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-150 mt-1">
                      <span className="font-bold text-slate-800">Chief Complaint:</span> {apt.chiefComplaint}
                    </p>
                  )}

                  {/* Token Bridge */}
                  {token && (
                    <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1 rounded-lg text-xs mt-1">
                      <span className="bg-blue-600 text-white font-bold text-[11px] px-2 py-0.5 rounded">
                        Token #{token.tokenNumber}
                      </span>
                      <span className="text-blue-900 font-medium">
                        OPD Queue Status: <strong className="capitalize">{token.status}</strong>
                      </span>
                    </div>
                  )}
                </div>

                {/* Status Controls */}
                <div className="flex flex-wrap items-center gap-2 border-t lg:border-t-0 pt-3 lg:pt-0">
                  {apt.mode === 'video' && ['booked', 'checked-in', 'in-progress'].includes(apt.status) && (
                    <Link
                      to={`/telemedicine/${apt._id}?role=doctor`}
                      id={`start-video-${apt._id}`}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-sm transition flex items-center gap-1.5"
                    >
                      <span>📹</span> Video Consult
                    </Link>
                  )}

                  <button
                    type="button"
                    onClick={() => setSelectedAptDetails(apt)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl transition"
                  >
                    Details
                  </button>

                  {/* Consent-gated medical data button */}
                  <button
                    type="button"
                    id={`view-medical-data-${apt._id}`}
                    onClick={() => handleViewMedicalData(apt, 'medical_history')}
                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold px-3 py-2 rounded-xl transition"
                  >
                    🔒 Medical Data
                  </button>

                  {/* Order Lab Test button */}
                  <button
                    type="button"
                    id={`order-test-${apt._id}`}
                    onClick={() => {
                      setOrderTestModalApt(apt);
                      setTestOrderForm({ testName: 'Complete Blood Count (CBC)', reason: '' });
                    }}
                    className="bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold px-3 py-2 rounded-xl transition flex items-center gap-1"
                  >
                    🧪 Order Test
                  </button>

                  {apt.status === 'booked' && (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleStatusChange(apt._id, 'checked-in')}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-sm transition disabled:opacity-50"
                    >
                      Check In Patient
                    </button>
                  )}

                  {apt.status === 'checked-in' && (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleStatusChange(apt._id, 'in-progress')}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-sm transition disabled:opacity-50"
                    >
                      Start Consultation ▶
                    </button>
                  )}

                  {apt.status === 'in-progress' && (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleStatusChange(apt._id, 'completed')}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-sm transition disabled:opacity-50"
                    >
                      ✓ Complete Visit
                    </button>
                  )}

                  {['booked', 'checked-in'].includes(apt.status) && (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleStatusChange(apt._id, 'no-show')}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-medium px-2.5 py-2 rounded-xl transition"
                    >
                      No-Show
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Consent-Gated Medical Data Panel */}
      {medicalDataPanel && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-3xl">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  🔒 Shared Medical Data
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Patient: <strong>{medicalDataPanel.patientName}</strong>
                </p>
              </div>
              <button
                onClick={() => setMedicalDataPanel(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Resource selector */}
              <div className="flex flex-wrap gap-2">
                {Object.keys(RESOURCE_LABELS).map((res) => (
                  <button
                    key={res}
                    id={`resource-btn-${res}`}
                    onClick={() => handleViewMedicalData({ patientId: { _id: medicalDataPanel.patientId, name: medicalDataPanel.patientName } }, res)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-full border transition ${
                      medicalDataPanel.resource === res
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                    }`}
                  >
                    {RESOURCE_LABELS[res]}
                  </button>
                ))}
              </div>

              {/* Loading */}
              {medicalDataPanel.status === 'loading' && (
                <div className="flex justify-center py-10">
                  <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {/* Access Denied — patient has NOT shared data */}
              {medicalDataPanel.status === 'denied' && (
                <div id="consent-denied-panel" className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
                  <div className="text-4xl mb-3">🔐</div>
                  <h4 className="font-black text-slate-800 text-base">
                    Medical data has not been shared.
                  </h4>
                  <p className="text-sm text-slate-600 mt-2 max-w-sm mx-auto">
                    This patient has not granted you access to their{' '}
                    <strong>{RESOURCE_LABELS[medicalDataPanel.resource]}</strong>.
                    They must grant access from their&nbsp;
                    <span className="font-bold text-indigo-700">My Data &amp; Privacy</span> page.
                  </p>
                  <p className="text-xs text-slate-400 mt-3">
                    Access control is enforced at the server level. This is not a display issue.
                  </p>
                </div>
              )}

              {/* Granted — show medical data */}
              {medicalDataPanel.status === 'granted' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                    <span className="text-emerald-600 font-bold text-xs">✓ Consent Verified</span>
                    <span className="text-xs text-emerald-700">
                      Access granted by patient for {RESOURCE_LABELS[medicalDataPanel.resource]}.
                    </span>
                  </div>

                  {/* Use HistoryTimeline for medical history, TestRecordsTimeline for test results, generic table for others */}
                  {medicalDataPanel.resource === 'medical_history' ? (
                    <HistoryTimeline
                      entries={Array.isArray(medicalDataPanel.data) ? medicalDataPanel.data : (medicalDataPanel.data?.records || [])}
                      isPatientView={false}
                      consentVerified={true}
                      loading={false}
                    />
                  ) : medicalDataPanel.resource === 'test_results' ? (
                    <TestRecordsTimeline
                      orders={Array.isArray(medicalDataPanel.data) ? medicalDataPanel.data : (medicalDataPanel.data?.records || [])}
                      isPatientView={false}
                      doctorTokenId={doctorId}
                    />
                  ) : medicalDataPanel.resource === 'care_plans' ? (
                    (Array.isArray(medicalDataPanel.data) ? medicalDataPanel.data : (medicalDataPanel.data?.records || [])).length === 0 ? (
                      <div className="text-center py-8 text-slate-400 text-sm">
                        No care plans on record for this patient.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {(Array.isArray(medicalDataPanel.data) ? medicalDataPanel.data : (medicalDataPanel.data?.records || [])).map((plan) => (
                          <CarePlanCard key={plan.id || plan._id} plan={plan} isPatientView={false} />
                        ))}
                      </div>
                    )
                  ) : medicalDataPanel.data?.records?.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">
                      {medicalDataPanel.data?.note || 'No records found.'}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(medicalDataPanel.data?.records || []).map((record, i) => (
                        <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-700 space-y-1">
                          {Object.entries(record).map(([k, v]) => (
                            <div key={k} className="flex gap-2">
                              <span className="font-semibold text-slate-500 capitalize min-w-28">{k.replace(/_/g, ' ')}:</span>
                              <span className="text-slate-800">{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Error */}
              {medicalDataPanel.status === 'error' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                  Error: {medicalDataPanel.error}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Order Lab Test Modal */}
      {orderTestModalApt && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <span>🧪</span> Order Diagnostic / Lab Test
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Patient: <strong>{orderTestModalApt.patientId?.name || 'Patient'}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOrderTestModalApt(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleOrderTestSubmit} className="space-y-3">
              {/* Presets */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Common Tests Quick Select</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Complete Blood Count (CBC)',
                    'Fasting Blood Sugar & HbA1c',
                    'Comprehensive Lipid Profile',
                    'Liver Function Test (LFT)',
                    'Kidney Panel (KFT)',
                    'Thyroid Profile (TSH)',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setTestOrderForm((f) => ({ ...f, testName: preset }))}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition ${
                        testOrderForm.testName === preset
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-purple-50 hover:border-purple-200'
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
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Clinical Indication / Reason *</label>
                <textarea
                  rows={3}
                  required
                  value={testOrderForm.reason}
                  onChange={(e) => setTestOrderForm({ ...testOrderForm, reason: e.target.value })}
                  placeholder="e.g. Recurrent fever, evaluate hemoglobin and platelet count"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setOrderTestModalApt(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingTestOrder}
                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition disabled:opacity-50"
                >
                  {submittingTestOrder ? 'Ordering...' : 'Confirm Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Appointment Details Modal */}
      {selectedAptDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl relative space-y-4">
            <button
              type="button"
              onClick={() => setSelectedAptDetails(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold"
            >
              ✕
            </button>
            <h3 className="text-lg font-bold text-slate-900">
              Appointment Details
            </h3>

            <div className="space-y-2 text-xs border-y border-slate-100 py-3">
              <div className="flex justify-between">
                <span className="text-slate-500">Patient Name:</span>
                <span className="font-bold text-slate-800">{selectedAptDetails.patientId?.name || 'Unknown'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Email:</span>
                <span className="font-semibold text-slate-800">{selectedAptDetails.patientId?.email || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Phone:</span>
                <span className="font-semibold text-slate-800">{selectedAptDetails.patientId?.phone || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Slot:</span>
                <span className="font-bold text-blue-700">{selectedAptDetails.date} at {selectedAptDetails.slotTime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Consultation Mode:</span>
                <span className="font-semibold capitalize">{selectedAptDetails.mode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Priority:</span>
                <span className="font-bold capitalize text-rose-600">{selectedAptDetails.priority}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <span className="font-bold capitalize">{selectedAptDetails.status}</span>
              </div>
              {selectedAptDetails.tokenId && (
                <div className="flex justify-between text-blue-700 font-bold">
                  <span>Authoritative Token:</span>
                  <span>Token #{selectedAptDetails.tokenId.tokenNumber || selectedAptDetails.tokenId}</span>
                </div>
              )}
            </div>

            {selectedAptDetails.chiefComplaint && (
              <div>
                <span className="text-xs font-bold text-slate-700 block mb-1">Reason / Complaint:</span>
                <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  {selectedAptDetails.chiefComplaint}
                </p>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                id="btn-issue-care-plan"
                onClick={() => {
                  setCreateCarePlanApt(selectedAptDetails);
                  setCarePlanForm({
                    diagnosis: selectedAptDetails.chiefComplaint || 'Clinical Consultation',
                    dietRecommended: 'DASH dietary pattern, minimum 2.5L daily hydration',
                    dietRestricted: 'Refined sugar beverages, excess sodium (>2g/day)',
                    activitiesRecommended: '30-minute moderate aerobic walk 5 days/week',
                    activitiesRestricted: 'High-strain heavy lifting',
                    followUpDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
                    notes: 'Monitor daily vitals and symptoms. Report severe symptoms immediately.',
                  });
                  setSelectedAptDetails(null);
                }}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm"
              >
                <span>📋</span> Issue Doctor Care Plan
              </button>
              <button
                type="button"
                onClick={() => setSelectedAptDetails(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Doctor Care Plan Modal */}
      {createCarePlanApt && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <span>📋</span> Issue Doctor Care Plan
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Patient: <strong>{createCarePlanApt.patientId?.name || 'Patient'}</strong> • Attending Clinician Guidance
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateCarePlanApt(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCarePlanSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Diagnosis / Clinical Context *
                </label>
                <input
                  type="text"
                  required
                  value={carePlanForm.diagnosis}
                  onChange={(e) => setCarePlanForm({ ...carePlanForm, diagnosis: e.target.value })}
                  placeholder="e.g. Stage 1 Essential Hypertension, Type 2 Diabetes"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              {/* DO SECTION INPUTS */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                  <span className="bg-emerald-600 text-white rounded px-1.5 py-0.5 text-[10px]">DO</span> Recommended Guidance
                </span>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    🥗 Diet Recommended (comma or newline separated)
                  </label>
                  <textarea
                    rows={2}
                    value={carePlanForm.dietRecommended}
                    onChange={(e) => setCarePlanForm({ ...carePlanForm, dietRecommended: e.target.value })}
                    placeholder="e.g. High-fiber vegetables, whole grains, 2.5L hydration daily"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-400 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    🏃 Activities Recommended (comma or newline separated)
                  </label>
                  <textarea
                    rows={2}
                    value={carePlanForm.activitiesRecommended}
                    onChange={(e) => setCarePlanForm({ ...carePlanForm, activitiesRecommended: e.target.value })}
                    placeholder="e.g. 30 minutes brisk walking 5 days/week, light stretching"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-400 bg-white"
                  />
                </div>
              </div>

              {/* AVOID SECTION INPUTS */}
              <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-4 space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-900 flex items-center gap-1.5">
                  <span className="bg-rose-600 text-white rounded px-1.5 py-0.5 text-[10px]">AVOID</span> Restrictions &amp; Contraindications
                </span>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    🚫 Diet Restricted (comma or newline separated)
                  </label>
                  <textarea
                    rows={2}
                    value={carePlanForm.dietRestricted}
                    onChange={(e) => setCarePlanForm({ ...carePlanForm, dietRestricted: e.target.value })}
                    placeholder="e.g. Excess sodium (>2g/day), deep-fried trans-fats, refined sugars"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-rose-400 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ⚠️ Activities Restricted (comma or newline separated)
                  </label>
                  <textarea
                    rows={2}
                    value={carePlanForm.activitiesRestricted}
                    onChange={(e) => setCarePlanForm({ ...carePlanForm, activitiesRestricted: e.target.value })}
                    placeholder="e.g. Heavy isometric lifting, high-strain cardiovascular overload"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-rose-400 bg-white"
                  />
                </div>
              </div>

              {/* FOLLOW-UP INPUTS */}
              <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                  <span className="bg-indigo-600 text-white rounded px-1.5 py-0.5 text-[10px]">FOLLOW-UP</span> Review Plan
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Planned Follow-Up Date</label>
                    <input
                      type="date"
                      value={carePlanForm.followUpDate}
                      onChange={(e) => setCarePlanForm({ ...carePlanForm, followUpDate: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-400 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Attending Clinician</label>
                    <input
                      type="text"
                      disabled
                      value="Dr. Attending Clinician"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-slate-100 text-slate-600 cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Clinical Instructions &amp; Notes</label>
                  <textarea
                    rows={2}
                    value={carePlanForm.notes}
                    onChange={(e) => setCarePlanForm({ ...carePlanForm, notes: e.target.value })}
                    placeholder="Monitor blood pressure or fasting glucose daily. Report severe symptoms."
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-400 bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCreateCarePlanApt(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCarePlan}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition shadow-sm disabled:opacity-50"
                >
                  {submittingCarePlan ? 'Issuing Plan...' : 'Issue Care Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
