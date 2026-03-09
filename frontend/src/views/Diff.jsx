import { useState } from 'react';
import { useStore } from '../store/index.js';
import { twinsApi } from '../api/index.js';

export default function Diff() {
  const { twins } = useStore();
  const [twinA, setTwinA] = useState('');
  const [twinB, setTwinB] = useState('');
  const [schemaA, setSchemaA] = useState(null);
  const [schemaB, setSchemaB] = useState(null);
  const [loading, setLoading] = useState(false);

  const runDiff = async () => {
    if (!twinA || !twinB) return;
    setLoading(true);
    try {
      const [a, b] = await Promise.all([twinsApi.schema(twinA), twinsApi.schema(twinB)]);
      setSchemaA(a); setSchemaB(b);
    } finally { setLoading(false); }
  };

  const endpointsA = schemaA ? new Set(schemaA.endpoints.map(e => `${e.method} ${e.path}`)) : new Set();
  const endpointsB = schemaB ? new Set(schemaB.endpoints.map(e => `${e.method} ${e.path}`)) : new Set();
  const allEndpoints = new Set([...endpointsA, ...endpointsB]);
  const added   = [...allEndpoints].filter(e => !endpointsA.has(e) && endpointsB.has(e));
  const removed = [...allEndpoints].filter(e => endpointsA.has(e) && !endpointsB.has(e));
  const shared  = [...allEndpoints].filter(e => endpointsA.has(e) && endpointsB.has(e));

  return (
    <div className="view">
      <div className="view-header">
        <div><div className="view-title">Schema Diff</div><div className="view-sub">Compare endpoints between two twins</div></div>
      </div>
      <div className="flex gap-8" style={{ marginBottom: 20 }}>
        <div className="form-group">
          <label className="form-label">Twin A</label>
          <select className="input select" value={twinA} onChange={e => setTwinA(e.target.value)}>
            <option value="">Select…</option>
            {twins.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Twin B</label>
          <select className="input select" value={twinB} onChange={e => setTwinB(e.target.value)}>
            <option value="">Select…</option>
            {twins.filter(t => t.id !== twinA).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ justifyContent: 'flex-end' }}>
          <label className="form-label">&nbsp;</label>
          <button className="btn btn-primary" onClick={runDiff} disabled={loading || !twinA || !twinB}>
            {loading ? <span className="spinner" /> : '⇌'} Compare
          </button>
        </div>
      </div>
      {(schemaA || schemaB) && (
        <>
          <div className="flex gap-8" style={{ marginBottom: 16, fontSize: 12 }}>
            <span style={{ color: 'var(--green2)' }}>+{added.length} added</span>
            <span style={{ color: 'var(--red)' }}>−{removed.length} removed</span>
            <span style={{ color: 'var(--dim)' }}>{shared.length} shared</span>
          </div>
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              {added.map(ep => <div key={ep} className="diff-line diff-added">{ep}</div>)}
              {removed.map(ep => <div key={ep} className="diff-line diff-removed">{ep}</div>)}
              {shared.map(ep => <div key={ep} className="diff-line" style={{ padding: '3px 8px', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--dim)' }}>&nbsp; {ep}</div>)}
              {allEndpoints.size === 0 && <div className="empty"><div className="empty-sub">Neither twin has captured events yet.</div></div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
