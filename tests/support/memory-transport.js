// Transporte falso en memoria con reloj virtual y fallos con semilla. Solo para tests
// (contracts/transport.md › Transporte falso).
import { createRng } from './prng.js';

/**
 * @typedef {object} Handle Una conexión de participante.
 * @property {number} id
 * @property {string} peerId
 * @property {number} epoch Se incrementa en cada desconexión (descarta mensajes en vuelo).
 * @property {boolean} connected
 * @property {boolean} closed
 * @property {((d: string) => void) | null} onMessage
 * @property {((s: string) => void) | null} onStatus
 */

/**
 * @param {{ seed?: number, drop?: number, duplicate?: number, maxDelayMs?: number }} [opts]
 */
export function createMemoryHub({ seed = 1, drop = 0, duplicate = 0, maxDelayMs = 0 } = {}) {
  const rng = createRng(seed);
  const faults = { drop, duplicate, maxDelayMs };

  let time = 0;
  let order = 0;
  /** Cola de sucesos ordenada por (at, order): montículo mínimo. */
  /** @type {{ at: number, order: number, fn: () => void }[]} */
  const heap = [];

  /** @param {{ at: number, order: number }} a @param {{ at: number, order: number }} b */
  const less = (a, b) => a.at < b.at || (a.at === b.at && a.order < b.order);

  /** @param {number} at @param {() => void} fn */
  function schedule(at, fn) {
    const ev = { at, order: order++, fn };
    let i = heap.push(ev) - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(heap[i], heap[p])) break;
      [heap[i], heap[p]] = [heap[p], heap[i]];
      i = p;
    }
  }

  function pop() {
    const top = heap[0];
    const last = /** @type {NonNullable<typeof top>} */ (heap.pop());
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && less(heap[l], heap[m])) m = l;
        if (r < heap.length && less(heap[r], heap[m])) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m], heap[i]];
        i = m;
      }
    }
    return top;
  }

  /** @param {number} ms */
  function advance(ms) {
    const target = time + ms;
    while (heap.length > 0 && heap[0].at <= target) {
      const ev = pop();
      time = ev.at;
      ev.fn();
    }
    time = target;
  }

  // ---- Reloj ----
  let nextTimer = 0;
  const cancelled = new Set();
  function clock() {
    return {
      now: () => time,
      /** @param {() => void} fn @param {number} ms */
      setInterval(fn, ms) {
        const id = ++nextTimer;
        /** @param {number} at */
        const arm = (at) =>
          schedule(at, () => {
            if (cancelled.has(id)) return;
            arm(at + ms);
            fn();
          });
        arm(time + ms);
        return id;
      },
      /** @param {number} id */
      clearInterval(id) {
        cancelled.add(id);
      },
    };
  }

  // ---- Red ----
  /** @type {{ at: number, dir: 'host→participant' | 'participant→host', peerId: string, participant: number, data: string }[]} */
  const log = [];
  /** @type {Map<any, Handle>} */
  const handles = new Map();
  /** @type {Map<string, Handle>} */
  const byPeer = new Map();
  let nextPeer = 0;
  let nextHandle = 0;
  let hostDown = false;
  let hostClosed = false;
  let destroyed = false;
  /** @type {((peerId: string, data: string) => void) | null} */
  let hostOnMessage = null;
  /** @type {((peerId: string) => void) | null} */
  let hostOnPeerLeave = null;
  /** @type {string[]} */
  let pendingLeaves = [];

  /** @returns {number[]} retrasos de cada copia que se entregará (vacío si se pierde). */
  function copies() {
    const out = [];
    const n = rng.rnd() < faults.duplicate ? 2 : 1;
    for (let i = 0; i < n; i++) {
      if (rng.rnd() < faults.drop) continue;
      out.push(Math.floor(rng.rnd() * (faults.maxDelayMs + 1)));
    }
    return out;
  }

  /** @param {Handle} h @param {string} status */
  function emitStatus(h, status) {
    schedule(time, () => {
      if (!h.closed) h.onStatus?.(status);
    });
  }

  /** @param {Handle} h */
  function newPeer(h) {
    byPeer.delete(h.peerId);
    h.peerId = `peer-${++nextPeer}`;
    byPeer.set(h.peerId, h);
  }

  /** @param {Handle} h @param {string} data */
  function toParticipant(h, data) {
    if (destroyed || hostDown || hostClosed || !h.connected || h.closed) return;
    const epoch = h.epoch;
    for (const delay of copies()) {
      schedule(time + delay, () => {
        if (destroyed || hostDown || h.closed || !h.connected || h.epoch !== epoch) return;
        log.push({ at: time, dir: 'host→participant', peerId: h.peerId, participant: h.id, data });
        h.onMessage?.(data);
      });
    }
  }

  /** @param {Handle} h @param {string} data */
  function toHost(h, data) {
    if (destroyed || hostDown || hostClosed || !h.connected || h.closed) return;
    const epoch = h.epoch;
    for (const delay of copies()) {
      schedule(time + delay, () => {
        if (destroyed || hostDown || hostClosed || h.closed || !h.connected || h.epoch !== epoch) {
          return;
        }
        log.push({ at: time, dir: 'participant→host', peerId: h.peerId, participant: h.id, data });
        hostOnMessage?.(h.peerId, data);
      });
    }
  }

  /** @param {string} peerId */
  function notifyLeave(peerId) {
    if (hostDown || hostClosed) pendingLeaves.push(peerId);
    else schedule(time, () => hostOnPeerLeave?.(peerId));
  }

  function hostTransport() {
    return {
      /** @param {string} peerId @param {string} data */
      send(peerId, data) {
        const h = byPeer.get(peerId);
        if (h) toParticipant(h, data);
      },
      /** @param {string} data */
      broadcast(data) {
        for (const h of handles.values()) toParticipant(h, data);
      },
      /** @param {(peerId: string, data: string) => void} fn */
      onMessage(fn) {
        hostOnMessage = fn;
        return () => {
          if (hostOnMessage === fn) hostOnMessage = null;
        };
      },
      /** @param {(peerId: string) => void} fn */
      onPeerLeave(fn) {
        hostOnPeerLeave = fn;
        return () => {
          if (hostOnPeerLeave === fn) hostOnPeerLeave = null;
        };
      },
      close() {
        hostClosed = true;
      },
    };
  }

  function participantTransport() {
    /** @type {Handle} */
    const h = {
      id: ++nextHandle,
      peerId: '',
      epoch: 0,
      connected: true,
      closed: false,
      onMessage: null,
      onStatus: null,
    };
    newPeer(h);
    const t = {
      /** @param {string} data */
      send: (data) => toHost(h, data),
      /** @param {(d: string) => void} fn */
      onMessage(fn) {
        h.onMessage = fn;
        return () => {
          if (h.onMessage === fn) h.onMessage = null;
        };
      },
      /** @param {(s: string) => void} fn */
      onStatus(fn) {
        h.onStatus = fn;
        return () => {
          if (h.onStatus === fn) h.onStatus = null;
        };
      },
      close() {
        if (h.closed) return;
        const wasConnected = h.connected;
        h.closed = true;
        h.connected = false;
        h.epoch++;
        byPeer.delete(h.peerId);
        handles.delete(t);
        if (wasConnected) notifyLeave(h.peerId);
      },
    };
    handles.set(t, h);
    emitStatus(h, destroyed ? 'room-unavailable' : hostDown ? 'host-offline' : 'connected');
    return t;
  }

  /** @param {any} p */
  function disconnect(p) {
    const h = handles.get(p);
    if (!h || !h.connected) return;
    h.connected = false;
    h.epoch++;
    notifyLeave(h.peerId);
    emitStatus(h, 'disconnected');
  }

  /** @param {any} p */
  function reconnect(p) {
    const h = handles.get(p);
    if (!h || h.connected || h.closed) return;
    h.connected = true;
    h.epoch++;
    newPeer(h);
    emitStatus(h, destroyed ? 'room-unavailable' : hostDown ? 'host-offline' : 'connected');
  }

  function hostOffline() {
    if (hostDown) return;
    hostDown = true;
    for (const h of handles.values()) if (h.connected) emitStatus(h, 'host-offline');
  }

  function hostOnline() {
    if (!hostDown) return;
    hostDown = false;
    for (const h of handles.values()) if (h.connected) emitStatus(h, 'connected');
    const leaves = pendingLeaves;
    pendingLeaves = [];
    for (const peerId of leaves) schedule(time, () => hostOnPeerLeave?.(peerId));
  }

  function destroyRoom() {
    destroyed = true;
    for (const h of handles.values()) if (h.connected) emitStatus(h, 'room-unavailable');
  }

  /** @param {{ drop?: number, duplicate?: number, maxDelayMs?: number }} f */
  function setFaults(f) {
    Object.assign(faults, f);
  }

  return {
    now: () => time,
    advance,
    clock,
    hostTransport,
    participantTransport,
    disconnect,
    reconnect,
    hostOffline,
    hostOnline,
    destroyRoom,
    setFaults,
    log,
  };
}
