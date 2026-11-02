import { h } from '../dom.js';
import { t } from '../../i18n/index.js';

/**
 * Última bola en tamaño máximo (FR-003). Anuncia cada bola nueva a lectores de pantalla.
 * @returns {{ el: HTMLElement, update: (ball: number | null) => void }}
 */
export function createLastBall() {
  const number = h('span', { class: 'last-ball__number' }, '—');
  const ball = h('div', { class: 'last-ball', 'aria-hidden': 'true' }, number);
  const live = h('p', { class: 'visually-hidden', 'aria-live': 'assertive', 'aria-atomic': 'true' });
  const el = h('div', { class: 'last-ball-wrap' }, ball, live);

  /** @type {number | null | undefined} */
  let shown;

  return {
    el,
    update(value) {
      if (value === shown) return;
      const isNew = shown !== undefined && value !== null;
      shown = value;
      number.textContent = value === null ? '—' : String(value);
      ball.classList.toggle('last-ball--empty', value === null);
      live.textContent = value === null ? '' : t('game.lastBallAnnounce', { n: value });
      if (isNew) {
        ball.classList.remove('last-ball--pop');
        void ball.offsetWidth; // reinicia la animación
        ball.classList.add('last-ball--pop');
      }
    },
  };
}
