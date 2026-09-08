import { useState, useEffect } from 'react';

export default function SlotPicker({ doctorId, doctorName, date, onBookSuccess }) {
  const [selectedDate, setSelectedDate] = useState(date || new Date().toISOString().slice(0, 10));
  const [availability, setAvailability] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [mode, setMode] = useState('in-person');
  const [chiefComplaint, setChiefComplaint] = useState('');

  // Fetch real-time availability whenever doctorId or selectedDate changes
  const fetchAvailability = async () => {
    if (!doctorId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctors/${doctorId}/availability?date=${selectedDate}`);
      const data = await res.json();
      if (data.success) {
        setAvailability(data.data);
        setSelectedSlot(null);
      } else {
        setError(data.error || 'Failed to fetch doctor availability');
      }
    } catch (err) {
      setError('Network error fetching slots');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailability();
  }, [doctorId, selectedDate]);

  // Handle server-enforced booking
  const handleBook = async () => {
    if (!selectedSlot) return;
    setBookingLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId,
          patientId: '65f000000000000000000001', // Patient demo ID (or logged in user)
          date: selectedDate,
          slotTime: selectedSlot.time,
          mode,
          chiefComplaint,
          priority: 'routine',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to book slot');
      }

      setSuccessMsg(`✓ Booked successfully for ${selectedDate} at ${selectedSlot.time}!`);
      // Immediately refresh slots so newly booked slot appears unavailable!
      await fetchAvailability();
      if (onBookSuccess) onBookSuccess(data.data);
    } catch (err) {
      setError(err.message);
      // Refresh to update slot statuses in case someone else booked it
      fetchAvailability();
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-5">
        <div>
          <h3 className="text-lg font-bold text-slate-800">
            Select Appointment Slot
          </h3>
          <p className="text-xs text-slate-500">
            {doctorName ? `with Dr. ${doctorName}` : 'Choose date and available time'}
          </p>
        </div>

        {/* Date Selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600">Date:</label>
          <input
            type="date"
            value={selectedDate}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-sm font-medium border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {loading && (
        <div className="py-8 text-center text-slate-400 text-sm">
          Checking real-time doctor availability...
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs font-medium">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs font-semibold">
          {successMsg}
        </div>
      )}

      {!loading && availability && (
        <div>
          {!availability.isAvailable ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">
              <p className="font-semibold">Unavailable on {selectedDate}</p>
              <p className="text-xs mt-1 text-amber-700">
                {availability.reason || 'Doctor has no working hours scheduled for this day.'}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3 text-xs text-slate-500">
                <span>
                  {availability.openSlotsCount} of {availability.totalSlotsCount} slots available
                </span>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span> Open
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block"></span> Booked
                  </span>
                </div>
              </div>

              {/* Slot grid */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 mb-6">
                {availability.slots.map((slot) => {
                  const isSelected = selectedSlot?.time === slot.time;
                  let btnClass = 'border py-2 px-1 text-center rounded-xl text-xs font-semibold transition-all ';

                  if (slot.isBooked) {
                    btnClass += 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed line-through';
                  } else if (slot.isPast) {
                    btnClass += 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed';
                  } else if (isSelected) {
                    btnClass += 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200';
                  } else {
                    btnClass += 'bg-emerald-50/50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 cursor-pointer';
                  }

                  return (
                    <button
                      key={slot.time}
                      type="button"
                      disabled={!slot.isAvailable}
                      onClick={() => setSelectedSlot(slot)}
                      className={btnClass}
                      title={slot.isBooked ? 'Slot already booked' : slot.isPast ? 'Slot has passed' : 'Available'}
                    >
                      {slot.time}
                    </button>
                  );
                })}
              </div>

              {/* Booking Details Section */}
              {selectedSlot && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">
                      Selected Slot: <strong className="text-blue-700 font-bold">{selectedSlot.time}</strong>
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setMode('in-person')}
                        className={`text-xs px-2.5 py-1 rounded-lg font-medium transition ${
                          mode === 'in-person' ? 'bg-slate-800 text-white' : 'bg-white border text-slate-600'
                        }`}
                      >
                        In-Person
                      </button>
                      {availability.videoEnabled && (
                        <button
                          type="button"
                          onClick={() => setMode('video')}
                          className={`text-xs px-2.5 py-1 rounded-lg font-medium transition ${
                            mode === 'video' ? 'bg-blue-600 text-white' : 'bg-white border text-slate-600'
                          }`}
                        >
                          Video
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Chief Complaint / Reason for Visit
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Fever and persistent cough"
                      value={chiefComplaint}
                      onChange={(e) => setChiefComplaint(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleBook}
                    disabled={bookingLoading}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition disabled:opacity-50"
                  >
                    {bookingLoading ? 'Confirming with Server...' : `Confirm Booking at ${selectedSlot.time}`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
