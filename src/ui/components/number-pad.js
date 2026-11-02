import { validateEntry } from '../../core/checker.js';
import { t } from '../../i18n/index.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';

const MAX_DIGITS = 2;
const ERROR_KEYS = {
  'out-of-range': 'check.errorOutOfRange',
  'not-integer': 'check.errorOutOfRange',
  duplicate: 'check.errorDuplicate',
};

/**
 * Teclado numérico propio (research R10): no tapa la lista como el teclado del sistema y se
 * comporta igual en Android e iOS. Valida al añadir (FR-017).
 *
 * @param {{ getNumbers: () => number[], onAdd: (n: number) => void }} deps
 */
export function createNumberPad({ getNumbers, onAdd }) {
  let digits = '';

  const display = h('output', { class: 'pad__display', 'aria-live': 'polite' });
  const error = h('p', { class: 'pad__error', role: 'alert' });
  const keys = h('div', { class: 'pad__keys' });

  /** @param {string} label @param {() => void} fn @param {string} [cls] */
  const key = (label, fn, cls = '') =>
    h('button', { type: 'button', class: `btn pad__key ${cls}`, onclick: fn }, label);

  for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
    keys.append(key(d, () => press(d)));
  }
  const backspace = key('', () => {
    digits = digits.slice(0, -1);
    error.textContent = '';
    paint();
  });
  backspace.append(icon('backspace', { size: 28 }));
  const zero = key('0', () => press('0'));
  const addBtn = key('', add, 'btn-primary pad__add');
  keys.append(backspace, zero, addBtn);

  const el = h('div', { class: 'pad' }, h('div', { class: 'pad__row' }, display), error, keys);

  /** @param {string} d */
  function press(d) {
    if (digits.length >= MAX_DIGITS) return;
    if (digits === '' && d === '0') return;
    digits += d;
    error.textContent = '';
    paint();
  }

  function add() {
    if (digits === '') return;
    const value = Number(digits);
    const result = validateEntry(getNumbers(), value);
    if (!result.ok) {
      error.textContent = t(ERROR_KEYS[result.reason], { n: value });
      return;
    }
    digits = '';
    error.textContent = '';
    paint();
    onAdd(value);
  }

  function paint() {
    display.textContent = digits || '—';
    addBtn.disabled = digits === '';
  }

  function render() {
    addBtn.textContent = t('check.add');
    backspace.setAttribute('aria-label', t('check.delete'));
    paint();
  }

  render();
  return {
    el,
    render,
    reset() {
      digits = '';
      error.textContent = '';
      paint();
    },
  };
}
