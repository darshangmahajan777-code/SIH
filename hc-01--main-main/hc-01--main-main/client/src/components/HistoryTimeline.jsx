/**
 * HistoryTimeline
 *
 * Reusable medical history timeline component used in:
 *   - PatientConsentPage (patient self-view, with add/delete)
 *   - DoctorAppointmentsDashboard (consent-gated doctor view, read-only)
 *
 * Props:
 *   entries          MedicalHistory[] — sorted by conditionDate desc
 *   isPatientView    boolean — if true, shows add-entry form and delete buttons
 *   onAdd            (entryData) => void — callback when patient adds entry
 *   onDelete         (entryId) => void — callback when patient deletes entry
 *   consentVerified  boolean — if true (doctor view), shows consent badge
 *   loading          boolean
 */

import { useState } from "react";

const SOURCE_CONFIG = {
  doctor_verified: {
    label: "Doctor verified",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    dot: "bg-blue-500",
    icon: "🩺",
  },
  self_reported: {
    label: "Self-reported",
    color: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
    icon: "✏️",
  },
};

function formatDisplayDate(dateStr) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function AddEntryForm({ onAdd, onCancel }) {
  const [form, setForm] = useState({ condition: "", conditionDate: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.condition.trim() || !form.conditionDate) {
      setErr("Condition and date are required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await onAdd(form);
      onCancel();
    } catch (ex) {
      setErr(ex.message || "Failed to add entry.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-indigo-200 rounded-2xl p-5 shadow-sm space-y-3 mt-2"
    >
      <h4 className="text-sm font-black text-slate-800">Add Self-Reported Entry</h4>
      {err && <p className="text-xs text-red-600 font-semibold">{err}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Condition / Diagnosis *</label>
          <input
            id="history-condition"
            type="text"
            required
            maxLength={300}
            value={form.condition}
            onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))}
            placeholder="e.g. COVID-19, Malaria, Diabetes"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Date *</label>
          <input
            id="history-date"
            type="date"
            required
            value={form.conditionDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setForm((f) => ({ ...f, conditionDate: e.target.value }))}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-600 mb-1">Notes (optional)</label>
        <textarea
          id="history-notes"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Any additional context, treatment, or outcome..."
          rows={2}
          maxLength={2000}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
        >
          Cancel
        </button>
        <button
          id="save-history-entry"
          type="submit"
          disabled={saving}
          className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Entry"}
        </button>
      </div>
    </form>
  );
}

export default function HistoryTimeline({
  entries = [],
  isPatientView = false,
  onAdd,
  onDelete,
  consentVerified = false,
  loading = false,
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const handleDelete = async (entryId) => {
    if (!window.confirm("Remove this entry from your timeline?")) return;
    setDeletingId(entryId);
    try {
      await onDelete(entryId);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Consent badge (doctor view) */}
      {consentVerified && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-xs">
          <span className="text-emerald-600 font-bold">✓ Consent Verified</span>
          <span className="text-emerald-700">
            Patient granted you access to view this medical history timeline.
          </span>
        </div>
      )}

      {/* Patient add-entry controls */}
      {isPatientView && !showAddForm && (
        <button
          id="add-history-entry-btn"
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800 transition"
        >
          <span className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-lg font-black leading-none">+</span>
          Add self-reported entry
        </button>
      )}

      {isPatientView && showAddForm && (
        <AddEntryForm onAdd={onAdd} onCancel={() => setShowAddForm(false)} />
      )}

      {/* Empty state */}
      {entries.length === 0 && (
        <div className="text-center py-10 text-slate-400">
          <div className="text-4xl mb-2">🩺</div>
          <p className="font-semibold text-slate-600">No medical history on record.</p>
          {isPatientView && (
            <p className="text-xs mt-1">
              Completed consultations will appear here automatically. You can also add your own entries.
            </p>
          )}
        </div>
      )}

      {/* Timeline */}
      {entries.length > 0 && (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[18px] top-0 bottom-0 w-0.5 bg-slate-200" aria-hidden="true" />

          <div className="space-y-0">
            {entries.map((entry, i) => {
              const src = SOURCE_CONFIG[entry.source] || SOURCE_CONFIG.self_reported;
              return (
                <div key={entry._id || entry.id || i} className="relative flex gap-4 pb-6 last:pb-0">
                  {/* Timeline dot */}
                  <div className={`relative z-10 mt-1 w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${src.dot} bg-opacity-20 border-2 border-white shadow-sm`}>
                    <span>{src.icon}</span>
                  </div>

                  {/* Card */}
                  <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:border-slate-300 transition group">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-slate-900 text-sm leading-tight">
                          {entry.condition}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {formatDisplayDate(entry.conditionDate)}
                        </p>
                      </div>

                      {/* Source badge */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`inline-block text-[11px] font-bold px-2.5 py-1 rounded-full border ${src.color}`}>
                          {src.label}
                          {entry.source === "doctor_verified" && entry.doctorName
                            ? ` · ${entry.doctorName}`
                            : ""}
                        </span>

                        {/* Delete (patient view, self-reported only) */}
                        {isPatientView && entry.source === "self_reported" && (
                          <button
                            id={`delete-history-${entry._id || entry.id}`}
                            onClick={() => handleDelete(entry._id || entry.id)}
                            disabled={deletingId === (entry._id || entry.id)}
                            className="opacity-0 group-hover:opacity-100 text-xs text-red-500 hover:text-red-700 font-semibold transition px-2 py-1 rounded-lg hover:bg-red-50"
                          >
                            {deletingId === (entry._id || entry.id) ? "..." : "Remove"}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Notes */}
                    {entry.notes && (
                      <p className="text-xs text-slate-600 mt-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                        {entry.notes}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
