import { useState, useEffect } from 'react';
import SlotPicker from '../components/SlotPicker';

export default function FindDoctors() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [specialty, setSpecialty] = useState('');
  const [preference, setPreference] = useState('balanced');
  const [maxFee, setMaxFee] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeDoctorForBooking, setActiveDoctorForBooking] = useState(null);
  const [ratingModalDoc, setRatingModalDoc] = useState(null);
  const [starRating, setStarRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [ratingStatus, setRatingStatus] = useState(null);

  // Fetch doctors and recommendations
  const fetchDoctors = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch daily listing for selected date
      const listingRes = await fetch(
        `/api/doctors/daily-listing?date=${selectedDate}&specialty=${encodeURIComponent(specialty)}&maxFee=${maxFee}`
      );
      const listingData = await listingRes.json();

      // 2. Fetch AI / Bayesian ranked recommendations
      const recRes = await fetch(
        `/api/recommendations?specialty=${encodeURIComponent(specialty)}&preference=${preference}&maxFee=${maxFee}&lat=28.6139&lng=77.2090`
      );
      const recData = await recRes.json();

      // Merge availability data with recommendation scores
      const recMap = new Map();
      if (recData.success && Array.isArray(recData.data)) {
        recData.data.forEach((item) => {
          const id = item.doctor?._id || item.doctor?.id || item.id;
          recMap.set(String(id), item);
        });
      }

      if (listingData.success && Array.isArray(listingData.data)) {
        const combined = listingData.data.map((doc) => {
          const rec = recMap.get(String(doc.id));
          return {
            ...doc,
            score: rec ? rec.score : 70,
            recommendedBecause: rec?.recommendedBecause || ['✓ Practicing specialist'],
            distanceKm: rec?.distanceKm ?? null,
          };
        });

        // Sort by recommendation score descending
        combined.sort((a, b) => b.score - a.score);
        setDoctors(combined);
      }
    } catch (err) {
      setError('Unable to fetch doctors list. Please check connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctors();
  }, [selectedDate, specialty, preference, maxFee]);

  // Handle rating submission
  const handleSubmitRating = async () => {
    if (!ratingModalDoc) return;
    setRatingStatus({ loading: true });
    try {
      const res = await fetch('/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: ratingModalDoc.id,
          patientId: '65f000000000000000000001',
          appointmentId: '65f000000000000000000099', // Demo completed appointment ID
          rating: Number(starRating),
          comment: reviewComment,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRatingStatus({ success: true, msg: 'Rating submitted! Aggregates safely updated.' });
        setTimeout(() => {
          setRatingModalDoc(null);
          setRatingStatus(null);
          fetchDoctors();
        }, 1500);
      } else {
        setRatingStatus({ error: data.error || 'Failed to submit rating' });
      }
    } catch (e) {
      setRatingStatus({ error: 'Network error submitting rating' });
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-4 space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-600 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-blue-100">
            MediQueue+ Discovery & Scheduling
          </span>
          <h1 className="text-3xl font-extrabold mt-3 tracking-tight">
            Find Doctors & Book Real-Time Slots
          </h1>
          <p className="text-blue-100 text-sm mt-2 leading-relaxed">
            Personalized Bayesian recommendations based on specialty match, verified rating quality, distance, and daily open slots.
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {/* Date Filter */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Select Date</label>
          <input
            type="date"
            value={selectedDate}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 bg-slate-50 font-medium focus:bg-white focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Specialty Filter */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Specialty</label>
          <select
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 bg-slate-50 font-medium focus:bg-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Specialties</option>
            <option value="Cardiology">Cardiology</option>
            <option value="Neurology">Neurology</option>
            <option value="Orthopedics">Orthopedics</option>
            <option value="Pediatrics">Pediatrics</option>
            <option value="General Medicine">General Medicine</option>
          </select>
        </div>

        {/* Sorting / Preference */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Prioritize By</label>
          <select
            value={preference}
            onChange={(e) => setPreference(e.target.value)}
            className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 bg-slate-50 font-medium focus:bg-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="balanced">Recommended (AI Composite)</option>
            <option value="rating">Rating Quality (Bayesian)</option>
            <option value="distance">Nearest Distance</option>
            <option value="fee">Most Affordable Fee</option>
            <option value="availability">Highest Availability</option>
          </select>
        </div>

        {/* Max Fee */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Max Consultation Fee</label>
          <input
            type="number"
            placeholder="e.g. 1000"
            value={maxFee}
            onChange={(e) => setMaxFee(e.target.value)}
            className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 bg-slate-50 font-medium focus:bg-white focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {loading && (
        <div className="py-12 text-center text-slate-400 text-sm font-medium">
          Loading doctors and calculating daily availability...
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
          {error}
        </div>
      )}

      {/* Doctor Cards Listing */}
      {!loading && doctors.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {doctors.map((doc) => (
            <div
              key={doc.id}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-base text-slate-900">Dr. {doc.name}</h3>
                      {doc.score >= 80 && (
                        <span className="bg-blue-100 text-blue-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wide">
                          Top Pick ({doc.score} pts)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-blue-600 font-semibold mt-0.5">{doc.specialty}</p>
                    <p className="text-xs text-slate-500">{doc.hospitalName}</p>
                  </div>

                  {/* Rating Badge */}
                  <div className="text-right">
                    <div className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200 px-2 py-1 rounded-xl text-xs font-bold">
                      ⭐ {doc.avgRating ? doc.avgRating.toFixed(1) : 'New'}
                      <span className="text-amber-700 font-normal text-[11px]">
                        ({doc.ratingCount || 0})
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Fee: <strong className="text-slate-700 font-bold">₹{doc.consultationFee}</strong>
                    </div>
                  </div>
                </div>

                {/* Explainability Block */}
                <div className="mt-4 bg-slate-50 border border-slate-150 rounded-xl p-3">
                  <div className="text-[11px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                    Recommended because:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {doc.recommendedBecause.map((reason, rIdx) => (
                      <span
                        key={rIdx}
                        className="inline-block bg-white border border-slate-200 text-slate-700 text-[11px] font-medium px-2 py-0.5 rounded-lg"
                      >
                        {reason}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Live Availability Status */}
                <div className="mt-4 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Availability on {selectedDate}:</span>
                  {doc.isAvailable ? (
                    <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 font-bold px-2 py-0.5 rounded-lg">
                      {doc.openSlotsCount} Open Slots
                    </span>
                  ) : (
                    <span className="text-rose-700 bg-rose-50 border border-rose-200 font-semibold px-2 py-0.5 rounded-lg">
                      {doc.reason || 'No Open Slots'}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveDoctorForBooking(doc)}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-sm transition text-center"
                >
                  Choose Available Slot →
                </button>
                <button
                  type="button"
                  onClick={() => setRatingModalDoc(doc)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs px-3 py-2.5 rounded-xl transition"
                >
                  Rate
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Slot Picker Modal / Drawer */}
      {activeDoctorForBooking && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <button
              type="button"
              onClick={() => setActiveDoctorForBooking(null)}
              className="absolute top-4 right-4 bg-slate-100 hover:bg-slate-200 rounded-full w-8 h-8 flex items-center justify-center text-slate-600 font-bold text-sm"
            >
              ✕
            </button>
            <div className="p-2">
              <SlotPicker
                doctorId={activeDoctorForBooking.id}
                doctorName={activeDoctorForBooking.name}
                date={selectedDate}
                onBookSuccess={() => {
                  fetchDoctors();
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Rating Modal */}
      {ratingModalDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setRatingModalDoc(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold"
            >
              ✕
            </button>
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              Rate Dr. {ratingModalDoc.name}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Share your feedback following your completed appointment.
            </p>

            {ratingStatus?.error && (
              <div className="mb-3 p-2.5 bg-red-50 text-red-700 text-xs rounded-xl font-medium">
                {ratingStatus.error}
              </div>
            )}
            {ratingStatus?.success && (
              <div className="mb-3 p-2.5 bg-emerald-50 text-emerald-700 text-xs rounded-xl font-semibold">
                {ratingStatus.msg}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Rating (1–5 Stars)
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setStarRating(star)}
                    className={`text-2xl transition ${
                      star <= starRating ? 'text-amber-400 scale-110' : 'text-slate-200'
                    }`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Optional Comment
              </label>
              <textarea
                rows={3}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Doctor was punctual, thorough, and answered all questions..."
                className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              ></textarea>
            </div>

            <button
              type="button"
              onClick={handleSubmitRating}
              disabled={ratingStatus?.loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 rounded-xl transition disabled:opacity-50"
            >
              {ratingStatus?.loading ? 'Submitting...' : 'Submit Rating'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
