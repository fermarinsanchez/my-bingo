/** @typedef {import('../core/game.js').Game} Game */

/**
 * Store observable de la partida actual.
 *
 * `dispatch(updater)` aplica una función pura del núcleo; antes de avisar a los suscriptores
 * llama a `onChange(state)`, que persiste el estado de forma síncrona (FR-012): así la bola ya
 * está guardada cuando se pinta.
 *
 * @param {Game} initialGame
 * @param {{ onChange?: (state: Game) => void }} [opts]
 */
export function createStore(initialGame, { onChange } = {}) {
  let state = initialGame;
  /** @type {Set<(state: Game) => void>} */
  const listeners = new Set();

  function notify() {
    for (const fn of listeners) fn(state);
  }

  return {
    getState: () => state,

    /**
     * @param {(state: Game) => Game} updater
     * @returns {Game}
     */
    dispatch(updater) {
      const next = updater(state);
      if (next === state) return state;
      state = next;
      onChange?.(state);
      notify();
      return state;
    },

    /** Sustituye la partida entera (nueva partida o recuperada). */
    replace(/** @type {Game} */ game) {
      state = game;
      onChange?.(state);
      notify();
    },

    /**
     * @param {(state: Game) => void} fn
     * @returns {() => void}
     */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** @typedef {ReturnType<typeof createStore>} Store */
