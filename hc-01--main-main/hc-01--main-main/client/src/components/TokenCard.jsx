export default function TokenCard({
  token,
  showWait = true,
  large = false,
  onAction,
  actionLabel,
  onOverride,
}) {
  const priorityStyles = {
    critical: {
      bg: 'bg-rose-600',
      text: 'text-rose-700',
      border: 'border-rose-300',
      badge: 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse',
      label: 'CRITICAL',
    },
    emergency: {
      bg: 'bg-rose-600',
      text: 'text-rose-700',
      border: 'border-rose-300',
      badge: 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse',
      label: 'CRITICAL',
    },
    urgent: {
      bg: 'bg-amber-500',
      text: 'text-amber-700',
      border: 'border-amber-300',
      badge: 'bg-amber-100 text-amber-800 border border-amber-300',
      label: 'URGENT',
    },
    senior: {
      bg: 'bg-amber-500',
      text: 'text-amber-700',
      border: 'border-amber-300',
      badge: 'bg-amber-100 text-amber-800 border border-amber-300',
      label: 'URGENT',
    },
    routine: {
      bg: 'bg-sky-500',
      text: 'text-sky-700',
      border: 'border-sky-300',
      badge: 'bg-sky-100 text-sky-800 border border-sky-300',
      label: 'ROUTINE',
    },
    general: {
      bg: 'bg-sky-500',
      text: 'text-sky-700',
      border: 'border-sky-300',
      badge: 'bg-sky-100 text-sky-800 border border-sky-300',
      label: 'ROUTINE',
    },
  };

  const statusStyles = {
    waiting: 'badge-waiting',
    'in-progress': 'badge-inprogress',
    done: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800',
    cancelled: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600',
  };

  const normKey = (token.priority || '').toLowerCase();
  const style = priorityStyles[normKey] || priorityStyles.routine;
  const tokenStr = token.tokenNumber !== undefined ? `A${String(token.tokenNumber).padStart(3, '0')}` : '--';

  const priorityReason = token.priorityReason || token.reason || 'Clinical priority';

  return (
    <div
      className={`p-4 rounded-2xl border-2 ${style.border} bg-white transition-all duration-300 hover:shadow-lg ${
        token.isEmergency || normKey === 'critical' || normKey === 'emergency' ? 'shadow-glow-red' : ''
      } ${large ? 'p-6' : ''} animate-slide-up`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider ${style.badge}`}>
            {style.label}
          </span>
          {token.isOverridden ? (
            <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full border border-purple-200">
              Overridden: {token.overriddenBy || 'Doctor'}
            </span>
          ) : (
            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              CDS Recommendation
            </span>
          )}
        </div>
        <span className={statusStyles[token.status] || ''}>{token.status}</span>
      </div>

      <div className="flex items-center gap-4">
        <div
          className={`${
            large ? 'w-16 h-16 text-xl' : 'w-12 h-12 text-sm'
          } ${style.bg} text-white font-black rounded-xl flex items-center justify-center shadow-lg`}
        >
          {tokenStr}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-800 truncate text-base">{token.patientName || '--'}</p>
          {token.age && <p className="text-xs text-slate-500">Age: {token.age}</p>}
          {token.condition && (
            <p className="text-xs text-slate-600 truncate mt-0.5 font-medium">
              Complaint: {token.condition}
            </p>
          )}
        </div>
      </div>

      {/* Clinical Priority Reason */}
      <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-700">
        <div className="flex items-start justify-between gap-2">
          <div>
            <strong className="text-slate-900 font-bold block">Reason:</strong>
            <span className="text-slate-600">{priorityReason}</span>
          </div>
          {onOverride && (
            <button
              type="button"
              onClick={() => onOverride(token)}
              className="text-xs text-blue-600 hover:text-blue-800 font-bold underline shrink-0 transition"
            >
              Override
            </button>
          )}
        </div>
      </div>

      {showWait && token.estimatedWaitTime > 0 && token.status === 'waiting' && (
        <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span>⏱️</span>
            <span>~{Math.round(token.estimatedWaitTime)} min wait</span>
          </span>
          {token.waitingPosition ? (
            <span className="font-semibold text-slate-600">Position #{token.waitingPosition}</span>
          ) : null}
        </div>
      )}

      {onAction && (
        <button
          onClick={() => onAction(token)}
          className="mt-3 w-full btn-primary text-sm py-2"
        >
          {actionLabel || 'Action'}
        </button>
      )}
    </div>
  );
}
