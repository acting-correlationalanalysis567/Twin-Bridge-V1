import { useEffect, useRef } from 'react';

const WS_URL = `ws://${location.host}/ws`;
const listeners = new Map(); // type → Set<fn>
let socket = null;
let reconnectTimer = null;

function connect() {
  if (socket && socket.readyState < 2) return;
  socket = new WebSocket(WS_URL);

  socket.onopen  = () => { clearTimeout(reconnectTimer); console.log('[WS] connected'); };
  socket.onclose = () => { reconnectTimer = setTimeout(connect, 2000); };
  socket.onerror = () => { socket.close(); };

  socket.onmessage = (ev) => {
    try {
      const { type, data } = JSON.parse(ev.data);
      const fns = listeners.get(type);
      if (fns) fns.forEach(fn => fn(data));
    } catch {}
  };
}

// Kick off connection when module loads
connect();

export function useWS(types, handler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const arr = Array.isArray(types) ? types : [types];
    const fn = (data) => handlerRef.current(data);

    arr.forEach(t => {
      if (!listeners.has(t)) listeners.set(t, new Set());
      listeners.get(t).add(fn);
    });

    return () => {
      arr.forEach(t => listeners.get(t)?.delete(fn));
    };
  }, []);
}
