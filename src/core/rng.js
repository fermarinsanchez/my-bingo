// @ts-check

const RANGE = 2 ** 32;

/**
 * Entero uniforme en [0, n) usando crypto.getRandomValues con muestreo por rechazo,
 * para evitar el sesgo del módulo (constitución, principio III; research R2).
 *
 * @param {number} n
 * @returns {number}
 */
export function randomInt(n) {
  if (!Number.isInteger(n) || n < 1 || n > RANGE) {
    throw new RangeError(`randomInt: n debe ser un entero en 1..2^32 (recibido ${n})`);
  }
  const limit = RANGE - (RANGE % n);
  const buf = new Uint32Array(1);
  let x;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % n;
}
