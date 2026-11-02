import './styles/tokens.css';
import './styles/base.css';
import './styles/game.css';

import { createGame } from './core/game.js';
import { applyTranslations, detectLang, setLang } from './i18n/index.js';
import { createStore } from './ui/store.js';
import { initRouter } from './ui/router.js';
import { initSwUpdate } from './ui/sw-update.js';
import { mountGameScreen } from './ui/screens/game-screen.js';

/** @typedef {import('./ui/store.js').Store} Store */

/**
 * Monta las pantallas de la app. Cada historia de usuario añade aquí su pantalla.
 * @param {Store} store
 */
export function mountScreens(store) {
  const game = mountGameScreen(/** @type {HTMLElement} */ (document.getElementById('view-game')), store);
  return { game };
}

function main() {
  setLang(detectLang(navigator.languages));
  applyTranslations(document);

  const store = createStore(createGame());

  mountScreens(store);
  initRouter();
  initSwUpdate({ isGameInProgress: () => store.getState().drawn.length > 0 });
}

main();
