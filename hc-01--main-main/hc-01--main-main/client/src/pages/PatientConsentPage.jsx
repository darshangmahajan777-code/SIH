import { useState, useEffect } from "react";
import HistoryTimeline from "../components/HistoryTimeline";
import TestRecordsTimeline from "../components/TestRecordsTimeline";
import CarePlanCard from "../components/CarePlanCard";

const PATIENT_ID = "65f000000000000000000001"; // In prod: from auth context

const RESOURCE_LABELS = {
  medical_history: "Medical History",
  prescriptions: "Prescriptions",
  test_results: "Test Results",
  care_plans: "Care Plans",
  medical_reports: "Medical Reports",
  grant: "Access Granted",
  revoke: "Access Revoked",
};

const ACTION_LABELS = {
  read: "Viewed",
  write: "Updated",
  grant: "Granted",
  revoke: "Revoked",
  emergency_access: "Emergency Access",
};

const ACTION_COLORS = {
  read: "text-blue-600 bg-blue-50",
  write: "text-purple-600 bg-purple-50",
  grant: "text-emerald-600 bg-emerald-50",
  revoke: "text-amber-600 bg-amber-50",
  emergency_access: "text-red-600 bg-red-50",
};

export default function PatientConsentPage() {
  const [activeTab, setActiveTab] = useState("sharing");
  const [grants, setGrants] = useState([]);
  const [accessLogs, setAccessLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);
  const [revokeLoading, setRevokeLoading] = useState(null);

  // Grant modal
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [grantForm, setGrantForm] = useState({ doctorId: "", scope: "ongoing", appointmentId: "", note: "" });
  const [grantLoading, setGrantLoading] = useState(false);

  // Medical history timeline
  const [historyEntries, setHistoryEntries] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Lab & Test records timeline
  const [testOrders, setTestOrders] = useState([]);
  const [testsLoading, setTestsLoading] = useState(false);

  // Doctor care plans
  const [carePlans, setCarePlans] = useState([]);
  const [carePlansLoading, setCarePlansLoading] = useState(false);

  const fetchGrants = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/consent/grants?patientId=${PATIENT_ID}`);
      const data = await res.json();
      if (data.success) setGrants(data.data || []);
    } catch (e) {
      console.error("Error fetching grants", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchAccessLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/consent/access-log?patientId=${PATIENT_ID}&limit=100`);
      const data = await res.json();
      if (data.success) setAccessLogs(data.data || []);
    } catch (e) {
      console.error("Error fetching access log", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "sharing") fetchGrants();
    if (activeTab === "log") fetchAccessLogs();
    if (activeTab === "timeline") fetchHistory();
    if (activeTab === "tests") fetchTestOrders();
    if (activeTab === "care-plans") fetchCarePlans();
  }, [activeTab]);

  const fetchCarePlans = async () => {
    setCarePlansLoading(true);
    try {
      const res = await fetch(`/api/care-plans/patient/${PATIENT_ID}`, {
        headers: { "x-patient-id": PATIENT_ID },
      });
      const data = await res.json();
      if (data.success) setCarePlans(data.data || []);
    } catch (e) {
      console.error("Error fetching care plans", e);
    } finally {
      setCarePlansLoading(false);
    }
  };

  const fetchTestOrders = async () => {
    setTestsLoading(true);
    try {
      const res = await fetch(`/api/test-orders/patient/${PATIENT_ID}`, {
        headers: { "x-patient-id": PATIENT_ID },
      });
      const data = await res.json();
      if (data.success) setTestOrders(data.data || []);
    } catch (e) {
      console.error("Error fetching test orders", e);
    } finally {
      setTestsLoading(false);
    }
  };

  const handleRecordTestResult = async (orderId, resultData) => {
    const res = await fetch(`/api/test-orders/${orderId}/result`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result: resultData, status: "completed" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to record lab result");
    await fetchTestOrders();
    setActionMsg({ type: "success", text: "Lab test result recorded and verified." });
    setTimeout(() => setActionMsg(null), 3500);
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/history/mine?patientId=${PATIENT_ID}`);
      const data = await res.json();
      if (data.success) setHistoryEntries(data.data || []);
    } catch (e) {
      console.error("Error fetching history", e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleAddHistoryEntry = async ({ condition, conditionDate, notes }) => {
    const res = await fetch("/api/history/self-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: PATIENT_ID, condition, conditionDate, notes }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to add entry");
    await fetchHistory();
    setActionMsg({ type: "success", text: "Medical history entry added." });
    setTimeout(() => setActionMsg(null), 3500);
  };

  const handleDeleteHistoryEntry = async (entryId) => {
    const res = await fetch(`/api/history/${entryId}?patientId=${PATIENT_ID}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: PATIENT_ID }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to delete entry");
    await fetchHistory();
    setActionMsg({ type: "success", text: "Entry removed from your timeline." });
    setTimeout(() => setActionMsg(null), 3500);
  };

  const handleRevoke = async (grantId) => {
    if (!window.confirm("Are you sure you want to revoke this access? The doctor will no longer be able to view your medical data.")) return;
    setRevokeLoading(grantId);
    try {
      const res = await fetch(`/api/consent/grant/${grantId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: PATIENT_ID }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg({ type: "success", text: "Access revoked successfully." });
        fetchGrants();
      } else {
        setActionMsg({ type: "error", text: data.error || "Failed to revoke access." });
      }
    } catch {
      setActionMsg({ type: "error", text: "Network error. Please try again." });
    } finally {
      setRevokeLoading(null);
      setTimeout(() => setActionMsg(null), 4000);
    }
  };

  const handleGrant = async (e) => {
    e.preventDefault();
    setGrantLoading(true);
    try {
      const body = {
        patientId: PATIENT_ID,
        doctorId: grantForm.doctorId.trim(),
        scope: grantForm.scope,
        appointmentId: grantForm.scope === "appointment" ? grantForm.appointmentId.trim() || null : null,
        note: grantForm.note.trim(),
      };
      const res = await fetch("/api/consent/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg({ type: "success", text: "Access granted to doctor successfully." });
        setShowGrantModal(false);
        setGrantForm({ doctorId: "", scope: "ongoing", appointmentId: "", note: "" });
        fetchGrants();
      } else {
        setActionMsg({ type: "error", text: data.error || "Failed to grant access." });
      }
    } catch {
      setActionMsg({ type: "error", text: "Network error. Please try again." });
    } finally {
      setGrantLoading(false);
      setTimeout(() => setActionMsg(null), 4000);
    }
  };

  const formatDate = (d) => {
    if (!d) return "-";
    return new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  };

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider bg-white/20 px-3 py-1 rounded-full">
              🔒 Data Privacy & Consent
            </span>
            <h1 className="text-2xl font-black mt-3">My Data & Privacy</h1>
            <p className="text-indigo-100 text-sm mt-1 max-w-lg">
              You own your health data. You decide who can see it, when, and for how long.
              Revoke access at any time — changes take effect immediately.
            </p>
          </div>
          <button
            id="grant-access-btn"
            onClick={() => setShowGrantModal(true)}
            className="self-start bg-white text-indigo-700 font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-indigo-50 transition shadow-sm"
          >
            + Grant Access
          </button>
        </div>
      </div>

      {/* Action Message */}
      {actionMsg && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-semibold border ${
            actionMsg.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {actionMsg.type === "success" ? "✓ " : "✗ "}{actionMsg.text}
        </div>
      )}

      {/* Security Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-3">
        <span className="text-amber-500 text-xl">⚠️</span>
        <div className="text-sm text-amber-800">
          <strong>Your privacy is enforced at the server level.</strong> Doctors without an active grant
          cannot access your records regardless of what they request. Access control is not based on
          what the app shows — it is verified by the server on every request.
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto">
        {[
          { key: "sharing", label: "🤝 Data Sharing", desc: "Manage doctor access" },
          { key: "tests", label: "🧪 Tests & Reports", desc: "Lab test records & results" },
          { key: "care-plans", label: "📋 Care Plans", desc: "Doctor clinical guidance" },
          { key: "timeline", label: "🩺 My Timeline", desc: "Medical history" },
          { key: "log", label: "📋 Access Log", desc: "Who viewed your data" },
        ].map((tab) => (
          <button
            key={tab.key}
            id={`tab-${tab.key}`}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
              activeTab === tab.key
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "care-plans" ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <span>📋</span> Doctor Care Plans &amp; Clinical Guidance
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Personalized dietary, physical activity, and follow-up guidance issued directly by your physicians.
              </p>
            </div>
          </div>

          {carePlansLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : carePlans.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-500 shadow-sm">
              <div className="text-4xl mb-3">📋</div>
              <p className="font-semibold text-slate-700">No active care plans</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                When your doctor prescribes lifestyle modifications, nutrition plans, or follow-up milestones, they will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {carePlans.map((plan) => (
                <CarePlanCard key={plan.id || plan._id} plan={plan} isPatientView={true} />
              ))}
            </div>
          )}
        </div>
      ) : activeTab === "tests" ? (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <div>
                <h2 className="text-base font-black text-slate-900">🧪 Lab &amp; Diagnostic Test Records</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  View tests ordered by your physicians, structured clinical lab results, and verified reports.
                </p>
              </div>
            </div>
            <TestRecordsTimeline
              orders={testOrders}
              isPatientView={true}
              onRecordResult={handleRecordTestResult}
              loading={testsLoading}
            />
          </div>
        </div>
      ) : activeTab === "timeline" ? (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-base font-black text-slate-900 mb-4">🩺 My Medical History Timeline</h2>
            <HistoryTimeline
              entries={historyEntries}
              isPatientView={true}
              onAdd={handleAddHistoryEntry}
              onDelete={handleDeleteHistoryEntry}
              loading={historyLoading}
            />
          </div>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activeTab === "sharing" ? (
        <div className="space-y-4">
          {grants.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 shadow-sm">
              <div className="text-4xl mb-3">🔐</div>
              <p className="font-semibold text-slate-700">No active data sharing</p>
              <p className="text-sm mt-1">You have not granted any doctor access to your medical records.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-5 py-3.5 font-semibold text-slate-600">Doctor</th>
                    <th className="text-left px-5 py-3.5 font-semibold text-slate-600">Access Type</th>
                    <th className="text-left px-5 py-3.5 font-semibold text-slate-600">Granted</th>
                    <th className="text-left px-5 py-3.5 font-semibold text-slate-600">Status</th>
                    <th className="text-right px-5 py-3.5 font-semibold text-slate-600">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {grants.map((grant) => (
                    <tr key={grant._id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-800">
                          {grant.doctorId?.name || "Doctor"}
                        </div>
                        <div className="text-xs text-slate-400">{grant.doctorId?.email || ""}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${
                            grant.scope === "ongoing"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-purple-50 text-purple-700"
                          }`}
                        >
                          {grant.scope === "ongoing" ? "🔄 Ongoing" : "📅 Appointment-Specific"}
                        </span>
                        {grant.note && (
                          <div className="text-xs text-slate-400 mt-1 italic">"{grant.note}"</div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-600 text-xs">{formatDate(grant.grantedAt)}</td>
                      <td className="px-5 py-4">
                        {grant.revokedAt ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                            ⊘ Revoked {formatDate(grant.revokedAt)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                            ● Active
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {!grant.revokedAt && (
                          <button
                            id={`revoke-btn-${grant._id}`}
                            onClick={() => handleRevoke(grant._id)}
                            disabled={revokeLoading === grant._id}
                            className="text-xs font-bold text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 hover:border-red-300 transition disabled:opacity-50"
                          >
                            {revokeLoading === grant._id ? "Revoking..." : "Revoke"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Access Log Tab */
        <div className="space-y-4">
          {accessLogs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 shadow-sm">
              <div className="text-4xl mb-3">📋</div>
              <p className="font-semibold text-slate-700">No access events recorded yet</p>
              <p className="text-sm mt-1">Every time a doctor views your data, it will appear here.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-5 py-3.5 font-semibold text-slate-600">Doctor</th>
                    <th className="text-left px-5 py-3.5 font-semibold text-slate-600">Resource</th>
                    <th className="text-left px-5 py-3.5 font-semibold text-slate-600">Action</th>
                    <th className="text-left px-5 py-3.5 font-semibold text-slate-600">Date & Time</th>
                  </tr>
                </thead>
                <tbody>
                  {accessLogs.map((log) => (
                    <tr
                      key={log._id}
                      className={`border-b border-slate-100 last:border-0 transition ${
                        log.isEmergency ? "bg-red-50/60" : "hover:bg-slate-50/50"
                      }`}
                    >
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-800">
                          {log.doctorId?.name || log.authorizedBy || "Doctor"}
                        </div>
                        {log.isEmergency && (
                          <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                            🚨 Emergency
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {RESOURCE_LABELS[log.resource] || log.resource}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full ${
                            ACTION_COLORS[log.action] || "text-slate-600 bg-slate-100"
                          }`}
                        >
                          {ACTION_LABELS[log.action] || log.action}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500">{formatDate(log.accessedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Grant Access Modal */}
      {showGrantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 pt-6 pb-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black text-slate-900">Grant Medical Data Access</h2>
                <button onClick={() => setShowGrantModal(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100">✕</button>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Choose a doctor and access scope. You can revoke this access at any time from the Data Sharing tab.
              </p>
            </div>
            <form onSubmit={handleGrant} className="px-6 pb-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Doctor ID *</label>
                <input
                  id="grant-doctor-id"
                  type="text"
                  required
                  value={grantForm.doctorId}
                  onChange={(e) => setGrantForm((f) => ({ ...f, doctorId: e.target.value }))}
                  placeholder="Doctor's user ID"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Access Scope *</label>
                <select
                  id="grant-scope"
                  value={grantForm.scope}
                  onChange={(e) => setGrantForm((f) => ({ ...f, scope: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="ongoing">🔄 Ongoing — standing access to all my records with this doctor</option>
                  <option value="appointment">📅 Appointment-specific — access only for one visit</option>
                </select>
              </div>
              {grantForm.scope === "appointment" && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Appointment ID *</label>
                  <input
                    id="grant-appointment-id"
                    type="text"
                    required
                    value={grantForm.appointmentId}
                    onChange={(e) => setGrantForm((f) => ({ ...f, appointmentId: e.target.value }))}
                    placeholder="Appointment ID"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Note (optional)</label>
                <input
                  id="grant-note"
                  type="text"
                  value={grantForm.note}
                  onChange={(e) => setGrantForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="e.g. For cardiac follow-up only"
                  maxLength={200}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="bg-indigo-50 rounded-xl p-3 text-xs text-indigo-800">
                <strong>Consent is your right.</strong> This doctor will be able to access your medical records.
                You can revoke this permission at any time with immediate effect.
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowGrantModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  id="confirm-grant-btn"
                  type="submit"
                  disabled={grantLoading}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition disabled:opacity-50"
                >
                  {grantLoading ? "Granting..." : "Grant Access"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
