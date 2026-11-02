import { t } from '../i18n/index.js';
import { icon } from './icons.js';

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
 * Coloca los avisos justo encima de la barra de acciones de la vista visible.
 * @param {HTMLElement} region
 */
function placeAboveActionbar(region) {
  const bar = document.querySelector('.view:not([hidden]) .actionbar:not([hidden])');
  const offset = bar ? bar.getBoundingClientRect().height + 8 : null;
  if (offset) region.style.setProperty('--notices-bottom', `${offset}px`);
  else region.style.removeProperty('--notices-bottom');
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
  text.dataset.noticeKey = key;
  text.dataset.noticeParams = JSON.stringify(params ?? {});
  text.textContent = t(key, params);
  el.append(text);

  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.dataset.noticeKey = action.labelKey;
    btn.dataset.noticeParams = '{}';
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
  close.append(icon('close'));
  close.addEventListener('click', () => el.remove());
  el.append(close);

  placeAboveActionbar(region);
  region.append(el);
  if (!persistent && !action) setTimeout(() => el.remove(), AUTO_DISMISS_MS);
  return el;
}

/** Vuelve a traducir los avisos visibles (al cambiar de idioma). */
export function retranslateNotices() {
  for (const el of document.querySelectorAll('#notices [data-notice-key]')) {
    const node = /** @type {HTMLElement} */ (el);
    node.textContent = t(/** @type {string} */ (node.dataset.noticeKey), JSON.parse(node.dataset.noticeParams ?? '{}'));
  }
  for (const btn of document.querySelectorAll('#notices .btn-icon')) {
    btn.setAttribute('aria-label', t('common.close'));
  }
}
