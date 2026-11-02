import es from './es.js';
import gl from './gl.js';

/** @typedef {'es' | 'gl'} Lang */

const DICTS = { es, gl };
/** @type {Lang} */
let current = 'es';

/**
 * Idioma inicial: gallego si el primer idioma del dispositivo es gallego; si no, español
 * (FR-026).
 * @param {readonly string[] | undefined} navigatorLanguages
 * @returns {Lang}
 */
export function detectLang(navigatorLanguages) {
  const first = navigatorLanguages?.[0]?.toLowerCase() ?? '';
  return first.startsWith('gl') ? 'gl' : 'es';
}

/** @returns {Lang} */
export function getLang() {
  return current;
}

/** @param {Lang} lang */
export function setLang(lang) {
  current = lang === 'gl' ? 'gl' : 'es';
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}

/**
 * Traduce una clave con interpolación `{param}`. Cae a español y, si no existe, a la clave.
 * @param {string} key
 * @param {Record<string, string | number>} [params]
 */
export function t(key, params = {}) {
  const template = DICTS[current][key] ?? es[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}

/**
 * Rellena `[data-i18n]` (texto) y `[data-i18n-aria]` (aria-label) bajo `root`.
 * @param {ParentNode} root
 */
export function applyTranslations(root) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(/** @type {HTMLElement} */ (el).dataset.i18n ?? '');
  }
  for (const el of root.querySelectorAll('[data-i18n-aria]')) {
    el.setAttribute('aria-label', t(/** @type {HTMLElement} */ (el).dataset.i18nAria ?? ''));
  }
}
