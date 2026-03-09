import { useState, useEffect } from 'react';
import { useStore } from '../store/index.js';
import { replayApi, shadowApi } from '../api/index.js';

export default function Replay() {
  const { twins, replayRuns, setReplayRuns, activeRunId, setActiveRun,
          replayResults, addReplayResult, addNotif } = useStore();

  const [selectedTwinId, setSelectedTwin] = useState('');
  const [compareReal, setCompareReal] = useState(false);
  const [starting, setStarting] = useState(false);
  const [runName, setRunName] = useState('');
  const [mode, setMode] = useState('replay');         // 'replay' | 'shadow'
  const [shadowSession, setShadowSession] = useState(null);
  const [shadowResults, setShadowResults] = useState([]);
  const [shadowDuration, setShadowDuration] = useState(300);

  useEffect(() => {
    replayApi.runs().then(setReplayRuns).catch(() => {});
  }, []);

  const selectedRun = replayRuns.find(r => r.id === activeRunId);
  const selectedResults = activeRunId ? (replayResults[activeRunId] || []) : [];

  const startShadow = async () => {
    if (!selectedTwinId) return;
    setStarting(true);
    try {
      const s = await shadowApi.start(selectedTwinId, shadowDuration * 1000);
      setShadowSession(s);
      setShadowResults([]);
      addNotif({ icon: '⬡', title: 'Shadow mode started', msg: s.instructions, type: 'success' });
    } catch (err) {
      addNotif({ icon: '✗', title: 'Shadow failed', msg: err.response?.data?.error || err.message, type: 'error' });
    } finally { setStarting(false); }
  };

  const stopShadow = async () => {
    if (!shadowSession) return;
    try {
      const r = await shadowApi.stop(shadowSession.sessionId);
      setShadowSession(s => s ? { ...s, stopped: true } : null);
      addNotif({ icon: '■', title: 'Shadow stopped', msg: `${r.results} requests compared`, type: 'info' });
    } catch {}
  };

  // Fetch shadow results periodically while active
  useEffect(() => {
    if (!shadowSession || shadowSession.stopped) return;
    const interval = setInterval(async () => {
      try {
        const r = await shadowApi.results(shadowSession.sessionId);
        setShadowResults(r.results || []);
        if (r.stopped) { setShadowSession(s => s ? { ...s, stopped: true } : null); }
      } catch {}
    }, 1500);
    return () => clearInterval(interval);
  }, [shadowSession]);

  // Fetch results from server when selecting a completed run with no in-memory results
  useEffect(() => {
    if (!activeRunId) return;
    const run = replayRuns.find(r => r.id === activeRunId);
    if (run?.status === 'done' && !replayResults[activeRunId]?.length) {
      replayApi.results(activeRunId).then(results => {
        results.forEach(r => addReplayResult(activeRunId, { ...r, resultId: r.id }));
      }).catch(() => {});
    }
  }, [activeRunId]);

  const startRun = async () => {
    if (!selectedTwinId) return;
    const twin = twins.find(t => t.id === selectedTwinId);
    if (!twin?.running) {
      addNotif({ icon: '✗', title: 'Twin not running', msg: 'Start the twin proxy before replaying', type: 'warn' });
      return;
    }
    setStarting(true);
    try {
      const run = await replayApi.start({ twinId: selectedTwinId, compareReal, name: runName });
      setReplayRuns([{ id: run.runId, twin_id: selectedTwinId, status: 'running', total: run.total, passed: 0, failed: 0, name: runName }, ...replayRuns]);
      setActiveRun(run.runId);
    } catch (err) {
      addNotif({ icon: '✗', title: 'Replay failed', msg: err.response?.data?.error || err.message, type: 'error' });
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="view" style={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--s1)', flexShrink: 0 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <div>
            <div className="view-title">Replay</div>
            <div className="view-sub">Fire captured requests against twin and compare responses</div>
          </div>
          <button className="btn btn-primary" onClick={startRun} disabled={starting || !selectedTwinId}>
            {starting ? <span className="spinner" /> : '▶'} Run Replay
          </button>
        </div>
        <div className="flex gap-8">
          <div className="form-group" style={{ flex: '0 0 200px' }}>
            <label className="form-label">Twin</label>
            <select className="input select" value={selectedTwinId} onChange={e => setSelectedTwin(e.target.value)}>
              <option value="">Select twin…</option>
              {twins.map(t => <option key={t.id} value={t.id}>{t.name} {t.running ? '▶' : '■'}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Run Name (optional)</label>
            <input className="input" placeholder="e.g. Payment flow v2" value={runName} onChange={e => setRunName(e.target.value)} />
          </div>
          <div className="form-group" style={{ flexShrink: 0, justifyContent: 'flex-end' }}>
            <label className="form-label">Options</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={compareReal} onChange={e => setCompareReal(e.target.checked)} />
              Also hit real upstream
            </label>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Run list */}
        <div style={{ width: 260, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--s1)' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--dim)', fontWeight: 600 }}>
            Runs
          </div>
          {replayRuns.length === 0 ? (
            <div className="empty" style={{ padding: 24 }}>
              <div className="empty-icon">▶</div>
              <div className="empty-sub">No runs yet</div>
            </div>
          ) : replayRuns.map(run => (
            <div key={run.id}
              className={`nav-item ${activeRunId === run.id ? 'active' : ''}`}
              onClick={() => setActiveRun(run.id)}
              style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '10px 16px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{run.name || run.twin_name || run.id.slice(0,8)}</span>
                <RunStatus status={run.status} />
              </div>
              {run.status === 'done' && (
                <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 4 }}>
                  <span style={{ color: 'var(--green2)' }}>{run.passed} pass</span>
                  {' · '}
                  <span style={{ color: run.failed > 0 ? 'var(--red)' : 'var(--dim)' }}>{run.failed} fail</span>
                  {' · '}{run.total} total
                </div>
              )}
              {run.status === 'running' && (
                <div className="progress-bar" style={{ width: '100%', marginTop: 6 }}>
                  <div className="progress-fill" style={{ width: `${run.total ? ((run.passed + run.failed) / run.total) * 100 : 0}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Results panel */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {!activeRunId ? (
            <div className="empty">
              <div className="empty-icon">⇄</div>
              <div className="empty-title">Select a run</div>
              <div className="empty-sub">Choose a replay run from the left to see request-by-request results.</div>
            </div>
          ) : (
            <>
              {/* Run summary */}
              {selectedRun && (
                <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--s2)', display: 'flex', gap: 24, fontSize: 12 }}>
                  <span><span className="text-muted">Status: </span><RunStatus status={selectedRun.status} /></span>
                  <span><span className="text-muted">Passed: </span><span className="text-green">{selectedRun.passed}</span></span>
                  <span><span className="text-muted">Failed: </span><span style={{ color: selectedRun.failed > 0 ? 'var(--red)' : 'var(--dim)' }}>{selectedRun.failed}</span></span>
                  <span><span className="text-muted">Total: </span>{selectedRun.total}</span>
                </div>
              )}

              {/* Results */}
              {selectedResults.length === 0 ? (
                <div className="empty">
                  <span className="spinner" />
                  <div className="empty-sub">Waiting for results…</div>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Method</th>
                      <th>Path</th>
                      <th>Twin</th>
                      <th>Real</th>
                      <th>Twin ms</th>
                      <th>Real ms</th>
                      <th>Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedResults.map(r => (
                      <tr key={r.resultId || r.id}>
                        <td>{r.match
                          ? <span style={{ color: 'var(--green2)' }}>✓</span>
                          : <span style={{ color: 'var(--red)' }}>✗</span>}
                        </td>
                        <td><span className={`method ${r.method}`}>{r.method}</span></td>
                        <td className="mono" style={{ fontSize: 11 }}>{r.path}</td>
                        <td><StatusBadge code={r.twinStatus} /></td>
                        <td><StatusBadge code={r.realStatus} /></td>
                        <td className="text-muted" style={{ fontSize: 11 }}>{r.twinLatency != null ? `${r.twinLatency}ms` : '—'}</td>
                        <td className="text-muted" style={{ fontSize: 11 }}>{r.realLatency != null ? `${r.realLatency}ms` : '—'}</td>
                        <td style={{ fontSize: 11 }}>
                          {r.diffPatch?.length > 0
                            ? <span style={{ color: 'var(--amber)' }}>{r.diffPatch.length} diff{r.diffPatch.length !== 1 ? 's' : ''}</span>
                            : <span className="text-muted">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Shadow mode results ── */}
      {mode === 'shadow' && shadowSession && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <span className="card-title">Shadow Session</span>
            <div className="flex gap-8" style={{ alignItems: 'center', fontSize: 12 }}>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--dim)', fontSize: 11 }}>{shadowSession.sessionId?.slice(0,8)}</span>
              {!shadowSession.stopped ? (
                <span style={{ color: 'var(--cyan)' }}>⬡ Live — point traffic at <code style={{ background: 'var(--s2)', padding: '1px 6px', borderRadius: 3 }}>http://127.0.0.1:{shadowSession.port}</code></span>
              ) : <span style={{ color: 'var(--dim)' }}>■ Stopped</span>}
              <span className="text-muted">{shadowResults.length} requests compared</span>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {shadowResults.length === 0 ? (
              <div className="empty"><div className="empty-sub">No requests yet — send traffic to the shadow port above</div></div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Match</th><th>Method</th><th>Path</th>
                    <th>Upstream</th><th>Twin</th>
                    <th>Upstream ms</th><th>Twin ms</th><th>Diffs</th>
                  </tr>
                </thead>
                <tbody>
                  {shadowResults.map(r => (
                    <tr key={r.id}>
                      <td>{r.match ? <span style={{ color:'var(--green)' }}>✓</span> : <span style={{ color:'var(--red)' }}>✗</span>}</td>
                      <td><span className={`method ${r.method}`}>{r.method}</span></td>
                      <td className="mono" style={{ fontSize: 11 }}>{r.path}</td>
                      <td><StatusBadge code={r.upstreamStatus} /></td>
                      <td><StatusBadge code={r.twinStatus} /></td>
                      <td className="text-muted" style={{ fontSize: 11 }}>{r.upstreamLatency != null ? `${r.upstreamLatency}ms` : '—'}</td>
                      <td className="text-muted" style={{ fontSize: 11 }}>{r.twinLatency != null ? `${r.twinLatency}ms` : '—'}</td>
                      <td style={{ fontSize: 11 }}>
                        {r.diffPatch?.length > 0
                          ? <span style={{ color: 'var(--amber)' }}>{r.diffPatch.length} diff{r.diffPatch.length > 1 ? 's' : ''}</span>
                          : <span className="text-muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RunStatus({ status }) {
  const colors = { running: 'var(--cyan)', done: 'var(--green2)', error: 'var(--red)', pending: 'var(--dim)' };
  return <span style={{ color: colors[status] || 'var(--dim)', fontSize: 11 }}>{status}</span>;
}

function StatusBadge({ code }) {
  if (!code) return <span className="text-muted" style={{ fontSize: 11 }}>—</span>;
  const cls = code < 300 ? 'ok' : code < 400 ? 'redir' : 'err';
  return <span className={`status ${cls}`}>{code}</span>;
}
