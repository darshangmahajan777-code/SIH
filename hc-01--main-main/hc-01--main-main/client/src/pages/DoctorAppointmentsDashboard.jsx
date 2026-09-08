import { useState, useEffect } from 'react';

export default function DoctorAppointmentsDashboard({ doctorId = '65f000000000000000000002' }) {
  const [activeTab, setActiveTab] = useState('today');
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedAptDetails, setSelectedAptDetails] = useState(null);

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
                  <button
                    type="button"
                    onClick={() => setSelectedAptDetails(apt)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl transition"
                  >
                    Details
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

            <button
              type="button"
              onClick={() => setSelectedAptDetails(null)}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 rounded-xl transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
