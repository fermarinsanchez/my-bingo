import './styles/tokens.css';
import './styles/base.css';
import './styles/game.css';

import { createGame, restoreForResume } from './core/game.js';
import { applyTranslations, detectLang, setLang } from './i18n/index.js';
import { confirm } from './ui/dialog.js';
import { showNotice } from './ui/notices.js';
import { loadGame, saveGame } from './ui/persistence.js';
import { initRouter } from './ui/router.js';
import { createStore } from './ui/store.js';
import { initSwUpdate } from './ui/sw-update.js';
import { mountGameScreen } from './ui/screens/game-screen.js';

/** @typedef {import('./ui/store.js').Store} Store */
/** @typedef {import('./core/game.js').Game} Game */

/**
 * Monta las pantallas de la app. Cada historia de usuario añade aquí su pantalla.
 * @param {Store} store
 */
export function mountScreens(store) {
  const game = mountGameScreen(/** @type {HTMLElement} */ (document.getElementById('view-game')), store);
  return { game };
}

/**
 * Guarda tras cada cambio, antes de repintar (FR-012). Si el navegador no permite guardar,
 * avisa una vez por sesión.
 * @param {Game} game
 */
function persist(game) {
  const { saved } = saveGame(game);
  if (!saved) showNotice('notice.storageUnavailable', { once: 'storageUnavailable', persistent: true });
}

/**
 * Decide con qué partida arrancar (FR-013, FR-014).
 * @param {Store} store
 */
async function restoreSavedGame(store) {
  const result = loadGame();
  if (!result.ok) {
    if (result.reason !== 'empty') showNotice('notice.gameCorrupt', { persistent: true });
    return;
  }
  const saved = result.game;
  if (saved.status === 'finished' || saved.drawn.length === 0) {
    store.replace(saved);
    return;
  }
  for (;;) {
    const resume = await confirm({
      titleKey: 'resume.title',
      messageKey: 'resume.message',
      confirmKey: 'resume.continue',
      cancelKey: 'resume.discard',
      params: { n: saved.drawn.length },
    });
    if (resume) {
      store.replace(restoreForResume(saved));
      return;
    }
    const discard = await confirm({
      titleKey: 'newGame.confirmTitle',
      messageKey: 'newGame.confirmMessage',
      confirmKey: 'resume.discard',
      danger: true,
    });
    if (discard) {
      store.replace(createGame());
      return;
    }
  }
}

function main() {
  setLang(detectLang(navigator.languages));
  applyTranslations(document);

  // La partida guardada no se sobrescribe hasta que el cantador decide (continuar o descartar).
  const store = createStore(createGame(), { onChange: persist });

  mountScreens(store);
  initRouter();
  initSwUpdate({
    isGameInProgress: () => {
      const g = store.getState();
      return g.status === 'in-progress' && g.drawn.length > 0;
    },
  });
  restoreSavedGame(store);
}

main();
