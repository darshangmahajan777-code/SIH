/**
 * TestRecordsTimeline
 *
 * Visual timeline for Lab and Diagnostic Test records.
 * Used in:
 *  - PatientConsentPage (Patient's "Tests & Reports" tab)
 *  - DoctorAppointmentsDashboard (Doctor's consent-gated shared test records panel)
 */

import { useState } from "react";

const STATUS_CONFIG = {
  ordered: {
    label: "Ordered (Pending)",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
    dotClass: "bg-amber-500 ring-amber-200",
    icon: "⏳",
  },
  "in-progress": {
    label: "In Progress",
    badgeClass: "bg-blue-100 text-blue-800 border-blue-200",
    dotClass: "bg-blue-500 ring-blue-200",
    icon: "🔄",
  },
  completed: {
    label: "Completed",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
    dotClass: "bg-emerald-500 ring-emerald-200",
    icon: "✓",
  },
  cancelled: {
    label: "Cancelled",
    badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
    dotClass: "bg-slate-400 ring-slate-200",
    icon: "✕",
  },
};

function formatDisplayDate(dateVal) {
  if (!dateVal) return "—";
  try {
    return new Date(dateVal).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(dateVal);
  }
}

export default function TestRecordsTimeline({
  orders = [],
  isPatientView = false,
  onRecordResult = null,
  loading = false,
  doctorTokenId = null,
}) {
  // Modal for entering test results (simulating lab completion)
  const [activeOrderForModal, setActiveOrderForModal] = useState(null);
  const [resultForm, setResultForm] = useState({
    value: "",
    unit: "g/dL",
    labName: "Central Diagnostics & Pathology",
    notes: "",
  });
  const [submittingResult, setSubmittingResult] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Report viewer modal (authenticated)
  const [viewingReport, setViewingReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");

  const handleOpenResultModal = (order) => {
    setActiveOrderForModal(order);
    setResultForm({
      value: "14.2",
      unit: order.testName.toLowerCase().includes("glucose") || order.testName.toLowerCase().includes("sugar") ? "mg/dL" : "g/dL",
      labName: "Central Diagnostics & Pathology",
      notes: "Sample collected and processed. All clinical control parameters valid.",
    });
    setSubmitError("");
  };

  const handleResultSubmit = async (e) => {
    e.preventDefault();
    if (!resultForm.value.trim()) {
      setSubmitError("Test result value is required.");
      return;
    }
    setSubmittingResult(true);
    setSubmitError("");
    try {
      if (onRecordResult) {
        await onRecordResult(activeOrderForModal._id || activeOrderForModal.id, {
          value: resultForm.value.trim(),
          unit: resultForm.unit.trim(),
          labName: resultForm.labName.trim(),
          notes: resultForm.notes.trim(),
          resultDate: new Date(),
        });
      }
      setActiveOrderForModal(null);
    } catch (err) {
      setSubmitError(err.message || "Failed to record test result.");
    } finally {
      setSubmittingResult(false);
    }
  };

  const handleFetchReport = async (orderId) => {
    setReportLoading(true);
    setReportError("");
    setViewingReport(null);
    try {
      const headers = {};
      if (doctorTokenId) {
        headers["x-doctor-id"] = doctorTokenId;
      }
      const res = await fetch(`/api/test-orders/${orderId}/report`, { headers });
      const json = await res.json();
      if (res.ok && json.success) {
        setViewingReport(json.data);
      } else {
        setReportError(json.error || "Failed to fetch medical report.");
      }
    } catch {
      setReportError("Network error fetching report.");
    } finally {
      setReportLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-12 px-4 bg-slate-50 rounded-2xl border border-slate-200">
        <div className="text-4xl mb-2">🧪</div>
        <p className="font-semibold text-slate-700">No lab or test records found</p>
        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
          {isPatientView
            ? "When a doctor orders blood tests or imaging, they will appear here along with verified lab results."
            : "No test records have been ordered or shared for this patient."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative pl-6 sm:pl-8 border-l-2 border-indigo-100 space-y-6">
        {orders.map((order) => {
          const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.ordered;
          const orderId = order._id || order.id;
          const isCompleted = order.status === "completed";
          const structured = order.result || order.structuredResult;

          return (
            <div key={orderId} className="relative group">
              {/* Timeline dot */}
              <div
                className={`absolute -left-[31px] sm:-left-[39px] top-1.5 w-4 h-4 rounded-full ring-4 ring-white ${cfg.dotClass}`}
              />

              {/* Order Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition">
                {/* Header row */}
                <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🧪</span>
                      <h4 className="font-black text-slate-900 text-base">{order.testName}</h4>
                    </div>
                    {/* Attribution */}
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                      <span className="font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
                        👨‍⚕️ Ordered by: <strong>{order.doctorName || order.orderedBy || "Attending Doctor"}</strong>
                      </span>
                      <span>•</span>
                      <span>Ordered: {formatDisplayDate(order.createdAt || order.date)}</span>
                    </div>
                  </div>

                  <span
                    className={`text-xs font-bold px-3 py-1 rounded-full border flex items-center gap-1.5 ${cfg.badgeClass}`}
                  >
                    <span>{cfg.icon}</span>
                    <span>{cfg.label}</span>
                  </span>
                </div>

                {/* Reason for test */}
                <div className="py-3 text-xs text-slate-600">
                  <span className="font-bold text-slate-700">Clinical Indication: </span>
                  <span className="italic">{order.reason}</span>
                </div>

                {/* Structured Result Section */}
                {isCompleted && structured ? (
                  <div className="bg-gradient-to-r from-emerald-50/70 to-teal-50/70 border border-emerald-200 rounded-xl p-4 mt-2 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded">
                        ✓ Structured Result
                      </span>
                      {structured.resultDate && (
                        <span className="text-xs text-emerald-700">
                          Completed: {formatDisplayDate(structured.resultDate)}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="bg-white/90 rounded-lg p-3 border border-emerald-100 shadow-2xs">
                        <div className="text-[11px] text-slate-500 font-medium">Result Value</div>
                        <div className="text-xl font-black text-slate-900 mt-0.5">
                          {structured.value || "Normal"}{" "}
                          <span className="text-sm font-semibold text-slate-600">
                            {structured.unit || ""}
                          </span>
                        </div>
                      </div>

                      <div className="bg-white/90 rounded-lg p-3 border border-emerald-100 shadow-2xs">
                        <div className="text-[11px] text-slate-500 font-medium">Reporting Laboratory</div>
                        <div className="text-sm font-bold text-slate-800 mt-0.5">
                          🏥 {structured.labName || "Central Diagnostic Lab"}
                        </div>
                      </div>
                    </div>

                    {structured.notes && (
                      <div className="text-xs text-slate-700 bg-white/70 p-2.5 rounded-lg border border-emerald-100">
                        <strong className="text-slate-800">Lab Interpretation: </strong>
                        {structured.notes}
                      </div>
                    )}

                    {/* Authenticated Report Action */}
                    <div className="pt-1 flex items-center justify-between flex-wrap gap-2">
                      <div className="text-[11px] text-slate-500 flex items-center gap-1">
                        <span>🔒 Authenticated medical report available</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleFetchReport(orderId)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg transition shadow-2xs flex items-center gap-1.5"
                      >
                        <span>📄</span>
                        <span>View Secure Report</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Pending state */
                  <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 mt-2 flex items-center justify-between flex-wrap gap-3">
                    <div className="text-xs text-amber-800">
                      Sample pending collection or laboratory analysis.
                    </div>
                    {isPatientView && (
                      <button
                        type="button"
                        onClick={() => handleOpenResultModal(order)}
                        className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition shadow-2xs"
                      >
                        + Enter Lab Result
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Enter Result Modal */}
      {activeOrderForModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Record Lab Result: {activeOrderForModal.testName}
              </h3>
              <button
                onClick={() => setActiveOrderForModal(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {submitError && (
              <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl p-3 text-xs font-semibold">
                {submitError}
              </div>
            )}

            <form onSubmit={handleResultSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Measured Value *</label>
                  <input
                    type="text"
                    required
                    value={resultForm.value}
                    onChange={(e) => setResultForm({ ...resultForm, value: e.target.value })}
                    placeholder="e.g. 14.2 or 110"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Unit</label>
                  <input
                    type="text"
                    value={resultForm.unit}
                    onChange={(e) => setResultForm({ ...resultForm, unit: e.target.value })}
                    placeholder="e.g. g/dL, mg/dL"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Laboratory Name</label>
                <input
                  type="text"
                  value={resultForm.labName}
                  onChange={(e) => setResultForm({ ...resultForm, labName: e.target.value })}
                  placeholder="e.g. Apex Diagnostics"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Interpretation</label>
                <textarea
                  rows={2}
                  value={resultForm.notes}
                  onChange={(e) => setResultForm({ ...resultForm, notes: e.target.value })}
                  placeholder="Clinical observation, reference intervals, etc."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveOrderForModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingResult}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition disabled:opacity-50"
                >
                  {submittingResult ? "Saving..." : "Save & Complete Result"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Authenticated Report Viewer Modal */}
      {(viewingReport || reportLoading || reportError) && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <span>🔒</span> Medical Diagnostic Report
                </h3>
                <p className="text-[11px] text-slate-500">Authenticated & Authorized Access Only</p>
              </div>
              <button
                onClick={() => {
                  setViewingReport(null);
                  setReportError("");
                }}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {reportLoading && (
              <div className="py-8 text-center text-slate-500 text-xs">
                <div className="w-6 h-6 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                Verifying authorization and loading report...
              </div>
            )}

            {reportError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-medium p-3 rounded-xl">
                {reportError}
              </div>
            )}

            {viewingReport && (
              <div className="space-y-3">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Test:</span>
                    <strong className="text-slate-800">{viewingReport.testName}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Ordered By:</span>
                    <span className="font-semibold text-indigo-700">{viewingReport.orderedBy}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Document File:</span>
                    <span className="font-mono text-slate-800">{viewingReport.reportFile?.fileName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">MIME Type:</span>
                    <span className="text-slate-600">{viewingReport.reportFile?.mimeType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Status:</span>
                    <span className="text-emerald-700 font-bold">Verified & Authenticated</span>
                  </div>
                </div>

                <div className="border border-dashed border-emerald-300 bg-emerald-50/50 rounded-xl p-4 text-center">
                  <div className="text-3xl mb-1">📄</div>
                  <div className="text-xs font-bold text-emerald-900">
                    {viewingReport.testName} Official Clinical Report
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Result: <strong>{viewingReport.result?.value} {viewingReport.result?.unit}</strong>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-2">
                    Security Notice: This document is served over an encrypted, authorized channel with
                    Cache-Control: private, no-store. URLs are never public.
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setViewingReport(null);
                      setReportError("");
                    }}
                    className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-xl"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
