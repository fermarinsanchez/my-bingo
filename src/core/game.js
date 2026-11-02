// @ts-check
import { GameError } from './errors.js';
import { randomInt as rngRandomInt } from './rng.js';

export const TOTAL_BALLS = 90;
export const INTERVAL_MIN = 3;
export const INTERVAL_MAX = 30;
export const INTERVAL_DEFAULT = 5;

/**
 * Premio concedido (data-model.md › Prize).
 * @typedef {object} Prize
 * @property {'line' | 'bingo'} type
 * @property {number[]} numbers 5 (línea) o 15 (bingo) números únicos 1-90, todos en `drawn`.
 * @property {number} completionPosition Máxima posición en `drawn` de cualquiera de `numbers`.
 * @property {number} awardedAtPosition `drawn.length` al concederlo; ≥ completionPosition.
 */

/**
 * Partida (data-model.md › Game). Inmutable: las funciones devuelven objetos nuevos.
 * @typedef {object} Game
 * @property {string} id
 * @property {string} startedAt ISO 8601
 * @property {'in-progress' | 'finished'} status
 * @property {number[]} drawn Bolas salidas en orden; enteros 1-90 sin duplicados.
 * @property {'manual' | 'auto'} mode
 * @property {number} intervalSec Entero 3-30.
 * @property {boolean} autoPaused
 * @property {boolean} undoLocked
 * @property {Prize[]} prizes
 */

/**
 * @param {{ now?: Date, id?: string }} [opts]
 * @returns {Game}
 */
export function createGame({ now = new Date(), id = crypto.randomUUID() } = {}) {
  return {
    id,
    startedAt: now.toISOString(),
    status: 'in-progress',
    drawn: [],
    mode: 'manual',
    intervalSec: INTERVAL_DEFAULT,
    autoPaused: true,
    undoLocked: false,
    prizes: [],
  };
}

/**
 * Bolas pendientes en orden ascendente.
 * @param {Game} game
 * @returns {number[]}
 */
export function getPending(game) {
  const drawn = new Set(game.drawn);
  const pending = [];
  for (let n = 1; n <= TOTAL_BALLS; n++) if (!drawn.has(n)) pending.push(n);
  return pending;
}

/**
 * Últimas `k` bolas, de la más reciente a la más antigua.
 * @param {Game} game
 * @param {number} k
 * @returns {number[]}
 */
export function getLastBalls(game, k) {
  return game.drawn.slice(-k).reverse();
}

/** @param {Game} game */
export function canDraw(game) {
  return game.status === 'in-progress' && game.drawn.length < TOTAL_BALLS;
}

/**
 * Saca una bola pendiente al azar.
 * @param {Game} game
 * @param {(n: number) => number} [randomInt]
 * @returns {{ game: Game, ball: number }}
 */
export function drawBall(game, randomInt = rngRandomInt) {
  if (game.status === 'finished') throw new GameError('game-finished');
  const pending = getPending(game);
  if (pending.length === 0) throw new GameError('no-balls-left');
  const ball = pending[randomInt(pending.length)];
  return {
    game: { ...game, drawn: [...game.drawn, ball], undoLocked: false },
    ball,
  };
}

/**
 * @param {Game} game
 * @returns {Game}
 */
export function finishGame(game) {
  return { ...game, status: 'finished', autoPaused: true };
}
