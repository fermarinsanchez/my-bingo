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

/**
 * UUID v4. `crypto.randomUUID` solo existe en contexto seguro (HTTPS o localhost);
 * en `http://192.168.x.x` se genera con `getRandomValues` (Principio III).
 * @returns {string}
 */
export function randomUUID() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
