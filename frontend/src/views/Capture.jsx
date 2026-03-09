import { useState, useEffect } from 'react';
import { useStore } from '../store/index.js';
import { proxyApi, captureApi, twinsApi } from '../api/index.js';
import EventInspector from '../components/EventInspector.jsx';

export default function Capture() {
  const { twins, captureEvents, clearCaptureEvents, setActiveSession, clearActiveSession, activePort,
          activeSessionId, activeTwinId, setInspectorEvent, inspectorEvent, addNotif, addLog } = useStore();

  const [selectedTwinId, setSelectedTwinId] = useState('');
  const [upstream, setUpstream]   = useState('');
  const [port, setPort]           = useState('');
  const [starting, setStarting]   = useState(false);
  const [stopping, setStopping]   = useState(false);
  const [filterMethod, setFilter] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchPath, setSearchPath] = useState('');
  const [exporting, setExporting] = useState(false);

  // Pre-fill upstream from selected twin
  useEffect(() => {
    const twin = twins.find(t => t.id === selectedTwinId);
    if (twin?.upstream) setUpstream(twin.upstream);
  }, [selectedTwinId, twins]);

  const isCapturing = !!activeSessionId;

  const startCapture = async () => {
    if (!selectedTwinId || !upstream) return;
    setStarting(true);
    try {
      const session = await proxyApi.start(selectedTwinId, upstream, port ? Number(port) : undefined);
      setActiveSession(session.sessionId, selectedTwinId, session.port);
      clearCaptureEvents();
      addLog({ level: 'success', message: `Proxy started on :${session.port} → ${upstream}`, source: 'capture' });
    } catch (err) {
      addNotif({ icon: '✗', title: 'Proxy error', msg: err.response?.data?.error || err.message, type: 'error' });
    } finally {
      setStarting(false);
    }
  };

  const stopCapture = async () => {
    if (!activeTwinId || !activePort) return;
    setStopping(true);
    try {
      await proxyApi.stop(activeTwinId, activePort);
      clearActiveSession();
    } catch (err) {
      addNotif({ icon: '✗', title: 'Stop error', msg: err.message, type: 'error' });
    } finally {
      setStopping(false);
    }
  };

  const doExport = async (format) => {
    const params = { format };
    if (activeTwinId) params.twinId = activeTwinId;
    try {
      const res = await fetch(captureApi.exportUrl(params));
      const blob = await res.blob();
      const ext = format === 'har' ? 'har' : format === 'openapi' ? 'json' : 'json';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `capture-${Date.now()}.${ext}`;
      a.click();
    } catch (err) {
      addNotif({ icon: '✗', title: 'Export failed', msg: err.message, type: 'error' });
    }
  };

  const filtered = captureEvents.filter(e => {
    if (filterMethod !== 'ALL' && e.method !== filterMethod) return false;
    if (filterStatus === '2xx' && !(e.status >= 200 && e.status < 300)) return false;
    if (filterStatus === '4xx' && !(e.status >= 400 && e.status < 500)) return false;
    if (filterStatus === '5xx' && e.status >= 500) return false;
    if (searchPath && !e.path.toLowerCase().includes(searchPath.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="view" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0 }}>
      {/* Toolbar */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--s1)', flexShrink: 0 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <div>
            <div className="view-title">Capture</div>
            <div className="view-sub">Proxy real API traffic and capture it</div>
          </div>
          <div className="flex gap-8">
            {isCapturing ? (
              <button className="btn btn-danger" onClick={stopCapture} disabled={stopping}>
                {stopping ? <span className="spinner" /> : '■'} Stop
              </button>
            ) : (
              <button className="btn btn-primary" onClick={startCapture} disabled={starting || !selectedTwinId || !upstream}>
                {starting ? <span className="spinner" /> : '▶'} Start Capture
              </button>
            )}
          </div>
        </div>

        {/* Config row */}
        {!isCapturing && (
          <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '0 0 200px' }}>
              <label className="form-label">Twin</label>
              <select className="input select" value={selectedTwinId} onChange={e => setSelectedTwinId(e.target.value)}>
                <option value="">Select a twin…</option>
                {twins.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 240 }}>
              <label className="form-label">Upstream URL</label>
              <input className="input" placeholder="https://api.stripe.com" value={upstream} onChange={e => setUpstream(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: '0 0 120px' }}>
              <label className="form-label">Proxy Port</label>
              <input className="input" placeholder="auto" value={port} onChange={e => setPort(e.target.value)} type="number" />
            </div>
          </div>
        )}

        {isCapturing && (
          <div className="flex items-center gap-12" style={{ fontSize: 12 }}>
            <span style={{ color: 'var(--green2)' }}>
              <span className="sidebar-status-dot" style={{ marginRight: 6 }} />
              Capturing → {upstream || 'upstream'}
            </span>
            <span className="text-muted">{captureEvents.length} events</span>
            <span className="text-muted">Port :{activePort || '…'}</span>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border)', background: 'var(--s2)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        {['ALL','GET','POST','PUT','PATCH','DELETE'].map(m => (
          <button key={m} className={`btn btn-xs ${filterMethod === m ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setFilter(m)}>{m}</button>
        ))}
        <select className="input select btn-sm" style={{ width: 100 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All status</option>
          <option value="2xx">2xx</option>
          <option value="4xx">4xx</option>
          <option value="5xx">5xx</option>
        </select>
        <input className="input" style={{ flex: 1, maxWidth: 280 }} placeholder="Filter path…"
          value={searchPath} onChange={e => setSearchPath(e.target.value)} />
        <button className="btn btn-outline btn-sm" onClick={clearCaptureEvents} title="Clear">✕ Clear</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <span className="text-xs text-muted">{filtered.length} rows</span>
          {['json','har','openapi'].map(fmt => (
            <button key={fmt} className="btn btn-outline btn-xs" onClick={() => doExport(fmt)} disabled={captureEvents.length === 0}>
              ↓ {fmt.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Stream table */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Header */}
          <div className="stream-row" style={{ cursor: 'default', borderBottom: '2px solid var(--border)', background: 'var(--s2)' }}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--dim)', fontWeight: 600 }}>Method</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--dim)', fontWeight: 600 }}>Status</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--dim)', fontWeight: 600 }}>Path</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--dim)', fontWeight: 600 }}>Latency</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--dim)', fontWeight: 600 }}>Time</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--dim)', fontWeight: 600 }}>Size</span>
          </div>

          {filtered.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">⏺</div>
              <div className="empty-title">{isCapturing ? 'Waiting for traffic…' : 'No capture active'}</div>
              <div className="empty-sub">
                {isCapturing
                  ? 'Point your app or curl at http://127.0.0.1:<port> to start capturing.'
                  : 'Select a twin, set the upstream URL, and press Start Capture.'}
              </div>
            </div>
          ) : (
            filtered.map(e => <StreamRow key={e.id} event={e} selected={inspectorEvent?.id === e.id}
              onClick={() => setInspectorEvent(inspectorEvent?.id === e.id ? null : e)} />)
          )}
        </div>

        {/* Inspector panel */}
        {inspectorEvent && (
          <EventInspector event={inspectorEvent} onClose={() => setInspectorEvent(null)} />
        )}
      </div>
    </div>
  );
}

function StreamRow({ event: e, selected, onClick }) {
  const latencyClass = e.latency_ms < 100 ? 'fast' : e.latency_ms < 500 ? 'medium' : 'slow';
  const pct = Math.min(100, (e.latency_ms / 2000) * 100);
  const statusClass = e.status < 300 ? 'ok' : e.status < 400 ? 'redir' : 'err';
  const time = e.captured_at ? new Date(e.captured_at).toLocaleTimeString() : '';

  return (
    <div className={`stream-row ${selected ? 'selected' : ''}`} onClick={onClick}>
      <span className={`method ${e.method}`}>{e.method}</span>
      <span className={`status ${statusClass}`}>{e.status || '—'}</span>
      <span className="truncate" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{e.path}</span>
      <div className="latency-bar">
        <div className="latency-track"><div className={`latency-fill ${latencyClass}`} style={{ width: `${pct}%` }} /></div>
        <span style={{ fontSize: 10, color: 'var(--dim)', minWidth: 40 }}>{e.latency_ms}ms</span>
      </div>
      <span style={{ fontSize: 10, color: 'var(--dim)' }}>{time}</span>
      <span style={{ fontSize: 10, color: 'var(--dim)' }}>
        {e.res_body ? (JSON.stringify(e.res_body).length / 1024).toFixed(1) + ' KB' : '—'}
      </span>
    </div>
  );
}
