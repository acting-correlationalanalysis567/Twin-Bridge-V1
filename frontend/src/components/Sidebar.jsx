import { useStore } from '../store/index.js';
import { useEffect, useState } from 'react';
import { healthApi } from '../api/index.js';

const NAV = [
  { id: 'dashboard', icon: '⬡', label: 'Dashboard',  section: 'main' },
  { id: 'twins',     icon: '◈', label: 'Twins',       section: 'main' },
  { id: 'capture',   icon: '⏺', label: 'Capture',     section: 'main' },
  { id: 'replay',    icon: '▶', label: 'Replay',      section: 'main' },
  { id: 'diff',      icon: '⇌', label: 'Schema Diff', section: 'main' },
  { id: 'logs',      icon: '≡', label: 'Logs',        section: 'main' },
  { id: 'versions',  icon: '◎', label: 'Versions',    section: 'main' },
  { id: 'registry',  icon: '⊞', label: 'Registry',    section: 'data' },
  { id: 'settings',  icon: '⚙', label: 'Settings',    section: 'data' },
];

export default function Sidebar() {
  const { view, setView, twins, captureEvents, unreadCount } = useStore();
  const [backendOk, setBackendOk] = useState(null);

  useEffect(() => {
    const check = () => healthApi.check().then(() => setBackendOk(true)).catch(() => setBackendOk(false));
    check();
    const t = setInterval(check, 10000);
    return () => clearInterval(t);
  }, []);

  const runningTwins = twins.filter(t => t.running).length;

  const badges = {
    twins:   runningTwins > 0 ? String(runningTwins) : null,
    capture: captureEvents.length > 0 ? String(captureEvents.length > 999 ? '999+' : captureEvents.length) : null,
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-section-label">Main</div>
      {NAV.filter(n => n.section === 'main').map(item => (
        <button
          key={item.id}
          className={`nav-item ${view === item.id ? 'active' : ''}`}
          onClick={() => setView(item.id)}
          title={item.label}
        >
          <span className="nav-item-icon">{item.icon}</span>
          {item.label}
          {badges[item.id] && (
            <span className={`nav-item-badge ${item.id === 'capture' ? '' : ''}`}>
              {badges[item.id]}
            </span>
          )}
        </button>
      ))}

      <div className="sidebar-section-label" style={{ marginTop: 8 }}>Config</div>
      {NAV.filter(n => n.section === 'data').map(item => (
        <button
          key={item.id}
          className={`nav-item ${view === item.id ? 'active' : ''}`}
          onClick={() => setView(item.id)}
        >
          <span className="nav-item-icon">{item.icon}</span>
          {item.label}
        </button>
      ))}

      <div className="sidebar-footer">
        <span className={`sidebar-status-dot ${backendOk === false ? 'offline' : ''}`} />
        {backendOk === null ? 'connecting…' : backendOk ? 'backend connected' : 'backend offline'}
        <div style={{ marginTop: 6, color: 'var(--dim)', fontSize: 10 }}>
          {twins.length} twin{twins.length !== 1 ? 's' : ''}
          {runningTwins > 0 && ` · ${runningTwins} running`}
        </div>
      </div>
    </aside>
  );
}
