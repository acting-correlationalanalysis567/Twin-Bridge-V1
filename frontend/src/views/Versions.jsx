import { useState, useEffect } from 'react';
import { versionsApi } from '../api/index.js';
import { useStore } from '../store/index.js';

export default function Versions() {
  const { twins, addNotif } = useStore();
  const [selectedTwinId, setSelectedTwinId] = useState('');
  const [versions, setVersions]             = useState([]);
  const [label, setLabel]                   = useState('');
  const [snapping, setSnapping]             = useState(false);
  const [diffA, setDiffA]                   = useState('');
  const [diffB, setDiffB]                   = useState('');
  const [diffResult, setDiffResult]         = useState(null);
  const [diffing, setDiffing]               = useState(false);
  const [loading, setLoading]               = useState(false);

  useEffect(() => {
    if (!selectedTwinId) { setVersions([]); return; }
    setLoading(true);
    versionsApi.list(selectedTwinId).then(setVersions).catch(() => {}).finally(() => setLoading(false));
  }, [selectedTwinId]);

  const snapshot = async () => {
    if (!selectedTwinId) return;
    setSnapping(true);
    try {
      const v = await versionsApi.snapshot(selectedTwinId, label.trim());
      setVersions(vs => [v, ...vs]);
      setLabel('');
      addNotif({ icon: '◎', title: 'Snapshot created', msg: `${v.label} — ${v.endpoints.length} endpoints`, type: 'success' });
    } catch (err) {
      addNotif({ icon: '✗', title: 'Snapshot failed', msg: err.message, type: 'error' });
    } finally { setSnapping(false); }
  };

  const runDiff = async () => {
    if (!diffA || !diffB || diffA === diffB) return;
    setDiffing(true);
    try {
      setDiffResult(await versionsApi.diff(selectedTwinId, diffA, diffB));
    } catch (err) {
      addNotif({ icon: '✗', title: 'Diff failed', msg: err.message, type: 'error' });
    } finally { setDiffing(false); }
  };

  const deleteVersion = async (versionId) => {
    try {
      await versionsApi.delete(selectedTwinId, versionId);
      setVersions(vs => vs.filter(v => v.id !== versionId));
      if (diffA === versionId) setDiffA('');
      if (diffB === versionId) setDiffB('');
      if (diffResult?.versionA?.id === versionId || diffResult?.versionB?.id === versionId) setDiffResult(null);
    } catch (err) {
      addNotif({ icon: '✗', title: 'Delete failed', msg: err.message, type: 'error' });
    }
  };

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <div className="view-title">Versioning</div>
          <div className="view-sub">Snapshot and diff twin schemas over time</div>
        </div>
      </div>

      {/* Twin selector + snapshot controls */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><span className="card-title">Snapshot</span></div>
        <div className="card-body">
          <div className="flex gap-8" style={{ alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: '0 0 220px' }}>
              <label className="form-label">Twin</label>
              <select className="input select" value={selectedTwinId} onChange={e => { setSelectedTwinId(e.target.value); setDiffResult(null); }}>
                <option value="">Select a twin…</option>
                {twins.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Label <span style={{ color:'var(--dim)', fontWeight:400 }}>(optional)</span></label>
              <input className="input" placeholder="e.g. pre-migration, v2.0-rc1" value={label} onChange={e => setLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && snapshot()} />
            </div>
            <button className="btn btn-primary" onClick={snapshot} disabled={!selectedTwinId || snapping}
              style={{ marginBottom: 2 }}>
              {snapping ? <span className="spinner" /> : '◎'} Snapshot
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-12" style={{ alignItems: 'flex-start' }}>
        {/* Version list */}
        <div style={{ flex: '0 0 320px' }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Snapshots</span>
              {loading && <span className="spinner" style={{ marginLeft: 8 }} />}
              {versions.length > 0 && <span className="text-xs text-muted">{versions.length}</span>}
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {!selectedTwinId ? (
                <div className="empty" style={{ padding: '32px 16px' }}>
                  <div className="empty-icon">⌚</div>
                  <div className="empty-title">Select a twin</div>
                </div>
              ) : versions.length === 0 ? (
                <div className="empty" style={{ padding: '32px 16px' }}>
                  <div className="empty-icon">◎</div>
                  <div className="empty-title">No snapshots yet</div>
                  <div className="empty-sub">Hit Snapshot to capture the current schema</div>
                </div>
              ) : (
                versions.map(v => (
                  <div key={v.id} style={{
                    padding: '10px 14px', borderBottom: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--bright)', fontFamily: 'var(--mono)' }}>{v.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>
                        {v.endpoints.length} endpoints · {new Date(v.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <button
                        className={`btn btn-xs ${diffA === v.id ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setDiffA(a => a === v.id ? '' : v.id)}
                        title="Set as diff baseline (A)"
                      >A</button>
                      <button
                        className={`btn btn-xs ${diffB === v.id ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setDiffB(b => b === v.id ? '' : v.id)}
                        title="Set as diff target (B)"
                      >B</button>
                      <button className="btn btn-xs btn-ghost" onClick={() => deleteVersion(v.id)} title="Delete snapshot">✕</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          {diffA && diffB && diffA !== diffB && (
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 10 }}
              onClick={runDiff} disabled={diffing}>
              {diffing ? <span className="spinner" /> : '⟷'} Diff A → B
            </button>
          )}
        </div>

        {/* Diff result */}
        <div style={{ flex: 1 }}>
          {!diffResult ? (
            <div className="card">
              <div className="card-body">
                <div className="empty" style={{ padding: '40px 0' }}>
                  <div className="empty-icon">⟷</div>
                  <div className="empty-title">Schema Diff</div>
                  <div className="empty-sub">Tag two snapshots A and B, then click Diff</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-header">
                <span className="card-title">
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--dim)' }}>{diffResult.versionA.label}</span>
                  <span style={{ margin: '0 8px', color: 'var(--dim)' }}>→</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--bright)' }}>{diffResult.versionB.label}</span>
                </span>
                <div className="flex gap-8">
                  {diffResult.added > 0 && <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>+{diffResult.added} added</span>}
                  {diffResult.removed > 0 && <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>−{diffResult.removed} removed</span>}
                  <span style={{ fontSize: 12, color: 'var(--dim)' }}>{diffResult.same} same</span>
                </div>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                {diffResult.lines.length === 0 ? (
                  <div className="empty" style={{ padding: '32px 0' }}>
                    <div className="empty-icon" style={{ color: 'var(--green)' }}>✓</div>
                    <div className="empty-title">No changes</div>
                    <div className="empty-sub">These two snapshots have identical schemas</div>
                  </div>
                ) : (
                  diffResult.lines.map((line, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 14px',
                      borderBottom: '1px solid var(--border)',
                      background: line.status === 'added' ? 'rgba(0,255,128,0.04)'
                                : line.status === 'removed' ? 'rgba(255,64,64,0.04)' : 'transparent',
                    }}>
                      <span style={{
                        width: 16, textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 700,
                        color: line.status === 'added' ? 'var(--green)'
                             : line.status === 'removed' ? 'var(--red)' : 'var(--dim)',
                      }}>
                        {line.status === 'added' ? '+' : line.status === 'removed' ? '−' : '·'}
                      </span>
                      <span style={{
                        fontFamily: 'var(--mono)', fontSize: 12,
                        color: line.status === 'added' ? 'var(--green)'
                             : line.status === 'removed' ? 'var(--dim)' : 'var(--text)',
                        textDecoration: line.status === 'removed' ? 'line-through' : 'none',
                      }}>
                        {line.key}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
