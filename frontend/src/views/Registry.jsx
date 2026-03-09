import { useState, useEffect } from 'react';
import { registryApi, githubApi } from '../api/index.js';
import { useStore } from '../store/index.js';

export default function Registry() {
  const { twins, upsertTwin, addNotif, setView } = useStore();
  const [entries, setEntries]     = useState([]);
  const [cats, setCats]           = useState([]);
  const [catFilter, setCat]       = useState('');
  const [search, setSearch]       = useState('');
  const [pulling, setPulling]     = useState({});
  const [sourceFilter, setSource] = useState('all');  // all | curated | local

  // GitHub push state
  const [pushingTwin, setPushingTwin]   = useState('');
  const [pushRepo, setPushRepo]         = useState('');
  const [pushing, setPushing]           = useState(false);
  const [ghConnected, setGhConnected]   = useState(false);

  useEffect(() => {
    load();
    githubApi.settings().then(s => {
      setPushRepo(s.defaultRepo || '');
      if (s.hasToken) githubApi.status().then(st => setGhConnected(st.connected)).catch(() => {});
    }).catch(() => {});
  }, []);

  const load = () => {
    registryApi.list().then(setEntries);
    registryApi.categories().then(setCats);
  };

  const pull = async (name) => {
    setPulling(p => ({ ...p, [name]: true }));
    try {
      const { twin, message } = await registryApi.pull(name);
      upsertTwin(twin);
      addNotif({ icon: '⊞', title: `Pulled ${name}`, msg: message, type: 'success' });
    } catch (err) {
      addNotif({ icon: '✗', title: 'Pull failed', msg: err.response?.data?.error || err.message, type: 'error' });
    } finally {
      setPulling(p => ({ ...p, [name]: false }));
    }
  };

  const pushToGitHub = async (twinId) => {
    if (!pushRepo) { addNotif({ icon: '✗', title: 'No repo set', msg: 'Configure a default repo in Settings', type: 'error' }); return; }
    setPushing(true);
    try {
      const result = await githubApi.push(twinId, pushRepo);
      addNotif({ icon: '↑', title: `Pushed to GitHub`, msg: `${result.repo}/${result.path}`, type: 'success' });
      setPushingTwin('');
    } catch (err) {
      addNotif({ icon: '✗', title: 'Push failed', msg: err.response?.data?.error || err.message, type: 'error' });
    } finally { setPushing(false); }
  };

  const alreadyPulled = new Set(twins.map(t => t.name));

  const filtered = entries.filter(e => {
    const matchesCat    = !catFilter || e.category === catFilter;
    const matchesSearch = !search || e.name.includes(search.toLowerCase()) || e.service.toLowerCase().includes(search.toLowerCase());
    const matchesSrc    = sourceFilter === 'all' || e._source === sourceFilter;
    return matchesCat && matchesSearch && matchesSrc;
  });

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <div className="view-title">Registry</div>
          <div className="view-sub">Curated and local API twin packages</div>
        </div>
        <div className="flex gap-8">
          <input className="input" style={{ width: 180 }} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="input select" style={{ width: 130 }} value={catFilter} onChange={e => setCat(e.target.value)}>
            <option value="">All categories</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="input select" style={{ width: 120 }} value={sourceFilter} onChange={e => setSource(e.target.value)}>
            <option value="all">All sources</option>
            <option value="curated">Curated</option>
            <option value="local">Local cache</option>
          </select>
        </div>
      </div>

      {/* GitHub push panel — shown when a twin is selected for push */}
      {pushingTwin && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--cyan)' }}>
          <div className="card-header">
            <span className="card-title">Push to GitHub</span>
            <button className="btn btn-ghost btn-xs" onClick={() => setPushingTwin('')}>✕</button>
          </div>
          <div className="card-body">
            <div className="flex gap-8" style={{ alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="form-label">Repository</label>
                <input className="input" placeholder="owner/repo" value={pushRepo} onChange={e => setPushRepo(e.target.value)} />
              </div>
              <button className="btn btn-primary" onClick={() => pushToGitHub(pushingTwin)} disabled={pushing || !pushRepo}>
                {pushing ? <span className="spinner" /> : '↑'} Push OpenAPI
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 6 }}>
              Will create/update <code style={{ background: 'var(--s2)', padding: '1px 4px', borderRadius: 3 }}>twins/{twins.find(t=>t.id===pushingTwin)?.name}/openapi.json</code> in the repo.
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 12 }}>
        {filtered.map(entry => {
          const pulled = alreadyPulled.has(entry.name);
          const twin   = twins.find(t => t.name === entry.name);
          return (
            <div key={entry.name} className="card">
              <div className="card-body">
                <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, color: 'var(--bright)' }}>{entry.service}</div>
                    <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 2, fontFamily: 'var(--mono)' }}>
                      {entry.name} · v{entry.version}
                    </div>
                  </div>
                  <div className="flex gap-4" style={{ alignItems: 'center' }}>
                    {entry._source === 'local' && (
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'rgba(0,200,255,0.1)', color: 'var(--cyan)' }}>local</span>
                    )}
                    <span className="tag">{entry.category}</span>
                  </div>
                </div>

                <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 8, fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>
                  {entry.upstream}
                </div>

                {entry.endpoints?.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 10 }}>
                    {entry.endpoints.length} endpoints
                    {entry.metadata?.tags?.length > 0 && (
                      <span style={{ marginLeft: 8 }}>
                        {entry.metadata.tags.slice(0, 3).map(t => (
                          <span key={t} style={{ marginRight: 4, padding: '1px 5px', borderRadius: 3, background: 'var(--s2)', fontSize: 10 }}>{t}</span>
                        ))}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex gap-6">
                  {pulled ? (
                    <>
                      <button className="btn btn-outline btn-sm" style={{ flex: 1 }} disabled>✓ Pulled</button>
                      {ghConnected && twin && (
                        <button className="btn btn-ghost btn-sm" title="Push to GitHub"
                          onClick={() => setPushingTwin(twin.id === pushingTwin ? '' : twin.id)}>
                          ↑ GitHub
                        </button>
                      )}
                    </>
                  ) : (
                    <button className="btn btn-outline btn-sm" style={{ flex: 1 }}
                      onClick={() => pull(entry.name)} disabled={pulling[entry.name]}>
                      {pulling[entry.name] ? <span className="spinner" /> : '⊞'} Pull Twin
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div style={{ gridColumn: '1/-1' }}>
            <div className="card"><div className="card-body">
              <div className="empty">
                <div className="empty-icon">⊞</div>
                <div className="empty-title">No packages found</div>
                <div className="empty-sub">Try adjusting your search or filter. Install local packages via Settings.</div>
              </div>
            </div></div>
          </div>
        )}
      </div>
    </div>
  );
}
