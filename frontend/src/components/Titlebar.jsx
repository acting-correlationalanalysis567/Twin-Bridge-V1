import { useStore } from '../store/index.js';

export default function Titlebar() {
  const { setCmdPalette, setNotifPanel, unreadCount, theme, setTheme } = useStore();

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('tb-theme', next);
  };

  return (
    <header className="titlebar">
      <div className="titlebar-traffic">
        <div className="tb-dot red"    title="Close" />
        <div className="tb-dot yellow" title="Minimize" />
        <div className="tb-dot green"  title="Maximize" />
      </div>
      <div className="titlebar-title">
        Twin<span>Bridge</span>
      </div>
      <div className="titlebar-actions">
        <button
          className="btn btn-outline btn-xs"
          onClick={() => setCmdPalette(true)}
          title="Command Palette (⌘K)"
        >
          ⌘K
        </button>
        <button
          className="btn btn-outline btn-xs"
          onClick={toggleTheme}
          title="Toggle theme"
        >
          {theme === 'dark' ? '◑' : '◐'}
        </button>
        <button
          className="btn btn-outline btn-xs"
          onClick={() => setNotifPanel(true)}
          title="Notifications"
          style={{ position: 'relative' }}
        >
          🔔
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute', top: -4, right: -4,
              background: 'var(--red)', color: '#fff',
              width: 14, height: 14, borderRadius: '50%',
              fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
