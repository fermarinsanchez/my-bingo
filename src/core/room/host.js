// @ts-check
import {
  HEARTBEAT_MS,
  MAX_PARTICIPANTS,
  RESERVATION_MS,
} from './constants.js';
import { sanitizeAlias } from './alias.js';
import { decodeMessage } from './protocol.js';
import { applyChange, diffGames, toSpectatorView } from './view.js';

/**
 * @typedef {import('../game.js').Game} Game
 * @typedef {import('./view.js').SpectatorView} SpectatorView
 * @typedef {import('./protocol.js').HostMessage} HostMessage
 *
 * @typedef {object} Member
 * @property {string} participantId
 * @property {string} alias
 * @property {string} aliasKey
 * @property {'connected' | 'reserved'} status
 * @property {string | null} peerId
 * @property {number | null} reservedUntil
 *
 * @typedef {object} HostRoom
 * @property {'open' | 'closed'} status
 * @property {number} seq
 * @property {Game} lastGame
 * @property {SpectatorView} view
 * @property {Map<string, Member>} members
 * @property {Map<string, string>} peers
 * @property {number} lastHeartbeatAt
 *
 * @typedef {{ to: 'all' | string, msg: HostMessage }} Outgoing
 *
 * @typedef {{ type: 'game-changed', game: Game, now: number }
 *   | { type: 'message', peerId: string, data: unknown, now: number }
 *   | { type: 'peer-left', peerId: string, now: number }
 *   | { type: 'tick', now: number }
 *   | { type: 'resume', now: number }
 *   | { type: 'close', now: number }} HostInput
 */

const EMPTY = Object.freeze(/** @type {Outgoing[]} */ ([]));

/**
 * @param {HostRoom} room
 * @returns {HostRoom}
 */
function cloneRoom(room) {
  return {
    ...room,
    members: new Map(room.members),
    peers: new Map(room.peers),
  };
}

/**
 * Alias de los miembros conectados, en orden de llegada.
 * @param {HostRoom} room
 * @returns {{ count: number, aliases: string[] }}
 */
export function getPresence(room) {
  const aliases = [];
  for (const m of room.members.values()) {
    if (m.status === 'connected') aliases.push(m.alias);
  }
  return { count: aliases.length, aliases };
}

/**
 * @param {string} peerId
 * @param {import('./protocol.js').RejectReason} reason
 * @returns {Outgoing}
 */
const rejectTo = (peerId, reason) => ({ to: peerId, msg: { type: 'reject', reason } });

/**
 * @param {HostRoom} room
 * @returns {Outgoing}
 */
const presenceToAll = (room) => ({
  to: 'all',
  msg: { type: 'presence', count: getPresence(room).count, lastSeq: room.seq },
});

/**
 * Snapshot de respuesta (join / resync): no incrementa seq.
 * @param {string} peerId
 * @param {HostRoom} room
 * @param {string} alias
 * @returns {Outgoing}
 */
const snapshotTo = (peerId, room, alias) => ({
  to: peerId,
  msg: {
    type: 'snapshot',
    seq: room.seq,
    view: room.view,
    alias,
    participantCount: getPresence(room).count,
  },
});

/**
 * Pasa un miembro conectado a reservado. Mutates `room` (ya clonado).
 * @param {HostRoom} room
 * @param {string} participantId
 * @param {number} now
 */
function reserve(room, participantId, now) {
  const m = room.members.get(participantId);
  if (!m || m.status !== 'connected') return;
  if (m.peerId) room.peers.delete(m.peerId);
  room.members.set(participantId, {
    ...m,
    status: 'reserved',
    peerId: null,
    reservedUntil: now + RESERVATION_MS,
  });
}

/**
 * Si este peer estaba ligado a otra identidad, la reserva.
 * @param {HostRoom} room
 * @param {string} peerId
 * @param {string} keepId
 * @param {number} now
 */
function detachPeerIfOther(room, peerId, keepId, now) {
  const bound = room.peers.get(peerId);
  if (bound && bound !== keepId) reserve(room, bound, now);
}

/**
 * @param {{ game: Game, now: number }} args
 * @returns {HostRoom}
 */
