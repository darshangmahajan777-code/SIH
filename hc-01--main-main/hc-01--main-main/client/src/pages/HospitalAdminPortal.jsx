import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Building2,
  CheckCircle2,
  Clock,
  XCircle,
  Plus,
  Search,
  Filter,
  Users,
  BedDouble,
  Phone,
  Mail,
  MapPin,
  ShieldCheck,
  Stethoscope,
  Activity,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Award,
  ChevronRight,
  UserCheck,
  ExternalLink,
} from 'lucide-react';

const DEPARTMENTS_LIST = [
  'General Medicine',
  'Cardiology',
  'Orthopedics',
  'Pediatrics',
  'Neurology',
  'Dermatology',
  'Emergency',
  'OPD',
  'Gynecology',
  'ENT',
  'Oncology',
  'Radiology',
];

const INITIAL_FALLBACK_HOSPITALS = [
  {
    _id: 'hosp-001',
    name: 'Apollo Multispecialty Hospital',
    code: 'APOL-01',
    address: {
      city: 'Delhi NCR',
      state: 'Delhi',
      pincode: '110076',
      fullAddress: 'Sarita Vihar, Delhi Mathura Road, New Delhi',
    },
    contact: {
      phone: '+91-11-2692-5858',
      email: 'emergency@apollohospitals.com',
      emergencyHelpline: '1066',
    },
    departments: ['Cardiology', 'OPD', 'Emergency', 'Orthopedics', 'Pediatrics'],
    verificationStatus: 'verified',
    totalBeds: 710,
    facilities: ['ICU', 'Trauma Center', '24x7 Pharmacy', 'Cath Lab', 'Blood Bank'],
    doctorsCount: 4,
  },
  {
    _id: 'hosp-002',
    name: 'AIIMS Super Specialty Center',
    code: 'AIIMS-01',
    address: {
      city: 'New Delhi',
      state: 'Delhi',
      pincode: '110029',
      fullAddress: 'Ansari Nagar East, New Delhi',
    },
    contact: {
      phone: '+91-11-2658-8500',
      email: 'helpline@aiims.edu',
      emergencyHelpline: '102',
    },
    departments: ['General Medicine', 'Neurology', 'Cardiology', 'Emergency', 'OPD'],
    verificationStatus: 'verified',
    totalBeds: 2478,
    facilities: ['Level-1 Trauma', 'Cardiac ICU', 'Telemedicine Hub', 'Organ Transplant'],
    doctorsCount: 6,
  },
  {
    _id: 'hosp-003',
    name: 'Fortis Memorial Research Institute',
    code: 'FORT-01',
    address: {
      city: 'Gurugram',
      state: 'Haryana',
      pincode: '122002',
      fullAddress: 'Sector 44, Opposite HUDA City Centre, Gurugram',
    },
    contact: {
      phone: '+91-124-496-2200',
      email: 'care@fortishealthcare.com',
      emergencyHelpline: '105010',
    },
    departments: ['Oncology', 'Cardiology', 'Neurology', 'Orthopedics'],
    verificationStatus: 'pending',
    totalBeds: 1000,
    facilities: ['Robotic Surgery', 'CyberKnife', 'Bone Marrow Unit'],
    doctorsCount: 3,
  },
  {
    _id: 'hosp-004',
    name: 'Max Super Speciality Hospital',
    code: 'MAX-01',
    address: {
      city: 'Saket',
      state: 'Delhi',
      pincode: '110017',
      fullAddress: '1, 2, Press Enclave Marg, Saket Institutional Area, New Delhi',
    },
    contact: {
      phone: '+91-11-2651-5050',
      email: 'saket@maxhealthcare.com',
      emergencyHelpline: '102',
    },
    departments: ['Emergency', 'OPD', 'Dermatology', 'General Medicine'],
    verificationStatus: 'verified',
    totalBeds: 530,
    facilities: ['24x7 Emergency', 'Daycare Surgeries', 'Advanced Labs'],
    doctorsCount: 2,
  },
];

