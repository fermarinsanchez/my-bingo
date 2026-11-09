// @ts-check
import { TOTAL_BALLS } from './constants.js';

/**
 * @typedef {import('../game.js').Game} Game
 * @typedef {{ type: 'line' | 'bingo', completionPosition: number, awardedAtPosition: number }} SpectatorPrize
 * @typedef {{ gameId: string, status: 'in-progress' | 'finished', drawn: number[], prizes: SpectatorPrize[] }} SpectatorView
 * @typedef {{ type: 'ball' | 'undo', ball: number }
 *   | { type: 'prize', prize: SpectatorPrize }
 *   | { type: 'end-game' }
 *   | { type: 'snapshot' }} Change
 */

/** @param {unknown} n */
const isBall = (n) => Number.isInteger(n) && /** @type {number} */ (n) >= 1 && /** @type {number} */ (n) <= TOTAL_BALLS;

/** @param {unknown} n */
const isPosInt = (n) => Number.isInteger(n) && /** @type {number} */ (n) >= 1;

/**
 * ¿Es un `SpectatorPrize` bien formado (sin comprobar contra `drawn`)?
 * @param {unknown} p
 * @returns {p is SpectatorPrize}
 */
export function isSpectatorPrize(p) {
  if (typeof p !== 'object' || p === null) return false;
  const q = /** @type {Record<string, unknown>} */ (p);
  return (
    (q.type === 'line' || q.type === 'bingo') &&
    isPosInt(q.completionPosition) &&
    isPosInt(q.awardedAtPosition) &&
    /** @type {number} */ (q.completionPosition) <= /** @type {number} */ (q.awardedAtPosition)
  );
}

/**
 * ¿Es una `SpectatorView` válida (data-model.md › SpectatorView)? Nunca lanza.
 * @param {unknown} v
 * @returns {v is SpectatorView}
 */
export function isSpectatorView(v) {
  if (typeof v !== 'object' || v === null) return false;
  const q = /** @type {Record<string, unknown>} */ (v);
  if (typeof q.gameId !== 'string' || q.gameId === '') return false;
  if (q.status !== 'in-progress' && q.status !== 'finished') return false;
  if (!Array.isArray(q.drawn) || q.drawn.length > TOTAL_BALLS) return false;
  const seen = new Set();
  for (const b of q.drawn) {
    if (!isBall(b) || seen.has(b)) return false;
    seen.add(b);
  }
  if (!Array.isArray(q.prizes)) return false;
  for (const p of q.prizes) {
    if (!isSpectatorPrize(p) || p.awardedAtPosition > q.drawn.length) return false;
  }
  return true;
}

/**
 * Proyección de una partida a lo que ve un espectador. No modifica `game`.
 * @param {Game} game
 * @returns {SpectatorView}
 */
export function toSpectatorView(game) {
  return {
    gameId: game.id,
    status: game.status,
    drawn: [...game.drawn],
    prizes: game.prizes.map(({ type, completionPosition, awardedAtPosition }) => ({
      type,
      completionPosition,
      awardedAtPosition,
    })),
  };
}

/**
 * ¿`a` es prefijo de `b`?
 * @template T
 * @param {readonly T[]} a
 * @param {readonly T[]} b
 * @param {(x: T, y: T) => boolean} [eq]
 */
function isPrefix(a, b, eq = (x, y) => x === y) {
  return a.length <= b.length && a.every((x, i) => eq(x, b[i]));
}

/**
 * @param {{ type: string, completionPosition: number, awardedAtPosition: number }} p
 * @param {{ type: string, completionPosition: number, awardedAtPosition: number }} q
 */
const samePrize = (p, q) =>
  p.type === q.type &&
  p.completionPosition === q.completionPosition &&
  p.awardedAtPosition === q.awardedAtPosition;

/**
 * Deriva los cambios compartidos entre dos estados de la partida (research R2). Cualquier
 * combinación que no sea un único cambio conocido produce `snapshot` como salvaguarda.
 * Los cambios solo locales (modo, intervalo, pausa…) no producen nada.
 * @param {Game} prev
 * @param {Game} next
 * @returns {Change[]}
 */
export function diffGames(prev, next) {
  if (prev === next) return [];
  if (prev.id !== next.id) return [{ type: 'snapshot' }];
  const d0 = prev.drawn;
  const d1 = next.drawn;
  const p0 = prev.prizes;
  const p1 = next.prizes;
  const sameDrawn = d0.length === d1.length && isPrefix(d0, d1);
  const samePrizes = p0.length === p1.length && isPrefix(p0, p1, samePrize);

  if (prev.status !== next.status) {
    return prev.status === 'in-progress' && next.status === 'finished' && sameDrawn && samePrizes
      ? [{ type: 'end-game' }]
      : [{ type: 'snapshot' }];
  }
  if (sameDrawn && samePrizes) return [];
  if (samePrizes && d1.length === d0.length + 1 && isPrefix(d0, d1)) {
    return [{ type: 'ball', ball: d1[d1.length - 1] }];
  }
  if (samePrizes && d1.length === d0.length - 1 && isPrefix(d1, d0)) {
    return [{ type: 'undo', ball: d0[d0.length - 1] }];
  }
  if (sameDrawn && p1.length === p0.length + 1 && isPrefix(p0, p1, samePrize)) {
    const { type, completionPosition, awardedAtPosition } = p1[p1.length - 1];
    return [{ type: 'prize', prize: { type, completionPosition, awardedAtPosition } }];
  }
  return [{ type: 'snapshot' }];
}

/**
 * Aplica un cambio a una vista comprobando su coherencia (FR-022). Nunca lanza ni muta.
 * @param {SpectatorView} view
 * @param {Change} change
 * @returns {{ ok: true, view: SpectatorView } | { ok: false }}
 */
export function applyChange(view, change) {
  const n = view.drawn.length;
  switch (change?.type) {
    case 'ball':
      if (
        view.status !== 'in-progress' ||
        !isBall(change.ball) ||
        view.drawn.includes(change.ball) ||
        n >= TOTAL_BALLS
      ) {
        return { ok: false };
      }
      return { ok: true, view: { ...view, drawn: [...view.drawn, change.ball] } };
    case 'undo':
      if (
        n === 0 ||
        change.ball !== view.drawn[n - 1] ||
        view.prizes.some((p) => p.awardedAtPosition === n)
      ) {
        return { ok: false };
      }
      return { ok: true, view: { ...view, drawn: view.drawn.slice(0, -1) } };
    case 'prize': {
      const p = change.prize;
      if (!isSpectatorPrize(p) || p.awardedAtPosition !== n) return { ok: false };
      return { ok: true, view: { ...view, prizes: [...view.prizes, { ...p }] } };
    }
    case 'end-game':
      if (view.status !== 'in-progress') return { ok: false };
      return { ok: true, view: { ...view, status: 'finished' } };
    default:
      return { ok: false };
  }
}

/**
 * Igualdad estructural de dos vistas (`null` solo es igual a `null`).
 * @param {SpectatorView | null} a
 * @param {SpectatorView | null} b
 */
export function viewsEqual(a, b) {
  if (a === null || b === null) return a === b;
  if (a.gameId !== b.gameId || a.status !== b.status) return false;
  if (a.drawn.length !== b.drawn.length || a.prizes.length !== b.prizes.length) return false;
  if (a.drawn.some((x, i) => x !== b.drawn[i])) return false;
  return a.prizes.every((p, i) => {
    const q = b.prizes[i];
    return (
      p.type === q.type &&
      p.completionPosition === q.completionPosition &&
      p.awardedAtPosition === q.awardedAtPosition
    );
  });
}
