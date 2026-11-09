// PRNG con semilla solo para tests (el sorteo real usa crypto.getRandomValues).

/**
 * mulberry32: devuelve una función que produce floats en [0, 1).
 * @param {number} seed
 * @returns {() => number}
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {() => number} rnd
 */
export function helpers(rnd) {
  return {
    /** true con probabilidad p. */
    chance: (/** @type {number} */ p) => rnd() < p,
    /** entero uniforme en [0, n). */
    int: (/** @type {number} */ n) => Math.floor(rnd() * n),
    rnd,
  };
}

/**
 * Atajo: PRNG + helpers desde una semilla.
 * @param {number} seed
 */
export function createRng(seed) {
  return helpers(mulberry32(seed));
}
