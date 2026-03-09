import { useState } from 'react';

const TABS = ['Overview', 'Headers', 'Body', 'Timing'];

export default function EventInspector({ event: e, onClose }) {
  const [tab, setTab] = useState('Overview');

  return (
    <div style={{
      width: 380, flexShrink: 0, borderLeft: '1px solid var(--border2)',
      display: 'flex', flexDirection: 'column', background: 'var(--s1)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span className={`method ${e.method}`}>{e.method}</span>
          <span style={{ fontSize: 11, color: 'var(--text)', marginLeft: 8, fontFamily: 'var(--mono)' }}>{e.path}</span>
        </div>
        <button className="btn btn-xs btn-outline" onClick={onClose}>✕</button>
      </div>

      <div className="tab-bar">
        {TABS.map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {tab === 'Overview' && <OverviewTab e={e} />}
        {tab === 'Headers'  && <HeadersTab e={e} />}
        {tab === 'Body'     && <BodyTab e={e} />}
        {tab === 'Timing'   && <TimingTab e={e} />}
      </div>
    </div>
  );
}

function Row({ label, value, mono = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      <span style={{ color: 'var(--dim)', flexShrink: 0, marginRight: 12 }}>{label}</span>
      <span style={{ fontFamily: mono ? 'var(--mono)' : undefined, textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

function OverviewTab({ e }) {
  const statusClass = e.status < 300 ? 'ok' : e.status < 400 ? 'redir' : 'err';
  return (
    <div>
      <Row label="Status" value={<span className={`status ${statusClass}`}>{e.status}</span>} />
      <Row label="Latency" value={`${e.latency_ms} ms`} />
      <Row label="Size" value={e.res_body ? (JSON.stringify(e.res_body).length / 1024).toFixed(2) + ' KB' : '—'} />
      <Row label="Captured" value={e.captured_at ? new Date(e.captured_at).toLocaleString() : '—'} />
      <Row label="Session" value={e.session_id ? e.session_id.slice(0, 8) + '…' : '—'} mono />
      <Row label="Twin" value={e.twin_id ? e.twin_id.slice(0, 8) + '…' : '—'} mono />
    </div>
  );
}

function HeadersTab({ e }) {
  const sections = [
    { title: 'Request Headers', headers: e.req_headers || {} },
    { title: 'Response Headers', headers: e.res_headers || {} },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {sections.map(s => (
        <div key={s.title}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--dim)', marginBottom: 8, fontWeight: 600 }}>{s.title}</div>
          {Object.entries(s.headers).length === 0
            ? <span className="text-muted text-sm">—</span>
            : Object.entries(s.headers).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                  <span style={{ color: 'var(--cyan)', fontFamily: 'var(--mono)', flexShrink: 0 }}>{k}</span>
                  <span style={{ color: 'var(--text)', wordBreak: 'break-all' }}>{v}</span>
                </div>
              ))}
        </div>
      ))}
    </div>
  );
}

function BodyTab({ e }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[['Request Body', e.req_body], ['Response Body', e.res_body]].map(([title, body]) => (
        <div key={title}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--dim)', marginBottom: 8, fontWeight: 600 }}>{title}</div>
          {body == null
            ? <span className="text-muted text-sm">—</span>
            : <pre className="code-block">{JSON.stringify(body, null, 2)}</pre>}
        </div>
      ))}
    </div>
  );
}

function TimingTab({ e }) {
  const t = e.timing || {};
  const total = (t.dns || 0) + (t.connect || 0) + (t.ttfb || 0) + (t.download || 0) || 1;
  const bars = [
    { label: 'DNS',      value: t.dns,      color: '#7c3aed' },
    { label: 'Connect',  value: t.connect,  color: '#3b82f6' },
    { label: 'TTFB',     value: t.ttfb,     color: '#f59e0b' },
    { label: 'Download', value: t.download, color: '#10b981' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {bars.map(b => (
        <div key={b.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
            <span style={{ color: 'var(--dim)' }}>{b.label}</span>
            <span>{b.value || 0} ms</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${((b.value || 0) / total) * 100}%`, background: b.color }} />
          </div>
        </div>
      ))}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600 }}>
        <span style={{ color: 'var(--dim)' }}>Total</span>
        <span>{e.latency_ms} ms</span>
      </div>
    </div>
  );
}
