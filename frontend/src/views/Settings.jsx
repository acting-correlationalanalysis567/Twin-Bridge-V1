import { useState, useEffect } from 'react';
import { useStore } from '../store/index.js';
import { githubApi, packageApi, versionsApi } from '../api/index.js';

export default function Settings() {
  const { theme, setTheme, twins, addNotif } = useStore();

  // GitHub state
  const [token, setToken]           = useState('');
  const [showToken, setShowToken]   = useState(false);
  const [defaultRepo, setDefaultRepo] = useState('');
  const [ghStatus, setGhStatus]     = useState(null);   // null | { connected, user? }
  const [repos, setRepos]           = useState([]);
  const [saving, setSaving]         = useState(false);
  const [checking, setChecking]     = useState(false);

  // Package cache state
  const [cached, setCached]         = useState([]);
  const [uploading, setUploading]   = useState(false);

  // Export state
  const [exportTwinId, setExportTwinId] = useState('');

  useEffect(() => {
    // Load saved settings
    githubApi.settings().then(s => {
      setDefaultRepo(s.defaultRepo || '');
      if (s.hasToken) checkGitHub(false);
    }).catch(() => {});
    loadCache();
  }, []);

  const checkGitHub = async (withFeedback = true) => {
    setChecking(true);
    try {
      const s = await githubApi.status();
      setGhStatus(s);
      if (s.connected) {
        const r = await githubApi.repos();
        setRepos(r);
      }
      if (withFeedback) addNotif({ icon: s.connected ? '✓' : '✗', title: s.connected ? `Connected as ${s.user.login}` : 'Connection failed', msg: s.error || '', type: s.connected ? 'success' : 'error' });
    } catch {
      setGhStatus({ connected: false, error: 'Request failed' });
    } finally { setChecking(false); }
  };

  const saveGitHub = async () => {
    setSaving(true);
    try {
      await githubApi.save({ token: token || undefined, defaultRepo, defaultBranch: 'main' });
      await checkGitHub(true);
      setToken('');
    } catch (err) {
      addNotif({ icon: '✗', title: 'Save failed', msg: err.message, type: 'error' });
    } finally { setSaving(false); }
  };

  const loadCache = () => {
    packageApi.cache().then(setCached).catch(() => {});
  };

  const removePackage = async (name) => {
    try {
      await packageApi.remove(name);
      setCached(c => c.filter(p => p.name !== name));
      addNotif({ icon: '🗑', title: 'Removed', msg: name, type: 'info' });
    } catch (err) {
      addNotif({ icon: '✗', title: 'Remove failed', msg: err.message, type: 'error' });
    }
  };

  const importPackage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const pkg = JSON.parse(ev.target.result);
        await packageApi.install(pkg);
        addNotif({ icon: '⊞', title: 'Installed', msg: `${pkg.name} — ${pkg.endpoints?.length || 0} endpoints`, type: 'success' });
        loadCache();
      } catch (err) {
        addNotif({ icon: '✗', title: 'Install failed', msg: err.message, type: 'error' });
      } finally { setUploading(false); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const doExport = () => {
    if (!exportTwinId) return;
    const url = packageApi.exportUrl(exportTwinId);
    const a = document.createElement('a');
    a.href = url; a.click();
  };

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-title">Settings</div>
      </div>

      {/* ── Appearance ── */}
      <div className="card" style={{ maxWidth: 560, marginBottom: 16 }}>
        <div className="card-header"><span className="card-title">Appearance</span></div>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">Theme</label>
            <div className="flex gap-8">
              {['dark', 'light'].map(t => (
                <button key={t} className={`btn ${theme === t ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => { setTheme(t); localStorage.setItem('tb-theme', t); }}>
                  {t === 'dark' ? '◑ Dark' : '◐ Light'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── GitHub Integration ── */}
      <div className="card" style={{ maxWidth: 560, marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">GitHub Integration</span>
          {ghStatus && (
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 4, fontFamily: 'var(--mono)',
              background: ghStatus.connected ? 'rgba(0,255,128,0.1)' : 'rgba(255,64,64,0.1)',
              color: ghStatus.connected ? 'var(--green)' : 'var(--red)',
            }}>
              {ghStatus.connected ? `✓ ${ghStatus.user?.login}` : '✗ disconnected'}
            </span>
          )}
        </div>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">Personal Access Token</label>
            <div className="flex gap-8">
              <input
                className="input" style={{ flex: 1, fontFamily: 'var(--mono)', letterSpacing: showToken ? 0 : 2 }}
                type={showToken ? 'text' : 'password'}
                placeholder={ghStatus?.connected ? '● ● ● ● saved ● ● ● ●' : 'ghp_…'}
                value={token} onChange={e => setToken(e.target.value)}
              />
              <button className="btn btn-outline btn-sm" onClick={() => setShowToken(s => !s)}>
                {showToken ? '◉' : '○'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>
              Needs <code style={{ background: 'var(--s2)', padding: '1px 4px', borderRadius: 3 }}>repo</code> scope.{' '}
              <a href="https://github.com/settings/tokens/new" target="_blank" rel="noreferrer"
                style={{ color: 'var(--cyan)' }}>Create token ↗</a>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Default repository</label>
            {repos.length > 0 ? (
              <select className="input select" value={defaultRepo} onChange={e => setDefaultRepo(e.target.value)}>
                <option value="">— choose repo —</option>
                {repos.map(r => <option key={r.full_name} value={r.full_name}>{r.full_name}{r.private ? ' 🔒' : ''}</option>)}
              </select>
            ) : (
              <input className="input" placeholder="owner/repo" value={defaultRepo} onChange={e => setDefaultRepo(e.target.value)} />
            )}
          </div>
          <div className="flex gap-8">
            <button className="btn btn-primary" onClick={saveGitHub} disabled={saving || (!token && !defaultRepo)}>
              {saving ? <span className="spinner" /> : '✓'} Save
            </button>
            <button className="btn btn-outline" onClick={() => checkGitHub(true)} disabled={checking}>
              {checking ? <span className="spinner" /> : '⟳'} Test connection
            </button>
          </div>
        </div>
      </div>

      {/* ── Package Cache ── */}
      <div className="card" style={{ maxWidth: 560, marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">Local Package Cache</span>
          <span className="text-xs text-muted">{cached.length} packages</span>
        </div>
        <div className="card-body" style={{ padding: cached.length ? 0 : undefined }}>
          {cached.length === 0 ? (
            <div style={{ color: 'var(--dim)', fontSize: 12 }}>
              No local packages cached. Import a <code style={{ background: 'var(--s2)', padding: '1px 4px', borderRadius: 3 }}>.twinpkg</code> file below.
            </div>
          ) : (
            cached.map(pkg => (
              <div key={pkg.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--bright)' }}>{pkg.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--dim)', marginLeft: 8 }}>v{pkg.version} · {pkg.endpoints?.length || 0} endpoints</span>
                </div>
                <span className="tag">{pkg.category}</span>
                <button className="btn btn-xs btn-ghost" onClick={() => removePackage(pkg.name)}>✕</button>
              </div>
            ))
          )}
          <div style={{ padding: 12, borderTop: cached.length ? '1px solid var(--border)' : 'none', display: 'flex', gap: 8, alignItems: 'center' }}>
            <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
              {uploading ? <span className="spinner" /> : '⊞'} Import .twinpkg
              <input type="file" accept=".twinpkg,.json" style={{ display: 'none' }} onChange={importPackage} />
            </label>
            <span style={{ fontSize: 11, color: 'var(--dim)' }}>or drag a .twinpkg file</span>
          </div>
        </div>
      </div>

      {/* ── Export twin as .twinpkg ── */}
      <div className="card" style={{ maxWidth: 560, marginBottom: 16 }}>
        <div className="card-header"><span className="card-title">Export Twin as Package</span></div>
        <div className="card-body">
          <div className="flex gap-8" style={{ alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">Twin</label>
              <select className="input select" value={exportTwinId} onChange={e => setExportTwinId(e.target.value)}>
                <option value="">Select twin…</option>
                {twins.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <button className="btn btn-outline" onClick={doExport} disabled={!exportTwinId}>
              ↓ Download .twinpkg
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 8 }}>
            Exports captured endpoints as a portable .twinpkg file that can be shared or installed on other TwinBridge instances.
          </div>
        </div>
      </div>

      {/* ── Keyboard shortcuts ── */}
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-header"><span className="card-title">Keyboard Shortcuts</span></div>
        <div className="card-body">
          {[['⌘K', 'Command palette'], ['⌘1–8', 'Navigate views'], ['Esc', 'Close panels']].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--cyan)' }}>{k}</span>
              <span style={{ color: 'var(--dim)' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
