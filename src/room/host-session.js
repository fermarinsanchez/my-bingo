// @ts-check
import { TICK_MS } from '../core/room/constants.js';
import { getPresence, hostStep, openRoom } from '../core/room/host.js';
import { encodeMessage } from '../core/room/protocol.js';

/**
 * @typedef {import('./transport.js').HostTransport} HostTransport
 * @typedef {import('./transport.js').Clock} Clock
 * @typedef {import('../core/game.js').Game} Game
 * @typedef {import('../core/room/host.js').HostRoom} HostRoom
 * @typedef {{ count: number, aliases: string[] }} Presence
 *
 * @typedef {object} HostSession
 * @property {(game: Game) => void} update
 * @property {() => void} resume
 * @property {() => void} close
 * @property {() => Presence} getPresence
 * @property {(fn: (presence: Presence) => void) => () => void} subscribe
 */

/**
 * @param {Presence} a
 * @param {Presence} b
 */
function samePresence(a, b) {
  return (
    a.count === b.count &&
    a.aliases.length === b.aliases.length &&
    a.aliases.every((x, i) => x === b.aliases[i])
  );
}

/**
 * Conecta el reductor del cantador con un transporte y un reloj inyectados.
 * Nunca lanza hacia el llamador (FR-030).
 * @param {{ transport: HostTransport, clock: Clock, game: Game }} args
 * @returns {HostSession}
 */
export function createHostSession({ transport, clock, game }) {
  /** @type {HostRoom} */
  let room;
  try {
    room = openRoom({ game, now: clock.now() });
  } catch {
    room = openRoom({ game, now: 0 });
  }
  /** @type {Set<(p: Presence) => void>} */
  const subs = new Set();
  let lastPresence = getPresence(room);
  /** @type {any} */
  let timer = null;
  let closed = false;

  function notifyPresence() {
    try {
      const p = getPresence(room);
      if (samePresence(p, lastPresence)) return;
      lastPresence = p;
      for (const fn of subs) {
        try {
          fn(p);
        } catch {
          /* FR-030 */
        }
      }
    } catch {
      /* FR-030 */
    }
  }

  /** @param {import('../core/room/host.js').Outgoing[]} out */
  function emit(out) {
    for (const item of out) {
      try {
        const data = encodeMessage(item.msg);
        if (item.to === 'all') transport.broadcast(data);
        else transport.send(item.to, data);
      } catch {
        /* FR-030 */
      }
    }
  }

  /** @param {import('../core/room/host.js').HostInput} input */
  function dispatch(input) {
    try {
      const r = hostStep(room, input);
      room = r.state;
      emit(r.out);
      notifyPresence();
    } catch {
      /* FR-030 */
    }
  }

  try {
    transport.onMessage((peerId, data) => {
      let now = 0;
      try {
        now = clock.now();
      } catch {
        /* FR-030 */
      }
      dispatch({ type: 'message', peerId, data, now });
    });
    transport.onPeerLeave((peerId) => {
      let now = 0;
      try {
        now = clock.now();
      } catch {
        /* FR-030 */
      }
      dispatch({ type: 'peer-left', peerId, now });
    });
    timer = clock.setInterval(() => {
      let now = 0;
      try {
        now = clock.now();
      } catch {
        /* FR-030 */
      }
      dispatch({ type: 'tick', now });
    }, TICK_MS);
  } catch {
    /* FR-030 */
  }

  return {
    update(nextGame) {
      let now = 0;
      try {
        now = clock.now();
      } catch {
        /* FR-030 */
      }
      dispatch({ type: 'game-changed', game: nextGame, now });
    },
    resume() {
      let now = 0;
      try {
        now = clock.now();
      } catch {
        /* FR-030 */
      }
      dispatch({ type: 'resume', now });
    },
    close() {
      let now = 0;
      try {
        now = clock.now();
      } catch {
        /* FR-030 */
      }
      if (!closed) {
        closed = true;
        dispatch({ type: 'close', now });
        try {
          if (timer != null) clock.clearInterval(timer);
        } catch {
          /* FR-030 */
        }
      }
      try {
        transport.close();
      } catch {
        /* FR-030 */
      }
    },
    getPresence() {
      try {
        return getPresence(room);
      } catch {
        return { count: 0, aliases: [] };
      }
    },
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}
