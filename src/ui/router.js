/** @typedef {'game' | 'check' | 'settings'} ViewName */

const VIEWS = /** @type {const} */ (['game', 'check', 'settings']);
/** @type {ViewName} */
let current = 'game';
/** @type {Set<(view: ViewName) => void>} */
const listeners = new Set();

/** @param {ViewName} name */
function render(name) {
  current = name;
  for (const v of VIEWS) {
    const el = document.getElementById(`view-${v}`);
    if (el) el.hidden = v !== name;
  }
  window.scrollTo(0, 0);
  for (const fn of listeners) fn(name);
}

/** Inicializa el router: la vista de partida es la raíz del historial. */
export function initRouter() {
  history.replaceState({ view: 'game' }, '');
  window.addEventListener('popstate', (e) => {
    const view = e.state?.view;
    render(VIEWS.includes(view) ? view : 'game');
  });
  render('game');
}

/**
 * Muestra una vista. Comprobación y Ajustes se apilan en el historial para que el botón
 * "atrás" del sistema vuelva a la partida.
 * @param {ViewName} name
 */
export function showView(name) {
  if (name === current) return;
  if (name === 'game') {
    closeView();
    return;
  }
  history.pushState({ view: name }, '');
  render(name);
}

/** Vuelve a la partida (equivalente al botón "atrás"). */
export function closeView() {
  if (history.state?.view && history.state.view !== 'game') history.back();
  else render('game');
}

/** @returns {ViewName} */
export function currentView() {
  return current;
}

/**
 * @param {(view: ViewName) => void} fn
 * @returns {() => void}
 */
export function onViewChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
