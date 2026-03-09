import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/index.js';

const CMDS = [
  { label: 'Dashboard',   action: s => s.setView('dashboard'),  shortcut: '⌘1' },
  { label: 'Twins',       action: s => s.setView('twins'),       shortcut: '⌘2' },
  { label: 'Capture',     action: s => s.setView('capture'),     shortcut: '⌘3' },
  { label: 'Replay',      action: s => s.setView('replay'),      shortcut: '⌘4' },
  { label: 'Schema Diff', action: s => s.setView('diff'),        shortcut: '⌘5' },
  { label: 'Logs',        action: s => s.setView('logs'),        shortcut: '⌘6' },
  { label: 'Registry',    action: s => s.setView('registry'),    shortcut: '⌘7' },
  { label: 'Settings',    action: s => s.setView('settings'),    shortcut: '⌘8' },
  { label: 'Clear Logs',  action: s => s.clearLogs() },
  { label: 'Toggle Theme',action: s => { const n = s.theme === 'dark' ? 'light' : 'dark'; s.setTheme(n); localStorage.setItem('tb-theme', n); }},
];

export default function CmdPalette() {
  const store = useStore();
  const { cmdPaletteOpen, setCmdPalette } = store;
  const [query, setQuery] = useState('');
  const [idx, setIdx]     = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (cmdPaletteOpen) { setQuery(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [cmdPaletteOpen]);

  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setCmdPalette(true); }
      if (e.key === 'Escape') setCmdPalette(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  if (!cmdPaletteOpen) return null;

  const filtered = CMDS.filter(c => !query || c.label.toLowerCase().includes(query.toLowerCase()));

  const exec = (cmd) => { cmd.action(store); setCmdPalette(false); };
  const handleKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i+1, filtered.length-1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx(i => Math.max(i-1, 0)); }
    if (e.key === 'Enter' && filtered[idx]) exec(filtered[idx]);
    if (e.key === 'Escape') setCmdPalette(false);
  };

  return (
    <div className="modal-overlay" onClick={() => setCmdPalette(false)}>
      <div className="modal" style={{ width: 520 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <input ref={inputRef} className="input" style={{ border: 'none', background: 'transparent', fontSize: 14, padding: '4px 0' }}
            placeholder="Type a command…" value={query}
            onChange={e => { setQuery(e.target.value); setIdx(0); }} onKeyDown={handleKey} />
        </div>
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: '6px 0' }}>
          {filtered.map((cmd, i) => (
            <div key={cmd.label}
              style={{ padding: '8px 16px', display: 'flex', justifyContent: 'space-between', cursor: 'pointer',
                background: i === idx ? 'rgba(0,212,255,0.08)' : 'transparent', fontSize: 13 }}
              onClick={() => exec(cmd)} onMouseEnter={() => setIdx(i)}>
              <span style={{ color: i === idx ? 'var(--cyan)' : 'var(--text)' }}>{cmd.label}</span>
              {cmd.shortcut && <span style={{ color: 'var(--dim)', fontSize: 11, fontFamily: 'var(--mono)' }}>{cmd.shortcut}</span>}
            </div>
          ))}
          {filtered.length === 0 && <div className="empty" style={{ padding: 20 }}><div className="empty-sub">No commands match</div></div>}
        </div>
      </div>
    </div>
  );
}
