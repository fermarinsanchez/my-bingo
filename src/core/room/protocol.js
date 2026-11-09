// @ts-check
import { PROTOCOL_VERSION, MAX_MESSAGE_BYTES, MAX_PARTICIPANTS, TOTAL_BALLS } from './constants.js';
import { isSpectatorPrize, isSpectatorView } from './view.js';

/**
 * @typedef {import('./view.js').SpectatorView} SpectatorView
 * @typedef {import('./view.js').SpectatorPrize} SpectatorPrize
 * @typedef {'alias-invalid' | 'alias-taken' | 'room-full' | 'incompatible-version' | 'room-closed'} RejectReason
 *
 * @typedef {{ v?: number, type: 'join', participantId: string, alias: string }
 *   | { v?: number, type: 'resync' }} ParticipantMessage
 *
 * @typedef {{ v?: number, type: 'snapshot', seq: number, view: SpectatorView, alias?: string, participantCount?: number }
 *   | { v?: number, type: 'reject', reason: RejectReason }
 *   | { v?: number, type: 'ball', seq: number, ball: number }
 *   | { v?: number, type: 'undo', seq: number, ball: number }
 *   | { v?: number, type: 'prize', seq: number, prize: SpectatorPrize }
 *   | { v?: number, type: 'end', scope: 'game', seq: number }
 *   | { v?: number, type: 'end', scope: 'room', lastSeq: number }
 *   | { v?: number, type: 'host-online', lastSeq: number }
 *   | { v?: number, type: 'presence', count: number, lastSeq: number }} HostMessage
 *
 * @typedef {ParticipantMessage | HostMessage} Message
 *
 * @typedef {{ ok: true, msg: any }
 *   | { ok: false, reason: 'malformed' | 'incompatible-version' | 'too-large', type?: string }} DecodeResult
 */

export const REJECT_REASONS = [
  'alias-invalid',
  'alias-taken',
  'room-full',
  'incompatible-version',
  'room-closed',
];

const PARTICIPANT_ID = /^[A-Za-z0-9-]{8,64}$/;
const MALFORMED = /** @type {const} */ ({ ok: false, reason: 'malformed' });

/**
 * Codifica un mensaje como cadena JSON añadiendo `v` si falta.
 * @param {Message} msg
 * @returns {string}
 */
export function encodeMessage(msg) {
  return JSON.stringify({ v: PROTOCOL_VERSION, ...msg });
}

/** @param {unknown} n */
const isSeq = (n) => Number.isInteger(n) && /** @type {number} */ (n) >= 0;
/** @param {unknown} n */
const isBall = (n) => Number.isInteger(n) && /** @type {number} */ (n) >= 1 && /** @type {number} */ (n) <= TOTAL_BALLS;

/**
 * Valida un objeto ya parseado según su tipo y lo devuelve limpio (solo campos conocidos).
 * Devuelve `null` si no es válido.
 * @param {'host' | 'participant'} from
 * @param {Record<string, any>} o
 * @returns {Record<string, any> | null}
 */
