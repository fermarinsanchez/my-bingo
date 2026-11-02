import { getLastBalls } from '../../core/game.js';
import { t } from '../../i18n/index.js';
import { DIALOG_OPEN_EVENT } from '../dialog.js';
import { h } from '../dom.js';

const VISIBLE = 5;

/** @typedef {import('../../core/game.js').Game} Game */

/**
 * Historial con las últimas 5 bolas (más reciente primero). Al tocarlo se abre la secuencia
 * completa numerada por orden de salida (FR-011).
 */
export function createHistory() {
  const title = h('h2', { class: 'section-title', id: 'history-title' });
  const chips = h('ol', { class: 'history__chips', 'aria-labelledby': 'history-title' });
  const empty = h('p', { class: 'history__empty' });
  const allBtn = h('button', { type: 'button', class: 'btn history__all', onclick: openAll });

  const listTitle = h('h2', { id: 'sequence-title' });
  const list = h('ol', { class: 'sequence' });
  const closeBtn = h('button', { type: 'button', class: 'btn', onclick: () => dialog.close() });
  const dialog = h('dialog', { class: 'sequence-dialog', 'aria-labelledby': 'sequence-title' },
    listTitle, list, h('div', { class: 'dialog-actions' }, closeBtn));

  const el = h('section', { class: 'history' },
    h('div', { class: 'section-head' }, title, allBtn), chips, empty, dialog);

  /** @type {Game | null} */
  let current = null;

  function openAll() {
    if (!current) return;
    list.replaceChildren(...current.drawn.map((n) => h('li', {}, String(n))));
    window.dispatchEvent(new Event(DIALOG_OPEN_EVENT));
    dialog.showModal();
  }

  return {
    el,
    /** @param {Game} game */
    update(game) {
      current = game;
      const last = getLastBalls(game, VISIBLE);
      chips.replaceChildren(
        ...last.map((n, i) => h('li', { class: `chip${i === 0 ? ' chip--latest' : ''}` }, String(n))),
      );
      empty.hidden = last.length > 0;
      chips.hidden = last.length === 0;
      allBtn.disabled = game.drawn.length === 0;

      title.textContent = t('history.title');
      empty.textContent = t('history.empty');
      allBtn.textContent = t('history.fullSequence');
      listTitle.textContent = t('history.sequenceTitle', { n: game.drawn.length });
      closeBtn.textContent = t('common.close');
    },
  };
}
