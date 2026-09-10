import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  X,
  Home,
  Search,
  Building2,
  Calendar,
  Clock,
  User,
  Shield,
  Bell,
  Stethoscope,
  Activity,
  FileText,
  Pill,
  Users,
  Settings,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Layers,
  BarChart3,
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  UserPlus,
  Hospital,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function SidebarNavigation({
  isOpen,
  onClose,
  onOpenNotifications,
  unreadCount = 0,
}) {
  const location = useLocation();
  const { user, isAuthenticated, role, logout, loginWithRole, doctorProfile } = useAuth();

  const roleMeta = {
    patient: {
      label: 'Patient Portal',
      badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      accentColor: 'text-indigo-600',
      activeBg: 'bg-indigo-50 text-indigo-900 font-bold border-l-4 border-indigo-600',
      menuHeader: 'PATIENT SERVICES',
    },
    doctor: {
      label: 'Doctor Practice',
      badgeBg: 'bg-cyan-50 text-cyan-800 border-cyan-200',
      accentColor: 'text-cyan-700',
      activeBg: 'bg-cyan-50 text-cyan-900 font-bold border-l-4 border-cyan-600',
      menuHeader: 'CLINICAL PRACTICE',
    },
    receptionist: {
      label: 'Reception Staff',
      badgeBg: 'bg-amber-50 text-amber-800 border-amber-200',
      accentColor: 'text-amber-700',
      activeBg: 'bg-amber-50 text-amber-900 font-bold border-l-4 border-amber-600',
      menuHeader: 'FRONT DESK OPERATIONS',
    },
    hospital_admin: {
      label: 'Hospital / Clinic Admin',
      badgeBg: 'bg-purple-50 text-purple-800 border-purple-200',
      accentColor: 'text-purple-700',
      activeBg: 'bg-purple-50 text-purple-900 font-bold border-l-4 border-purple-600',
      menuHeader: 'ORGANIZATION MANAGEMENT',
    },
    admin: {
      label: 'Platform Admin',
      badgeBg: 'bg-purple-50 text-purple-800 border-purple-200',
      accentColor: 'text-purple-700',
      activeBg: 'bg-purple-50 text-purple-900 font-bold border-l-4 border-purple-600',
      menuHeader: 'HOSPITAL ADMINISTRATION',
    },
    guest: {
      label: 'Healthcare Marketplace',
      badgeBg: 'bg-slate-100 text-slate-700 border-slate-200',
      accentColor: 'text-blue-600',
      activeBg: 'bg-blue-50 text-blue-900 font-bold border-l-4 border-blue-600',
      menuHeader: 'DISCOVER & BOOK',
    },
  };

  const currentRoleMeta = roleMeta[role] || roleMeta.guest;
  const activeOrgName =
    doctorProfile?.hospitalName ||
    user?.hospitalName ||
    (role === 'receptionist' || role === 'hospital_admin' ? 'AIIMS Super Specialty' : null);

  // Role-Based Navigation Items
  const getRoleNavItems = () => {
    if (!isAuthenticated) {
      return [
        { label: 'Marketplace', path: '/home', icon: Home },
        { label: 'Find & Book', path: '/find-doctors', icon: Search },
        { label: 'Hospitals & Clinics', path: '/hospitals', icon: Building2 },
        { label: 'Emergency Triage', path: '/emergency', icon: AlertCircle },
        { label: 'Live TV Display', path: '/display', icon: Activity },
        { label: 'Sign In / Register', path: '/auth', icon: User },
      ];
    }

    switch (role) {
      case 'patient':
        return [
          { label: 'Patient Hub', path: '/patient-dashboard', icon: LayoutDashboard },
          { label: 'Find & Book', path: '/find-doctors', icon: Search },
          { label: 'Hospitals & Clinics', path: '/find-doctors?view=facilities', icon: Building2 },
          { label: 'My Appointments', path: '/patient-dashboard?tab=appointments', icon: Calendar },
          { label: 'My Queue', path: '/patient-dashboard?tab=queue', icon: Clock },
          { label: 'My Data', path: '/my-data', icon: Shield },
          { label: 'Notifications', isAction: 'notifications', icon: Bell, badge: unreadCount },
          { label: 'Profile', path: '/patient-dashboard?tab=profile', icon: User },
        ];

      case 'doctor':
        return [
          { label: 'Doctor Dashboard', path: '/doctor', icon: LayoutDashboard },
          { label: "Today's Queue", path: '/doctor?tab=queue', icon: Clock },
          { label: 'My Appointments', path: '/doctor-appointments', icon: CalendarDays },
          { label: 'My Schedule', path: '/doctor-schedule', icon: Calendar },
          { label: 'Patients', path: '/doctor?tab=patients', icon: Users },
          { label: 'Clinical Workspace', path: '/doctor-workspace', icon: Stethoscope },
          { label: 'Medical History', path: '/doctor-workspace?tab=history', icon: FileText },
          { label: 'Prescriptions', path: '/doctor?tab=prescription', icon: Pill },
          { label: 'Notifications', isAction: 'notifications', icon: Bell, badge: unreadCount },
          { label: 'Profile', path: '/doctor?tab=settings', icon: Settings },
        ];

      case 'receptionist':
        return [
          { label: 'Reception Dashboard', path: '/reception', icon: LayoutDashboard },
          { label: 'Patient Registration', path: '/reception?tab=register', icon: UserPlus },
          { label: 'Appointments', path: '/reception?tab=appointments', icon: Calendar },
          { label: "Today's Waiting Queue", path: '/reception?tab=queue', icon: Clock },
          { label: 'Token Management', path: '/reception?tab=tokens', icon: ClipboardList },
          { label: 'Doctor Availability', path: '/find-doctors', icon: Stethoscope },
          { label: 'Check-in', path: '/reception?tab=checkin', icon: CheckCircle2 },
          { label: 'Notifications', isAction: 'notifications', icon: Bell, badge: unreadCount },
          { label: 'Profile', path: '/reception?tab=profile', icon: User },
        ];

      case 'hospital_admin':
      case 'admin':
      case 'clinic_manager':
        return [
          { label: 'Admin Dashboard', path: '/hospitals', icon: LayoutDashboard },
          { label: 'Doctors', path: '/hospitals?tab=doctors', icon: Stethoscope },
          { label: 'Reception Staff', path: '/hospitals?tab=staff', icon: Users },
          { label: 'Patients', path: '/hospitals?tab=patients', icon: Users },
          { label: 'Appointments', path: '/hospitals?tab=appointments', icon: Calendar },
          { label: 'Schedules', path: '/doctor-schedule', icon: CalendarDays },
          { label: 'Departments', path: '/hospitals?tab=departments', icon: Layers },
          { label: 'Analytics', path: '/hospitals?tab=analytics', icon: BarChart3 },
          { label: 'Hospital/Clinic Profile', path: '/hospitals?tab=profile', icon: Building2 },
        ];

      default:
        return [
          { label: 'Marketplace', path: '/home', icon: Home },
          { label: 'Find & Book', path: '/find-doctors', icon: Search },
          { label: 'Emergency', path: '/emergency', icon: AlertCircle },
        ];
    }
  };

  const navItems = getRoleNavItems();

  const isCurrentActive = (item) => {
    if (item.isAction) return false;
    const currentUrl = location.pathname + location.search;
    if (item.path.includes('?')) {
      return currentUrl === item.path;
    }
    return location.pathname === item.path && (!location.search || location.search === '');
  };

  return (
    <>
      {/* Backdrop overlay (mobile & desktop click-away) */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />

      {/* Slide-out Sidebar Drawer */}
      <aside
        id="side-navigation-drawer"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 sm:w-80 flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-700 text-white font-black text-base shadow-md">
              M+
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-black tracking-tight text-slate-900">MediQueue+</span>
              </div>
              <span
                className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${currentRoleMeta.badgeBg}`}
              >
                {currentRoleMeta.label}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            title="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Organization Badge (if assigned to doctor/staff/clinic) */}
        {isAuthenticated && activeOrgName && (
          <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-700">
            <Hospital className="h-4 w-4 text-cyan-700 shrink-0" />
            <div className="truncate">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Facility / Branch
              </span>
              <span className="font-bold text-slate-800 truncate block">{activeOrgName}</span>
            </div>
          </div>
        )}

        {/* Section Label */}
        <div className="px-5 pt-4 pb-1">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            {currentRoleMeta.menuHeader}
          </span>
        </div>

        {/* Scrollable Navigation Items */}
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isCurrentActive(item);

            if (item.isAction === 'notifications') {
              return (
                <button
                  key="action-notifications"
                  onClick={() => {
                    onOpenNotifications();
                    onClose();
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition text-left"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-amber-500" />
                    <span>{item.label}</span>
                  </div>
                  {unreadCount > 0 ? (
                    <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white shadow-sm animate-pulse">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400">0</span>
                  )}
                </button>
              );
            }

            return (
              <Link
                key={item.path + item.label}
                to={item.path}
                onClick={onClose}
                className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs transition ${
                  active
                    ? currentRoleMeta.activeBg
                    : 'font-semibold text-slate-600 hover:bg-slate-100/90 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${active ? currentRoleMeta.accentColor : 'text-slate-400'}`}
                  />
                  <span>{item.label}</span>
                </div>
                {active && <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
              </Link>
            );
          })}
        </nav>

        {/* Drawer Footer: User Session & Demo Switcher */}
        <div className="border-t border-slate-100 bg-slate-50/70 p-4 space-y-3">
          {/* Quick Demo Persona Switcher */}
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Instant Demo Switcher
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  loginWithRole({ email: 'patient.demo@mediqueue.test', password: 'demo123', role: 'patient' });
                  onClose();
                }}
                className={`rounded-lg py-1 px-2 text-[10px] font-bold transition text-left border ${
                  role === 'patient'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                👤 Patient
              </button>
              <button
                type="button"
                onClick={() => {
                  loginWithRole({ email: 'dr.priya@mediqueue.test', password: 'demo123', role: 'doctor' });
                  onClose();
                }}
                className={`rounded-lg py-1 px-2 text-[10px] font-bold transition text-left border ${
                  role === 'doctor'
                    ? 'bg-cyan-700 text-white border-cyan-700'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                🩺 Doctor
              </button>
              <button
                type="button"
                onClick={() => {
                  loginWithRole({ email: 'reception.demo@mediqueue.test', password: 'demo123', role: 'receptionist' });
                  onClose();
                }}
                className={`rounded-lg py-1 px-2 text-[10px] font-bold transition text-left border ${
                  role === 'receptionist'
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                📋 Reception
              </button>
              <button
                type="button"
                onClick={() => {
                  loginWithRole({ email: 'admin.demo@mediqueue.test', password: 'demo123', role: 'admin' });
                  onClose();
                }}
                className={`rounded-lg py-1 px-2 text-[10px] font-bold transition text-left border ${
                  role === 'admin'
                    ? 'bg-purple-700 text-white border-purple-700'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                🏢 Admin
              </button>
            </div>
          </div>

          {/* User Account / Sign Out / Sign In */}
          {isAuthenticated ? (
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-2.5">
              <div className="min-w-0 pr-2">
                <p className="truncate text-xs font-bold text-slate-900">{user?.name || user?.email}</p>
                <p className="truncate text-[10px] text-slate-500">{user?.email}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  logout();
                  onClose();
                }}
                className="flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-100 transition"
                title="Sign out of current account"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Exit</span>
              </button>
            </div>
          ) : (
            <Link
              to="/auth"
              onClick={onClose}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 py-2 text-xs font-bold text-white shadow-sm hover:opacity-95 transition"
            >
              <User className="h-3.5 w-3.5" />
              <span>Sign In / Onboard</span>
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}
