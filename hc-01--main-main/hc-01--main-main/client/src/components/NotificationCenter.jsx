import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getSocket } from '../services/socket';

const TYPE_CONFIG = {
  appointment_confirmed: {
    icon: '📅',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    category: 'appointments',
  },
  appointment_cancelled: {
    icon: '❌',
    color: 'bg-rose-50 text-rose-700 border-rose-200',
    category: 'appointments',
  },
  appointment_reminder: {
    icon: '⏰',
    color: 'bg-sky-50 text-sky-700 border-sky-200',
    category: 'appointments',
  },
  queue_update: {
    icon: '⏱️',
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    category: 'queue',
  },
  near_turn: {
    icon: '🚨',
    color: 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse',
    category: 'queue',
  },
  video_ready: {
    icon: '📹',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    category: 'appointments',
  },
  prescription_created: {
    icon: '💊',
    color: 'bg-purple-50 text-purple-700 border-purple-200',
    category: 'clinical',
  },
  medicine_reminder: {
    icon: '🕒',
    color: 'bg-teal-50 text-teal-700 border-teal-200',
    category: 'clinical',
  },
  lab_result: {
    icon: '🧪',
    color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    category: 'clinical',
  },
  care_plan: {
    icon: '📋',
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    category: 'clinical',
  },
  follow_up: {
    icon: '🗓️',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    category: 'appointments',
  },
  consent_granted: {
    icon: '🔓',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    category: 'security',
  },
  consent_revoked: {
    icon: '🔒',
    color: 'bg-rose-50 text-rose-700 border-rose-200',
    category: 'security',
  },
  medical_record_access: {
    icon: '👁️',
    color: 'bg-amber-50 text-amber-800 border-amber-200',
    category: 'security',
  },
};

