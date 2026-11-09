// @ts-check
import { HOST_GONE_MS, HOST_SILENCE_MS, RESYNC_RETRY_MS } from './constants.js';
import { decodeMessage } from './protocol.js';
import { applyChange } from './view.js';

/**
 * @typedef {import('./view.js').SpectatorView} SpectatorView
 * @typedef {import('./protocol.js').Message} Message
 * @typedef {import('./protocol.js').RejectReason} RejectReason
 * @typedef {import('../../room/transport.js').TransportStatus} TransportStatus
 *
 * @typedef {'joining' | 'connected' | 'host-offline' | 'closed' | 'unavailable' | 'rejected'} Connection
 * @typedef {'waiting' | 'synced' | 'desynced'} Sync
 *
 * @typedef {object} ParticipantState
 * @property {string} participantId
 * @property {string} alias
 * @property {Connection} connection
 * @property {Sync} sync
 * @property {SpectatorView | null} view
 * @property {number | null} seq
 * @property {number | null} participantCount
 * @property {RejectReason | null} rejectReason
 * @property {number} lastHostMessageAt
 * @property {number | null} hostOfflineSince
 * @property {number | null} lastResyncAt
 *
 * @typedef {{ type: 'status', status: TransportStatus, now: number }
 *   | { type: 'message', data: unknown, now: number }
 *   | { type: 'tick', now: number }} ParticipantInput
 */

const EMPTY_OUT = Object.freeze(/** @type {Message[]} */ ([]));
const FINAL = new Set(['rejected', 'closed', 'unavailable']);

/**
 * @param {{ participantId: string, alias: string, now: number }} args
 * @returns {ParticipantState}
 */
export function createParticipant({ participantId, alias, now }) {
  return {
    participantId,
    alias,
    connection: 'joining',
    sync: 'waiting',
    view: null,
    seq: null,
    participantCount: null,
    rejectReason: null,
    lastHostMessageAt: now,
    hostOfflineSince: null,
    lastResyncAt: null,
  };
}

/**
 * @param {SpectatorView} view
 * @returns {SpectatorView}
 */
function copyView(view) {
  return {
    gameId: view.gameId,
    status: view.status,
    drawn: [...view.drawn],
    prizes: view.prizes.map((p) => ({ ...p })),
  };
}

/**
 * @param {import('./protocol.js').HostMessage} msg
 * @returns {import('./view.js').Change | null}
 */
function toChange(msg) {
  switch (msg.type) {
    case 'ball':
      return { type: 'ball', ball: msg.ball };
    case 'undo':
      return { type: 'undo', ball: msg.ball };
    case 'prize':
      return { type: 'prize', prize: msg.prize };
    case 'end':
      return msg.scope === 'game' ? { type: 'end-game' } : null;
    default:
      return null;
  }
}

/**
 * @param {ParticipantState} state
 * @param {number} now
 * @returns {{ state: ParticipantState, out: Message[] }}
 */
function maybeResync(state, now) {
  const already = state.sync === 'desynced';
  const next = { ...state, sync: /** @type {Sync} */ ('desynced') };
  if (already && next.lastResyncAt != null && now - next.lastResyncAt < RESYNC_RETRY_MS) {
    return { state: next, out: EMPTY_OUT };
  }
  next.lastResyncAt = now;
  return { state: next, out: [{ type: 'resync' }] };
}

/**
 * @param {ParticipantState} state
 * @param {Extract<import('./protocol.js').HostMessage, { type: 'snapshot' }>} msg
 * @param {number} now
 * @returns {{ state: ParticipantState, out: Message[] }}
 */
function applySnapshot(state, msg, now) {
  const s = state.seq;
  if (s != null && msg.seq < s) {
    return { state: { ...state, lastHostMessageAt: now }, out: EMPTY_OUT };
  }
  /** @type {ParticipantState} */
  const next = {
    ...state,
    connection: 'connected',
    sync: 'synced',
    seq: msg.seq,
    view: copyView(msg.view),
    lastHostMessageAt: now,
    hostOfflineSince: null,
    lastResyncAt: null,
  };
  if (typeof msg.alias === 'string') next.alias = msg.alias;
  if (typeof msg.participantCount === 'number') next.participantCount = msg.participantCount;
  return { state: next, out: EMPTY_OUT };
}

/**
 * Recupera de `host-offline` al recibir cualquier mensaje del cantador.
 * @param {ParticipantState} state
 */
function recovered(state) {
  if (state.connection !== 'host-offline') return state;
  return { ...state, connection: /** @type {Connection} */ ('connected'), hostOfflineSince: null };
}

/**
 * @param {ParticipantState} state
 * @param {unknown} data
 * @param {number} now
 * @returns {{ state: ParticipantState, out: Message[] }}
 */
