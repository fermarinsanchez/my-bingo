// @ts-check
import { GameError } from './errors.js';
import { hasLine, TOTAL_BALLS } from './game.js';

/** @typedef {import('./game.js').Game} Game */
/** @typedef {'line' | 'bingo'} CheckType */

/**
 * Resultado de una comprobación (data-model.md › CheckResult).
 * @typedef {object} CheckResult
 * @property {boolean} valid Todos los números han salido.
 * @property {number[]} missing Números no salidos, en orden ascendente.
 * @property {number | null} completionNumber Número del cartón que salió en último lugar.
 * @property {number | null} completionPosition Posición (1-based) de ese número.
 * @property {number} ballsSince Bolas salidas después de completarse (0 si no es válido).
 */

/** Números necesarios por tipo (5 por línea, 15 por bingo). */
export const REQUIRED = Object.freeze({ line: 5, bingo: 15 });

/**
 * Valida un número introducido por teclado (FR-017).
 * @param {number[]} numbers Ya introducidos.
 * @param {number} value
 * @returns {{ ok: true } | { ok: false, reason: 'out-of-range' | 'duplicate' | 'not-integer' }}
 */
export function validateEntry(numbers, value) {
  if (!Number.isInteger(value)) return { ok: false, reason: 'not-integer' };
  if (value < 1 || value > TOTAL_BALLS) return { ok: false, reason: 'out-of-range' };
  if (numbers.includes(value)) return { ok: false, reason: 'duplicate' };
  return { ok: true };
}

/**
 * Cuadrícula: añade el número si no está y lo quita si está.
 * @param {number[]} numbers
 * @param {number} value
 * @returns {number[]}
 */
export function toggleNumber(numbers, value) {
  return numbers.includes(value) ? numbers.filter((n) => n !== value) : [...numbers, value];
}

/**
 * Estado del recuento para habilitar "Comprobar" (FR-018).
 * @param {CheckType} type
 * @param {number[]} numbers
 */
export function countStatus(type, numbers) {
  const required = REQUIRED[type];
  const current = numbers.length;
  return {
    required,
    current,
    missing: Math.max(0, required - current),
    extra: Math.max(0, current - required),
    canSubmit: current === required,
  };
}

/**
 * Comprueba una línea o un bingo contra las bolas salidas (FR-019, FR-019a). No modifica nada
 * (FR-022).
 * @param {readonly number[]} drawn
 * @param {CheckType} type
 * @param {readonly number[]} numbers
 * @returns {CheckResult}
 */
export function checkClaim(drawn, type, numbers) {
  if (numbers.length !== REQUIRED[type]) throw new GameError('wrong-count');
  /** @type {Map<number, number>} número → posición 1-based */
  const position = new Map(drawn.map((n, i) => [n, i + 1]));
  const missing = numbers.filter((n) => !position.has(n)).sort((a, b) => a - b);
  if (missing.length > 0) {
    return { valid: false, missing, completionNumber: null, completionPosition: null, ballsSince: 0 };
  }
  let completionNumber = numbers[0];
  let completionPosition = 0;
  for (const n of numbers) {
    const p = /** @type {number} */ (position.get(n));
    if (p > completionPosition) {
      completionPosition = p;
      completionNumber = n;
    }
  }
  return {
    valid: true,
    missing: [],
    completionNumber,
    completionPosition,
    ballsSince: drawn.length - completionPosition,
  };
}

/**
 * Tipo propuesto al abrir la comprobación: bingo si ya hay una línea concedida (FR-021b).
 * @param {Game} game
 * @returns {CheckType}
 */
export function defaultCheckType(game) {
  return hasLine(game) ? 'bingo' : 'line';
}
