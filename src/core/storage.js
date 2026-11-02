// @ts-check
import { INTERVAL_MAX, INTERVAL_MIN, TOTAL_BALLS } from './game.js';

/** @typedef {import('./game.js').Game} Game */
/** @typedef {import('./game.js').Prize} Prize */

/**
 * @typedef {object} Preferences
 * @property {'es' | 'gl'} lang
 * @property {'system' | 'light' | 'dark'} theme
 * @property {'grid' | 'keypad'} inputMethod
 * @property {boolean} wakeLockNoticeShown
 */

export const GAME_SCHEMA_VERSION = 1;
export const PREFS_SCHEMA_VERSION = 1;

const REQUIRED_COUNT = { line: 5, bingo: 15 };

/** @param {unknown} v */
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
/** @param {unknown} v */
const isBall = (v) => Number.isInteger(v) && /** @type {number} */ (v) >= 1 && /** @type {number} */ (v) <= TOTAL_BALLS;
/** @param {unknown[]} arr */
const unique = (arr) => new Set(arr).size === arr.length;

/**
 * Punto de extensión para futuras versiones del esquema. v1 → v1: identidad.
 * @param {Record<string, any>} data
 * @returns {Record<string, any>}
 */
export function migrate(data) {
  return data;
}

/**
 * @param {Game} game
 * @returns {string}
 */
export function serializeGame(game) {
  const { id, startedAt, status, drawn, mode, intervalSec, autoPaused, undoLocked, prizes } = game;
  return JSON.stringify({
    schemaVersion: GAME_SCHEMA_VERSION,
    id,
    startedAt,
    status,
    drawn,
    mode,
    intervalSec,
    autoPaused,
    undoLocked,
    prizes,
  });
}

/**
 * @param {unknown} p
 * @param {number[]} drawn
 * @returns {p is Prize}
 */
function isValidPrize(p, drawn) {
  if (!isObject(p)) return false;
  const prize = /** @type {Record<string, any>} */ (p);
  if (prize.type !== 'line' && prize.type !== 'bingo') return false;
  const { numbers, completionPosition: c, awardedAtPosition: a } = prize;
  if (!Array.isArray(numbers) || numbers.length !== REQUIRED_COUNT[prize.type]) return false;
  if (!numbers.every(isBall) || !unique(numbers)) return false;
  const drawnSet = new Set(drawn);
  if (!numbers.every((n) => drawnSet.has(n))) return false;
  if (!Number.isInteger(c) || !Number.isInteger(a)) return false;
  return c >= 1 && c <= a && a <= drawn.length;
}

/**
 * Lee y valida una partida guardada (contracts/storage-schema.md). Nunca lanza.
 *
 * @param {string | null | undefined} raw
 * @returns {{ ok: true, game: Game } | { ok: false, reason: 'empty' | 'corrupt' | 'unsupported-version' }}
 */
export function parseGame(raw) {
  if (raw === null || raw === undefined || raw === '') return { ok: false, reason: 'empty' };
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  if (!isObject(data)) return { ok: false, reason: 'corrupt' };
  const d = /** @type {Record<string, any>} */ (data);
  if (!Number.isInteger(d.schemaVersion)) return { ok: false, reason: 'corrupt' };
  if (d.schemaVersion > GAME_SCHEMA_VERSION) return { ok: false, reason: 'unsupported-version' };

  const g = migrate(d);
  const valid =
    typeof g.id === 'string' &&
    typeof g.startedAt === 'string' &&
    (g.status === 'in-progress' || g.status === 'finished') &&
    Array.isArray(g.drawn) &&
    g.drawn.length <= TOTAL_BALLS &&
    g.drawn.every(isBall) &&
    unique(g.drawn) &&
    (g.mode === 'manual' || g.mode === 'auto') &&
    Number.isInteger(g.intervalSec) &&
    g.intervalSec >= INTERVAL_MIN &&
    g.intervalSec <= INTERVAL_MAX &&
    typeof g.autoPaused === 'boolean' &&
    typeof g.undoLocked === 'boolean' &&
    Array.isArray(g.prizes) &&
    g.prizes.every((/** @type {unknown} */ p) => isValidPrize(p, g.drawn));
  if (!valid) return { ok: false, reason: 'corrupt' };

  return {
    ok: true,
    game: {
      id: g.id,
      startedAt: g.startedAt,
      status: g.status,
      drawn: [...g.drawn],
      mode: g.mode,
      intervalSec: g.intervalSec,
      autoPaused: g.autoPaused,
      undoLocked: g.undoLocked,
      prizes: g.prizes.map((/** @type {Prize} */ p) => ({ ...p, numbers: [...p.numbers] })),
    },
  };
}

/**
 * @param {Preferences} prefs
 * @returns {string}
 */
export function serializePrefs(prefs) {
  const { lang, theme, inputMethod, wakeLockNoticeShown } = prefs;
  return JSON.stringify({ schemaVersion: PREFS_SCHEMA_VERSION, lang, theme, inputMethod, wakeLockNoticeShown });
}

/**
 * Lee preferencias; cualquier campo ausente o inválido toma su valor por defecto.
 *
 * @param {string | null | undefined} raw
 * @param {'es' | 'gl'} defaultLang
 * @returns {Preferences}
 */
export function parsePrefs(raw, defaultLang) {
  /** @type {Record<string, any>} */
  let d = {};
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    if (isObject(parsed)) d = parsed;
  } catch {
    d = {};
  }
  return {
    lang: d.lang === 'es' || d.lang === 'gl' ? d.lang : defaultLang,
    theme: ['system', 'light', 'dark'].includes(d.theme) ? d.theme : 'system',
    inputMethod: d.inputMethod === 'grid' || d.inputMethod === 'keypad' ? d.inputMethod : 'grid',
    wakeLockNoticeShown: typeof d.wakeLockNoticeShown === 'boolean' ? d.wakeLockNoticeShown : false,
  };
}