function onMessage(state, data, now) {
  const decoded = decodeMessage(data, 'host');
  if (!decoded.ok) {
    if (decoded.reason === 'incompatible-version') {
      return {
        state: { ...state, connection: 'rejected', rejectReason: 'incompatible-version' },
        out: EMPTY_OUT,
      };
    }
    return { state, out: EMPTY_OUT };
  }
  const msg = decoded.msg;

  if (msg.type === 'reject') {
    return {
      state: { ...state, connection: 'rejected', rejectReason: msg.reason, lastHostMessageAt: now },
      out: EMPTY_OUT,
    };
  }
  if (msg.type === 'end' && msg.scope === 'room') {
    return {
      state: { ...state, connection: 'closed', lastHostMessageAt: now },
      out: EMPTY_OUT,
    };
  }

  let current = recovered({ ...state, lastHostMessageAt: now });

  if (msg.type === 'snapshot') {
    if (current.sync === 'waiting' && typeof msg.alias !== 'string') {
      return { state: current, out: EMPTY_OUT };
    }
    return applySnapshot(current, msg, now);
  }

  if (current.sync === 'waiting' || current.view == null || current.seq == null) {
    if (msg.type === 'host-online') return maybeJoin(current, now);
    return { state: current, out: EMPTY_OUT };
  }

  if (msg.type === 'presence') {
    current = { ...current, participantCount: msg.count };
    if (msg.lastSeq > current.seq) return maybeResync(current, now);
    return { state: current, out: EMPTY_OUT };
  }

  if (msg.type === 'host-online') {
    if (msg.lastSeq > current.seq) return maybeResync(current, now);
    return { state: current, out: EMPTY_OUT };
  }

  const change = toChange(msg);
  if (!change || !('seq' in msg)) return { state: current, out: EMPTY_OUT };

  const seq = msg.seq;
  if (seq <= current.seq) return { state: current, out: EMPTY_OUT };
  if (seq === current.seq + 1) {
    const applied = applyChange(current.view, change);
    if (!applied.ok) return maybeResync(current, now);
    return {
      state: { ...current, view: applied.view, seq, sync: 'synced' },
      out: EMPTY_OUT,
    };
  }
  return maybeResync(current, now);
}

function joinMsg(state) {
  return { type: /** @type {const} */ ('join'), participantId: state.participantId, alias: state.alias };
}

/**
 * Reintenta `join` si el anterior pudo perderse (canal con pérdidas).
 * @param {ParticipantState} state
 * @param {number} now
 * @returns {{ state: ParticipantState, out: Message[] }}
 */
function maybeJoin(state, now) {
  if (state.lastResyncAt != null && now - state.lastResyncAt < RESYNC_RETRY_MS) {
    return { state, out: EMPTY_OUT };
  }
  return { state: { ...state, lastResyncAt: now }, out: [joinMsg(state)] };
}

/**
 * @param {ParticipantState} state
 * @param {TransportStatus} status
 * @param {number} now
 * @returns {{ state: ParticipantState, out: Message[] }}
 */
function onStatus(state, status, now) {
  switch (status) {
    case 'connected':
      return { state: { ...state, lastResyncAt: now }, out: [joinMsg(state)] };
    case 'disconnected':
      return { state: { ...state, connection: 'joining' }, out: EMPTY_OUT };
    case 'host-offline':
      if (state.connection === 'host-offline') return { state, out: EMPTY_OUT };
      return {
        state: { ...state, connection: 'host-offline', hostOfflineSince: now },
        out: EMPTY_OUT,
      };
    case 'room-unavailable':
      return { state: { ...state, connection: 'unavailable' }, out: EMPTY_OUT };
    default:
      return { state, out: EMPTY_OUT };
  }
}

/**
 * @param {ParticipantState} state
 * @param {number} now
 * @returns {{ state: ParticipantState, out: Message[] }}
 */
function onTick(state, now) {
  if (state.connection === 'joining' && state.sync === 'waiting') {
    return maybeJoin(state, now);
  }
  if (state.connection === 'host-offline') {
    if (state.hostOfflineSince != null && now - state.hostOfflineSince >= HOST_GONE_MS) {
      return { state: { ...state, connection: 'unavailable' }, out: EMPTY_OUT };
    }
    return { state, out: EMPTY_OUT };
  }
  if (state.connection === 'connected' && now - state.lastHostMessageAt >= HOST_SILENCE_MS) {
    return {
      state: { ...state, connection: 'host-offline', hostOfflineSince: now },
      out: EMPTY_OUT,
    };
  }
  return { state, out: EMPTY_OUT };
}

/**
 * Reductor puro del participante. Nunca lanza ante datos de la red.
 * @param {ParticipantState} state
 * @param {ParticipantInput} input
 * @returns {{ state: ParticipantState, out: Message[] }}
 */
export function participantStep(state, input) {
  if (FINAL.has(state.connection)) return { state, out: EMPTY_OUT };
  switch (input?.type) {
    case 'status':
      return onStatus(state, input.status, input.now);
    case 'message':
      return onMessage(state, input.data, input.now);
    case 'tick':
      return onTick(state, input.now);
    default:
      return { state, out: EMPTY_OUT };
  }
}
