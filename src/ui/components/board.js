import { h } from '../dom.js';
import { t } from '../../i18n/index.js';

const TOTAL = 90;

/**
 * Tablero 1-90 (10 columnas × 9 filas). Las casillas marcadas se distinguen por relleno,
 * negrita y una marca de esquina, no solo por color (FR-010).
 *
 * Modo estático (sin `onToggle`): casillas no interactivas.
 * Modo interactivo (con `onToggle`): botones con `aria-pressed` (cuadrícula de la comprobación).
 * La primera llamada crea las casillas; las siguientes solo actualizan su estado.
 *
 * @param {HTMLElement} container
 * @param {{ marked: Set<number>, highlighted?: Set<number>, onToggle?: (n: number) => void }} opts
 */
export function renderBoard(container, { marked, highlighted = new Set(), onToggle }) {
  const interactive = typeof onToggle === 'function';
  /** @type {HTMLElement[]} */
  let cells = /** @type {any} */ (container)._boardCells;

  if (!cells || /** @type {any} */ (container)._boardInteractive !== interactive) {
    cells = [];
    const grid = h('div', { class: `board${interactive ? ' board--interactive' : ''}` });
    for (let n = 1; n <= TOTAL; n++) {
      const cell = interactive
        ? h('button', { type: 'button', class: 'board__cell', dataset: { n: String(n) } }, String(n))
        : h('span', { class: 'board__cell', role: 'listitem' }, String(n));
      cells.push(cell);
      grid.append(cell);
    }
    if (interactive) {
      grid.addEventListener('click', (e) => {
        const btn = /** @type {HTMLElement} */ (e.target).closest('button[data-n]');
        if (btn) /** @type {any} */ (container)._boardOnToggle(Number(btn.dataset.n));
      });
    } else {
      grid.setAttribute('role', 'list');
    }
    container.replaceChildren(grid);
    Object.assign(container, { _boardCells: cells, _boardInteractive: interactive });
  }
  Object.assign(container, { _boardOnToggle: onToggle });

  for (let n = 1; n <= TOTAL; n++) {
    const cell = cells[n - 1];
    const isMarked = marked.has(n);
    cell.classList.toggle('board__cell--marked', isMarked);
    cell.classList.toggle('board__cell--highlighted', highlighted.has(n));
    if (interactive) {
      cell.setAttribute('aria-pressed', String(isMarked));
    } else {
      cell.setAttribute('aria-label', t(isMarked ? 'board.cellDrawn' : 'board.cellPending', { n }));
    }
  }
}
