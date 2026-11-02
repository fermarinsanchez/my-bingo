import { parseGame, parsePrefs, serializeGame, serializePrefs } from '../core/storage.js';

/** @typedef {import('../core/game.js').Game} Game */
/** @typedef {import('../core/storage.js').Preferences} Preferences */

const GAME_KEY = 'my-bingo:game';
const PREFS_KEY = 'my-bingo:prefs';

/**
 * Lee la partida guardada. Cualquier fallo de acceso (modo privado, bloqueo) cuenta como vacío.
 * @returns {ReturnType<typeof parseGame>}
 */
export function loadGame() {
  try {
    return parseGame(localStorage.getItem(GAME_KEY));
  } catch {
    return { ok: false, reason: 'empty' };
  }
}

/**
 * Guarda la partida de forma síncrona (FR-012).
 * @param {Game} game
 * @returns {{ saved: boolean }}
 */
export function saveGame(game) {
  try {
    localStorage.setItem(GAME_KEY, serializeGame(game));
    return { saved: true };
  } catch {
    return { saved: false };
  }
}

export function clearGame() {
  try {
    localStorage.removeItem(GAME_KEY);
  } catch {
    // sin almacenamiento: nada que borrar
  }
}

/**
 * @param {'es' | 'gl'} defaultLang
 * @returns {Preferences}
 */
export function loadPrefs(defaultLang) {
  try {
    return parsePrefs(localStorage.getItem(PREFS_KEY), defaultLang);
  } catch {
    return parsePrefs(null, defaultLang);
  }
}

/**
 * @param {Preferences} prefs
 * @returns {{ saved: boolean }}
 */
export function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, serializePrefs(prefs));
    return { saved: true };
  } catch {
    return { saved: false };
  }
}
