import { useState } from 'react';
import { useStore } from '../store/index.js';
import { twinsApi, proxyApi } from '../api/index.js';

export default function Twins() {
  const { twins, upsertTwin, removeTwin, addNotif, setView } = useStore();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [form, setForm] = useState({ name: '', service: '', upstream: '', version: '1.0.0' });
  const [saving, setSaving] = useState(false);

  const filtered = twins.filter(t =>
    !search || t.name.toLowerCase().includes(search) || t.service?.toLowerCase().includes(search)
  );

  const createTwin = async () => {
    if (!form.name || !form.service) return;
    setSaving(true);
    try {
      const twin = await twinsApi.create(form);
      upsertTwin(twin);
      setCreating(false);
      setForm({ name: '', service: '', upstream: '', version: '1.0.0' });
    } catch (err) {
      addNotif({ icon: '✗', title: 'Error', msg: err.response?.data?.error || err.message, type: 'error' });
    } finally { setSaving(false); }
  };

  const deleteTwin = async (twin) => {
    if (!confirm(`Delete twin "${twin.name}"? All captured events will be lost.`)) return;
    try {
      await twinsApi.delete(twin.id);
      removeTwin(twin.id);
    } catch (err) {
      addNotif({ icon: '✗', title: 'Error', msg: err.response?.data?.error || err.message, type: 'error' });
    }
  };

  const cloneTwin = async (twin) => {
    try {
      const cloned = await twinsApi.clone(twin.id);
      upsertTwin(cloned);
    } catch (err) {
      addNotif({ icon: '✗', title: 'Clone failed', msg: err.message, type: 'error' });
    }
  };

  const stopTwin = async (twin) => {
    try {
      await proxyApi.stop(twin.id, twin.proxy_port);
      upsertTwin({ ...twin, running: false, proxy_port: null });
    } catch (err) {
      addNotif({ icon: '✗', title: 'Error', msg: err.message, type: 'error' });
    }
  };

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <div className="view-title">Twins</div>
          <div className="view-sub">{twins.length} twin{twins.length !== 1 ? 's' : ''} · {twins.filter(t => t.running).length} running</div>
        </div>
        <div className="flex gap-8">
          <input className="input" style={{ width: 220 }} placeholder="Search twins…" value={search} onChange={e => setSearch(e.target.value.toLowerCase())} />
          <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New Twin</button>
        </div>
      </div>

      {/* Create form */}
      {creating && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">New Twin</span>
            <button className="btn btn-xs btn-outline" onClick={() => setCreating(false)}>✕</button>
          </div>
          <div className="card-body">
            <div className="flex gap-8" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input className="input" placeholder="stripe-payments-v3" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Service *</label>
                <input className="input" placeholder="Stripe" value={form.service} onChange={e => setForm(f => ({ ...f, service: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Version</label>
                <input className="input" placeholder="1.0.0" value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} />
              </div>
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">Upstream URL</label>
                <input className="input" placeholder="https://api.stripe.com" value={form.upstream} onChange={e => setForm(f => ({ ...f, upstream: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-8" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setCreating(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createTwin} disabled={saving || !form.name || !form.service}>
                {saving ? <span className="spinner" /> : null} Create Twin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Twin list */}
      {filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">◈</div>
          <div className="empty-title">{twins.length === 0 ? 'No twins yet' : 'No matches'}</div>
          <div className="empty-sub">{twins.length === 0 ? 'Create a twin or pull from the registry to get started.' : 'Try a different search.'}</div>
          {twins.length === 0 && <button className="btn btn-outline" onClick={() => setView('registry')}>Browse Registry</button>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(twin => (
            <TwinCard key={twin.id} twin={twin}
              expanded={expanded === twin.id}
              onToggle={() => setExpanded(expanded === twin.id ? null : twin.id)}
              onDelete={() => deleteTwin(twin)}
              onClone={() => cloneTwin(twin)}
              onStop={() => stopTwin(twin)}
              onCapture={() => setView('capture')}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TwinCard({ twin, expanded, onToggle, onDelete, onClone, onStop, onCapture }) {
  const [notes, setNotes] = useState(twin.notes || '');
  const [saving, setSaving] = useState(false);

  const saveNotes = async () => {
    setSaving(true);
    await twinsApi.update(twin.id, { notes }).finally(() => setSaving(false));
  };

  const accuracy = twin.accuracy || 0;
  const accuracyColor = accuracy >= 95 ? 'var(--green2)' : accuracy >= 80 ? 'var(--amber)' : 'var(--red)';

  return (
    <div className="card">
      <div className="card-header" style={{ cursor: 'pointer' }} onClick={onToggle}>
        <div className="flex items-center gap-12">
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: twin.running ? 'var(--green2)' : 'var(--muted)', flexShrink: 0, boxShadow: twin.running ? '0 0 6px var(--green2)' : 'none' }} />
          <div>
            <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, color: 'var(--bright)' }}>{twin.name}</div>
            <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>{twin.service} · v{twin.version}</div>
          </div>
          <div className="flex gap-8" style={{ marginLeft: 20 }}>
            {(twin.tags || []).map(tag => <span key={tag} className="tag">{tag}</span>)}
          </div>
        </div>
        <div className="flex items-center gap-12">
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: accuracyColor, fontWeight: 600 }}>{accuracy}%</div>
            <div style={{ fontSize: 10, color: 'var(--dim)' }}>accuracy</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: 'var(--bright)', fontWeight: 600 }}>{twin.event_count?.toLocaleString() || 0}</div>
            <div style={{ fontSize: 10, color: 'var(--dim)' }}>events</div>
          </div>
          {twin.running && twin.proxy_port && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: 'var(--cyan)', fontWeight: 600 }}>:{twin.proxy_port}</div>
              <div style={{ fontSize: 10, color: 'var(--dim)' }}>proxy</div>
            </div>
          )}
          <div className="flex gap-6" onClick={e => e.stopPropagation()}>
            {twin.running
              ? <button className="btn btn-xs btn-danger" onClick={onStop}>■ Stop</button>
              : <button className="btn btn-xs btn-primary" onClick={onCapture}>▶ Capture</button>}
            <button className="btn btn-xs btn-outline" onClick={onClone} title="Clone">⊕</button>
            <button className="btn btn-xs btn-danger" onClick={onDelete} title="Delete">✕</button>
          </div>
          <span style={{ color: 'var(--dim)', fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="card-body">
          <div className="flex gap-12" style={{ flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className="form-label" style={{ marginBottom: 6 }}>Upstream</div>
              <div className="text-sm" style={{ fontFamily: 'var(--mono)', color: 'var(--cyan)', wordBreak: 'break-all' }}>
                {twin.upstream || <span className="text-muted">—</span>}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className="form-label" style={{ marginBottom: 6 }}>Created</div>
              <div className="text-sm text-muted">{twin.created_at ? new Date(twin.created_at).toLocaleDateString() : '—'}</div>
            </div>
            <div style={{ flex: 2, minWidth: 300 }}>
              <div className="form-label" style={{ marginBottom: 6 }}>Notes</div>
              <div className="flex gap-6">
                <textarea className="input" rows={2} style={{ resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add notes…" />
                <button className="btn btn-xs btn-outline" onClick={saveNotes} disabled={saving}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
