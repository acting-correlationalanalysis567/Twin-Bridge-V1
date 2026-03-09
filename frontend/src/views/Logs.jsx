import { useState } from 'react';
import { useStore } from '../store/index.js';

export default function Logs() {
  const { logs, clearLogs } = useStore();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = logs.filter(l =>
    (filter === 'all' || l.level === filter || l.source === filter) &&
    (!search || l.message.toLowerCase().includes(search.toLowerCase()))
  );

  const exportLogs = (fmt) => {
    const content = fmt === 'json'
      ? JSON.stringify(filtered, null, 2)
      : 'timestamp,level,source,message\n' + filtered.map(l =>
          `${new Date(l.ts).toISOString()},${l.level},${l.source},"${l.message.replace(/"/g,'""')}"`).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `twinbridge-logs.${fmt}`; a.click();
  };

  const colors = { info: 'var(--cyan)', success: 'var(--green2)', warn: 'var(--amber)', error: 'var(--red)' };

  return (
    <div className="view" style={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--s1)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
        <div className="view-title" style={{ marginRight: 16 }}>Logs</div>
        {['all','info','success','warn','error','proxy','capture','replay','system'].map(f => (
          <button key={f} className={`btn btn-xs ${filter === f ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter(f)}>{f}</button>
        ))}
        <input className="input" style={{ flex: 1, maxWidth: 280, marginLeft: 8 }} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <span className="text-xs text-muted">{filtered.length} entries</span>
          <button className="btn btn-xs btn-outline" onClick={() => exportLogs('json')}>↓ JSON</button>
          <button className="btn btn-xs btn-outline" onClick={() => exportLogs('csv')}>↓ CSV</button>
          <button className="btn btn-xs btn-outline" onClick={clearLogs}>✕ Clear</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--mono)', fontSize: 11, padding: '0 24px' }}>
        {filtered.length === 0
          ? <div className="empty"><div className="empty-icon">≡</div><div className="empty-sub">No log entries</div></div>
          : filtered.map(l => (
              <div key={l.id} style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--dim)', flexShrink: 0, fontSize: 10 }}>{new Date(l.ts).toLocaleTimeString()}</span>
                <span style={{ color: colors[l.level] || 'var(--dim)', flexShrink: 0, minWidth: 52, fontWeight: 600 }}>{l.level}</span>
                <span style={{ color: 'var(--muted)', flexShrink: 0, minWidth: 60 }}>[{l.source}]</span>
                <span style={{ color: 'var(--text)' }}>{l.message}</span>
              </div>
            ))}
      </div>
    </div>
  );
}
