import { t } from '../../i18n/index.js';
import { h } from '../dom.js';

/** @typedef {import('../../core/game.js').Game} Game */

/** Lista de premios concedidos ("Línea · bola 32"), visible solo si hay alguno. */
export function createPrizes() {
  const list = h('ul', { class: 'prizes', 'aria-live': 'polite' });
  return {
    el: list,
    /** @param {Game} game */
    update(game) {
      list.hidden = game.prizes.length === 0;
      list.replaceChildren(
        ...game.prizes.map((p) =>
          h('li', { class: `prize prize--${p.type}` },
            t(p.type === 'line' ? 'prizes.line' : 'prizes.bingo', { pos: p.awardedAtPosition })),
        ),
      );
    },
  };
}
