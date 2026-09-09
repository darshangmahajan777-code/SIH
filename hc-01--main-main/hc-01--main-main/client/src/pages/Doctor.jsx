import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import QueueList from '../components/QueueList';
import ConsultationTimer from '../components/ConsultationTimer';
import StatsCard from '../components/StatsCard';
import { useQueue } from '../context/QueueContext';
import * as api from '../services/api';

export default function Doctor() {
  const pageRef = useRef(null);
  const { queue, callNext, completeToken, currentToken, stats, loading, connected } = useQueue();

  const [session, setSession] = useState(null);
  const [doctorName, setDoctorName] = useState('');
  const [error, setError] = useState('');

  const waitingQueue = useMemo(
    () => queue.filter((token) => token.status === 'waiting'),
    [queue]
  );

  useEffect(() => {
    if (!pageRef.current) return;

    const ctx = gsap.context(() => {
      gsap.from('[data-gsap-doctor-header]', {
        y: 18,
        opacity: 0,
        duration: 0.55,
        ease: 'power3.out',
      });

      gsap.from('[data-gsap-doctor-card]', {
        y: 24,
        opacity: 0,
        duration: 0.62,
        ease: 'power2.out',
        stagger: 0.1,
        delay: 0.1,
      });
    }, pageRef);

    return () => ctx.revert();
  }, [session]);

  const refetchSession = useCallback(async () => {
    try {
      const activeSession = await api.getDoctorSession();
      setSession(activeSession || null);
    } catch (fetchError) {
      setSession(null);
      setError(fetchError.message || 'Failed to fetch doctor session.');
    }
  }, []);

  useEffect(() => {
    refetchSession();
  }, [refetchSession]);

  const handleStartSession = async () => {
    if (!doctorName.trim()) {
      setError('Doctor name is required.');
      return;
    }

    try {
      const started = await api.startDoctorSession({ doctorName: doctorName.trim() });
      setSession(started);
      setError('');
    } catch (startError) {
      setError(startError.message || 'Failed to start session.');
    }
  };

  const handleEndSession = async () => {
    try {
      await api.endDoctorSession();
      setSession(null);
      setError('');
    } catch (endError) {
      setError(endError.message || 'Failed to end session.');
    }
  };

  const handleCallNext = async () => {
    setError('');
    try {
      await callNext();
    } catch (callError) {
      setError(callError.message || 'No waiting patients.');
    }
  };

  const handleComplete = async () => {
    if (!currentToken) return;

    try {
      await completeToken(currentToken.tokenNumber);
      await refetchSession();
    } catch (completeError) {
      setError(completeError.message || 'Failed to complete consultation.');
    }
  };

  if (!session) {
    return (
      <section ref={pageRef} className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/40">
        <h1 className="text-2xl font-black text-slate-900">Doctor Session</h1>
        <p className="mt-1 text-sm text-slate-600">Start session to manage queue operations.</p>

        <div className="mt-6 space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-slate-700">Doctor Name</span>
            <input
              type="text"
              className="input-field"
              value={doctorName}
              onChange={(event) => setDoctorName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleStartSession();
                }
              }}
            />
          </label>

          {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          <button type="button" className="btn-primary w-full py-3" onClick={handleStartSession}>
            Start Session
          </button>
        </div>
      </section>
    );
  }

  // Priority Override State
  const [overrideToken, setOverrideToken] = useState(null);
  const [overridePriorityVal, setOverridePriorityVal] = useState('critical');
  const [overrideReasonText, setOverrideReasonText] = useState('');
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [overrideFeedback, setOverrideFeedback] = useState('');

  const handleOpenOverride = (token) => {
    setOverrideToken(token);
    setOverridePriorityVal(token.priority || 'urgent');
    setOverrideReasonText('');
    setOverrideFeedback('');
  };

  const handleSubmitOverride = async (e) => {
    e?.preventDefault();
    if (!overrideToken) return;
    setOverrideLoading(true);
    setOverrideFeedback('');

    try {
      const res = await fetch('/api/priority/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId: overrideToken._id,
          newPriority: overridePriorityVal,
          overrideReason: overrideReasonText.trim() || 'Clinical direct assessment by physician',
          doctorName: session?.doctorName || 'Attending Physician',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setOverrideFeedback(`Priority successfully updated to ${overridePriorityVal.toUpperCase()}`);
        setTimeout(() => {
          setOverrideToken(null);
          setOverrideFeedback('');
        }, 1200);
      } else {
        alert(data.error || 'Failed to override priority');
      }
    } catch (err) {
      alert('Network error submitting clinical override');
    } finally {
      setOverrideLoading(false);
    }
  };

  return (
    <section ref={pageRef} className="space-y-6">
      <div data-gsap-doctor-header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Doctor Panel</h1>
          <p className="mt-1 text-sm text-slate-600">Dr. {session.doctorName}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className={`rounded-full px-4 py-2 text-sm font-semibold ${connected ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
            {connected ? 'Live' : 'Offline'}
          </div>
          <button type="button" onClick={handleEndSession} className="btn-outline py-2 text-sm">
            End Session
          </button>
        </div>
      </div>

      {/* Clinical Decision Support (CDS) Advisory Banner */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 text-xs text-indigo-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-base">🛡️</span>
          <div>
            <strong className="font-bold">Clinical Decision Support (CDS) Active:</strong> Queue priorities are dynamically proposed to expedite emergent cases. 
            <span className="text-indigo-800 ml-1">Not an autonomous medical diagnosis. Attending physician holds sole clinical authority to override.</span>
          </div>
        </div>
        <span className="text-[11px] font-bold bg-indigo-100 text-indigo-800 px-2.5 py-1 rounded-full border border-indigo-200 shrink-0">
          Physician Override Enabled
        </span>
      </div>

      <div data-gsap-doctor-card className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatsCard icon="Q" label="Waiting" value={waitingQueue.length} color="sky" />
        <StatsCard icon="P" label="In Progress" value={currentToken ? 1 : 0} color="emerald" />
        <StatsCard icon="H" label="Handled" value={session.tokensHandled ?? '--'} color="purple" />
        <StatsCard
          icon="A"
          label="Avg Consult"
          value={stats?.avgConsultTime !== undefined ? `${stats.avgConsultTime}m` : '--'}
          color="amber"
        />
      </div>

      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div data-gsap-doctor-card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/40">
          <h2 className="text-xl font-bold text-slate-900">Now Serving</h2>
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-5 text-center">
            <p className="text-4xl font-black text-slate-900">
              {currentToken ? `A${String(currentToken.tokenNumber).padStart(3, '0')}` : '--'}
            </p>
            <p className="mt-2 text-sm text-slate-600">{currentToken?.patientName || 'No active patient'}</p>
            {currentToken?.priority ? (
              <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                ['critical', 'emergency'].includes(currentToken.priority)
                  ? 'bg-rose-600 text-white animate-pulse'
                  : ['urgent', 'senior'].includes(currentToken.priority)
                  ? 'bg-amber-500 text-white'
                  : 'bg-slate-900 text-white'
              }`}>
                {currentToken.priority}
              </span>
            ) : null}
          </div>

          <ConsultationTimer
            isActive={Boolean(currentToken)}
            startTime={currentToken?.calledAt}
            onComplete={currentToken ? handleComplete : undefined}
          />

          <button
            type="button"
            onClick={handleCallNext}
            disabled={loading || waitingQueue.length === 0}
            className="btn-primary mt-4 w-full py-4 text-base font-bold disabled:opacity-50"
          >
            {loading ? 'Processing...' : waitingQueue.length === 0 ? 'No waiting patients' : 'Call Next Patient'}
          </button>
        </div>

        <div data-gsap-doctor-card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/40">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">Waiting Queue</h2>
            <span className="text-xs text-slate-500 font-medium">Sorted by Acuity Policy</span>
          </div>
          <div className="mt-4">
            <QueueList queue={waitingQueue} onOverride={handleOpenOverride} isDoctorView={true} />
          </div>
        </div>
      </div>

      {/* Clinical Override Modal */}
      {overrideToken && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 animate-scale-up space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-slate-900 text-lg">Clinical Priority Override</h3>
                <p className="text-xs text-slate-500">Authorized Physician Action</p>
              </div>
              <button
                onClick={() => setOverrideToken(null)}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs space-y-1.5">
              <div>
                <strong className="text-slate-700">Patient:</strong> {overrideToken.patientName} (Token #{overrideToken.tokenNumber})
              </div>
              <div>
                <strong className="text-slate-700">Chief Complaint:</strong> {overrideToken.condition || 'None specified'}
              </div>
              <div>
                <strong className="text-slate-700">Current Priority:</strong>{' '}
                <span className="capitalize font-bold text-slate-900">{overrideToken.priority}</span>
              </div>
              <div>
                <strong className="text-slate-700">CDS Reason:</strong>{' '}
                <span className="text-slate-600">{overrideToken.priorityReason || overrideToken.reason || 'Standard assessment'}</span>
              </div>
            </div>

            <form onSubmit={handleSubmitOverride} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-2">
                  Select New Priority
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'critical', label: 'CRITICAL', color: 'border-rose-500 bg-rose-50 text-rose-800' },
                    { id: 'urgent', label: 'URGENT', color: 'border-amber-500 bg-amber-50 text-amber-800' },
                    { id: 'routine', label: 'ROUTINE', color: 'border-sky-500 bg-sky-50 text-sky-800' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setOverridePriorityVal(p.id)}
                      className={`py-2 px-2 text-xs font-black rounded-xl border-2 transition text-center ${
                        overridePriorityVal === p.id
                          ? `${p.color} ring-2 ring-offset-1 ring-slate-400`
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                  Clinical Override Reason (Required for Audit Trail)
                </label>
                <textarea
                  required
                  rows={3}
                  value={overrideReasonText}
                  onChange={(e) => setOverrideReasonText(e.target.value)}
                  placeholder="e.g. Physical exam shows patient stable / SpO2 normal / Escalated due to acute symptoms"
                  className="w-full text-xs rounded-xl border border-slate-300 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {overrideFeedback && (
                <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold text-center">
                  ✓ {overrideFeedback}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOverrideToken(null)}
                  className="btn-outline py-2.5 px-4 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={overrideLoading}
                  className="btn-primary py-2.5 px-5 text-xs font-bold shadow-md disabled:opacity-50"
                >
                  {overrideLoading ? 'Applying...' : 'Confirm Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
