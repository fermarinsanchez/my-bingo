// @ts-check
import { ALIAS_MAX } from './constants.js';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

// Controles, formato (ancho cero, bidi), sustitutos sueltos, uso privado y no asignados.
const FORBIDDEN = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u;
const PICTO = /^\p{Extended_Pictographic}$/u;
const ZWJ = '\u200d';

/**
 * Quita los caracteres prohibidos, salvo el ZWJ que une dos pictogramas (emoji compuestos).
 * @param {string} s
 */
function stripForbidden(s) {
  const chars = [...s];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === ZWJ) {
      // Se conserva solo entre un pictograma (ignorando modificadores) y otro pictograma.
      const next = chars[i + 1];
      const lastBase = [...out].reverse().find((x) => !/[\p{Sk}\ufe0f]/u.test(x));
      if (next !== undefined && PICTO.test(next) && lastBase !== undefined && PICTO.test(lastBase)) {
        out += c;
      }
      continue;
    }
    if (!FORBIDDEN.test(c)) out += c;
  }
  return out;
}

/**
 * Sanea el alias de un participante (research R7). Nunca lanza.
 * @param {unknown} raw
 * @returns {{ ok: true, alias: string, key: string } | { ok: false }}
 */
export function sanitizeAlias(raw) {
  if (typeof raw !== 'string') return { ok: false };
  let s = raw.normalize('NFC');
  s = s.replace(/\s+/g, ' ');
  s = stripForbidden(s);
  s = s.replace(/[<>&"'`]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (s === '') return { ok: false };
  let count = 0;
  for (const _ of segmenter.segment(s)) {
    count++;
    if (count > ALIAS_MAX) return { ok: false };
  }
  return { ok: true, alias: s, key: s.normalize('NFKC').toLowerCase() };
}
