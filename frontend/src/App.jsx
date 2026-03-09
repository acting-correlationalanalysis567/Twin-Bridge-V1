import { useEffect } from 'react';
import { useStore } from './store/index.js';
import { useWS } from './api/ws.js';
import { twinsApi } from './api/index.js';
import Titlebar      from './components/Titlebar.jsx';
import Sidebar       from './components/Sidebar.jsx';
import CmdPalette    from './components/CmdPalette.jsx';
import NotifPanel    from './components/NotifPanel.jsx';
import Dashboard     from './views/Dashboard.jsx';
import Twins         from './views/Twins.jsx';
import Capture       from './views/Capture.jsx';
import Replay        from './views/Replay.jsx';
import Diff          from './views/Diff.jsx';
import Logs          from './views/Logs.jsx';
import Registry      from './views/Registry.jsx';
import Settings      from './views/Settings.jsx';
import Versions      from './views/Versions.jsx';

export default function App() {
  const { view, theme, setTwins, upsertTwin, removeTwin,
          addCaptureEvent, addNotif, addLog,
          addReplayResult, updateReplayRun, setReplayRuns } = useStore();

  // ── Load initial data ─────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('tb-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);

    twinsApi.list().then(setTwins).catch(err => {
      addLog({ level: 'error', message: `Failed to load twins: ${err.message}`, source: 'app' });
    });
  }, []);

  // ── WebSocket events ──────────────────────────────────────────────
  useWS('capture:event', (data) => {
    addCaptureEvent(data.event);
    addLog({ level: 'info', message: `${data.event.method} ${data.event.path} → ${data.event.status} (${data.event.latency_ms}ms)`, source: 'proxy' });
  });

  useWS(['twin:created', 'twin:updated'], (twin) => {
    upsertTwin(twin);
  });

  useWS('twin:deleted', ({ id }) => {
    removeTwin(id);
    addLog({ level: 'warn', message: `Twin deleted: ${id}`, source: 'system' });
  });

  useWS('proxy:started', (data) => {
    upsertTwin({ id: data.twinId, running: true, proxy_port: data.port });
    addNotif({ icon: '▶', title: 'Proxy started', msg: `Port :${data.port} → ${data.upstream}`, type: 'success' });
    addLog({ level: 'success', message: `Proxy started on :${data.port} → ${data.upstream}`, source: 'proxy' });
  });

  useWS('proxy:stopped', (data) => {
    upsertTwin({ id: data.twinId, running: false, proxy_port: null });
    addNotif({ icon: '■', title: 'Proxy stopped', msg: `Port :${data.port}`, type: 'info' });
    addLog({ level: 'warn', message: `Proxy stopped on :${data.port}`, source: 'proxy' });
  });

  useWS('replay:result', (data) => {
    addReplayResult(data.runId, data);
  });

  useWS('replay:complete', (data) => {
    updateReplayRun(data.runId, { status: 'done', passed: data.passed, failed: data.failed });
    addNotif({
      icon: data.failed === 0 ? '✓' : '✗',
      title: 'Replay complete',
      msg: `${data.passed}/${data.total} passed`,
      type: data.failed === 0 ? 'success' : 'warn',
    });
  });

  useWS('version:created', (data) => {
    addNotif({ icon: '◎', title: 'Version snapshot', msg: `${data.version.label} saved`, type: 'info' });
  });

  useWS(['shadow:started', 'shadow:stopped'], (data) => {
    addLog({ level: 'info', message: `Shadow session ${data.sessionId?.slice(0,8)} ${data.port ? 'started on :' + data.port : 'stopped'}`, source: 'replay' });
  });

  useWS('replay:started', (data) => {
    updateReplayRun(data.runId, { status: 'running', total: data.total });
    addLog({ level: 'info', message: `Replay started: ${data.total} requests`, source: 'replay' });
  });

  // ── View map ──────────────────────────────────────────────────────
  const views = {
    dashboard: <Dashboard />,
    twins:     <Twins />,
    capture:   <Capture />,
    replay:    <Replay />,
    diff:      <Diff />,
    logs:      <Logs />,
    registry:  <Registry />,
    versions:  <Versions />,
    settings:  <Settings />,
  };

  return (
    <div id="app" data-theme={theme}>
      <Titlebar />
      <div className="main-layout">
        <Sidebar />
        <main className="view-area">
          {views[view] || <Dashboard />}
        </main>
      </div>
      <CmdPalette />
      <NotifPanel />
    </div>
  );
}
