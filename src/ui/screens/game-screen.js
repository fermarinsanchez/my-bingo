import { canDraw, canUndo, createGame, drawBall, finishGame, undoLastBall } from '../../core/game.js';
import { t } from '../../i18n/index.js';
import { renderBoard } from '../components/board.js';
import { createHistory } from '../components/history.js';
import { createLastBall } from '../components/last-ball.js';
import { confirm, DIALOG_OPEN_EVENT } from '../dialog.js';
import { h } from '../dom.js';

/** Margen mínimo entre dos "Sacar bola" para absorber dobles toques accidentales. */
const DRAW_GUARD_MS = 300;

/** @typedef {import('../store.js').Store} Store */
/** @typedef {import('../../core/game.js').Game} Game */

/**
 * Pantalla de partida (contracts/ui-screens.md › Pantalla Partida).
 *
 * @param {HTMLElement} root
 * @param {Store} store
 * @param {{ onOpenSettings?: () => void }} [deps]
 */
export function mountGameScreen(root, store, { onOpenSettings } = {}) {
  const lastBall = createLastBall();
  const history = createHistory();
  const boardTitle = h('h2', { class: 'section-title', id: 'board-title' });
  const boardEl = h('div', { class: 'board-wrap', 'aria-labelledby': 'board-title' });

  // --- Barra superior ---
  const counter = h('p', { class: 'counter' });
  const settingsBtn = h('button', {
    type: 'button',
    class: 'btn btn-icon',
    onclick: () => onOpenSettings?.(),
  }, '⚙');
  const menuBtn = h('button', {
    type: 'button',
    class: 'btn btn-icon',
    'aria-haspopup': 'dialog',
    onclick: () => openMenu(),
  }, '⋮');

  const topbar = h('header', { class: 'topbar' },
    h('h1', { id: 'game-title', class: 'visually-hidden' }),
    counter,
    settingsBtn,
    menuBtn,
  );

  // --- Zona central ---
  const message = h('div', { class: 'game-message', hidden: true });
  const content = h('main', { class: 'content game-content' },
    lastBall.el,
    message,
    history.el,
    h('section', { class: 'board-section' }, boardTitle, boardEl),
  );

  // --- Barra de acciones ---
  const drawBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: onDraw });
  const undoBtn = h('button', { type: 'button', class: 'btn', onclick: onUndo });
  const actionbar = h('footer', { class: 'actionbar' }, drawBtn, undoBtn);

  // --- Menú (nueva partida / terminar) ---
  const newGameBtn = h('button', { type: 'button', class: 'btn btn-block', onclick: onNewGame });
  const finishBtn = h('button', { type: 'button', class: 'btn btn-block btn-danger', onclick: onFinish });
  const closeMenuBtn = h('button', { type: 'button', class: 'btn btn-block', onclick: () => menu.close() });
  const menu = h('dialog', { class: 'menu-sheet', 'aria-labelledby': 'menu-title' },
    h('h2', { id: 'menu-title' }),
    h('div', { class: 'menu-actions' }, newGameBtn, finishBtn, closeMenuBtn),
  );

  root.replaceChildren(topbar, content, actionbar, menu);

  let lastDrawAt = 0;

  function onDraw() {
    const now = performance.now();
    if (now - lastDrawAt < DRAW_GUARD_MS) return;
    if (!canDraw(store.getState())) return;
    lastDrawAt = now;
    store.dispatch((g) => drawBall(g).game);
  }

  async function onUndo() {
    const game = store.getState();
    if (!canUndo(game)) return;
    const ok = await confirm({
      titleKey: 'undo.confirmTitle',
      messageKey: 'undo.confirmMessage',
      confirmKey: 'game.undo',
      params: { n: /** @type {number} */ (game.drawn.at(-1)) },
    });
    if (ok && canUndo(store.getState())) store.dispatch((g) => undoLastBall(g).game);
  }

  function openMenu() {
    window.dispatchEvent(new Event(DIALOG_OPEN_EVENT));
    menu.showModal();
  }

  async function onNewGame() {
    menu.close();
    const game = store.getState();
    if (game.drawn.length > 0 && game.status === 'in-progress') {
      const ok = await confirm({
        titleKey: 'newGame.confirmTitle',
        messageKey: 'newGame.confirmMessage',
        confirmKey: 'game.newGame',
        danger: true,
      });
      if (!ok) return;
    }
    store.replace(createGame());
  }

  async function onFinish() {
    menu.close();
    await requestFinish();
  }

  async function requestFinish() {
    const ok = await confirm({
      titleKey: 'finish.confirmTitle',
      messageKey: 'finish.confirmMessage',
      confirmKey: 'game.finish',
      danger: true,
    });
    if (ok) store.dispatch((g) => (g.status === 'finished' ? g : finishGame(g)));
  }

  /** @param {Game} game */
  function renderMessage(game) {
    const finished = game.status === 'finished';
    const noBalls = !finished && !canDraw(game);
    message.hidden = !finished && !noBalls;
    if (finished) {
      message.replaceChildren(
        h('p', {}, t('game.finished', { n: game.drawn.length })),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: onNewGame }, t('game.newGame')),
      );
    } else if (noBalls) {
      message.replaceChildren(
        h('p', {}, t('game.noBallsLeft')),
        h('button', { type: 'button', class: 'btn btn-danger', onclick: requestFinish }, t('game.finish')),
      );
    }
  }

  /** @param {Game} game */
  function render(game) {
    const finished = game.status === 'finished';
    counter.textContent = t('game.counter', {
      drawn: game.drawn.length,
      pending: 90 - game.drawn.length,
    });
    lastBall.update(game.drawn.at(-1) ?? null);
    renderMessage(game);
    history.update(game);
    renderBoard(boardEl, { marked: new Set(game.drawn) });

    drawBtn.disabled = !canDraw(game);
    undoBtn.disabled = !canUndo(game);
    actionbar.hidden = finished;
    finishBtn.disabled = finished;

    // Textos (se repintan al cambiar de idioma)
    root.querySelector('#game-title').textContent = t('app.title');
    menuBtn.setAttribute('aria-label', t('game.menu'));
    settingsBtn.setAttribute('aria-label', t('settings.title'));
    boardTitle.textContent = t('board.title');
    drawBtn.textContent = t('game.draw');
    undoBtn.textContent = t('game.undo');
    menu.querySelector('#menu-title').textContent = t('game.menu');
    newGameBtn.textContent = t('game.newGame');
    finishBtn.textContent = t('game.finish');
    closeMenuBtn.textContent = t('common.cancel');
  }

  store.subscribe(render);
  render(store.getState());

  return { render: () => render(store.getState()) };
}
