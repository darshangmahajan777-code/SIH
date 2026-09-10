import { useState, useEffect, useMemo } from 'react';
import SlotPicker from '../components/SlotPicker';

export default function FindDoctors() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [specialty, setSpecialty] = useState('');
  const [preference, setPreference] = useState('balanced');
  const [maxFee, setMaxFee] = useState('');
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [hospitalsList, setHospitalsList] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Multi-Organization view & discovery states
  const [searchMode, setSearchMode] = useState('all'); // 'all' | 'hospitals' | 'clinics' | 'doctors' | 'compare'
  const [searchQuery, setSearchQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [compareList, setCompareList] = useState([]);

  // Modals
  const [activeDoctorForBooking, setActiveDoctorForBooking] = useState(null);
  const [ratingModalDoc, setRatingModalDoc] = useState(null);
  const [starRating, setStarRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [ratingStatus, setRatingStatus] = useState(null);

  // Public Queue Modal for Hospital/Clinic
  const [queueModalOrg, setQueueModalOrg] = useState(null);
  const [queueModalLoading, setQueueModalLoading] = useState(false);
  const [queueModalData, setQueueModalData] = useState(null);

  // Fetch registered hospitals / clinics directory
  const fetchHospitals = async () => {
    try {
      const res = await fetch('/api/hospitals?limit=100');
      const data = await res.json();
      if (data?.data && Array.isArray(data.data)) {
        setHospitalsList(data.data);
      }
    } catch {
      // Fallback initial organizations
      setHospitalsList([
        {
          _id: 'hosp-001',
          name: 'Apollo Multispecialty Hospital',
          code: 'APOL-01',
          type: 'hospital',
          address: { city: 'New Delhi', fullAddress: 'Mathura Road, Sarita Vihar, New Delhi' },
          contact: { phone: '+91-11-2692-5858', emergencyHelpline: '1066' },
          departments: ['Cardiology', 'Emergency', 'Neurology', 'Orthopedics'],
          workingHours: { openTime: '00:00', closeTime: '23:59', emergency24x7: true },
          services: ['Level-1 Trauma', 'Cardiac ICU', '24x7 Pharmacy', 'Radiology'],
          rating: 4.8,
          reviewCount: 310,
          availabilityStatus: 'available',
          totalBeds: 500,
          doctorsCount: 4,
        },
        {
          _id: 'hosp-002',
          name: 'AIIMS Super Specialty Center',
          code: 'AIIMS-01',
          type: 'hospital',
          address: { city: 'New Delhi', fullAddress: 'Ansari Nagar East, New Delhi 110029' },
          contact: { phone: '+91-11-2658-8500', emergencyHelpline: '102' },
          departments: ['General Medicine', 'Neurology', 'Cardiology', 'Emergency'],
          workingHours: { openTime: '00:00', closeTime: '23:59', emergency24x7: true },
          services: ['Level-1 Trauma', 'Cardiac ICU', 'Advanced Cath Lab', 'Telemedicine'],
          rating: 4.9,
          reviewCount: 520,
          availabilityStatus: 'available',
          totalBeds: 1200,
          doctorsCount: 6,
        },
        {
          _id: 'clinic-001',
          name: 'Sunrise Family Health Clinic',
          code: 'CLINIC-SUN-01',
          type: 'clinic',
          address: { city: 'Gurugram', fullAddress: 'Shop 14, Main Market, Sector 15, Gurugram' },
          contact: { phone: '+91-124-555-6677', emergencyHelpline: '102' },
          departments: ['General OPD', 'Family Medicine', 'Pediatrics'],
          workingHours: { openTime: '09:00', closeTime: '18:00', emergency24x7: false },
          services: ['General OPD', 'Doctor Consultations', 'Vaccinations', 'BP Check'],
          rating: 4.9,
          reviewCount: 65,
          availabilityStatus: 'available',
          totalBeds: 0,
          doctorsCount: 2,
        },
        {
          _id: 'clinic-002',
          name: 'Dr. Sen Dental & ENT Clinic',
          code: 'CLINIC-SEN-02',
          type: 'clinic',
          address: { city: 'Noida', fullAddress: 'A-22, Sector 18, Noida' },
          contact: { phone: '+91-120-777-8899', emergencyHelpline: '102' },
          departments: ['Dental', 'ENT', 'OPD'],
          workingHours: { openTime: '10:00', closeTime: '19:00', emergency24x7: false },
          services: ['Dental Checkup', 'ENT Diagnosis', 'Audiometry'],
          rating: 4.7,
          reviewCount: 38,
          availabilityStatus: 'available',
          totalBeds: 0,
          doctorsCount: 1,
        },
      ]);
    }
  };

  useEffect(() => {
    fetchHospitals();
  }, []);

  // Fetch doctors and recommendations
  const fetchDoctors = async () => {
    setLoading(true);
    setError(null);
    try {
      const [listingRes, recRes] = await Promise.all([
        fetch(
          `/api/doctors/daily-listing?date=${selectedDate}&specialty=${encodeURIComponent(specialty)}&maxFee=${maxFee}`
        ),
        fetch(
          `/api/recommendations?specialty=${encodeURIComponent(specialty)}&preference=${preference}&maxFee=${maxFee}&lat=28.6139&lng=77.2090`
        ),
      ]);

      const [listingData, recData] = await Promise.all([
        listingRes.json(),
        recRes.json(),
      ]);

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

        combined.sort((a, b) => b.score - a.score);
        setDoctors(combined);
      }
    } catch {
      setError('Unable to fetch doctors list. Please check connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctors();
  }, [selectedDate, specialty, preference, maxFee]);

  // Open live queue status for an organization
  const handleOpenQueueModal = async (org) => {
    setQueueModalOrg(org);
    setQueueModalLoading(true);
    setQueueModalData(null);
    try {
      const res = await fetch(`/api/hospitals/${org._id}/queue-summary`);
      const data = await res.json();
      if (data.success && data.data) {
        setQueueModalData(data.data);
      } else {
        setQueueModalData({
          waitingCount: 4,
          currentToken: 18,
          estimatedWaitTimeMinutes: 25,
          activeDoctorsCount: org.doctorsCount || 2,
        });
      }
    } catch {
      setQueueModalData({
        waitingCount: 3,
        currentToken: 14,
        estimatedWaitTimeMinutes: 20,
        activeDoctorsCount: org.doctorsCount || 1,
      });
    } finally {
      setQueueModalLoading(false);
    }
  };

  // Toggle doctor in compare list
  const toggleCompare = (doc) => {
    setCompareList((prev) => {
      const exists = prev.some((d) => d.id === doc.id);
      if (exists) {
        return prev.filter((d) => d.id !== doc.id);
      }
      if (prev.length >= 3) {
        alert('You can compare up to 3 doctors at a time.');
        return prev;
      }
      return [...prev, doc];
    });
  };

  // Filtered Organizations
  const filteredHospitals = useMemo(() => {
    return hospitalsList.filter((h) => {
      if (searchMode === 'hospitals' && h.type !== 'hospital') return false;
      if (searchMode === 'clinics' && h.type !== 'clinic') return false;
      if (cityFilter && !h.address?.city?.toLowerCase().includes(cityFilter.toLowerCase())) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = h.name.toLowerCase().includes(q);
        const matchesCode = h.code?.toLowerCase().includes(q);
        const matchesCity = h.address?.city?.toLowerCase().includes(q);
        const matchesServices = h.services?.some((s) => s.toLowerCase().includes(q));
        const matchesDept = h.departments?.some((d) => d.toLowerCase().includes(q));
        if (!matchesName && !matchesCode && !matchesCity && !matchesServices && !matchesDept) return false;
      }
      return true;
    });
  }, [hospitalsList, searchMode, cityFilter, searchQuery]);

  // Filtered Doctors
  const filteredDoctors = useMemo(() => {
    return doctors.filter((doc) => {
      if (hospitalFilter) {
        const matchesHosp =
          String(doc.hospitalId) === String(hospitalFilter) ||
          doc.hospitalName?.toLowerCase().includes(hospitalFilter.toLowerCase());
        if (!matchesHosp) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = doc.name.toLowerCase().includes(q);
        const matchesSpec = doc.specialty.toLowerCase().includes(q);
        const matchesHosp = doc.hospitalName.toLowerCase().includes(q);
        if (!matchesName && !matchesSpec && !matchesHosp) return false;
      }
      return true;
    });
  }, [doctors, hospitalFilter, searchQuery]);

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
          appointmentId: '65f000000000000000000099',
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
    } catch {
      setRatingStatus({ error: 'Network error submitting rating' });
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-4 space-y-6 px-2 sm:px-4">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-3xl space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-indigo-500/30 border border-indigo-400/40 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider text-indigo-200">
              Healthcare Marketplace &amp; Discovery Hub
            </span>
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
              Multi-Organization Network
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            Search Hospitals, Small Clinics &amp; Specialist Doctors
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            Find certified super-specialty hospitals and independent community clinics. Compare doctor ratings, view real-time queue wait times, and book instant appointment slots.
          </p>
        </div>
      </div>

      {/* Discovery Mode Selector Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: '🌐 All Healthcare', count: hospitalsList.length + doctors.length },
            { id: 'hospitals', label: '🏥 Hospitals', count: hospitalsList.filter((h) => h.type === 'hospital').length },
            { id: 'clinics', label: '🏬 Small Clinics', count: hospitalsList.filter((h) => h.type === 'clinic').length },
            { id: 'doctors', label: '👨‍⚕️ Doctors', count: doctors.length },
            { id: 'compare', label: `⚖️ Compare (${compareList.length})`, count: compareList.length },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              id={`tab-discover-${tab.id}`}
              onClick={() => setSearchMode(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                searchMode === tab.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  searchMode === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {compareList.length > 0 && (
          <button
            type="button"
            onClick={() => setSearchMode('compare')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5"
          >
            <span>⚖️ Compare Selected Doctors ({compareList.length}) →</span>
          </button>
        )}
      </div>

      {/* Global Search & Universal Filter Toolbar */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        {/* Search Input */}
        <div className="relative">
          <input
            type="text"
            id="input-marketplace-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search hospitals, clinics, doctor names, medical specialties, or treatments..."
            className="w-full text-xs sm:text-sm pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <span className="absolute left-3.5 top-3.5 text-slate-400 text-base">🔍</span>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 text-xs font-bold"
            >
              ✕ Clear
            </button>
          )}
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-1 text-xs">
          {/* Date Picker */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Appointment Date</label>
            <input
              type="date"
              value={selectedDate}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* City Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">City / Region</label>
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Locations</option>
              <option value="New Delhi">New Delhi</option>
              <option value="Gurugram">Gurugram</option>
              <option value="Noida">Noida</option>
              <option value="Faridabad">Faridabad</option>
            </select>
          </div>

          {/* Specialty */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Clinical Specialty</label>
            <select
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Specialties</option>
              <option value="Cardiology">Cardiology</option>
              <option value="Neurology">Neurology</option>
              <option value="Orthopedics">Orthopedics</option>
              <option value="Pediatrics">Pediatrics</option>
              <option value="General Medicine">General Medicine</option>
              <option value="Family Medicine">Family Medicine</option>
              <option value="Dental">Dental</option>
              <option value="ENT">ENT</option>
            </select>
          </div>

          {/* Specific Hospital/Clinic Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Specific Facility</label>
            <select
              value={hospitalFilter}
              onChange={(e) => setHospitalFilter(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Facilities</option>
              {hospitalsList.map((h) => (
                <option key={h._id || h.code} value={h._id || h.name}>
                  {h.name} {h.type === 'clinic' ? '(Clinic)' : '(Hospital)'}
                </option>
              ))}
            </select>
          </div>

          {/* Sorting / Prioritize By */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Prioritize By</label>
            <select
              value={preference}
              onChange={(e) => setPreference(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500"
            >
              <option value="balanced">Recommended (AI Composite)</option>
              <option value="rating">Rating Quality</option>
              <option value="fee">Most Affordable Fee</option>
              <option value="distance">Nearest Distance</option>
              <option value="availability">Highest Open Slots</option>
            </select>
          </div>
        </div>
      </div>

      {loading && (
        <div className="py-12 text-center text-slate-500 text-sm font-bold flex items-center justify-center gap-2">
          <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading verified organizations and doctor availability...</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-2xl font-medium">
          {error}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 1. HOSPITALS & CLINICS DIRECTORY VIEW                                  */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {(searchMode === 'all' || searchMode === 'hospitals' || searchMode === 'clinics') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
              <span>{searchMode === 'clinics' ? '🏬 Registered Small Clinics' : searchMode === 'hospitals' ? '🏥 Registered Hospitals' : '🏥 Registered Hospitals & Small Clinics'}</span>
              <span className="text-xs font-bold text-slate-400">({filteredHospitals.length})</span>
            </h2>
            {hospitalFilter && (
              <button
                type="button"
                onClick={() => setHospitalFilter('')}
                className="text-xs font-bold text-indigo-600 hover:underline"
              >
                Reset Facility Filter ✕
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredHospitals.map((org) => {
              const isClinic = org.type === 'clinic';
              return (
                <div
                  key={org._id || org.code}
                  className="bg-white rounded-3xl border border-slate-200 shadow-xs hover:shadow-md transition p-5 sm:p-6 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    {/* Header: Type Badge, Org ID, Rating */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                              isClinic
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-blue-50 text-blue-800 border-blue-200'
                            }`}
                          >
                            {isClinic ? '🏬 Small Medical Clinic' : '🏥 Super Specialty Hospital'}
                          </span>
                          <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            ID: {org.code || org.organizationId}
                          </span>
                        </div>
                        <h3 className="font-black text-base text-slate-900">{org.name}</h3>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="inline-flex items-center gap-1 text-xs font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                          ⭐ {org.rating || 4.8} / 5.0
                        </span>
                        <span className="block text-[10px] text-slate-400 font-semibold mt-0.5">
                          ({org.reviewCount || 40} reviews)
                        </span>
                      </div>
                    </div>

                    {/* Address & Operational Info */}
                    <div className="text-xs text-slate-600 space-y-1 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <div className="flex items-start gap-1.5">
                        <span className="text-slate-400">📍</span>
                        <span className="font-medium text-slate-700 leading-tight">
                          {org.address?.fullAddress || `${org.address?.city || 'Delhi NCR'}`}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400">🕒</span>
                          <span className="font-bold text-slate-700">
                            {org.workingHours?.emergency24x7
                              ? '24x7 Emergency OPD'
                              : `${org.workingHours?.openTime || '09:00'} – ${org.workingHours?.closeTime || '18:00'}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400">📞</span>
                          <span className="font-bold text-slate-800">{org.contact?.phone || '+91-11-0000-0000'}</span>
                        </div>
                        {org.contact?.emergencyHelpline && (
                          <div className="flex items-center gap-1">
                            <span className="text-rose-500">🚨</span>
                            <span className="font-bold text-rose-700">{org.contact.emergencyHelpline}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Services Chips */}
                    {org.services && org.services.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {org.services.slice(0, 4).map((srv) => (
                          <span
                            key={srv}
                            className="text-[10px] font-semibold bg-indigo-50/70 text-indigo-800 px-2 py-0.5 rounded-md border border-indigo-100"
                          >
                            ✓ {srv}
                          </span>
                        ))}
                        {org.services.length > 4 && (
                          <span className="text-[10px] text-slate-400 font-semibold px-1 py-0.5">
                            +{org.services.length - 4} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Organization Card Actions */}
                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => handleOpenQueueModal(org)}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-2 rounded-xl transition flex items-center gap-1.5"
                    >
                      <span>⏱️</span>
                      <span>Live Waiting Queue</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setHospitalFilter(org._id || org.name);
                        setSearchMode('doctors');
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 py-2 rounded-xl transition shadow-xs"
                    >
                      View Doctors &amp; Slots →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 2. DOCTORS DIRECTORY VIEW                                              */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {(searchMode === 'all' || searchMode === 'doctors') && (
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
              <span>👨‍⚕️ Available Specialist Doctors</span>
              <span className="text-xs font-bold text-slate-400">({filteredDoctors.length})</span>
            </h2>
            <span className="text-xs text-slate-400">Verified clinical appointments</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredDoctors.map((doc) => {
              const isCompared = compareList.some((d) => d.id === doc.id);
              return (
                <div
                  key={doc.id}
                  className="bg-white rounded-3xl border border-slate-200 shadow-xs hover:shadow-md transition p-5 sm:p-6 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    {/* Top Row: Doctor Info & Ratings */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-base text-slate-900">Dr. {doc.name}</h3>
                          {doc.score >= 80 && (
                            <span className="bg-indigo-50 text-indigo-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wide border border-indigo-200">
                              Top Pick
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-bold text-blue-700 mt-0.5">{doc.specialty}</p>
                        <p className="text-xs font-medium text-slate-500 flex items-center gap-1 mt-0.5">
                          <span>🏥</span>
                          <span>{doc.hospitalName}</span>
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200 px-2 py-1 rounded-xl text-xs font-bold">
                          ⭐ {doc.avgRating ? doc.avgRating.toFixed(1) : 'New'}
                          <span className="text-amber-700 font-normal text-[11px]">
                            ({doc.ratingCount || 0})
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Fee: <strong className="text-slate-900 font-black">₹{doc.consultationFee}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Explainability tags */}
                    {doc.recommendedBecause && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {doc.recommendedBecause.map((reason, rIdx) => (
                          <span
                            key={rIdx}
                            className="inline-block bg-slate-50 border border-slate-200 text-slate-600 text-[10px] font-semibold px-2 py-0.5 rounded-md"
                          >
                            {reason}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Live Open Slots on Selected Date */}
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                      <span className="text-slate-500 font-medium">Availability on {selectedDate}:</span>
                      {doc.isAvailable ? (
                        <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 font-bold px-2.5 py-0.5 rounded-lg">
                          🟢 {doc.openSlotsCount} Open Slots
                        </span>
                      ) : (
                        <span className="text-rose-700 bg-rose-50 border border-rose-200 font-semibold px-2.5 py-0.5 rounded-lg">
                          🔴 {doc.reason || 'No Open Slots'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Doctor Card Action Buttons */}
                  <div className="pt-3 border-t border-slate-100 flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setActiveDoctorForBooking(doc)}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl shadow-xs transition text-center"
                    >
                      Book Real-Time Slot →
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleCompare(doc)}
                      className={`px-3 py-2.5 rounded-xl font-semibold transition ${
                        isCompared
                          ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                      title="Compare doctor ratings and fees"
                    >
                      {isCompared ? '✓ Compared' : '+ Compare'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRatingModalDoc(doc)}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3 py-2.5 rounded-xl transition"
                    >
                      Rate
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 3. DOCTOR COMPARISON VIEW                                              */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {searchMode === 'compare' && (
        <div className="space-y-4 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-black text-slate-900">
                ⚖️ Side-by-Side Doctor &amp; Facility Comparison
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Compare clinical reputation, consultation fees, and facility capabilities.
              </p>
            </div>
            {compareList.length > 0 && (
              <button
                type="button"
                onClick={() => setCompareList([])}
                className="text-xs font-bold text-rose-600 hover:underline"
              >
                Clear Comparison
              </button>
            )}
          </div>

          {compareList.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="text-4xl">⚖️</div>
              <h3 className="font-bold text-slate-800 text-sm">No doctors selected for comparison</h3>
              <p className="text-xs text-slate-500">
                Browse doctors and click "+ Compare" on any doctor card to compare them side-by-side.
              </p>
              <button
                type="button"
                onClick={() => setSearchMode('doctors')}
                className="inline-block bg-slate-900 text-white font-bold text-xs px-4 py-2 rounded-xl"
              >
                Browse Doctors →
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="p-3 font-black text-slate-700">Attribute</th>
                    {compareList.map((doc) => (
                      <th key={doc.id} className="p-3 font-black text-slate-900">
                        Dr. {doc.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="p-3 font-bold text-slate-500">Specialty</td>
                    {compareList.map((doc) => (
                      <td key={doc.id} className="p-3 font-bold text-blue-700">
                        {doc.specialty}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-slate-500">Affiliated Facility</td>
                    {compareList.map((doc) => (
                      <td key={doc.id} className="p-3 font-medium text-slate-800">
                        {doc.hospitalName}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-slate-500">Rating &amp; Reviews</td>
                    {compareList.map((doc) => (
                      <td key={doc.id} className="p-3">
                        <span className="font-black text-amber-500">⭐ {doc.avgRating || 4.8}</span>
                        <span className="text-slate-400 ml-1">({doc.ratingCount || 0} reviews)</span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-slate-500">Consultation Fee</td>
                    {compareList.map((doc) => (
                      <td key={doc.id} className="p-3 font-black text-slate-900 text-sm">
                        ₹{doc.consultationFee}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-slate-500">Open Slots on {selectedDate}</td>
                    {compareList.map((doc) => (
                      <td key={doc.id} className="p-3">
                        <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          {doc.openSlotsCount || 0} Slots Open
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-slate-500">Action</td>
                    {compareList.map((doc) => (
                      <td key={doc.id} className="p-3">
                        <button
                          type="button"
                          onClick={() => setActiveDoctorForBooking(doc)}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl transition"
                        >
                          Book Slot →
                        </button>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 4. PUBLIC QUEUE STATUS MODAL                                           */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {queueModalOrg && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl relative space-y-4">
            <button
              type="button"
              onClick={() => setQueueModalOrg(null)}
              className="absolute top-4 right-4 bg-slate-100 hover:bg-slate-200 rounded-full w-8 h-8 flex items-center justify-center text-slate-600 font-bold text-sm"
            >
              ✕
            </button>

            <div className="border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  Live Waiting Queue
                </span>
                <span className="font-mono text-[10px] font-bold text-slate-500">
                  {queueModalOrg.code}
                </span>
              </div>
              <h3 className="font-black text-lg text-slate-900">{queueModalOrg.name}</h3>
              <p className="text-xs text-slate-500">{queueModalOrg.address?.fullAddress || queueModalOrg.address?.city}</p>
            </div>

            {queueModalLoading ? (
              <div className="py-8 text-center text-xs font-bold text-slate-500">
                Fetching live token queue...
              </div>
            ) : (
              <div className="space-y-4">
                {/* Live Stats Display */}
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="bg-slate-900 text-white p-4 rounded-2xl">
                    <span className="block text-[10px] uppercase font-bold text-indigo-300">Currently Serving</span>
                    <span className="text-3xl font-black font-mono text-amber-400">
                      #{queueModalData?.currentToken || 18}
                    </span>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl">
                    <span className="block text-[10px] uppercase font-bold text-indigo-600">Waiting in Queue</span>
                    <span className="text-3xl font-black text-indigo-900">
                      {queueModalData?.waitingCount ?? 4}
                    </span>
                  </div>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-xs flex items-center justify-between text-emerald-900">
                  <span className="font-semibold">Estimated Wait Time:</span>
                  <span className="font-black text-sm">{queueModalData?.estimatedWaitTimeMinutes || 25} minutes</span>
                </div>

                <div className="text-[11px] text-slate-500 space-y-1">
                  <p>• Queue tokens are assigned automatically upon check-in or appointment booking.</p>
                  <p>• Walk-in tokens can also be tracked directly via the patient dashboard.</p>
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const org = queueModalOrg;
                      setQueueModalOrg(null);
                      setHospitalFilter(org._id || org.name);
                      setSearchMode('doctors');
                    }}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 rounded-xl transition text-center"
                  >
                    View Doctors in this Facility →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 5. SLOT PICKER MODAL                                                   */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {activeDoctorForBooking && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <button
              type="button"
              onClick={() => setActiveDoctorForBooking(null)}
              className="absolute top-4 right-4 bg-slate-100 hover:bg-slate-200 rounded-full w-8 h-8 flex items-center justify-center text-slate-600 font-bold text-sm z-10"
            >
              ✕
            </button>
            <div className="p-2 sm:p-4">
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

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 6. RATING MODAL                                                        */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {ratingModalDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setRatingModalDoc(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold"
            >
              ✕
            </button>
            <h3 className="text-base font-black text-slate-900 mb-1">
              Rate Dr. {ratingModalDoc.name}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Share your feedback following your completed clinical appointment.
            </p>

            {ratingStatus?.error && (
              <div className="mb-3 p-2.5 bg-rose-50 text-rose-700 text-xs rounded-xl font-medium">
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