function validate(from, o) {
  const v = PROTOCOL_VERSION;
  if (from === 'participant') {
    switch (o.type) {
      case 'join':
        if (typeof o.participantId !== 'string' || !PARTICIPANT_ID.test(o.participantId)) return null;
        if (typeof o.alias !== 'string') return null;
        return { v, type: 'join', participantId: o.participantId, alias: o.alias };
      case 'resync':
        return { v, type: 'resync' };
      default:
        return null;
    }
  }
  switch (o.type) {
    case 'snapshot': {
      if (!isSeq(o.seq) || !isSpectatorView(o.view)) return null;
      const hasAlias = o.alias !== undefined;
      const hasCount = o.participantCount !== undefined;
      const view = {
        gameId: o.view.gameId,
        status: o.view.status,
        drawn: [...o.view.drawn],
        prizes: o.view.prizes.map((/** @type {SpectatorPrize} */ p) => ({
          type: p.type,
          completionPosition: p.completionPosition,
          awardedAtPosition: p.awardedAtPosition,
        })),
      };
      if (!hasAlias && !hasCount) return { v, type: 'snapshot', seq: o.seq, view };
      if (
        typeof o.alias !== 'string' ||
        !Number.isInteger(o.participantCount) ||
        o.participantCount < 0 ||
        o.participantCount > MAX_PARTICIPANTS
      ) {
        return null;
      }
      return {
        v,
        type: 'snapshot',
        seq: o.seq,
        view,
        alias: o.alias,
        participantCount: o.participantCount,
      };
    }
    case 'reject':
      if (!REJECT_REASONS.includes(o.reason)) return null;
      return { v, type: 'reject', reason: o.reason };
    case 'ball':
    case 'undo':
      if (!isSeq(o.seq) || !isBall(o.ball)) return null;
      return { v, type: o.type, seq: o.seq, ball: o.ball };
    case 'prize':
      if (!isSeq(o.seq) || !isSpectatorPrize(o.prize)) return null;
      return {
        v,
        type: 'prize',
        seq: o.seq,
        prize: {
          type: o.prize.type,
          completionPosition: o.prize.completionPosition,
          awardedAtPosition: o.prize.awardedAtPosition,
        },
      };
    case 'end':
      if (o.scope === 'game' && isSeq(o.seq)) return { v, type: 'end', scope: 'game', seq: o.seq };
      if (o.scope === 'room' && isSeq(o.lastSeq)) {
        return { v, type: 'end', scope: 'room', lastSeq: o.lastSeq };
      }
      return null;
    case 'host-online':
      if (!isSeq(o.lastSeq)) return null;
      return { v, type: 'host-online', lastSeq: o.lastSeq };
    case 'presence':
      if (
        !Number.isInteger(o.count) ||
        o.count < 0 ||
        o.count > MAX_PARTICIPANTS ||
        !isSeq(o.lastSeq)
      ) {
        return null;
      }
      return { v, type: 'presence', count: o.count, lastSeq: o.lastSeq };
    default:
      return null;
  }
}

/**
 * ¿Supera la cadena el máximo de bytes UTF-8? Evita codificar cuando es evidente.
 * @param {string} s
 */
function isTooLarge(s) {
  if (s.length > MAX_MESSAGE_BYTES) return true;
  if (s.length * 3 <= MAX_MESSAGE_BYTES) return false;
  return new TextEncoder().encode(s).length > MAX_MESSAGE_BYTES;
}

/**
 * Decodifica y valida un mensaje recibido. Nunca lanza.
 * `from` es el origen del mensaje: `'host'` (llega a un participante) o `'participant'`
 * (llega al cantador). `reject` se acepta con cualquier `v`.
 * @param {unknown} raw
 * @param {'host' | 'participant'} from
 * @returns {DecodeResult}
 */
export function decodeMessage(raw, from) {
  try {
    if (typeof raw !== 'string') return MALFORMED;
    if (from !== 'host' && from !== 'participant') return MALFORMED;
    if (isTooLarge(raw)) return { ok: false, reason: 'too-large' };
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return MALFORMED;
    if (typeof parsed.type !== 'string') return MALFORMED;
    // `reject` tiene forma congelada: se entiende con cualquier versión.
    if (from === 'host' && parsed.type === 'reject') {
      const msg = validate(from, parsed);
      return msg ? { ok: true, msg } : MALFORMED;
    }
    if (!Number.isInteger(parsed.v)) return MALFORMED;
    if (parsed.v !== PROTOCOL_VERSION) {
      return { ok: false, reason: 'incompatible-version', type: parsed.type };
    }
    const msg = validate(from, parsed);
    return msg ? { ok: true, msg } : MALFORMED;
  } catch {
    return MALFORMED;
  }
}
