import { describe, it, expect } from 'vitest';
import {
  GAME_SCHEMA_VERSION,
  PREFS_SCHEMA_VERSION,
  serializeGame,
  parseGame,
  serializePrefs,
  parsePrefs,
  migrate,
} from '../../src/core/storage.js';

/** Partida válida de referencia (contracts/storage-schema.md). */
function sampleGame(overrides = {}) {
  return {
    id: '3f1c',
    startedAt: '2026-11-02T18:30:00.000Z',
    status: 'in-progress',
    drawn: [3, 18, 25, 61, 77, 12],
    mode: 'auto',
    intervalSec: 5,
    autoPaused: false,
    undoLocked: false,
    prizes: [
      { type: 'line', numbers: [3, 18, 25, 61, 77], completionPosition: 5, awardedAtPosition: 6 },
    ],
    ...overrides,
  };
}

/** JSON crudo con un campo cambiado. */
const raw = (overrides) => JSON.stringify({ schemaVersion: GAME_SCHEMA_VERSION, ...sampleGame(overrides) });

describe('serializeGame / parseGame', () => {
  it('versiones de esquema = 1', () => {
    expect(GAME_SCHEMA_VERSION).toBe(1);
    expect(PREFS_SCHEMA_VERSION).toBe(1);
  });

  it('ida y vuelta conserva la partida, premios incluidos', () => {
    const game = sampleGame();
    const json = serializeGame(game);
    expect(JSON.parse(json).schemaVersion).toBe(1);
    expect(parseGame(json)).toEqual({ ok: true, game });
  });

  it('acepta una partida vacía y una terminada', () => {
    expect(parseGame(raw({ drawn: [], prizes: [] })).ok).toBe(true);
    expect(parseGame(raw({ status: 'finished' })).ok).toBe(true);
  });

  it('null o cadena vacía → empty', () => {
    expect(parseGame(null)).toEqual({ ok: false, reason: 'empty' });
    expect(parseGame('')).toEqual({ ok: false, reason: 'empty' });
  });

  it('JSON inválido → corrupt', () => {
    expect(parseGame('{no es json')).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseGame('42')).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseGame('null')).toEqual({ ok: false, reason: 'corrupt' });
  });

  it('schemaVersion mayor que la soportada → unsupported-version', () => {
    const json = JSON.stringify({ ...sampleGame(), schemaVersion: GAME_SCHEMA_VERSION + 1 });
    expect(parseGame(json)).toEqual({ ok: false, reason: 'unsupported-version' });
  });

  it.each([
    ['schemaVersion ausente', { schemaVersion: undefined }],
    ['schemaVersion no entero', { schemaVersion: 1.5 }],
    ['id no es texto', { id: 5 }],
    ['startedAt no es texto', { startedAt: null }],
    ['número fuera de 1-90 (0)', { drawn: [0, 5] }],
    ['número fuera de 1-90 (91)', { drawn: [91] }],
    ['número no entero', { drawn: [4.5] }],
    ['duplicado en drawn', { drawn: [5, 5], prizes: [] }],
    ['drawn con más de 90', { drawn: Array.from({ length: 91 }, (_, i) => (i % 90) + 1), prizes: [] }],
    ['drawn no es array', { drawn: '1,2' }],
    ['intervalSec < 3', { intervalSec: 2 }],
    ['intervalSec > 30', { intervalSec: 31 }],
    ['intervalSec no entero', { intervalSec: 4.5 }],
    ['status desconocido', { status: 'paused' }],
    ['mode desconocido', { mode: 'turbo' }],
    ['autoPaused no booleano', { autoPaused: 'no' }],
    ['undoLocked no booleano', { undoLocked: 1 }],
    ['prizes no es array', { prizes: {} }],
    ['premio con tipo desconocido', { prizes: [{ type: 'full', numbers: [3, 18, 25, 61, 77], completionPosition: 5, awardedAtPosition: 6 }] }],
    ['línea con 4 números', { prizes: [{ type: 'line', numbers: [3, 18, 25, 61], completionPosition: 4, awardedAtPosition: 6 }] }],
    ['bingo con 5 números', { prizes: [{ type: 'bingo', numbers: [3, 18, 25, 61, 77], completionPosition: 5, awardedAtPosition: 6 }] }],
    ['premio con número repetido', { prizes: [{ type: 'line', numbers: [3, 3, 25, 61, 77], completionPosition: 5, awardedAtPosition: 6 }] }],
    ['número de premio no salido', { prizes: [{ type: 'line', numbers: [3, 18, 25, 61, 90], completionPosition: 5, awardedAtPosition: 6 }] }],
    ['completionPosition < 1', { prizes: [{ type: 'line', numbers: [3, 18, 25, 61, 77], completionPosition: 0, awardedAtPosition: 6 }] }],
    ['completionPosition > awardedAtPosition', { prizes: [{ type: 'line', numbers: [3, 18, 25, 61, 77], completionPosition: 6, awardedAtPosition: 5 }] }],
    ['awardedAtPosition > drawn.length', { prizes: [{ type: 'line', numbers: [3, 18, 25, 61, 77], completionPosition: 5, awardedAtPosition: 7 }] }],
    ['posición no entera', { prizes: [{ type: 'line', numbers: [3, 18, 25, 61, 77], completionPosition: 5.5, awardedAtPosition: 6 }] }],
    ['premio nulo', { prizes: [null] }],
  ])('%s → corrupt', (_label, overrides) => {
    expect(parseGame(raw(overrides))).toEqual({ ok: false, reason: 'corrupt' });
  });

  it('nunca lanza, ni con entradas extrañas', () => {
    for (const input of [undefined, '[]', '{}', '"texto"', 'true', JSON.stringify({ schemaVersion: 1 })]) {
      expect(() => parseGame(/** @type {any} */ (input))).not.toThrow();
    }
  });
});

describe('serializePrefs / parsePrefs', () => {
  it('ida y vuelta conserva las preferencias', () => {
    const prefs = { lang: 'gl', theme: 'dark', inputMethod: 'keypad', wakeLockNoticeShown: true };
    expect(parsePrefs(serializePrefs(prefs), 'es')).toEqual(prefs);
    expect(JSON.parse(serializePrefs(prefs)).schemaVersion).toBe(1);
  });

  it('usa valores por defecto si no hay datos o son inválidos', () => {
    const defaults = { lang: 'gl', theme: 'system', inputMethod: 'grid', wakeLockNoticeShown: false };
    expect(parsePrefs(null, 'gl')).toEqual(defaults);
    expect(parsePrefs('{roto', 'gl')).toEqual(defaults);
    expect(parsePrefs('"x"', 'gl')).toEqual(defaults);
  });

  it('sustituye solo los campos inválidos', () => {
    const json = JSON.stringify({ schemaVersion: 1, lang: 'fr', theme: 'light', inputMethod: 'mouse', wakeLockNoticeShown: 'sí' });
    expect(parsePrefs(json, 'es')).toEqual({ lang: 'es', theme: 'light', inputMethod: 'grid', wakeLockNoticeShown: false });
  });
});

describe('migrate', () => {
  it('v1 → v1 es la identidad', () => {
    const data = { schemaVersion: 1, ...sampleGame() };
    expect(migrate(data)).toEqual(data);
  });
});
