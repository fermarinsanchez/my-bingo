import { describe, it, expect } from 'vitest';
import { sanitizeAlias } from '../../../src/core/room/alias.js';

const alias = (raw) => {
  const r = sanitizeAlias(raw);
  return r.ok ? r.alias : null;
};

describe('sanitizeAlias', () => {
  it('rechaza lo que no es cadena', () => {
    for (const x of [undefined, null, 5, {}, [], true, Symbol.iterator]) {
      expect(sanitizeAlias(x)).toEqual({ ok: false });
    }
  });

  it('recorta y colapsa espacios', () => {
    expect(alias('  Lola   Pérez ')).toBe('Lola Pérez');
    expect(alias('Lola\t\nPérez')).toBe('Lola Pérez');
    expect(alias('a\u00a0\u00a0b')).toBe('a b');
  });

  it('elimina controles, ancho cero, marcas bidi, uso privado y no asignados', () => {
    expect(alias('Lo\u0000la')).toBe('Lola');
    expect(alias('Lo\u200bla')).toBe('Lola');
    expect(alias('\u202eLola')).toBe('Lola');
    expect(alias('Lo\u200dla')).toBe('Lola');
    expect(alias('Lo\u200cla')).toBe('Lola');
    expect(alias('Lo\ue000la')).toBe('Lola');
    expect(alias('Lo\u0378la')).toBe('Lola');
    expect(alias('Lo\ud800la')).toBe('Lola');
    expect(alias('a \u200b b')).toBe('a b');
  });

  it('un ZWJ aislado no sobrevive pero dentro de un emoji compuesto sí', () => {
    expect(alias('\u200d')).toBeNull();
    expect(alias('👩\u200d')).toBe('👩');
    expect(alias('\u200d👩')).toBe('👩');
    expect(alias('👩\u200d👩\u200d👧')).toBe('👩\u200d👩\u200d👧');
  });

  it('elimina < > & " \' y `', () => {
    expect(alias('<b>Ana</b>')).toBe('bAna/b');
    expect(alias(`A&B "C" 'D' \`E\``)).toBe('AB C D E');
  });

  it('vacío, solo espacios o solo caracteres eliminables son inválidos', () => {
    for (const x of ['', '   ', '\u0000\u200b', '<>&"\'`', ' \u202e ']) {
      expect(sanitizeAlias(x)).toEqual({ ok: false });
    }
  });

  it('límite de 20 grafemas', () => {
    expect(alias('a'.repeat(20))).toBe('a'.repeat(20));
    expect(sanitizeAlias('a'.repeat(21))).toEqual({ ok: false });
  });

  it('cuenta grafemas y no unidades UTF-16', () => {
    const family = '👩\u200d👩\u200d👧';
    expect(alias(family.repeat(20))).toBe(family.repeat(20));
    expect(sanitizeAlias(family.repeat(21))).toEqual({ ok: false });
    expect(alias('👍🏽'.repeat(20))).toBe('👍🏽'.repeat(20));
    expect(sanitizeAlias('👍🏽'.repeat(21))).toEqual({ ok: false });
  });

  it('aplica NFC', () => {
    expect(alias('Jose\u0301')).toBe('José');
    expect(alias('Jose\u0301')).toBe('Jos\u00e9');
  });

  it('conserva diacríticos gallegos', () => {
    expect(alias('Uxía Núñez')).toBe('Uxía Núñez');
    expect(alias('Antón Rañó')).toBe('Antón Rañó');
  });

  it('la clave de unicidad ignora mayúsculas y formas equivalentes', () => {
    const keys = ['LOLA', 'lola', 'Lola', 'ＬＯＬＡ', ' lola '].map((x) => {
      const r = sanitizeAlias(x);
      return r.ok ? r.key : null;
    });
    expect(new Set(keys)).toEqual(new Set(['lola']));
    const a = sanitizeAlias('José');
    const b = sanitizeAlias('Jose\u0301');
    expect(a.ok && b.ok && a.key === b.key).toBe(true);
    const c = sanitizeAlias('Lolo');
    expect(c.ok && a.ok && c.key !== a.key).toBe(true);
  });

  it('el alias devuelto conserva las mayúsculas originales', () => {
    expect(sanitizeAlias('LoLa')).toEqual({ ok: true, alias: 'LoLa', key: 'lola' });
  });
});