const INITIAL_FALLBACK_DOCTORS = [
  {
    _id: 'doc-001',
    doctorName: 'Dr. Sarah Patel',
    specialty: 'Cardiology',
    qualifications: 'MD, DM (Cardiology), FACC',
    experienceYears: 14,
    consultationFee: 800,
    avgRating: 4.9,
    ratingCount: 128,
    hospitalId: 'hosp-001',
    hospitalName: 'Apollo Multispecialty Hospital',
    verificationStatus: 'verified',
    videoEnabled: true,
  },
  {
    _id: 'doc-002',
    doctorName: 'Dr. Amit Mehta',
    specialty: 'Neurology',
    qualifications: 'MD (Gen Med), DM (Neurology)',
    experienceYears: 18,
    consultationFee: 1200,
    avgRating: 4.8,
    ratingCount: 210,
    hospitalId: 'hosp-002',
    hospitalName: 'AIIMS Super Specialty Center',
    verificationStatus: 'verified',
    videoEnabled: true,
  },
  {
    _id: 'doc-003',
    doctorName: 'Dr. Rajiv Malhotra',
    specialty: 'Orthopedics',
    qualifications: 'MS (Ortho), MCh',
    experienceYears: 11,
    consultationFee: 650,
    avgRating: 4.7,
    ratingCount: 84,
    hospitalId: 'hosp-002',
    hospitalName: 'AIIMS Super Specialty Center',
    verificationStatus: 'verified',
    videoEnabled: false,
  },
  {
    _id: 'doc-004',
    doctorName: 'Dr. Neha Gupta',
    specialty: 'Pediatrics',
    qualifications: 'MD (Pediatrics), DNB',
    experienceYears: 8,
    consultationFee: 500,
    avgRating: 4.9,
    ratingCount: 95,
    hospitalId: 'hosp-001',
    hospitalName: 'Apollo Multispecialty Hospital',
    verificationStatus: 'pending',
    videoEnabled: true,
  },
];