export default function NotificationCenter({
  userId = '65f000000000000000000001',
  isOpen,
  onClose,
  unreadCount,
  setUnreadCount,
}) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all'); // all, unread, appointments, clinical, security
  const [liveToast, setLiveToast] = useState(null);
  const panelRef = useRef(null);

  // Fetch notifications
  const fetchNotifications = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/notifications?recipient=${userId}&limit=50`);
      const data = await res.json();
      if (data.success) {
        setNotifications(data.data || []);
        if (typeof data.unreadCount === 'number' && setUnreadCount) {
          setUnreadCount(data.unreadCount);
        }
      }
    } catch (err) {
      console.warn('[NotificationCenter] Failed to fetch notifications:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [userId]);

  // Socket.IO real-time subscription
  useEffect(() => {
    if (!userId) return;
    const socket = getSocket();

    const subscribe = () => {
      socket.emit('notification:subscribe', { userId });
      socket.emit('join_room', `user:${userId}`);
      socket.emit('join_room', `patient-room:${userId}`);
    };

    subscribe();
    socket.on('connect', subscribe);

    const handleNewNotification = (notif) => {
      if (!notif) return;
      // Prepend if belongs to this user
      if (String(notif.recipient) === String(userId)) {
        setNotifications((prev) => [notif, ...prev.filter((n) => (n._id || n.id) !== (notif._id || notif.id))]);
        if (setUnreadCount) {
          setUnreadCount((c) => c + 1);
        }
        // Show live toast banner if center is closed
        setLiveToast(notif);
        setTimeout(() => setLiveToast(null), 5000);
      }
    };

    const handleUnreadCount = ({ unreadCount }) => {
      if (typeof unreadCount === 'number' && setUnreadCount) {
        setUnreadCount(unreadCount);
      }
    };

    socket.on('notification:new', handleNewNotification);
    socket.on('notification:unread_count', handleUnreadCount);

    return () => {
      socket.off('connect', subscribe);
      socket.off('notification:new', handleNewNotification);
      socket.off('notification:unread_count', handleUnreadCount);
    };
  }, [userId, setUnreadCount]);

  // Mark single notification as read
  const handleMarkAsRead = async (notifId) => {
    try {
      const res = await fetch(`/api/notifications/${notifId}/read`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: userId }),
      });
      const data = await res.json();
      if (data.success) {
        setNotifications((prev) =>
          prev.map((n) => ((n._id || n.id) === notifId ? { ...n, read: true } : n))
        );
        if (typeof data.unreadCount === 'number' && setUnreadCount) {
          setUnreadCount(data.unreadCount);
        }
      }
    } catch (err) {
      console.warn('Failed to mark read:', err.message);
    }
  };

  // Mark all as read
  const handleMarkAllAsRead = async () => {
    try {
      const res = await fetch('/api/notifications/mark-all-read', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: userId }),
      });
      const data = await res.json();
      if (data.success) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        if (setUnreadCount) {
          setUnreadCount(0);
        }
      }
    } catch (err) {
      console.warn('Failed to mark all read:', err.message);
    }
  };

  // Filter notifications
  const filteredNotifications = notifications.filter((n) => {
    if (activeFilter === 'unread') return !n.read;
    if (activeFilter === 'appointments') {
      return ['appointment_confirmed', 'appointment_cancelled', 'appointment_reminder', 'video_ready', 'follow_up'].includes(n.type);
    }
    if (activeFilter === 'clinical') {
      return ['prescription_created', 'medicine_reminder', 'lab_result', 'care_plan'].includes(n.type);
    }
    if (activeFilter === 'security') {
      return ['consent_granted', 'consent_revoked', 'medical_record_access'].includes(n.type);
    }
    return true;
  });

  // Relative time helper
  const formatRelativeTime = (dateStr) => {
    try {
      const date = new Date(dateStr);
      const diffMs = Date.now() - date.getTime();
      const diffSecs = Math.floor(diffMs / 1000);
      if (diffSecs < 60) return 'just now';
      const diffMins = Math.floor(diffSecs / 60);
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return '';
    }
  };

  return (
    <>
      {/* Real-time Floating Toast Alert (when notification center is closed) */}
      {!isOpen && liveToast && (
        <div className="fixed top-20 right-4 z-50 max-w-sm w-full bg-slate-900 text-white rounded-2xl shadow-2xl p-4 border border-slate-700 animate-in fade-in slide-in-from-top-4 flex items-start gap-3">
          <span className="text-2xl mt-0.5">
            {TYPE_CONFIG[liveToast.type]?.icon || '🔔'}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-slate-100 truncate">{liveToast.title}</h4>
              <button
                type="button"
                onClick={() => setLiveToast(null)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-300 mt-1 line-clamp-2">{liveToast.message}</p>
          </div>
        </div>
      )}

      {/* Flyout Panel Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-xs flex justify-end">
          <div
            ref={panelRef}
            className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 border-l border-slate-200"
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🔔</span>
                <h2 className="font-black text-slate-900 text-base">Notifications</h2>
                {unreadCount > 0 && (
                  <span className="bg-rose-500 text-white text-[11px] font-extrabold px-2 py-0.5 rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllAsRead}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 transition px-2 py-1 rounded-lg hover:bg-blue-50"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="text-slate-400 hover:text-slate-600 font-bold text-lg w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-200/50"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-slate-100 overflow-x-auto text-xs font-semibold">
              {[
                { id: 'all', label: 'All' },
                { id: 'unread', label: `Unread (${unreadCount})` },
                { id: 'appointments', label: 'Visits' },
                { id: 'clinical', label: 'Clinical' },
                { id: 'security', label: 'Security' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setActiveFilter(f.id)}
                  className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition ${
                    activeFilter === f.id
                      ? 'bg-slate-900 text-white font-bold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Notifications List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading && notifications.length === 0 && (
                <div className="text-center py-16 text-slate-400 text-xs">
                  Loading notifications...
                </div>
              )}

              {!loading && filteredNotifications.length === 0 && (
                <div className="text-center py-20 px-6 space-y-2">
                  <div className="text-4xl">🎉</div>
                  <h3 className="font-bold text-slate-700 text-sm">You're all caught up!</h3>
                  <p className="text-xs text-slate-400">
                    No {activeFilter !== 'all' ? activeFilter : ''} notifications to display.
                  </p>
                </div>
              )}

              {filteredNotifications.map((notif) => {
                const notifId = notif._id || notif.id;
                const cfg = TYPE_CONFIG[notif.type] || {
                  icon: '🔔',
                  color: 'bg-slate-50 text-slate-700 border-slate-200',
                };

                return (
                  <div
                    key={notifId}
                    className={`rounded-2xl border p-3.5 transition relative flex items-start gap-3 ${
                      !notif.read
                        ? 'bg-blue-50/40 border-blue-200 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Icon Badge */}
                    <div
                      className={`w-9 h-9 rounded-xl border flex items-center justify-center text-base shrink-0 ${cfg.color}`}
                    >
                      {cfg.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-6">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900 text-xs truncate">
                          {notif.title}
                        </h4>
                        {!notif.read && (
                          <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        {notif.message}
                      </p>

                      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100/80 text-[11px]">
                        <span className="text-slate-400">
                          {formatRelativeTime(notif.createdAt)}
                        </span>

                        {/* Action Link based on type / metadata */}
                        <div className="flex items-center gap-2">
                          {notif.type === 'video_ready' && notif.metadata?.appointmentId && (
                            <Link
                              to={`/telemedicine/${notif.metadata.appointmentId}`}
                              onClick={onClose}
                              className="text-emerald-700 font-bold hover:underline"
                            >
                              Join Call →
                            </Link>
                          )}
                          {['near_turn', 'queue_update'].includes(notif.type) && (
                            <Link
                              to="/my-appointments"
                              onClick={onClose}
                              className="text-blue-600 font-bold hover:underline"
                            >
                              Queue →
                            </Link>
                          )}
                          {['care_plan', 'consent_granted', 'consent_revoked', 'medical_record_access'].includes(
                            notif.type
                          ) && (
                            <Link
                              to="/my-data"
                              onClick={onClose}
                              className="text-indigo-600 font-bold hover:underline"
                            >
                              View Data →
                            </Link>
                          )}
                          {!notif.read && (
                            <button
                              type="button"
                              onClick={() => handleMarkAsRead(notifId)}
                              className="text-slate-400 hover:text-slate-700 font-medium"
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
