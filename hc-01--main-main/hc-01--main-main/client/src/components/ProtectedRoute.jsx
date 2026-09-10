import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, isAuthenticated, loading, role, loginWithRole } = useAuth();
  const location = useLocation();
  const [loggingIn, setLoggingIn] = useState(null);
  const [quickError, setQuickError] = useState('');

  const handleQuickLogin = async (demoRole) => {
    setLoggingIn(demoRole);
    setQuickError('');
    try {
      if (demoRole === 'doctor') {
        await loginWithRole({ email: 'dr.priya@mediqueue.test', password: 'demo123', role: 'doctor' });
      } else if (demoRole === 'patient') {
        await loginWithRole({ email: 'patient.demo@mediqueue.test', password: 'demo123', role: 'patient' });
      } else if (demoRole === 'receptionist') {
        await loginWithRole({ email: 'reception.demo@mediqueue.test', password: 'demo123', role: 'receptionist' });
      } else if (demoRole === 'admin') {
        await loginWithRole({ email: 'admin.demo@mediqueue.test', password: 'demo123', role: 'admin' });
      }
    } catch (err) {
      setQuickError(err.message || 'Quick login failed. Please use the Sign In portal.');
    } finally {
      setLoggingIn(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent"></div>
        <p className="text-sm font-semibold text-slate-500">Verifying security session...</p>
      </div>
    );
  }

  // If not authenticated, display an inline 1-click access gate instead of silently bouncing
  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-xl py-12 px-4">
        <div className="rounded-3xl border border-slate-200/80 bg-white/95 p-8 shadow-xl backdrop-blur-xl text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-600 text-3xl shadow-sm">
            🔐
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Protected Section</h2>
          <p className="mt-2 text-sm text-slate-600">
            This section requires authentication. You can sign in below or use a 1-click demo persona for instant access.
          </p>

          {quickError && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
              {quickError}
            </div>
          )}

          <div className="mt-6 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              ⚡ Instant 1-Click Demo Personas
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleQuickLogin('doctor')}
                disabled={Boolean(loggingIn)}
                className="flex items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50/80 px-4 py-3 text-xs font-bold text-cyan-800 transition hover:bg-cyan-100 disabled:opacity-50"
              >
                {loggingIn === 'doctor' ? 'Signing in...' : '🩺 Demo Doctor (Dr. Priya)'}
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('patient')}
                disabled={Boolean(loggingIn)}
                className="flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/80 px-4 py-3 text-xs font-bold text-indigo-800 transition hover:bg-indigo-100 disabled:opacity-50"
              >
                {loggingIn === 'patient' ? 'Signing in...' : '👤 Demo Patient (Rahul)'}
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('receptionist')}
                disabled={Boolean(loggingIn)}
                className="flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs font-bold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
              >
                {loggingIn === 'receptionist' ? 'Signing in...' : '📋 Demo Receptionist'}
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('admin')}
                disabled={Boolean(loggingIn)}
                className="flex items-center justify-center gap-2 rounded-xl border border-purple-200 bg-purple-50/80 px-4 py-3 text-xs font-bold text-purple-800 transition hover:bg-purple-100 disabled:opacity-50"
              >
                {loggingIn === 'admin' ? 'Signing in...' : '⚡ Demo Admin'}
              </button>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-center gap-3">
              <Link
                to="/auth"
                state={{ from: location }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition"
              >
                <span>🔑 Open Sign In Portal</span>
              </Link>
              <Link
                to="/home"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Admin has universal access
  if (role === 'admin') {
    return children;
  }

  // Check role authorization
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    return (
      <div className="mx-auto max-w-xl py-12 px-4 text-center">
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-8 shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-2xl">
            🔒
          </div>
          <h2 className="text-xl font-black text-rose-900">Access Restricted</h2>
          <p className="mt-2 text-sm text-rose-700">
            You are currently signed in as <span className="font-bold capitalize">{role}</span> ({user?.email}).
            This section requires one of the following roles:{' '}
            <span className="font-semibold">{allowedRoles.join(', ')}</span>.
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-2.5">
            {allowedRoles.includes('doctor') && (
              <button
                type="button"
                onClick={() => handleQuickLogin('doctor')}
                disabled={Boolean(loggingIn)}
                className="rounded-xl bg-cyan-700 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-800 transition"
              >
                {loggingIn === 'doctor' ? 'Switching...' : 'Switch to Demo Doctor'}
              </button>
            )}
            {allowedRoles.includes('patient') && (
              <button
                type="button"
                onClick={() => handleQuickLogin('patient')}
                disabled={Boolean(loggingIn)}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition"
              >
                {loggingIn === 'patient' ? 'Switching...' : 'Switch to Demo Patient'}
              </button>
            )}
            {allowedRoles.includes('receptionist') && (
              <button
                type="button"
                onClick={() => handleQuickLogin('receptionist')}
                disabled={Boolean(loggingIn)}
                className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 transition"
              >
                {loggingIn === 'receptionist' ? 'Switching...' : 'Switch to Demo Receptionist'}
              </button>
            )}
            <Link
              to="/auth"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              Sign In with Another Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
