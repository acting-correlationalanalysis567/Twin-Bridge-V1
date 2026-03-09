import { useStore } from '../store/index.js';

export default function Dashboard() {
  const { twins, captureEvents, logs, setView } = useStore();
  const runningTwins = twins.filter(t => t.running);
  const totalEvents  = twins.reduce((n, t) => n + (t.event_count || 0), 0);
  const avgAccuracy  = twins.length ? Math.round(twins.reduce((n, t) => n + (t.accuracy || 0), 0) / twins.length) : 0;
  const recentLogs   = logs.slice(0, 8);

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <div className="view-title">Dashboard</div>
          <div className="view-sub">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
      </div>
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Twins', value: twins.length, delta: `${runningTwins.length} running` },
          { label: 'Live Events', value: captureEvents.length, delta: captureEvents.length > 0 ? 'active capture' : 'no capture' },
          { label: 'Total Events', value: totalEvents.toLocaleString(), delta: '' },
          { label: 'Avg Accuracy', value: `${avgAccuracy}%`, delta: avgAccuracy >= 90 ? 'healthy' : avgAccuracy > 0 ? 'needs attention' : 'no data', neg: avgAccuracy < 90 && avgAccuracy > 0 },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            {s.delta && <div className={`stat-delta ${s.neg ? 'neg' : ''}`}>{s.delta}</div>}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Running Proxies</span></div>
          {runningTwins.length === 0
            ? <div className="empty" style={{ padding: 24 }}>
                <div className="empty-sub">No proxies running</div>
                <button className="btn btn-outline btn-sm" onClick={() => setView('capture')}>Start a Capture</button>
              </div>
            : runningTwins.map(t => (
                <div key={t.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 12, alignItems: 'center' }}>
                  <div>
                    <span style={{ color: 'var(--bright)', fontWeight: 500 }}>{t.name}</span>
                    <span style={{ color: 'var(--dim)', marginLeft: 8 }}>:{t.proxy_port}</span>
                  </div>
                  <span style={{ color: 'var(--dim)' }}>{t.event_count || 0} events</span>
                </div>
              ))}
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Recent Activity</span></div>
          {recentLogs.length === 0
            ? <div className="empty" style={{ padding: 24 }}><div className="empty-sub">No activity yet</div></div>
            : recentLogs.map(l => (
                <div key={l.id} style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, fontSize: 11 }}>
                  <span style={{ color: 'var(--dim)', flexShrink: 0 }}>{new Date(l.ts).toLocaleTimeString()}</span>
                  <span style={{ color: l.level === 'error' ? 'var(--red)' : l.level === 'success' ? 'var(--green2)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.message}</span>
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}
