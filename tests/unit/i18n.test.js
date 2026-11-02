import { describe, it, expect } from 'vitest';
import es from '../../src/i18n/es.js';
import gl from '../../src/i18n/gl.js';
import { detectLang, t, setLang } from '../../src/i18n/index.js';

const params = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('diccionarios es/gl', () => {
  it('tienen exactamente las mismas claves', () => {
    expect(Object.keys(gl).sort()).toEqual(Object.keys(es).sort());
  });

  it('no tienen textos vacíos', () => {
    for (const [lang, dict] of [['es', es], ['gl', gl]]) {
      for (const [key, value] of Object.entries(dict)) {
        expect(typeof value, `${lang}:${key}`).toBe('string');
        expect(value.trim().length, `${lang}:${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('usan los mismos {parámetros} en ambos idiomas', () => {
    for (const key of Object.keys(es)) {
      expect(params(gl[key] ?? ''), key).toEqual(params(es[key]));
    }
  });
});

describe('runtime i18n', () => {
  it('detectLang elige gl solo si el primer idioma es gallego', () => {
    expect(detectLang(['gl-ES', 'es'])).toBe('gl');
    expect(detectLang(['gl'])).toBe('gl');
    expect(detectLang(['es-ES', 'gl'])).toBe('es');
    expect(detectLang(['en-US'])).toBe('es');
    expect(detectLang([])).toBe('es');
    expect(detectLang(undefined)).toBe('es');
  });

  it('t interpola parámetros y cae a la clave si no existe', () => {
    setLang('es');
    expect(t('game.counter', { drawn: 3, pending: 87 })).toBe('Bolas: 3 / 90 · Quedan 87');
    setLang('gl');
    expect(t('game.counter', { drawn: 3, pending: 87 })).toBe('Bólas: 3 / 90 · Quedan 87');
    expect(t('no.existe')).toBe('no.existe');
    setLang('es');
  });
});
