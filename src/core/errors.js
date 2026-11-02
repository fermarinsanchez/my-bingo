// @ts-check

/**
 * @typedef {'no-balls-left' | 'game-finished' | 'undo-not-allowed' | 'invalid-interval'
 *   | 'invalid-prize' | 'wrong-count'} GameErrorCode
 */

/** Error de uso del motor de juego, con un código estable (contracts/game-engine.md). */
export class GameError extends Error {
  /**
   * @param {GameErrorCode} code
   * @param {string} [message]
   */
  constructor(code, message) {
    super(message ?? code);
    this.name = 'GameError';
    /** @type {GameErrorCode} */
    this.code = code;
  }
}
