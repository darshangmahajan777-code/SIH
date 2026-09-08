import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getSocket } from '../services/socket';

export default function PatientAppointmentsDashboard() {
  const [activeTab, setActiveTab] = useState('today');
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);

  // Smart Virtual Queue state
  const [liveQueueData, setLiveQueueData] = useState(null);
  const [nearTurnAlert, setNearTurnAlert] = useState(null);

  // Reschedule state
  const [reschedulingApt, setReschedulingApt] = useState(null);
  const [newDate, setNewDate] = useState('');
  const [newSlotTime, setNewSlotTime] = useState('10:00');
  const [rescheduleLoading, setRescheduleLoading] = useState(false);

  // Rating modal state
  const [ratingApt, setRatingApt] = useState(null);
  const [starRating, setStarRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [ratingLoading, setRatingLoading] = useState(false);

  // Patient user ID
  const patientId = '65f000000000000000000001';

  const fetchAppointments = async (tab) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/appointments/mine?tab=${tab}&patientId=${patientId}`);
      const data = await res.json();
      if (data.success) {
        const apts = data.data || [];
        setAppointments(apts);

        // If in 'today' tab and has an appointment with a token, fetch virtual queue position
        if (tab === 'today') {
          const todayAptWithToken = apts.find(
            (a) => a.tokenId && ['booked', 'checked-in', 'in-progress'].includes(a.status)
          );
          if (todayAptWithToken) {
            fetchLiveQueuePosition(todayAptWithToken._id);
          } else {
            setLiveQueueData(null);
          }
        }
      } else {
        setError(data.error || 'Failed to fetch appointments');
      }
    } catch (err) {
      setError('Network error fetching appointments');
    } finally {
      setLoading(false);
    }
  };

  const fetchLiveQueuePosition = async (appointmentId) => {
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/queue-position`);
      const json = await res.json();
      if (json.success && json.data?.isLiveQueue) {
        setLiveQueueData(json.data);
      }
    } catch (e) {
      // Quiet fail
    }
  };

  useEffect(() => {
    fetchAppointments(activeTab);
  }, [activeTab]);

  // Socket.IO real-time updates & room join
  useEffect(() => {
    const socket = getSocket();
    const patientRoom = `patient-room:${patientId}`;

    socket.emit('join_room', patientRoom);

    const handlePositionUpdate = (data) => {
      setLiveQueueData((prev) => ({
        ...(prev || {}),
        isLiveQueue: true,
        tokenNumber: data.tokenNumber,
        position: data.position,
        patientsAhead: data.patientsAhead,
        status: data.status,
        estimatedTime: data.estimatedTime,
        estimatedWindow: data.estimatedWindow,
        recommendedArrivalTime: data.recommendedArrivalTime,
        priority: data.priority,
        reason: data.reason,
        lastUpdated: data.lastUpdated,
      }));
    };

    const handleNearTurn = (data) => {
      setNearTurnAlert(data.message);
    };

    socket.on('queue:position-update', handlePositionUpdate);
    socket.on('queue:near-turn', handleNearTurn);

    return () => {
      socket.off('queue:position-update', handlePositionUpdate);
      socket.off('queue:near-turn', handleNearTurn);
    };
  }, [patientId]);

  // Cancel handler
  const handleCancel = async (aptId) => {
    if (!window.confirm('Are you sure you want to cancel this appointment? Your slot will be freed.')) {
      return;
    }
    try {
      const res = await fetch(`/api/appointments/${aptId}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Cancelled by patient from dashboard' }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg('Appointment cancelled. Slot has been freed.');
        setLiveQueueData(null);
        setNearTurnAlert(null);
        fetchAppointments(activeTab);
      } else {
        alert(data.error || 'Failed to cancel appointment');
      }
    } catch (e) {
      alert('Error cancelling appointment');
    }
  };

  // Check in handler for today
  const handleCheckIn = async (aptId) => {
    try {
      const res = await fetch(`/api/appointments/${aptId}/check-in`, {
        method: 'PATCH',
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg('Checked in! OPD Token generated and linked.');
        fetchAppointments(activeTab);
        fetchLiveQueuePosition(aptId);
      } else {
        alert(data.error || 'Check-in failed');
      }
    } catch (e) {
      alert('Error checking in');
    }
  };

  // Reschedule handler
  const handleRescheduleSubmit = async () => {
    if (!reschedulingApt || !newDate || !newSlotTime) return;
    setRescheduleLoading(true);
    try {
      const res = await fetch(`/api/appointments/${reschedulingApt._id}/reschedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newDate, newSlotTime }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg(`Rescheduled successfully to ${newDate} at ${newSlotTime}`);
        setReschedulingApt(null);
        fetchAppointments(activeTab);
      } else {
        alert(data.error || 'Failed to reschedule');
      }
    } catch (e) {
      alert('Error rescheduling');
    } finally {
      setRescheduleLoading(false);
    }
  };

  // Submit rating
  const handleRatingSubmit = async () => {
    if (!ratingApt) return;
    setRatingLoading(true);
    try {
      const res = await fetch('/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: ratingApt._id,
          doctorId: ratingApt.doctorId?._id || ratingApt.doctorId,
          patientId: ratingApt.patientId?._id || ratingApt.patientId,
          rating: starRating,
          comment: reviewComment,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg('Rating submitted successfully! Doctor metrics updated.');
        setRatingApt(null);
      } else {
        alert(data.error || 'Failed to submit rating');
      }
    } catch (e) {
      alert('Error submitting rating');
    } finally {
      setRatingLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            My Appointments & Smart Queue
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Wait comfortably offsite. Track real-time queue position and recommended hospital arrival time.
          </p>
        </div>
        <Link
          to="/find-doctors"
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm transition text-center"
        >
          + Book New Appointment
        </Link>
      </div>

      {actionMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center justify-between">
          <span>{actionMsg}</span>
          <button onClick={() => setActionMsg(null)} className="text-emerald-600 font-bold">✕</button>
        </div>
      )}

      {/* Near Turn Warning Banner */}
      {nearTurnAlert && (
        <div className="p-4 bg-amber-500 text-white rounded-2xl shadow-lg flex items-center justify-between animate-bounce">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚨</span>
            <div>
              <div className="font-extrabold text-sm uppercase tracking-wide">Almost Your Turn!</div>
              <div className="text-xs font-medium text-amber-50">{nearTurnAlert}</div>
            </div>
          </div>
          <button
            onClick={() => setNearTurnAlert(null)}
            className="text-white/80 hover:text-white font-bold text-sm px-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Prominent Smart Virtual Queue Card (YOUR QUEUE) */}
      {activeTab === 'today' && liveQueueData && (
        <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-indigo-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5 mb-6">
            <div className="flex items-center gap-3">
              <span className="bg-blue-500/20 border border-blue-400/30 text-blue-300 font-bold text-xs px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                YOUR QUEUE (LIVE)
              </span>
              <span className="text-xs text-slate-300">
                Token #{liveQueueData.tokenNumber}
              </span>
            </div>
            <Link
              to="/display"
              className="text-xs font-semibold text-blue-300 hover:text-white transition flex items-center gap-1"
            >
              Public Waiting Board →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Token & Current Position */}
            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-white/10">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Current Position
              </div>
              <div className="text-3xl font-black mt-1 text-white flex items-baseline gap-2">
                #{liveQueueData.position}
                <span className="text-xs font-medium text-slate-400">in line</span>
              </div>
              <div className="text-xs text-blue-200 mt-2 font-semibold">
                Token #{liveQueueData.tokenNumber}
              </div>
            </div>

            {/* Patients Ahead */}
            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-white/10">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Patients Ahead
              </div>
              <div className="text-3xl font-black mt-1 text-amber-400">
                {liveQueueData.patientsAhead}
              </div>
              <div className="text-xs text-slate-300 mt-2">
                {liveQueueData.patientsAhead === 0 ? 'You are next in line!' : `${liveQueueData.patientsAhead} waiting before you`}
              </div>
            </div>

            {/* Estimated Consultation Window */}
            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-white/10">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Estimated Time
              </div>
              <div className="text-xl sm:text-2xl font-black mt-1 text-emerald-300">
                {liveQueueData.estimatedWindow || liveQueueData.estimatedTime}
              </div>
              <div className="text-xs text-slate-300 mt-2">
                Expected ~{liveQueueData.estimatedTime}
              </div>
            </div>

            {/* Recommended Arrival */}
            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-white/10">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Recommended Arrival
              </div>
              <div className="text-xl sm:text-2xl font-black mt-1 text-sky-300">
                {liveQueueData.recommendedArrivalTime}
              </div>
              <div className="text-xs text-slate-300 mt-2">
                Avoid hospital waiting room
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-400 gap-2">
            <span>
              Priority: <strong className="text-white capitalize">{liveQueueData.priority}</strong> — {liveQueueData.reason}
            </span>
            <span className="text-[11px] text-slate-400">
              Auto-updating live via Socket.IO • Last checked {new Date(liveQueueData.lastUpdated || Date.now()).toLocaleTimeString()}
            </span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        {[
          { id: 'today', label: "Today's Visits" },
          { id: 'upcoming', label: 'Upcoming' },
          { id: 'past', label: 'Past Visits' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="py-12 text-center text-slate-400 text-sm font-medium">
          Loading appointments...
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 text-red-700 text-xs rounded-xl font-medium">
          {error}
        </div>
      )}

      {/* Appointments List */}
      {!loading && appointments.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
          <p className="font-semibold text-sm">No {activeTab} appointments found.</p>
          {activeTab !== 'past' && (
            <Link
              to="/find-doctors"
              className="inline-block mt-3 text-xs text-blue-600 hover:underline font-bold"
            >
              Browse available doctors & slots →
            </Link>
          )}
        </div>
      )}

      {!loading && appointments.length > 0 && (
        <div className="space-y-4">
          {appointments.map((apt) => {
            const isToday = apt.date === new Date().toISOString().slice(0, 10);
            const token = apt.tokenId;

            return (
              <div
                key={apt._id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-base">
                      Dr. {apt.doctorId?.doctorName || 'Specialist'}
                    </h3>
                    <span className="text-xs text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded-lg">
                      {apt.doctorId?.specialty || 'General'}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                        apt.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : apt.status === 'cancelled'
                          ? 'bg-rose-100 text-rose-800'
                          : apt.status === 'in-progress'
                          ? 'bg-amber-100 text-amber-800 animate-pulse'
                          : apt.status === 'checked-in'
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {apt.status}
                    </span>
                    <span className="text-[11px] font-medium text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg">
                      {apt.mode === 'video' ? '📹 Video' : '🏥 In-Person'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500">
                    {apt.doctorId?.hospitalName || 'Hospital Clinic'}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-700 pt-1">
                    <span>📅 {apt.date}</span>
                    <span>⏰ {apt.slotTime}</span>
                    <span>Priority: <span className="capitalize">{apt.priority}</span></span>
                  </div>

                  {apt.chiefComplaint && (
                    <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100 mt-2">
                      <strong className="text-slate-700">Complaint:</strong> {apt.chiefComplaint}
                    </p>
                  )}

                  {/* Token Bridge Badge */}
                  {token && (
                    <div className="mt-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-600 text-white font-black text-sm px-3 py-1.5 rounded-lg shadow-sm">
                          Token #{token.tokenNumber}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">
                            Authoritative OPD Queue
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Status: <strong className="capitalize text-blue-700">{token.status}</strong>
                            {token.estimatedWaitTime ? ` • ~${token.estimatedWaitTime} min wait` : ''}
                          </p>
                        </div>
                      </div>
                      <Link
                        to="/display"
                        className="text-xs font-bold text-blue-700 hover:underline bg-white px-2.5 py-1 rounded-lg border border-blue-200 shadow-2xs"
                      >
                        Live Board →
                      </Link>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-row md:flex-col items-center md:items-end gap-2 border-t md:border-t-0 pt-3 md:pt-0">
                  {isToday && apt.status === 'booked' && (
                    <button
                      type="button"
                      onClick={() => handleCheckIn(apt._id)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-sm transition"
                    >
                      Check In Now
                    </button>
                  )}

                  {apt.status === 'booked' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setReschedulingApt(apt);
                          setNewDate(apt.date);
                        }}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl transition"
                      >
                        Reschedule
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCancel(apt._id)}
                        className="bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold px-3 py-2 rounded-xl transition border border-rose-200"
                      >
                        Cancel
                      </button>
                    </>
                  )}

                  {apt.status === 'completed' && (
                    <button
                      type="button"
                      onClick={() => setRatingApt(apt)}
                      className="bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold px-3 py-2 rounded-xl transition border border-amber-200"
                    >
                      ⭐ Rate Doctor
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reschedule Modal */}
      {reschedulingApt && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setReschedulingApt(null)}
              className="absolute top-4 right-4 text-slate-400 font-bold"
            >
              ✕
            </button>
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              Reschedule Appointment
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Pick a new date and slot. Your current slot ({reschedulingApt.slotTime}) will be released.
            </p>

            <div className="space-y-3 mb-5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">New Date</label>
                <input
                  type="date"
                  value={newDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 bg-slate-50"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">New Time Slot</label>
                <select
                  value={newSlotTime}
                  onChange={(e) => setNewSlotTime(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 bg-slate-50"
                >
                  {['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30', '16:00'].map(
                    (t) => (
                      <option key={t} value={t}>{t}</option>
                    )
                  )}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRescheduleSubmit}
              disabled={rescheduleLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 rounded-xl transition disabled:opacity-50"
            >
              {rescheduleLoading ? 'Rescheduling...' : 'Confirm Reschedule'}
            </button>
          </div>
        </div>
      )}

      {/* Rating Modal */}
      {ratingApt && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setRatingApt(null)}
              className="absolute top-4 right-4 text-slate-400 font-bold"
            >
              ✕
            </button>
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              Rate Your Consultation
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              With Dr. {ratingApt.doctorId?.doctorName} on {ratingApt.date}
            </p>

            <div className="mb-4">
              <label className="text-xs font-bold text-slate-700 block mb-1">Rating</label>
              <div className="flex gap-2 text-2xl">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStarRating(s)}
                    className={s <= starRating ? 'text-amber-400' : 'text-slate-200'}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs font-bold text-slate-700 block mb-1">Feedback Comment</label>
              <textarea
                rows={3}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Doctor was helpful and thorough..."
                className="w-full text-xs p-3 border border-slate-300 rounded-xl"
              ></textarea>
            </div>

            <button
              type="button"
              onClick={handleRatingSubmit}
              disabled={ratingLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 rounded-xl transition disabled:opacity-50"
            >
              {ratingLoading ? 'Submitting...' : 'Submit Rating'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
