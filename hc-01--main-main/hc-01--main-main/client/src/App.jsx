import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { gsap } from 'gsap';
import { Menu } from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary';
import Home from './pages/Home';
import Reception from './pages/Reception';
import Doctor from './pages/Doctor';
import Display from './pages/Display';
import Emergency from './pages/Emergency';
import NotFound from './pages/NotFound';
import FindDoctors from './pages/FindDoctors';
import DoctorSchedulePage from './pages/DoctorSchedulePage';
import PatientAppointmentsDashboard from './pages/PatientAppointmentsDashboard';
import DoctorAppointmentsDashboard from './pages/DoctorAppointmentsDashboard';
import PatientConsentPage from './pages/PatientConsentPage';
import TelemedicinePage from './pages/TelemedicinePage';
import UnifiedPatientDashboard from './pages/UnifiedPatientDashboard';
import DoctorClinicalWorkspace from './pages/DoctorClinicalWorkspace';
import DoctorBusinessDashboard from './pages/DoctorBusinessDashboard';
import HospitalAdminPortal from './pages/HospitalAdminPortal';
import AuthPortal from './pages/AuthPortal';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import NotificationCenter from './components/NotificationCenter';
import SidebarNavigation from './components/SidebarNavigation';

function App() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const appRef = useRef(null);

  const { user, isAuthenticated, role, logout, loginWithRole, doctorProfile } = useAuth();

  const isDisplayPage = location.pathname === '/display';

  useEffect(() => {
    if (isDisplayPage || !appRef.current) return;

    const ctx = gsap.context(() => {
      gsap.from('[data-gsap-nav]', {
        y: -24,
        opacity: 0,
        duration: 0.6,
        ease: 'power3.out',
      });

      gsap.from('[data-gsap-main]', {
        y: 20,
        opacity: 0,
        duration: 0.7,
        ease: 'power2.out',
        delay: 0.1,
      });
    }, appRef);

    return () => ctx.revert();
  }, [isDisplayPage, location.pathname]);

  if (isDisplayPage) {
    return (
      <Routes>
        <Route path="/display" element={<Display />} />
      </Routes>
    );
  }

  const roleLabels = {
    patient: 'Patient Portal',
    doctor: 'Doctor Practice',
    receptionist: 'Reception Desk',
    hospital_admin: 'Clinic Admin',
    admin: 'Platform Admin',
  };

  const activeOrgName = doctorProfile?.hospitalName || user?.hospitalName || (role === 'receptionist' || role === 'hospital_admin' ? 'AIIMS Center' : null);

  return (
    <div ref={appRef} className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50/40 to-blue-100/60">
      <nav data-gsap-nav className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            {/* Three-Line Left-Side Hamburger Button */}
            <button
              type="button"
              id="hamburger-nav-btn"
              onClick={() => setSidebarOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-700 shadow-sm hover:bg-slate-100 hover:text-slate-900 transition focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              title="Open Navigation Menu"
              aria-label="Open Navigation Menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <Link
              to={
                isAuthenticated
                  ? role === 'doctor'
                    ? '/doctor'
                    : role === 'patient'
                    ? '/patient-dashboard'
                    : role === 'receptionist'
                    ? '/reception'
                    : '/hospitals'
                  : '/home'
              }
              className="flex items-center gap-2.5 font-black tracking-tight text-slate-900"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-700 text-white font-black text-sm shadow-md">
                M+
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-black tracking-tight leading-tight text-slate-900">MediQueue+</span>
                <span className="text-[10px] font-bold text-cyan-700 uppercase tracking-wider">
                  {isAuthenticated ? roleLabels[role] || role : 'Healthcare Marketplace'}
                </span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {/* Organization Scope Chip (for Doctor, Staff, Admin) */}
            {isAuthenticated && activeOrgName && (
              <div className="hidden md:flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm" title={`Organization: ${activeOrgName}`}>
                <span className="text-cyan-700 font-bold">🏥</span>
                <span className="font-bold text-slate-800 truncate max-w-[140px]">{activeOrgName}</span>
              </div>
            )}

            {/* Quick Demo Persona Switcher (Allows 1-Click Evaluation of all 4 roles) */}
            <div className="hidden lg:flex items-center rounded-xl border border-slate-200/90 bg-slate-100/80 p-0.5 shadow-inner">
              <button
                type="button"
                onClick={() => loginWithRole({ email: 'patient.demo@mediqueue.test', password: 'demo123', role: 'patient' })}
                className={`rounded-lg px-2 py-1 text-[10px] font-extrabold transition ${role === 'patient' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                title="Switch to Demo Patient"
              >
                👤 Patient
              </button>
              <button
                type="button"
                onClick={() => loginWithRole({ email: 'dr.priya@mediqueue.test', password: 'demo123', role: 'doctor' })}
                className={`rounded-lg px-2 py-1 text-[10px] font-extrabold transition ${role === 'doctor' ? 'bg-white text-cyan-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                title="Switch to Demo Doctor"
              >
                🩺 Doctor
              </button>
              <button
                type="button"
                onClick={() => loginWithRole({ email: 'reception.demo@mediqueue.test', password: 'demo123', role: 'receptionist' })}
                className={`rounded-lg px-2 py-1 text-[10px] font-extrabold transition ${role === 'receptionist' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                title="Switch to Demo Reception Desk"
              >
                📋 Reception
              </button>
              <button
                type="button"
                onClick={() => loginWithRole({ email: 'admin.demo@mediqueue.test', password: 'demo123', role: 'admin' })}
                className={`rounded-lg px-2 py-1 text-[10px] font-extrabold transition ${role === 'admin' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                title="Switch to Demo Clinic Admin"
              >
                🏢 Admin
              </button>
            </div>

            {/* User Session Chip / Sign In Button */}
            {isAuthenticated ? (
              <div className="hidden sm:flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 py-1 px-2.5 shadow-sm">
                <span className="text-xs font-bold text-slate-800 max-w-[110px] truncate" title={user?.name || user?.email}>
                  {user?.name?.split(' ')[0] || user?.email}
                </span>
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-lg px-2 py-0.5 text-xs font-bold text-rose-600 hover:bg-rose-50 transition"
                  title="Sign Out"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <Link
                to="/auth"
                className="hidden sm:inline-flex rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-3.5 py-1.5 text-xs font-black text-white shadow-sm hover:opacity-95 transition"
              >
                Sign In / Register
              </Link>
            )}

            <button
              type="button"
              id="notification-bell-btn"
              onClick={() => setNotifOpen((prev) => !prev)}
              className="relative p-2 text-slate-700 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition"
              title="Notifications"
            >
              <span className="text-xl">🔔</span>
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 bg-rose-500 text-white font-black text-[10px] w-5 h-5 rounded-full flex items-center justify-center shadow-sm animate-pulse">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </nav>

      <main data-gsap-main className="mx-auto max-w-7xl px-4 py-8">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<Home />} />
            
            {/* Auth & Onboarding Routes */}
            <Route path="/auth" element={<AuthPortal />} />
            <Route path="/login" element={<AuthPortal />} />
            <Route path="/signup" element={<AuthPortal />} />
            <Route path="/patient/login" element={<AuthPortal />} />
            <Route path="/patient/signup" element={<AuthPortal />} />
            <Route path="/doctor/login" element={<AuthPortal />} />
            <Route path="/doctor/onboarding" element={<AuthPortal />} />

            {/* Patient Protected Routes */}
            <Route
              path="/patient-dashboard"
              element={
                <ProtectedRoute allowedRoles={['patient', 'doctor', 'admin']}>
                  <UnifiedPatientDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-appointments"
              element={
                <ProtectedRoute allowedRoles={['patient', 'doctor', 'admin']}>
                  <UnifiedPatientDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/appointments-tracker"
              element={
                <ProtectedRoute allowedRoles={['patient', 'doctor', 'admin']}>
                  <PatientAppointmentsDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-data"
              element={
                <ProtectedRoute allowedRoles={['patient', 'doctor', 'admin']}>
                  <PatientConsentPage />
                </ProtectedRoute>
              }
            />

            {/* Public Discovery */}
            <Route path="/find-doctors" element={<FindDoctors />} />

            {/* Doctor Protected Routes */}
            <Route
              path="/doctor"
              element={
                <ProtectedRoute allowedRoles={['doctor', 'admin']}>
                  <DoctorBusinessDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/doctor-dashboard"
              element={
                <ProtectedRoute allowedRoles={['doctor', 'admin']}>
                  <DoctorBusinessDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/doctor/dashboard"
              element={
                <ProtectedRoute allowedRoles={['doctor', 'admin']}>
                  <DoctorBusinessDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/doctor-workspace"
              element={
                <ProtectedRoute allowedRoles={['doctor', 'admin']}>
                  <DoctorClinicalWorkspace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/doctor-appointments"
              element={
                <ProtectedRoute allowedRoles={['doctor', 'admin']}>
                  <DoctorAppointmentsDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/doctor-schedule"
              element={
                <ProtectedRoute allowedRoles={['doctor', 'admin']}>
                  <DoctorSchedulePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/doctor-opd"
              element={
                <ProtectedRoute allowedRoles={['doctor', 'admin']}>
                  <Doctor />
                </ProtectedRoute>
              }
            />

            {/* Telemedicine */}
            <Route path="/telemedicine/:appointmentId" element={<TelemedicinePage />} />

            {/* Hospital Reception Desk (Original HC-01) */}
            <Route path="/reception" element={<Reception />} />
            <Route
              path="/hospitals"
              element={
                <ProtectedRoute allowedRoles={['admin', 'hospital_admin', 'clinic_manager']}>
                  <HospitalAdminPortal />
                </ProtectedRoute>
              }
            />
            <Route
              path="/hospital-admin"
              element={
                <ProtectedRoute allowedRoles={['admin', 'hospital_admin', 'clinic_manager']}>
                  <HospitalAdminPortal />
                </ProtectedRoute>
              }
            />

            {/* Public Utility */}
            <Route path="/emergency" element={<Emergency />} />
            <Route path="/display" element={<Display />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
      </main>

      <SidebarNavigation
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenNotifications={() => setNotifOpen(true)}
        unreadCount={unreadCount}
      />

      <NotificationCenter
        isOpen={notifOpen}
        onClose={() => setNotifOpen(false)}
        unreadCount={unreadCount}
        setUnreadCount={setUnreadCount}
      />
    </div>
  );
}

export default App;
