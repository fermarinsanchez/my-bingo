import { describe, it, expect } from 'vitest';
import { randomInt, randomUUID } from '../../src/core/rng.js';

describe('randomInt', () => {
  it.each([1, 2, 90])('devuelve enteros en [0, %i)', (n) => {
    for (let i = 0; i < 2000; i++) {
      const v = randomInt(n);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(n);
    }
  });

  it('con n = 1 siempre devuelve 0', () => {
    expect(randomInt(1)).toBe(0);
  });

  it.each([0, -1, 1.5, 2 ** 32 + 1, Number.NaN])('lanza RangeError para n = %s', (n) => {
    expect(() => randomInt(n)).toThrow(RangeError);
  });

  it('genera un UUID v4 y no depende de crypto.randomUUID', () => {
    const orig = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const id = randomUUID();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(randomUUID()).not.toBe(id);
    } finally {
      if (orig) Object.defineProperty(crypto, 'randomUUID', orig);
      else delete crypto.randomUUID;
    }
  });

  it('es uniforme: 90 000 muestras de randomInt(90) quedan a ±15 % de 1000 por valor', () => {
    const counts = new Array(90).fill(0);
    for (let i = 0; i < 90_000; i++) counts[randomInt(90)]++;
    for (const c of counts) {
      expect(c).toBeGreaterThan(850);
      expect(c).toBeLessThan(1150);
    }
  });
});