export default function HospitalAdminPortal() {
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [activeHospital, setActiveHospital] = useState(null);
  const [hospitalDoctors, setHospitalDoctors] = useState([]);
  const [hospitalStats, setHospitalStats] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // User role switcher for SIH demo: 'admin' (Platform Admin) or 'hospital_admin'
  const [userRole, setUserRole] = useState('admin');
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showAffiliateModal, setShowAffiliateModal] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);

  // Form states
  const [newHospital, setNewHospital] = useState({
    name: '',
    code: '',
    address: { fullAddress: '', city: 'New Delhi', state: 'Delhi', pincode: '110001' },
    contact: { phone: '', email: '', emergencyHelpline: '102' },
    departments: ['General Medicine', 'Emergency', 'OPD'],
    totalBeds: 250,
    facilities: 'ICU, Trauma Center, 24x7 Pharmacy',
  });

  const [newAffiliation, setNewAffiliation] = useState({
    doctorName: '',
    specialty: 'Cardiology',
    qualifications: 'MBBS, MD',
    experienceYears: 5,
    consultationFee: 500,
  });

  // Load Hospitals
  const fetchHospitals = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/hospitals', {
        params: {
          query: searchQuery,
          department: selectedDept,
          status: selectedStatus,
        },
      });
      if (res.data?.hospitals?.length > 0) {
        setHospitals(res.data.hospitals);
        if (!activeHospital) {
          selectHospital(res.data.hospitals[0]);
        }
      } else {
        fallbackFilter();
      }
    } catch {
      fallbackFilter();
    } finally {
      setLoading(false);
    }
  };

  const fallbackFilter = () => {
    let list = [...INITIAL_FALLBACK_HOSPITALS];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (h) =>
          h.name.toLowerCase().includes(q) ||
          h.code.toLowerCase().includes(q) ||
          h.address.city.toLowerCase().includes(q)
      );
    }
    if (selectedDept) {
      list = list.filter((h) => h.departments?.includes(selectedDept));
    }
    if (selectedStatus) {
      list = list.filter((h) => h.verificationStatus === selectedStatus);
    }
    setHospitals(list);
    if (list.length > 0 && !activeHospital) {
      selectHospital(list[0]);
    }
  };

  useEffect(() => {
    fetchHospitals();
  }, [searchQuery, selectedDept, selectedStatus]);

  // Select a hospital to inspect details and affiliated roster
  const selectHospital = async (hospital) => {
    setActiveHospital(hospital);
    setLoadingDetails(true);

    try {
      const [docRes, statsRes] = await Promise.allSettled([
        axios.get(`/api/hospitals/${hospital._id}/doctors`),
        axios.get(`/api/hospitals/${hospital._id}/stats`),
      ]);

      if (docRes.status === 'fulfilled' && docRes.value.data?.doctors) {
        setHospitalDoctors(docRes.value.data.doctors);
      } else {
        const docs = INITIAL_FALLBACK_DOCTORS.filter(
          (d) => d.hospitalId === hospital._id || d.hospitalName === hospital.name
        );
        setHospitalDoctors(docs);
      }

      if (statsRes.status === 'fulfilled' && statsRes.value.data?.stats) {
        setHospitalStats(statsRes.value.data.stats);
      } else {
        setHospitalStats({
          hospitalId: hospital._id,
          hospitalName: hospital.name,
          verificationStatus: hospital.verificationStatus,
          totalDoctors: hospital.doctorsCount || 3,
          verifiedDoctors: 2,
          pendingDoctors: 1,
          todayAppointments: 18,
          activeQueue: 7,
          inProgress: 2,
          completedToday: 9,
        });
      }
    } catch {
      const docs = INITIAL_FALLBACK_DOCTORS.filter(
        (d) => d.hospitalId === hospital._id || d.hospitalName === hospital.name
      );
      setHospitalDoctors(docs);
      setHospitalStats({
        hospitalId: hospital._id,
        hospitalName: hospital.name,
        verificationStatus: hospital.verificationStatus,
        totalDoctors: docs.length,
        verifiedDoctors: docs.filter((d) => d.verificationStatus === 'verified').length,
        pendingDoctors: docs.filter((d) => d.verificationStatus === 'pending').length,
        todayAppointments: 14,
        activeQueue: 5,
        inProgress: 1,
        completedToday: 8,
      });
    } finally {
      setLoadingDetails(false);
    }
  };

  // Verify/Reject Hospital (Admin Action)
  const handleVerifyHospital = async (hospitalId, status) => {
    try {
      await axios.patch(`/api/hospitals/${hospitalId}/verify`, { status });
      notify(`Hospital status updated to "${status.toUpperCase()}"`, 'success');
      setHospitals((prev) =>
        prev.map((h) => (h._id === hospitalId ? { ...h, verificationStatus: status } : h))
      );
      if (activeHospital?._id === hospitalId) {
        setActiveHospital((prev) => ({ ...prev, verificationStatus: status }));
      }
    } catch {
      setHospitals((prev) =>
        prev.map((h) => (h._id === hospitalId ? { ...h, verificationStatus: status } : h))
      );
      if (activeHospital?._id === hospitalId) {
        setActiveHospital((prev) => ({ ...prev, verificationStatus: status }));
      }
      notify(`Hospital status updated to "${status.toUpperCase()}" (Simulated)`, 'success');
    }
  };

  // Verify Doctor in Hospital
  const handleVerifyDoctor = async (doctorId, status) => {
    try {
      await axios.patch(`/api/hospitals/${activeHospital._id}/doctors/${doctorId}/verify`, {
        status,
      });
      notify(`Doctor verification set to "${status.toUpperCase()}"`, 'success');
      setHospitalDoctors((prev) =>
        prev.map((d) => (d._id === doctorId ? { ...d, verificationStatus: status } : d))
      );
    } catch {
      setHospitalDoctors((prev) =>
        prev.map((d) => (d._id === doctorId ? { ...d, verificationStatus: status } : d))
      );
      notify(`Doctor verification set to "${status.toUpperCase()}" (Simulated)`, 'success');
    }
  };

  // Onboard New Hospital
  const handleRegisterHospital = async (e) => {
    e.preventDefault();
    if (!newHospital.name || !newHospital.contact.phone || !newHospital.address.fullAddress) {
      notify('Please fill in required fields (Name, Phone, Address)', 'error');
      return;
    }

    const payload = {
      ...newHospital,
      facilities: typeof newHospital.facilities === 'string'
        ? newHospital.facilities.split(',').map((s) => s.trim())
        : newHospital.facilities,
    };

    try {
      const res = await axios.post('/api/hospitals', payload);
      const created = res.data?.hospital || {
        ...payload,
        _id: 'hosp-' + Date.now(),
        verificationStatus: 'verified',
        doctorsCount: 0,
      };
      setHospitals((prev) => [created, ...prev]);
      selectHospital(created);
      setShowRegisterModal(false);
      notify(`Hospital "${created.name}" registered successfully!`, 'success');
    } catch {
      const created = {
        ...payload,
        _id: 'hosp-' + Date.now(),
        verificationStatus: 'verified',
        doctorsCount: 0,
      };
      setHospitals((prev) => [created, ...prev]);
      selectHospital(created);
      setShowRegisterModal(false);
      notify(`Hospital "${created.name}" registered! (Simulated)`, 'success');
    }
  };

  // Affiliate New Doctor
  const handleAffiliateDoctor = async (e) => {
    e.preventDefault();
    if (!newAffiliation.doctorName || !activeHospital) return;

    const mockDoc = {
      _id: 'doc-' + Date.now(),
      ...newAffiliation,
      hospitalId: activeHospital._id,
      hospitalName: activeHospital.name,
      verificationStatus: 'pending',
      avgRating: 5.0,
      ratingCount: 1,
      videoEnabled: true,
    };

    try {
      await axios.post(`/api/hospitals/${activeHospital._id}/doctors`, {
        doctorId: mockDoc._id,
      });
      setHospitalDoctors((prev) => [...prev, mockDoc]);
      setShowAffiliateModal(false);
      notify(`Doctor "${mockDoc.doctorName}" affiliated to ${activeHospital.name}!`, 'success');
    } catch {
      setHospitalDoctors((prev) => [...prev, mockDoc]);
      setShowAffiliateModal(false);
      notify(`Doctor affiliated to ${activeHospital.name}! (Simulated)`, 'success');
    }
  };

  const notify = (msg, type = 'info') => {
    setActionNotice({ msg, type });
    setTimeout(() => setActionNotice(null), 4000);
  };

  // KPI Metrics Calculation
  const totalVerifiedHospitals = hospitals.filter((h) => h.verificationStatus === 'verified').length;
  const totalBedCapacity = hospitals.reduce((acc, h) => acc + (h.totalBeds || 0), 0);

  return (
    <div className="min-h-screen pb-16">
      {/* Toast Notification Banner */}
      {actionNotice && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-5 py-3.5 shadow-2xl transition-all duration-300 ${
            actionNotice.type === 'error'
              ? 'bg-rose-600 text-white'
              : actionNotice.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-indigo-600 text-white'
          }`}
        >
          {actionNotice.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : actionNotice.type === 'error' ? (
            <AlertTriangle className="h-5 w-5" />
          ) : (
            <Activity className="h-5 w-5" />
          )}
          <span className="text-sm font-semibold">{actionNotice.msg}</span>
        </div>
      )}

      {/* Header & Role Switcher */}
      <div className="mb-8 flex flex-col gap-4 rounded-3xl border border-slate-200/80 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-6 text-white shadow-xl md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-300">
            <ShieldCheck className="h-4 w-4" /> Multi-Hospital Clinical Network
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-white md:text-3xl">
            Hospital Directory & Clinical Governance
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            Enterprise multi-hospital administration, doctor affiliations, and cross-hospital clinical records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Role selector pill */}
          <div className="flex items-center gap-1 rounded-xl bg-white/10 p-1 backdrop-blur-md">
            <span className="px-2 text-xs font-medium text-slate-300">Role:</span>
            <button
              onClick={() => setUserRole('admin')}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                userRole === 'admin'
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Platform Admin
            </button>
            <button
              onClick={() => setUserRole('hospital_admin')}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                userRole === 'hospital_admin'
                  ? 'bg-indigo-500 text-white shadow-md'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Hospital Staff
            </button>
          </div>

          <button
            onClick={() => setShowRegisterModal(true)}
            className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-600 active:scale-95"
          >
            <Plus className="h-4 w-4" /> Register Hospital
          </button>

          <button
            onClick={fetchHospitals}
            className="rounded-xl bg-white/10 p-2 text-slate-300 hover:bg-white/20 hover:text-white"
            title="Refresh Network"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Network Overview Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Registered Hospitals</span>
            <Building2 className="h-5 w-5 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-800">{hospitals.length}</div>
          <div className="mt-1 text-xs font-medium text-blue-600">Across Delhi NCR & Metro</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Verified Institutions</span>
            <Award className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-800">{totalVerifiedHospitals}</div>
          <div className="mt-1 text-xs font-medium text-emerald-600">
            {hospitals.length ? Math.round((totalVerifiedHospitals / hospitals.length) * 100) : 100}% Compliance Rate
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Network Beds</span>
            <BedDouble className="h-5 w-5 text-purple-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-800">
            {totalBedCapacity.toLocaleString()}+
          </div>
          <div className="mt-1 text-xs font-medium text-purple-600">Real-time OPD & Inpatient</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Cross-Hospital History</span>
            <ShieldCheck className="h-5 w-5 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-800">Active</div>
          <div className="mt-1 text-xs font-medium text-amber-600">Consent Protected (ABDM-ready)</div>
        </div>
      </div>

      {/* Search & Filter Ribbon */}
      <div className="mb-8 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search hospitals by name, code, or city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 py-2 pl-10 pr-4 text-sm font-medium outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none transition focus:border-blue-500"
            >
              <option value="">All Departments</option>
              {DEPARTMENTS_LIST.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none transition focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="verified">Verified Only</option>
            <option value="pending">Pending Approval</option>
            <option value="rejected">Rejected</option>
          </select>

          {(searchQuery || selectedDept || selectedStatus) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedDept('');
                setSelectedStatus('');
              }}
              className="text-xs font-semibold text-rose-600 hover:underline"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Main 2-Column Layout: Hospital Cards on Left, Hospital Workspace on Right */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column: Hospital List (5 Cols) */}
        <div className="space-y-4 lg:col-span-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800">
              Hospitals ({hospitals.length})
            </h2>
            <span className="text-xs text-slate-500">Select to view doctors & stats</span>
          </div>

          {loading ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white">
              <div className="flex flex-col items-center gap-2">
                <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
                <span className="text-xs text-slate-500">Loading hospitals...</span>
              </div>
            </div>
          ) : hospitals.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-center">
              <Building2 className="h-10 w-10 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-700">No hospitals found</p>
              <p className="text-xs text-slate-400">Try adjusting your search criteria</p>
            </div>
          ) : (
            hospitals.map((hospital) => {
              const isSelected = activeHospital?._id === hospital._id;
              const isVerified = hospital.verificationStatus === 'verified';
              const isPending = hospital.verificationStatus === 'pending';

              return (
                <div
                  key={hospital._id}
                  onClick={() => selectHospital(hospital)}
                  className={`group relative cursor-pointer rounded-2xl border p-5 transition-all duration-200 ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50/40 shadow-md ring-2 ring-blue-500/20'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            isVerified
                              ? 'bg-emerald-100 text-emerald-700'
                              : isPending
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {isVerified ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : isPending ? (
                            <Clock className="h-3 w-3" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          {hospital.verificationStatus || 'verified'}
                        </span>
                        <span className="text-[11px] font-mono font-semibold text-slate-400">
                          #{hospital.code}
                        </span>
                      </div>
                      <h3 className="mt-1.5 text-base font-bold text-slate-900 group-hover:text-blue-600">
                        {hospital.name}
                      </h3>
                    </div>

                    <ChevronRight
                      className={`h-5 w-5 transition-transform ${
                        isSelected ? 'translate-x-1 text-blue-600' : 'text-slate-300'
                      }`}
                    />
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="line-clamp-1">{hospital.address?.fullAddress}</span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3 text-xs text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      <span>{hospital.contact?.phone}</span>
                    </div>

                    {hospital.contact?.emergencyHelpline && (
                      <div className="flex items-center gap-1.5 rounded-md bg-rose-50 px-2 py-0.5 font-bold text-rose-700">
                        <span>SOS: {hospital.contact.emergencyHelpline}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 text-purple-700">
                      <BedDouble className="h-3.5 w-3.5" />
                      <span>{hospital.totalBeds || 250} beds</span>
                    </div>
                  </div>

                  {/* Department Tags */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {hospital.departments?.slice(0, 4).map((d) => (
                      <span
                        key={d}
                        className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                      >
                        {d}
                      </span>
                    ))}
                    {(hospital.departments?.length || 0) > 4 && (
                      <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                        +{hospital.departments.length - 4} more
                      </span>
                    )}
                  </div>

                  {/* Admin Quick Action Button (if Platform Admin) */}
                  {userRole === 'admin' && (
                    <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                      {hospital.verificationStatus !== 'verified' ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleVerifyHospital(hospital._id, 'verified');
                          }}
                          className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Approve & Verify
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleVerifyHospital(hospital._id, 'rejected');
                          }}
                          className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          <XCircle className="h-3.5 w-3.5" /> Suspend
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Hospital Details & Doctor Roster (7 Cols) */}
        <div className="space-y-6 lg:col-span-7">
          {activeHospital ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              {/* Selected Hospital Banner */}
              <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-6 md:flex-row md:items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-blue-100 px-2 py-0.5 font-mono text-xs font-bold text-blue-800">
                      {activeHospital.code}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        activeHospital.verificationStatus === 'verified'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {activeHospital.verificationStatus?.toUpperCase()}
                    </span>
                  </div>
                  <h2 className="mt-2 text-2xl font-black text-slate-900">
                    {activeHospital.name}
                  </h2>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    {activeHospital.address?.fullAddress}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setShowAffiliateModal(true)}
                    className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" /> Affiliate Doctor
                  </button>
                </div>
              </div>

              {/* Hospital Contact & Facility Snapshot */}
              <div className="mt-5 grid grid-cols-1 gap-4 rounded-2xl bg-slate-50 p-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Phone / SOS Helpline
                  </span>
                  <p className="text-sm font-bold text-slate-800">
                    {activeHospital.contact?.phone}
                  </p>
                  <p className="text-xs font-semibold text-rose-600">
                    Emergency: {activeHospital.contact?.emergencyHelpline || '102'}
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Official Email
                  </span>
                  <p className="truncate text-sm font-bold text-slate-800">
                    {activeHospital.contact?.email || 'contact@mediqueue.org'}
                  </p>
                  <p className="text-xs text-slate-500">Verified institutional inbox</p>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Bed Capacity & Facilities
                  </span>
                  <p className="text-sm font-bold text-slate-800">
                    {activeHospital.totalBeds || 250} Inpatient Beds
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {Array.isArray(activeHospital.facilities)
                      ? activeHospital.facilities.slice(0, 3).join(', ')
                      : 'ICU, Trauma Center'}
                  </p>
                </div>
              </div>

              {/* Live Operational Stats Snapshot */}
              {hospitalStats && (
                <div className="mt-6">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Hospital Operations Snapshot
                  </h3>
                  <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                      <div className="text-lg font-black text-slate-800">
                        {hospitalStats.todayAppointments || 0}
                      </div>
                      <div className="text-[11px] font-medium text-slate-500">Today's Visits</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                      <div className="text-lg font-black text-blue-600">
                        {hospitalStats.activeQueue || 0}
                      </div>
                      <div className="text-[11px] font-medium text-slate-500">Waiting Queue</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                      <div className="text-lg font-black text-amber-600">
                        {hospitalStats.inProgress || 0}
                      </div>
                      <div className="text-[11px] font-medium text-slate-500">In Consultation</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                      <div className="text-lg font-black text-emerald-600">
                        {hospitalStats.completedToday || 0}
                      </div>
                      <div className="text-[11px] font-medium text-slate-500">Completed</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Affiliated Doctors Roster */}
              <div className="mt-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900">
                    Affiliated Clinical Specialists ({hospitalDoctors.length})
                  </h3>
                  <span className="text-xs text-slate-500">Verified doctor roster</span>
                </div>

                {loadingDetails ? (
                  <div className="flex h-32 items-center justify-center">
                    <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
                  </div>
                ) : hospitalDoctors.length === 0 ? (
                  <div className="mt-3 rounded-2xl border border-dashed border-slate-200 p-6 text-center">
                    <Stethoscope className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm font-semibold text-slate-600">
                      No doctors affiliated yet
                    </p>
                    <p className="text-xs text-slate-400">
                      Click "Affiliate Doctor" above to assign practitioners to this hospital.
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {hospitalDoctors.map((doc) => {
                      const isVerified = doc.verificationStatus === 'verified';

                      return (
                        <div
                          key={doc._id}
                          className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:border-slate-300 sm:flex-row sm:items-center"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 font-bold">
                              {doc.doctorName?.slice(3, 5).toUpperCase() || 'DR'}
                            </div>

                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-slate-900">
                                  {doc.doctorName}
                                </h4>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                    isVerified
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-amber-100 text-amber-700'
                                  }`}
                                >
                                  {doc.verificationStatus || 'pending'}
                                </span>
                              </div>
                              <p className="text-xs font-semibold text-blue-600">
                                {doc.specialty} • {doc.experienceYears || 5} yrs exp
                              </p>
                              <p className="text-[11px] text-slate-400">
                                {doc.qualifications || 'MBBS, MD'} • ₹{doc.consultationFee || 500} fee
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            {userRole === 'admin' && (
                              <>
                                {doc.verificationStatus !== 'verified' ? (
                                  <button
                                    onClick={() => handleVerifyDoctor(doc._id, 'verified')}
                                    className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                                  >
                                    <UserCheck className="h-3.5 w-3.5" /> Verify Credential
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleVerifyDoctor(doc._id, 'pending')}
                                    className="rounded-lg bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                                  >
                                    Revoke
                                  </button>
                                )}
                              </>
                            )}

                            {doc.avgRating && (
                              <div className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">
                                <span>★ {doc.avgRating}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-96 flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white p-8 text-center">
              <Building2 className="h-12 w-12 text-slate-300" />
              <h3 className="mt-3 text-lg font-bold text-slate-800">
                Select a Hospital to Inspect
              </h3>
              <p className="mt-1 max-w-sm text-xs text-slate-400">
                Choose any registered hospital from the directory to review credentials, affiliated doctors, and operational metrics.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Register New Hospital */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-black text-slate-900">Register New Hospital</h3>
              </div>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRegisterHospital} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700">Hospital Legal Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Max Super Speciality Hospital"
                  value={newHospital.name}
                  onChange={(e) => setNewHospital({ ...newHospital, name: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Code / Abbreviation</label>
                  <input
                    type="text"
                    placeholder="e.g. MAX-01"
                    value={newHospital.code}
                    onChange={(e) => setNewHospital({ ...newHospital, code: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Total Bed Capacity</label>
                  <input
                    type="number"
                    value={newHospital.totalBeds}
                    onChange={(e) =>
                      setNewHospital({ ...newHospital, totalBeds: Number(e.target.value) })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Full Address *</label>
                <input
                  type="text"
                  required
                  placeholder="Street, locality, landmarks"
                  value={newHospital.address.fullAddress}
                  onChange={(e) =>
                    setNewHospital({
                      ...newHospital,
                      address: { ...newHospital.address, fullAddress: e.target.value },
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-700">City</label>
                  <input
                    type="text"
                    value={newHospital.address.city}
                    onChange={(e) =>
                      setNewHospital({
                        ...newHospital,
                        address: { ...newHospital.address, city: e.target.value },
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">State</label>
                  <input
                    type="text"
                    value={newHospital.address.state}
                    onChange={(e) =>
                      setNewHospital({
                        ...newHospital,
                        address: { ...newHospital.address, state: e.target.value },
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Pincode</label>
                  <input
                    type="text"
                    value={newHospital.address.pincode}
                    onChange={(e) =>
                      setNewHospital({
                        ...newHospital,
                        address: { ...newHospital.address, pincode: e.target.value },
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Contact Phone *</label>
                  <input
                    type="text"
                    required
                    placeholder="+91-11-..."
                    value={newHospital.contact.phone}
                    onChange={(e) =>
                      setNewHospital({
                        ...newHospital,
                        contact: { ...newHospital.contact, phone: e.target.value },
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">SOS Helpline</label>
                  <input
                    type="text"
                    placeholder="102 or 1066"
                    value={newHospital.contact.emergencyHelpline}
                    onChange={(e) =>
                      setNewHospital({
                        ...newHospital,
                        contact: { ...newHospital.contact, emergencyHelpline: e.target.value },
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Official Email</label>
                <input
                  type="email"
                  placeholder="contact@hospital.org"
                  value={newHospital.contact.email}
                  onChange={(e) =>
                    setNewHospital({
                      ...newHospital,
                      contact: { ...newHospital.contact, email: e.target.value },
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Key Facilities (comma separated)</label>
                <input
                  type="text"
                  value={newHospital.facilities}
                  onChange={(e) => setNewHospital({ ...newHospital, facilities: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-blue-500/30 hover:bg-blue-700"
                >
                  Register & Verify
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Affiliate Doctor to Hospital */}
      {showAffiliateModal && activeHospital && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900">Affiliate Doctor</h3>
                <p className="text-xs text-slate-500">To {activeHospital.name}</p>
              </div>
              <button
                onClick={() => setShowAffiliateModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAffiliateDoctor} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700">Doctor Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Priya Sharma"
                  value={newAffiliation.doctorName}
                  onChange={(e) =>
                    setNewAffiliation({ ...newAffiliation, doctorName: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Medical Specialty</label>
                <select
                  value={newAffiliation.specialty}
                  onChange={(e) =>
                    setNewAffiliation({ ...newAffiliation, specialty: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                >
                  {DEPARTMENTS_LIST.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Qualifications</label>
                <input
                  type="text"
                  placeholder="MBBS, MD (Med), DM"
                  value={newAffiliation.qualifications}
                  onChange={(e) =>
                    setNewAffiliation({ ...newAffiliation, qualifications: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Experience (Years)</label>
                  <input
                    type="number"
                    value={newAffiliation.experienceYears}
                    onChange={(e) =>
                      setNewAffiliation({
                        ...newAffiliation,
                        experienceYears: Number(e.target.value),
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Consultation Fee (₹)</label>
                  <input
                    type="number"
                    value={newAffiliation.consultationFee}
                    onChange={(e) =>
                      setNewAffiliation({
                        ...newAffiliation,
                        consultationFee: Number(e.target.value),
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAffiliateModal(false)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-blue-500/30 hover:bg-blue-700"
                >
                  Affiliate Doctor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
