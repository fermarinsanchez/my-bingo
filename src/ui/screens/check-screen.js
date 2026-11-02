import { checkClaim, countStatus, defaultCheckType, toggleNumber } from '../../core/checker.js';
import { t } from '../../i18n/index.js';
import { renderBoard } from '../components/board.js';
import { createNumberPad } from '../components/number-pad.js';
import { DIALOG_OPEN_EVENT } from '../dialog.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';

/** @typedef {import('../../core/game.js').Game} Game */
/** @typedef {import('../../core/checker.js').CheckResult} CheckResult */
/** @typedef {'line' | 'bingo'} CheckType */

/**
 * Pantalla de comprobación de línea/bingo (contracts/ui-screens.md › Pantalla Comprobación).
 * Nunca modifica la partida salvo al conceder un premio (FR-022).
 *
 * @param {HTMLElement} root
 * @param {{
 *   getGame: () => Game,
 *   getInputMethod: () => 'grid' | 'keypad',
 *   onInputMethodChange: (m: 'grid' | 'keypad') => void,
 *   onAward: (check: { type: CheckType, numbers: number[] }, result: CheckResult) => void,
 *   onFinish: () => void,
 *   onBack: () => void,
 * }} deps
 */
export function mountCheckScreen(root, deps) {
  /** @type {{ type: CheckType, numbers: number[], inputMethod: 'grid' | 'keypad', missing: Set<number> }} */
  let check = { type: 'line', numbers: [], inputMethod: deps.getInputMethod(), missing: new Set() };
  /** @type {CheckResult | null} */
  let result = null;
  let awardedBingo = false;

  // --- Cabecera ---
  const backBtn = h('button', { type: 'button', class: 'btn btn-icon', onclick: deps.onBack }, icon('back'));
  const title = h('h2', { id: 'check-title' });

  // --- Tipo: línea / bingo ---
  const lineBtn = h('button', { type: 'button', class: 'segment', onclick: () => setType('line') });
  const bingoBtn = h('button', { type: 'button', class: 'segment', onclick: () => setType('bingo') });
  const typeGroup = h('div', { class: 'segmented', role: 'group' }, lineBtn, bingoBtn);

  // --- Recuento y números introducidos ---
  const counter = h('p', { class: 'check-counter', 'aria-live': 'polite' });
  const chips = h('ul', { class: 'check-chips' });
  const chipsEmpty = h('p', { class: 'check-empty' });

  // --- Método de entrada ---
  const gridBtn = h('button', { type: 'button', class: 'segment', onclick: () => setInputMethod('grid') });
  const padBtn = h('button', { type: 'button', class: 'segment', onclick: () => setInputMethod('keypad') });
  const inputGroup = h('div', { class: 'segmented segmented--small', role: 'group' }, gridBtn, padBtn);
  const gridEl = h('div', { class: 'check-grid' });
  const pad = createNumberPad({
    getNumbers: () => check.numbers,
    onAdd: (n) => setNumbers([...check.numbers, n]),
  });

  // --- Acciones ---
  const submitBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: submit });
  const backToGameBtn = h('button', { type: 'button', class: 'btn btn-block', onclick: deps.onBack });

  // --- Resultado (diálogo) ---
  const resultTitle = h('h2', { id: 'result-title' });
  const resultBody = h('div', { class: 'result-body' });
  const resultActions = h('div', { class: 'dialog-actions result-actions' });
  const resultDialog = h('dialog', { class: 'result-dialog', 'aria-labelledby': 'result-title' },
    resultTitle, resultBody, resultActions);

  root.replaceChildren(
    h('header', { class: 'topbar' }, backBtn, title),
    h('main', { class: 'content check-content' },
      typeGroup, counter, chips, chipsEmpty, inputGroup, gridEl, pad.el),
    h('footer', { class: 'actionbar' }, submitBtn, backToGameBtn),
    resultDialog,
  );

  /** @param {CheckType} type */
  function setType(type) {
    check = { ...check, type };
    render();
  }

  /** @param {'grid' | 'keypad'} method */
  function setInputMethod(method) {
    check = { ...check, inputMethod: method };
    deps.onInputMethodChange(method);
    render();
  }

  /** @param {number[]} numbers */
  function setNumbers(numbers) {
    check = { ...check, numbers, missing: new Set([...check.missing].filter((n) => numbers.includes(n))) };
    render();
  }

  function submit() {
    if (!countStatus(check.type, check.numbers).canSubmit) return;
    result = checkClaim(deps.getGame().drawn, check.type, check.numbers);
    check = { ...check, missing: new Set(result.missing) };
    awardedBingo = false;
    render();
    renderResult();
    window.dispatchEvent(new Event(DIALOG_OPEN_EVENT));
    resultDialog.showModal();
  }

  /** @param {string} labelKey @param {() => void} fn @param {string} [cls] */
  const action = (labelKey, fn, cls = '') =>
    h('button', { type: 'button', class: `btn ${cls}`, onclick: fn }, t(labelKey));

  function renderResult() {
    if (!result) return;
    const isLine = check.type === 'line';
    resultDialog.classList.toggle('result-dialog--ok', result.valid);
    resultDialog.classList.toggle('result-dialog--ko', !result.valid);

    if (awardedBingo) {
      resultTitle.textContent = t('prizes.afterBingo');
      resultBody.replaceChildren();
      resultActions.replaceChildren(
        action('prizes.keepPlaying', () => {
          resultDialog.close();
          deps.onBack();
        }),
        action('game.finish', () => {
          resultDialog.close();
          deps.onFinish();
          deps.onBack();
        }, 'btn-danger'),
      );
      return;
    }

    if (result.valid) {
      resultTitle.replaceChildren(icon('check', { size: 28, stroke: 3 }), t(isLine ? 'check.lineValid' : 'check.bingoValid'));
      resultBody.replaceChildren(
        result.ballsSince > 0
          ? h('p', { class: 'result-late' },
            t('check.late', { n: /** @type {number} */ (result.completionNumber), k: result.ballsSince }))
          : h('p', {}, t('check.onTime', { n: /** @type {number} */ (result.completionNumber) })),
      );
      resultActions.replaceChildren(
        action('check.backWithoutAward', () => {
          resultDialog.close();
          deps.onBack();
        }),
        action('check.award', award, 'btn-primary'),
      );
    } else {
      resultTitle.replaceChildren(icon('close', { size: 28, stroke: 3 }), t(isLine ? 'check.lineInvalid' : 'check.bingoInvalid'));
      resultBody.replaceChildren(
        h('p', {}, t('check.notDrawn')),
        h('ul', { class: 'check-chips' },
          ...result.missing.map((n) => h('li', { class: 'chip chip--missing' }, String(n)))),
      );
      resultActions.replaceChildren(
        action('check.backToGame', () => {
          resultDialog.close();
          deps.onBack();
        }),
        action('check.fix', () => resultDialog.close(), 'btn-primary'),
      );
    }
  }

  function award() {
    if (!result?.valid) return;
    deps.onAward({ type: check.type, numbers: [...check.numbers] }, result);
    if (check.type === 'bingo') {
      awardedBingo = true;
      renderResult();
    } else {
      resultDialog.close();
      deps.onBack();
    }
  }

  function render() {
    const status = countStatus(check.type, check.numbers);
    title.textContent = t('check.title');
    backBtn.setAttribute('aria-label', t('check.backToGame'));
    typeGroup.setAttribute('aria-label', t('check.typeLabel'));
    inputGroup.setAttribute('aria-label', t('check.inputLabel'));

    lineBtn.textContent = t('check.line');
    bingoBtn.textContent = t('check.bingo');
    lineBtn.setAttribute('aria-pressed', String(check.type === 'line'));
    bingoBtn.setAttribute('aria-pressed', String(check.type === 'bingo'));

    let detail = '';
    if (status.missing > 0) detail = ` · ${t('check.missing', { n: status.missing })}`;
    if (status.extra > 0) detail = ` · ${t('check.extra', { n: status.extra })}`;
    counter.textContent = t('check.counter', { current: status.current, required: status.required }) + detail;
    counter.classList.toggle('check-counter--extra', status.extra > 0);

    chips.replaceChildren(
      ...check.numbers.map((n) =>
        h('li', {},
          h('button', {
            type: 'button',
            class: `chip chip--removable${check.missing.has(n) ? ' chip--missing' : ''}`,
            'aria-label': t('check.remove', { n }),
            onclick: () => setNumbers(check.numbers.filter((x) => x !== n)),
          }, String(n), icon('close', { size: 16, stroke: 2.5 })),
        ),
      ),
    );
    chipsEmpty.textContent = t('check.empty');
    chipsEmpty.hidden = check.numbers.length > 0;

    gridBtn.textContent = t('check.inputGrid');
    padBtn.textContent = t('check.inputKeypad');
    gridBtn.setAttribute('aria-pressed', String(check.inputMethod === 'grid'));
    padBtn.setAttribute('aria-pressed', String(check.inputMethod === 'keypad'));
    gridEl.hidden = check.inputMethod !== 'grid';
    pad.el.hidden = check.inputMethod !== 'keypad';
    renderBoard(gridEl, {
      marked: new Set(check.numbers),
      highlighted: check.missing,
      onToggle: (n) => setNumbers(toggleNumber(check.numbers, n)),
    });
    pad.render();

    submitBtn.textContent = t('check.submit');
    submitBtn.disabled = !status.canSubmit;
    backToGameBtn.textContent = t('check.backToGame');
    if (resultDialog.open) renderResult();
  }

  render();

  return {
    render,
    /** Cierra el diálogo de resultado (al salir de la vista con el botón atrás del sistema). */
    close() {
      if (resultDialog.open) resultDialog.close();
    },
    /** Prepara una comprobación nueva (tipo propuesto según los premios ya dados). */
    open() {
      check = {
        type: defaultCheckType(deps.getGame()),
        numbers: [],
        inputMethod: deps.getInputMethod(),
        missing: new Set(),
      };
      result = null;
      awardedBingo = false;
      pad.reset();
      if (resultDialog.open) resultDialog.close();
      render();
    },
  };
}
