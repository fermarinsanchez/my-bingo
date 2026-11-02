import { describe, it, expect } from 'vitest';
import {
  REQUIRED,
  validateEntry,
  toggleNumber,
  countStatus,
  checkClaim,
  defaultCheckType,
} from '../../src/core/checker.js';
import { createGame } from '../../src/core/game.js';

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe('REQUIRED', () => {
  it('línea = 5, bingo = 15', () => {
    expect(REQUIRED).toEqual({ line: 5, bingo: 15 });
  });
});

describe('validateEntry (FR-017)', () => {
  it('acepta 1 y 90', () => {
    expect(validateEntry([], 1)).toEqual({ ok: true });
    expect(validateEntry([], 90)).toEqual({ ok: true });
  });

  it('rechaza fuera de rango, no enteros y duplicados', () => {
    expect(validateEntry([], 0)).toEqual({ ok: false, reason: 'out-of-range' });
    expect(validateEntry([], 91)).toEqual({ ok: false, reason: 'out-of-range' });
    expect(validateEntry([], 1.5)).toEqual({ ok: false, reason: 'not-integer' });
    expect(validateEntry([], Number.NaN)).toEqual({ ok: false, reason: 'not-integer' });
    expect(validateEntry([4, 7], 7)).toEqual({ ok: false, reason: 'duplicate' });
  });
});

describe('toggleNumber', () => {
  it('añade si no está y quita si está, sin modificar el original', () => {
    const base = [4, 7];
    expect(toggleNumber(base, 9)).toEqual([4, 7, 9]);
    expect(toggleNumber(base, 7)).toEqual([4]);
    expect(base).toEqual([4, 7]);
  });
});

describe('countStatus (FR-018)', () => {
  it('3 de 5 → faltan 2', () => {
    expect(countStatus('line', [1, 2, 3])).toEqual({ required: 5, current: 3, missing: 2, extra: 0, canSubmit: false });
  });
  it('5 de 5 → se puede comprobar', () => {
    expect(countStatus('line', range(1, 5))).toEqual({ required: 5, current: 5, missing: 0, extra: 0, canSubmit: true });
  });
  it('16 de 15 → sobra 1', () => {
    expect(countStatus('bingo', range(1, 16))).toEqual({ required: 15, current: 16, missing: 0, extra: 1, canSubmit: false });
  });
  it('al cambiar de línea a bingo con 5 números faltan 10', () => {
    expect(countStatus('bingo', range(1, 5)).missing).toBe(10);
  });
});

describe('checkClaim (FR-019, FR-019a, FR-022)', () => {
  const drawn = [40, 3, 18, 25, 61, 77, 23, 50, 8, 66];

  it('cantidad incorrecta → wrong-count', () => {
    expect(() => checkClaim(drawn, 'line', [3, 18, 25])).toThrow(expect.objectContaining({ code: 'wrong-count' }));
    expect(() => checkClaim(drawn, 'bingo', [3, 18, 25, 61, 77])).toThrow(expect.objectContaining({ code: 'wrong-count' }));
  });

  it('todos salidos → válido', () => {
    const r = checkClaim(drawn, 'line', [3, 18, 25, 61, 77]);
    expect(r.valid).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('uno sin salir → no válido y lo señala; missing en orden ascendente', () => {
    expect(checkClaim(drawn, 'line', [3, 18, 25, 62, 77])).toEqual({
      valid: false,
      missing: [62],
      completionNumber: null,
      completionPosition: null,
      ballsSince: 0,
    });
    expect(checkClaim(drawn, 'line', [90, 3, 1, 25, 77]).missing).toEqual([1, 90]);
  });

  it('completado con el 23 hace 3 bolas', () => {
    const r = checkClaim(drawn, 'line', [3, 18, 25, 23, 61]);
    expect(r).toEqual({ valid: true, missing: [], completionNumber: 23, completionPosition: 7, ballsSince: 3 });
  });

  it('completado con la última bola → ballsSince 0', () => {
    const r = checkClaim(drawn, 'line', [66, 3, 18, 25, 61]);
    expect(r.completionNumber).toBe(66);
    expect(r.completionPosition).toBe(10);
    expect(r.ballsSince).toBe(0);
  });

  it('comprueba un bingo de 15', () => {
    const all = range(1, 15);
    const ok = checkClaim([...all, 30], 'bingo', all);
    expect(ok.valid).toBe(true);
    expect(ok.ballsSince).toBe(1);
  });

  it('no modifica drawn ni los números', () => {
    const d = [...drawn];
    const nums = [77, 3, 18, 25, 61];
    checkClaim(d, 'line', nums);
    expect(d).toEqual(drawn);
    expect(nums).toEqual([77, 3, 18, 25, 61]);
  });
});

describe('defaultCheckType (FR-021b)', () => {
  it('línea si no hay premios de línea; bingo si ya hay una línea', () => {
    const g = createGame();
    expect(defaultCheckType(g)).toBe('line');
    const withLine = { ...g, drawn: range(1, 5), prizes: [{ type: 'line', numbers: range(1, 5), completionPosition: 5, awardedAtPosition: 5 }] };
    expect(defaultCheckType(withLine)).toBe('bingo');
  });
});
