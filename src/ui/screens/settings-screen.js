import { t } from '../../i18n/index.js';
import { h } from '../dom.js';

/** @typedef {import('../../core/storage.js').Preferences} Preferences */

/**
 * Crea un grupo de opciones (radio) accesible con filas grandes.
 * @param {string} name
 * @param {{ value: string, labelKey: string }[]} options
 * @param {(value: string) => void} onChange
 */
function radioGroup(name, options, onChange) {
  const legend = h('legend');
  const inputs = options.map((o) =>
    h('input', { type: 'radio', name, value: o.value, onchange: () => onChange(o.value) }),
  );
  const labels = options.map((o, i) =>
    h('label', { class: 'option-row' }, inputs[i], h('span', { dataset: { key: o.labelKey } })),
  );
  const el = h('fieldset', { class: 'option-group' }, legend, ...labels);
  return {
    el,
    /** @param {string} legendKey @param {string} value */
    update(legendKey, value) {
      legend.textContent = t(legendKey);
      for (const input of inputs) input.checked = input.value === value;
      for (const label of labels) {
        const span = /** @type {HTMLElement} */ (label.querySelector('span'));
        span.textContent = t(/** @type {string} */ (span.dataset.key));
      }
    },
  };
}

/**
 * Pantalla de Ajustes (contracts/ui-screens.md › Pantalla Ajustes).
 *
 * @param {HTMLElement} root
 * @param {{ getPrefs: () => Preferences, onChange: (patch: Partial<Preferences>) => void,
 *   onBack: () => void }} deps
 */
export function mountSettingsScreen(root, { getPrefs, onChange, onBack }) {
  const backBtn = h('button', { type: 'button', class: 'btn btn-icon', onclick: onBack }, '←');
  const title = h('h2', { id: 'settings-title' });

  const lang = radioGroup('lang', [
    { value: 'es', labelKey: 'settings.langEs' },
    { value: 'gl', labelKey: 'settings.langGl' },
  ], (value) => onChange({ lang: /** @type {'es' | 'gl'} */ (value) }));

  const theme = radioGroup('theme', [
    { value: 'system', labelKey: 'settings.themeSystem' },
    { value: 'light', labelKey: 'settings.themeLight' },
    { value: 'dark', labelKey: 'settings.themeDark' },
  ], (value) => onChange({ theme: /** @type {'system' | 'light' | 'dark'} */ (value) }));

  /** Hueco para controles añadidos por otras historias (intervalo del automático, US5). */
  const extra = h('div', { class: 'settings-extra' });

  const version = h('p', { class: 'settings-info' });
  const offline = h('p', { class: 'settings-info' });

  root.replaceChildren(
    h('header', { class: 'topbar' }, backBtn, title),
    h('main', { class: 'content settings-content' }, lang.el, theme.el, extra, version, offline),
  );

  function render() {
    const prefs = getPrefs();
    title.textContent = t('settings.title');
    backBtn.setAttribute('aria-label', t('common.back'));
    lang.update('settings.language', prefs.lang);
    theme.update('settings.theme', prefs.theme);
    version.textContent = t('settings.version', { v: __APP_VERSION__ });
    offline.textContent = t('settings.offlinePending');
    // Lista para offline = hay un service worker activo con la app precacheada.
    navigator.serviceWorker
      ?.getRegistration()
      .then((reg) => {
        if (reg?.active) offline.textContent = t('settings.offlineReady');
      })
      .catch(() => {});
  }

  render();
  return { render, extra };
}
