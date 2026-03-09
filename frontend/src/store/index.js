import { create } from 'zustand';

function uid() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ globalThis.crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
}

export const useStore = create((set, get) => ({
  // ── Navigation ──────────────────────────────────────────────────────
  view: 'dashboard',
  setView: (view) => set({ view }),

  // ── Theme ────────────────────────────────────────────────────────────
  theme: localStorage.getItem('tb-theme') || 'dark',
  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tb-theme', theme);
    set({ theme });
  },

  // ── UI overlays ──────────────────────────────────────────────────────
  cmdPaletteOpen: false,
  setCmdPalette: (open) => set({ cmdPaletteOpen: open }),

  notifPanelOpen: false,
  setNotifPanel: (open) => set({ notifPanelOpen: open }),

  // ── Twins ─────────────────────────────────────────────────────────────
  twins: [],
  setTwins: (twins) => set({ twins }),
  upsertTwin: (twin) => set(s => {
    const idx = s.twins.findIndex(t => t.id === twin.id);
    if (idx >= 0) {
      const next = [...s.twins];
      next[idx] = { ...next[idx], ...twin };
      return { twins: next };
    }
    return { twins: [twin, ...s.twins] };
  }),
  removeTwin: (id) => set(s => ({ twins: s.twins.filter(t => t.id !== id) })),

  // ── Capture ───────────────────────────────────────────────────────────
  captureEvents: [],
  activeSessionId: null,
  activeTwinId: null,
  activePort: null,
  inspectorEvent: null,

  addCaptureEvent: (event) => set(s => ({
    captureEvents: [event, ...s.captureEvents].slice(0, 2000),
  })),
  clearCaptureEvents: () => set({ captureEvents: [] }),
  setActiveSession: (sessionId, twinId, port) => set({ activeSessionId: sessionId, activeTwinId: twinId, activePort: port ?? null }),
  clearActiveSession: () => set({ activeSessionId: null, activeTwinId: null, activePort: null }),
  setInspectorEvent: (event) => set({ inspectorEvent: event }),

  // ── Replay ────────────────────────────────────────────────────────────
  replayRuns: [],
  setReplayRuns: (runs) => set({ replayRuns: runs }),
  updateReplayRun: (runId, patch) => set(s => ({
    replayRuns: s.replayRuns.map(r => r.id === runId ? { ...r, ...patch } : r),
  })),

  activeRunId: null,
  setActiveRun: (id) => set({ activeRunId: id }),

  replayResults: {}, // runId → result[]
  addReplayResult: (runId, result) => set(s => ({
    replayResults: {
      ...s.replayResults,
      [runId]: [...(s.replayResults[runId] || []), result],
    },
  })),

  // ── Notifications ─────────────────────────────────────────────────────
  notifications: [],
  unreadCount: 0,
  addNotif: (n) => set(s => {
    const next = [{ ...n, id: uid(), ts: Date.now(), read: false }, ...s.notifications].slice(0, 100);
    return { notifications: next, unreadCount: next.filter(x => !x.read).length };
  }),
  markAllRead: () => set(s => ({
    notifications: s.notifications.map(n => ({ ...n, read: true })),
    unreadCount: 0,
  })),

  // ── Logs ──────────────────────────────────────────────────────────────
  logs: [],
  addLog: (entry) => set(s => ({
    logs: [{ ...entry, id: uid(), ts: Date.now() }, ...s.logs].slice(0, 1000),
  })),
  clearLogs: () => set({ logs: [] }),
}));