export function openRoom({ game, now }) {
  return {
    status: 'open',
    seq: 0,
    lastGame: game,
    view: toSpectatorView(game),
    members: new Map(),
    peers: new Map(),
    lastHeartbeatAt: now,
  };
}

/**
 * @param {import('./view.js').Change} change
 * @param {number} seq
 * @param {Game} game
 * @returns {HostMessage}
 */
function changeToMsg(change, seq, game) {
  switch (change.type) {
    case 'ball':
      return { type: 'ball', seq, ball: change.ball };
    case 'undo':
      return { type: 'undo', seq, ball: change.ball };
    case 'prize':
      return { type: 'prize', seq, prize: change.prize };
    case 'end-game':
      return { type: 'end', scope: 'game', seq };
    default:
      return { type: 'snapshot', seq, view: toSpectatorView(game) };
  }
}

/**
 * @param {HostRoom} room
 * @param {Game} game
 * @returns {{ state: HostRoom, out: Outgoing[] }}
 */
function onGameChanged(room, game) {
  if (room.status === 'closed') {
    if (room.lastGame === game) return { state: room, out: EMPTY };
    return { state: { ...room, lastGame: game, view: toSpectatorView(game) }, out: EMPTY };
  }
  const changes = diffGames(room.lastGame, game);
  if (changes.length === 0) {
    if (room.lastGame === game) return { state: room, out: EMPTY };
    return { state: { ...room, lastGame: game }, out: EMPTY };
  }
  let seq = room.seq;
  let view = room.view;
  /** @type {Outgoing[]} */
  const out = [];
  for (const change of changes) {
    seq += 1;
    if (change.type === 'snapshot') {
      view = toSpectatorView(game);
    } else {
      const applied = applyChange(view, change);
      view = applied.ok ? applied.view : toSpectatorView(game);
    }
    out.push({ to: 'all', msg: changeToMsg(change, seq, game) });
  }
  return { state: { ...room, seq, lastGame: game, view }, out };
}

/**
 * @param {HostRoom} room
 * @param {string} peerId
 * @param {{ participantId: string, alias: string }} msg
 * @param {number} now
 * @returns {{ state: HostRoom, out: Outgoing[] }}
 */
function onJoin(room, peerId, msg, now) {
  if (room.status === 'closed') {
    return { state: room, out: [rejectTo(peerId, 'room-closed')] };
  }

  const existing = room.members.get(msg.participantId);
  if (existing) {
    const next = cloneRoom(room);
    detachPeerIfOther(next, peerId, msg.participantId, now);
    if (existing.peerId && existing.peerId !== peerId) next.peers.delete(existing.peerId);
    const member = next.members.get(msg.participantId) ?? existing;
    next.members.set(msg.participantId, {
      ...member,
      status: 'connected',
      peerId,
      reservedUntil: null,
    });
    next.peers.set(peerId, msg.participantId);
    return {
      state: next,
      out: [snapshotTo(peerId, next, member.alias), presenceToAll(next)],
    };
  }

  const sanitized = sanitizeAlias(msg.alias);
  if (!sanitized.ok) {
    return { state: room, out: [rejectTo(peerId, 'alias-invalid')] };
  }
  for (const m of room.members.values()) {
    if (m.aliasKey === sanitized.key) {
      return { state: room, out: [rejectTo(peerId, 'alias-taken')] };
    }
  }
  if (room.members.size >= MAX_PARTICIPANTS) {
    return { state: room, out: [rejectTo(peerId, 'room-full')] };
  }

  const next = cloneRoom(room);
  detachPeerIfOther(next, peerId, msg.participantId, now);
  next.members.set(msg.participantId, {
    participantId: msg.participantId,
    alias: sanitized.alias,
    aliasKey: sanitized.key,
    status: 'connected',
    peerId,
    reservedUntil: null,
  });
  next.peers.set(peerId, msg.participantId);
  return {
    state: next,
    out: [snapshotTo(peerId, next, sanitized.alias), presenceToAll(next)],
  };
}

/**
 * @param {HostRoom} room
 * @param {string} peerId
 * @returns {{ state: HostRoom, out: Outgoing[] }}
 */
