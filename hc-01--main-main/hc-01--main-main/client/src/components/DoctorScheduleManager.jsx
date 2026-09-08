import { useState, useEffect } from 'react';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export default function DoctorScheduleManager({ doctorId = '65f000000000000000000002' }) {
  const [slotDuration, setSlotDuration] = useState(30);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [weeklySchedule, setWeeklySchedule] = useState(
    DAYS.map((day) => ({
      day,
      isWorking: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].includes(day),
      startTime: '09:00',
      endTime: '17:00',
      breaks: [{ startTime: '13:00', endTime: '14:00', reason: 'Lunch' }],
      videoEnabled: false,
    }))
  );
  const [leaves, setLeaves] = useState([]);
  const [newLeave, setNewLeave] = useState({ startDate: '', endDate: '', reason: '' });
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  // Fetch doctor profile to load schedule
  useEffect(() => {
    const loadSchedule = async () => {
      try {
        const res = await fetch(`/api/doctors/${doctorId}`);
        const json = await res.json();
        if (json.success && json.data) {
          const doc = json.data;
          if (doc.slotDuration) setSlotDuration(doc.slotDuration);
          if (doc.videoEnabled !== undefined) setVideoEnabled(doc.videoEnabled);
          if (doc.weeklySchedule && doc.weeklySchedule.length > 0) {
            setWeeklySchedule(doc.weeklySchedule);
          }
          if (doc.leaves) setLeaves(doc.leaves);
        }
      } catch (e) {
        // Fallback to default
      }
    };
    loadSchedule();
  }, [doctorId]);

  const handleDayToggle = (index) => {
    const updated = [...weeklySchedule];
    updated[index].isWorking = !updated[index].isWorking;
    setWeeklySchedule(updated);
  };

  const handleTimeChange = (index, field, value) => {
    const updated = [...weeklySchedule];
    updated[index][field] = value;
    setWeeklySchedule(updated);
  };

  const handleAddLeave = () => {
    if (!newLeave.startDate || !newLeave.endDate) return;
    setLeaves([...leaves, { ...newLeave }]);
    setNewLeave({ startDate: '', endDate: '', reason: '' });
  };

  const handleRemoveLeave = (idx) => {
    setLeaves(leaves.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setLoading(true);
    setSaveStatus(null);
    try {
      const res = await fetch(`/api/doctors/${doctorId}/schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotDuration,
          weeklySchedule,
          leaves,
          videoEnabled,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaveStatus({ type: 'success', msg: 'Schedule updated and saved successfully!' });
      } else {
        setSaveStatus({ type: 'error', msg: data.error || 'Failed to save schedule' });
      }
    } catch (err) {
      setSaveStatus({ type: 'error', msg: 'Network error saving schedule' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm max-w-4xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Doctor Schedule & Availability</h2>
          <p className="text-xs text-slate-500">Configure your weekly hours, appointment slot duration, and leave periods</p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md transition disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save Schedule'}
        </button>
      </div>

      {saveStatus && (
        <div
          className={`mb-5 p-3 rounded-xl text-xs font-semibold ${
            saveStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {saveStatus.msg}
        </div>
      )}

      {/* Global Controls: Slot Duration & Video */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Slot Duration (minutes)
          </label>
          <select
            value={slotDuration}
            onChange={(e) => setSlotDuration(Number(e.target.value))}
            className="text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white w-full font-medium"
          >
            <option value={15}>15 Minutes</option>
            <option value={20}>20 Minutes</option>
            <option value={30}>30 Minutes (Standard)</option>
            <option value={45}>45 Minutes</option>
            <option value={60}>60 Minutes</option>
          </select>
        </div>

        <div className="flex items-center justify-between pt-4 sm:pt-2">
          <div>
            <div className="text-xs font-bold text-slate-700">Video Consultations</div>
            <div className="text-[11px] text-slate-500">Allow patients to book remote video appointments</div>
          </div>
          <input
            type="checkbox"
            checked={videoEnabled}
            onChange={(e) => setVideoEnabled(e.target.checked)}
            className="w-5 h-5 text-blue-600 rounded"
          />
        </div>
      </div>

      {/* Weekly Hours */}
      <div className="mb-6">
        <h3 className="text-sm font-bold text-slate-800 mb-3">Weekly Working Hours</h3>
        <div className="space-y-2">
          {weeklySchedule.map((sched, idx) => (
            <div
              key={sched.day}
              className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border text-xs gap-3 ${
                sched.isWorking ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 text-slate-400'
              }`}
            >
              <div className="flex items-center gap-3 w-32">
                <input
                  type="checkbox"
                  checked={sched.isWorking}
                  onChange={() => handleDayToggle(idx)}
                  className="rounded text-blue-600 w-4 h-4"
                />
                <span className="font-semibold capitalize text-slate-800">{sched.day}</span>
              </div>

              {sched.isWorking ? (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500 text-[11px]">Hours:</span>
                    <input
                      type="time"
                      value={sched.startTime}
                      onChange={(e) => handleTimeChange(idx, 'startTime', e.target.value)}
                      className="border border-slate-300 rounded px-2 py-1 text-xs"
                    />
                    <span>to</span>
                    <input
                      type="time"
                      value={sched.endTime}
                      onChange={(e) => handleTimeChange(idx, 'endTime', e.target.value)}
                      className="border border-slate-300 rounded px-2 py-1 text-xs"
                    />
                  </div>

                  <div className="flex items-center gap-1 ml-2 text-slate-500">
                    <span>(Break: 13:00 - 14:00)</span>
                  </div>
                </div>
              ) : (
                <span className="text-xs italic text-slate-400">Day Off / Closed</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Leaves & Holidays */}
      <div>
        <h3 className="text-sm font-bold text-slate-800 mb-3">Scheduled Leaves & Time Off</h3>
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 mb-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block">Start Date</label>
              <input
                type="date"
                value={newLeave.startDate}
                onChange={(e) => setNewLeave({ ...newLeave, startDate: e.target.value })}
                className="text-xs border border-slate-300 rounded px-2 py-1.5 w-full bg-white"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block">End Date</label>
              <input
                type="date"
                value={newLeave.endDate}
                onChange={(e) => setNewLeave({ ...newLeave, endDate: e.target.value })}
                className="text-xs border border-slate-300 rounded px-2 py-1.5 w-full bg-white"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block">Reason</label>
              <input
                type="text"
                placeholder="e.g. Medical conference"
                value={newLeave.reason}
                onChange={(e) => setNewLeave({ ...newLeave, reason: e.target.value })}
                className="text-xs border border-slate-300 rounded px-2 py-1.5 w-full bg-white"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleAddLeave}
            className="text-xs bg-slate-800 hover:bg-slate-900 text-white font-semibold px-3 py-1.5 rounded-lg transition"
          >
            + Add Leave Period
          </button>
        </div>

        {leaves.length > 0 && (
          <div className="space-y-1.5">
            {leaves.map((l, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs"
              >
                <div>
                  <span className="font-semibold text-slate-700">
                    {new Date(l.startDate).toLocaleDateString()} to {new Date(l.endDate).toLocaleDateString()}
                  </span>
                  <span className="ml-2 text-slate-500 italic">— {l.reason}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveLeave(i)}
                  className="text-red-500 hover:text-red-700 font-bold text-xs"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
