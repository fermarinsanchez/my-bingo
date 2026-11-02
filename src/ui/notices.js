import { t } from '../i18n/index.js';

const AUTO_DISMISS_MS = 6000;

/** Avisos "una vez": en memoria por defecto; `configureNotices` permite persistirlos. */
let store = {
  shown: new Set(),
  /** @param {string} key */
  isShown(key) {
    return this.shown.has(key);
  },
  /** @param {string} key */
  markShown(key) {
    this.shown.add(key);
  },
};

/**
 * @param {{ isShown: (key: string) => boolean, markShown: (key: string) => void }} impl
 */
export function configureNotices(impl) {
  store = { ...store, ...impl };
}

/**
 * Muestra un aviso no bloqueante en #notices.
 *
 * @param {string} key Clave i18n del texto.
 * @param {{ once?: string, params?: Record<string, string | number>, persistent?: boolean,
 *   action?: { labelKey: string, onClick: () => void } }} [opts]
 *   `once`: identificador para mostrarlo solo una vez. `persistent`: no se cierra solo.
 * @returns {HTMLElement | null}
 */
export function showNotice(key, { once, params, persistent = false, action } = {}) {
  if (once) {
    if (store.isShown(once)) return null;
    store.markShown(once);
  }
  const region = document.getElementById('notices');
  if (!region) return null;

  const el = document.createElement('div');
  el.className = 'notice';
  const text = document.createElement('p');
  text.textContent = t(key, params);
  el.append(text);

  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.textContent = t(action.labelKey);
    btn.addEventListener('click', () => {
      el.remove();
      action.onClick();
    });
    el.append(btn);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn btn-icon';
  close.setAttribute('aria-label', t('common.close'));
  close.textContent = '✕';
  close.addEventListener('click', () => el.remove());
  el.append(close);

  region.append(el);
  if (!persistent && !action) setTimeout(() => el.remove(), AUTO_DISMISS_MS);
  return el;
}
