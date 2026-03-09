import { useStore } from '../store/index.js';

export default function NotifPanel() {
  const { notifPanelOpen, setNotifPanel, notifications, markAllRead } = useStore();
  if (!notifPanelOpen) return null;

  return (
    <div className="modal-overlay" onClick={() => setNotifPanel(false)}>
      <div style={{ position: 'fixed', top: 40, right: 0, bottom: 0, width: 340, background: 'var(--s1)', borderLeft: '1px solid var(--border2)', display: 'flex', flexDirection: 'column', zIndex: 400 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Notifications</span>
          <div className="flex gap-6">
            <button className="btn btn-xs btn-outline" onClick={markAllRead}>Mark all read</button>
            <button className="btn btn-xs btn-outline" onClick={() => setNotifPanel(false)}>✕</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {notifications.length === 0
            ? <div className="empty"><div className="empty-icon">🔔</div><div className="empty-sub">No notifications yet</div></div>
            : notifications.map(n => (
                <div key={n.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: n.read ? 'transparent' : 'rgba(0,212,255,0.03)', display: 'flex', gap: 10 }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{n.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--bright)' }}>{n.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>{n.msg}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>{new Date(n.ts).toLocaleTimeString()}</div>
                  </div>
                  {!n.read && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cyan)', flexShrink: 0, marginTop: 4 }} />}
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}