function onResync(room, peerId) {
  if (room.status === 'closed') return { state: room, out: EMPTY };
  const id = room.peers.get(peerId);
  if (!id) return { state: room, out: EMPTY };
  const m = room.members.get(id);
  if (!m || m.status !== 'connected') return { state: room, out: EMPTY };
  return { state: room, out: [snapshotTo(peerId, room, m.alias)] };
}

/**
 * @param {HostRoom} room
 * @param {string} peerId
 * @param {unknown} data
 * @param {number} now
 * @returns {{ state: HostRoom, out: Outgoing[] }}
 */
function onMessage(room, peerId, data, now) {
  const decoded = decodeMessage(data, 'participant');
  if (!decoded.ok) {
    if (decoded.reason === 'incompatible-version' && decoded.type === 'join') {
      return { state: room, out: [rejectTo(peerId, 'incompatible-version')] };
    }
    return { state: room, out: EMPTY };
  }
  if (decoded.msg.type === 'join') {
    return onJoin(room, peerId, decoded.msg, now);
  }
  if (decoded.msg.type === 'resync') {
    return onResync(room, peerId);
  }
  return { state: room, out: EMPTY };
}

/**
 * @param {HostRoom} room
 * @param {string} peerId
 * @param {number} now
 * @returns {{ state: HostRoom, out: Outgoing[] }}
 */
function onPeerLeft(room, peerId, now) {
  if (room.status === 'closed') return { state: room, out: EMPTY };
  const id = room.peers.get(peerId);
  if (!id) return { state: room, out: EMPTY };
  const next = cloneRoom(room);
  reserve(next, id, now);
  return { state: next, out: [presenceToAll(next)] };
}

/**
 * @param {HostRoom} room
 * @param {number} now
 * @returns {{ state: HostRoom, out: Outgoing[] }}
 */
function onTick(room, now) {
  if (room.status !== 'open') return { state: room, out: EMPTY };
  let expired = false;
  /** @type {HostRoom | null} */
  let next = null;
  for (const [id, m] of room.members) {
    if (m.status === 'reserved' && m.reservedUntil != null && now >= m.reservedUntil) {
      if (!next) next = cloneRoom(room);
      next.members.delete(id);
      expired = true;
    }
  }
  const state = next ?? room;
  /** @type {Outgoing[]} */
  const out = [];
  if (now - state.lastHeartbeatAt >= HEARTBEAT_MS) {
    const beaten = next ?? cloneRoom(room);
    beaten.lastHeartbeatAt = now;
    out.push({ to: 'all', msg: { type: 'host-online', lastSeq: beaten.seq } });
    return { state: beaten, out };
  }
  if (expired && next) return { state: next, out: EMPTY };
  return { state: room, out: EMPTY };
}

/**
 * @param {HostRoom} room
 * @param {number} now
 * @returns {{ state: HostRoom, out: Outgoing[] }}
 */
function onResume(room, now) {
  if (room.status !== 'open') return { state: room, out: EMPTY };
  const next = cloneRoom(room);
  next.lastHeartbeatAt = now;
  return { state: next, out: [{ to: 'all', msg: { type: 'host-online', lastSeq: next.seq } }] };
}

/**
 * @param {HostRoom} room
 * @returns {{ state: HostRoom, out: Outgoing[] }}
 */
function onClose(room) {
  if (room.status === 'closed') return { state: room, out: EMPTY };
  const next = cloneRoom(room);
  next.status = 'closed';
  return { state: next, out: [{ to: 'all', msg: { type: 'end', scope: 'room', lastSeq: next.seq } }] };
}

/**
 * Reductor puro del cantador. Nunca lanza ante datos de la red.
 * @param {HostRoom} room
 * @param {HostInput} input
 * @returns {{ state: HostRoom, out: Outgoing[] }}
 */
export function hostStep(room, input) {
  switch (input?.type) {
    case 'game-changed':
      return onGameChanged(room, input.game);
    case 'message':
      return onMessage(room, input.peerId, input.data, input.now);
    case 'peer-left':
      return onPeerLeft(room, input.peerId, input.now);
    case 'tick':
      return onTick(room, input.now);
    case 'resume':
      return onResume(room, input.now);
    case 'close':
      return onClose(room);
    default:
      return { state: room, out: EMPTY };
  }
}
