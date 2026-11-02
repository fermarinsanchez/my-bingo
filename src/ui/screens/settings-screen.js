import { INTERVAL_DEFAULT, INTERVAL_MAX, INTERVAL_MIN } from '../../core/game.js';
import { t } from '../../i18n/index.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';

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
 *   onBack: () => void, getIntervalSec?: () => number,
 *   onIntervalChange?: (sec: number) => void }} deps
 */
export function mountSettingsScreen(root, { getPrefs, onChange, onBack, getIntervalSec, onIntervalChange }) {
  const backBtn = h('button', { type: 'button', class: 'btn btn-icon', onclick: onBack }, icon('back'));
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

  /** Hueco para controles añadidos por otras historias. */
  const extra = h('div', { class: 'settings-extra' });

  // Intervalo del sorteo automático: 3-30 s, por defecto 5 (FR-007).
  const intervalLabel = h('label', { for: 'interval-input', class: 'interval__label' });
  const intervalValue = h('output', { for: 'interval-input', class: 'interval__value' });
  const intervalInput = h('input', {
    id: 'interval-input',
    type: 'range',
    min: INTERVAL_MIN,
    max: INTERVAL_MAX,
    step: 1,
    value: INTERVAL_DEFAULT,
    oninput: () => {
      const sec = Number(intervalInput.value);
      intervalValue.textContent = t('auto.interval', { s: sec });
      onIntervalChange?.(sec);
    },
  });
  const interval = h('div', { class: 'interval' },
    h('div', { class: 'interval__head' }, intervalLabel, intervalValue), intervalInput);
  interval.hidden = !onIntervalChange;
  extra.append(interval);

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
    const sec = getIntervalSec?.() ?? INTERVAL_DEFAULT;
    intervalLabel.textContent = t('settings.interval');
    intervalInput.value = String(sec);
    intervalValue.textContent = t('auto.interval', { s: sec });
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
