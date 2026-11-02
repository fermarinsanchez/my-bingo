import './styles/tokens.css';
import './styles/base.css';
import './styles/game.css';
import './styles/settings.css';
import './styles/check.css';

import { awardPrize, createGame, finishGame, restoreForResume, setIntervalSec } from './core/game.js';
import { applyTranslations, detectLang, setLang } from './i18n/index.js';
import { createAutoDraw } from './ui/auto-draw.js';
import { confirm } from './ui/dialog.js';
import { retranslateNotices, showNotice } from './ui/notices.js';
import { loadGame, loadPrefs, saveGame, savePrefs } from './ui/persistence.js';
import { closeView, currentView, initRouter, onViewChange, showView } from './ui/router.js';
import { createStore } from './ui/store.js';
import { initSwUpdate } from './ui/sw-update.js';
import { applyTheme } from './ui/theme.js';
import { createWakeLock } from './ui/wake-lock.js';
import { mountCheckScreen } from './ui/screens/check-screen.js';
import { mountGameScreen } from './ui/screens/game-screen.js';
import { mountSettingsScreen } from './ui/screens/settings-screen.js';

/** @typedef {import('./ui/store.js').Store} Store */
/** @typedef {import('./core/game.js').Game} Game */
/** @typedef {import('./core/storage.js').Preferences} Preferences */

/** @type {Preferences} */
let prefs;

/** @param {Partial<Preferences>} patch */
function updatePrefs(patch) {
  prefs = { ...prefs, ...patch };
  savePrefs(prefs);
}

/** @param {string} id */
const view = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * Monta las pantallas de la app. Cada historia de usuario añade aquí su pantalla.
 * @param {Store} store
 */
export function mountScreens(store) {
  const autoDraw = createAutoDraw(store);

  const game = mountGameScreen(view('view-game'), store, {
    secondsToNext: autoDraw.secondsToNext,
    onOpenSettings: () => showView('settings'),
    onOpenCheck() {
      check.open();
      showView('check');
    },
  });

  const check = mountCheckScreen(view('view-check'), {
    getGame: store.getState,
    getInputMethod: () => prefs.inputMethod,
    onInputMethodChange: (inputMethod) => updatePrefs({ inputMethod }),
    onAward: (c, result) => store.dispatch((g) => awardPrize(g, c, result)),
    onFinish: () => store.dispatch((g) => (g.status === 'finished' ? g : finishGame(g))),
    onBack: closeView,
  });

  const settings = mountSettingsScreen(view('view-settings'), {
    getPrefs: () => prefs,
    onBack: closeView,
    getIntervalSec: () => store.getState().intervalSec,
    onIntervalChange: (sec) => store.dispatch((g) => setIntervalSec(g, sec)),
    onChange(patch) {
      updatePrefs(patch);
      if (patch.lang) {
        setLang(prefs.lang);
        applyTranslations(document);
        renderAll();
      }
      if (patch.theme) applyTheme(prefs.theme);
      settings.render();
    },
  });

  const screens = { game, check, settings };
  function renderAll() {
    for (const s of Object.values(screens)) s.render();
    retranslateNotices();
  }
  // Ajustes muestra estados que cambian (p. ej. modo offline listo): se repinta al abrirse.
  onViewChange((v) => {
    if (v === 'settings') settings.render();
    if (v !== 'check') check.close();
  });
  navigator.serviceWorker?.addEventListener('controllerchange', () => settings.render());
  return screens;
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
  prefs = loadPrefs(detectLang(navigator.languages));
  setLang(prefs.lang);
  applyTheme(prefs.theme);
  applyTranslations(document);

  // La partida guardada no se sobrescribe hasta que el cantador decide (continuar o descartar).
  const store = createStore(createGame(), { onChange: persist });

  mountScreens(store);
  initRouter();

  const isGameInProgress = () => {
    const g = store.getState();
    return g.status === 'in-progress' && g.drawn.length > 0;
  };

  // Pantalla encendida mientras hay partida en curso y se ve la partida (FR-025).
  const wakeLock = createWakeLock({
    shouldHold: () => isGameInProgress() && currentView() === 'game',
    onUnavailable() {
      if (prefs.wakeLockNoticeShown) return;
      updatePrefs({ wakeLockNoticeShown: true });
      showNotice('notice.wakeLockUnsupported', { persistent: true });
    },
  });
  store.subscribe(() => wakeLock.sync());
  onViewChange(() => wakeLock.sync());

  initSwUpdate({ isGameInProgress });
  restoreSavedGame(store);
}

main();
