// @ts-check
import { randomUUID } from '../core/rng.js';
import { TICK_MS } from '../core/room/constants.js';
import { createParticipant, participantStep } from '../core/room/participant.js';
import { encodeMessage } from '../core/room/protocol.js';

/**
 * @typedef {import('./transport.js').ParticipantTransport} ParticipantTransport
 * @typedef {import('./transport.js').Clock} Clock
 * @typedef {import('../core/room/participant.js').ParticipantState} ParticipantState
 *
 * @typedef {object} ParticipantSession
 * @property {() => ParticipantState} getState
 * @property {(fn: (state: ParticipantState) => void) => () => void} subscribe
 * @property {() => void} leave
 */

/**
 * Conecta el reductor del participante con un transporte y un reloj inyectados.
 * Nunca lanza hacia el llamador (FR-030).
 * @param {{ transport: ParticipantTransport, clock: Clock, alias: string, participantId?: string }} args
 * @returns {ParticipantSession}
 */
export function createParticipantSession({
  transport,
  clock,
  alias,
  participantId = randomUUID(),
}) {
  /** @type {ParticipantState} */
  let state;
  try {
    state = createParticipant({ participantId, alias, now: clock.now() });
  } catch {
    state = createParticipant({ participantId, alias, now: 0 });
  }
  /** @type {Set<(s: ParticipantState) => void>} */
  const subs = new Set();
  /** @type {any} */
  let timer = null;
  let left = false;

  function notify() {
    for (const fn of subs) {
      try {
        fn(state);
      } catch {
        /* FR-030 */
      }
    }
  }

  /** @param {import('../core/room/protocol.js').Message[]} out */
  function emit(out) {
    for (const msg of out) {
      try {
        transport.send(encodeMessage(msg));
      } catch {
        /* FR-030 */
      }
    }
  }

  /** @param {import('../core/room/participant.js').ParticipantInput} input */
  function dispatch(input) {
    try {
      const prev = state;
      const r = participantStep(state, input);
      state = r.state;
      emit(r.out);
      if (state !== prev) notify();
    } catch {
      /* FR-030 */
    }
  }

  try {
    transport.onMessage((data) => {
      let now = 0;
      try {
        now = clock.now();
      } catch {
        /* FR-030 */
      }
      dispatch({ type: 'message', data, now });
    });
    transport.onStatus((status) => {
      let now = 0;
      try {
        now = clock.now();
      } catch {
        /* FR-030 */
      }
      dispatch({ type: 'status', status, now });
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
    getState() {
      return state;
    },
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
    leave() {
      if (left) return;
      left = true;
      subs.clear();
      try {
        if (timer != null) clock.clearInterval(timer);
      } catch {
        /* FR-030 */
      }
      try {
        transport.close();
      } catch {
        /* FR-030 */
      }
    },
  };
}
