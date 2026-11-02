import { canDraw, drawBall, pauseAuto } from '../core/game.js';
import { DIALOG_OPEN_EVENT } from './dialog.js';
import { onViewChange } from './router.js';

/** @typedef {import('./store.js').Store} Store */
/** @typedef {import('../core/game.js').Game} Game */

/** @param {Game} g */
const isRunning = (g) => g.mode === 'auto' && !g.autoPaused && canDraw(g);

/**
 * Sorteo automático (FR-007 a FR-009, research R6): saca una bola cada `intervalSec` con
 * `setTimeout` encadenado. Se pausa al pasar a segundo plano, al abrir Comprobación o Ajustes,
 * al abrir un diálogo y al agotarse las bolas. Nunca se reanuda solo.
 *
 * @param {Store} store
 */
export function createAutoDraw(store) {
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  let nextAt = 0;
  let key = '';

  function clear() {
    if (timer) clearTimeout(timer);
    timer = null;
    nextAt = 0;
  }

  function schedule() {
    clear();
    const g = store.getState();
    if (!isRunning(g)) return;
    const ms = g.intervalSec * 1000;
    nextAt = Date.now() + ms;
    timer = setTimeout(tick, ms);
  }

  function tick() {
    timer = null;
    const g = store.getState();
    if (!isRunning(g)) return;
    store.dispatch((s) => drawBall(s).game);
    if (!canDraw(store.getState())) store.dispatch(pauseAuto);
    else schedule();
  }

  function pause() {
    if (isRunning(store.getState())) store.dispatch(pauseAuto);
  }

  // Reprogramar solo cuando cambia algo que afecta al temporizador.
  store.subscribe((g) => {
    const next = `${g.id}|${g.status}|${g.mode}|${g.autoPaused}|${g.intervalSec}`;
    if (next === key) return;
    key = next;
    schedule();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pause();
  });
  onViewChange((view) => {
    if (view !== 'game') pause();
  });
  window.addEventListener(DIALOG_OPEN_EVENT, pause);

  return {
    /** Segundos que faltan para la próxima bola, o null si no está en marcha. */
    secondsToNext() {
      if (!timer) return null;
      return Math.max(0, Math.ceil((nextAt - Date.now()) / 1000));
    },
    isRunning: () => isRunning(store.getState()),
  };
}
