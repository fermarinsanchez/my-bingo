/**
 * Mantiene la pantalla encendida durante la partida (FR-025) con la Screen Wake Lock API.
 * El navegador libera el bloqueo al pasar a segundo plano, así que se vuelve a pedir al volver.
 * Si no se puede, avisa una vez (`onUnavailable`) y la app sigue funcionando.
 *
 * @param {{ shouldHold: () => boolean, onUnavailable: () => void }} deps
 */
export function createWakeLock({ shouldHold, onUnavailable }) {
  /** @type {WakeLockSentinel | null} */
  let sentinel = null;
  let requesting = false;
  let reported = false;

  function reportUnavailable() {
    if (reported) return;
    reported = true;
    onUnavailable();
  }

  async function acquire() {
    if (sentinel || requesting) return;
    if (!('wakeLock' in navigator)) {
      reportUnavailable();
      return;
    }
    requesting = true;
    try {
      sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => {
        sentinel = null;
      });
      if (!shouldHold()) await release();
    } catch {
      reportUnavailable();
    } finally {
      requesting = false;
    }
  }

  async function release() {
    const s = sentinel;
    sentinel = null;
    try {
      await s?.release();
    } catch {
      // ya liberado
    }
  }

  /** Pide o libera el bloqueo según el estado actual. */
  function sync() {
    if (document.visibilityState === 'visible' && shouldHold()) acquire();
    else release();
  }

  document.addEventListener('visibilitychange', sync);

  return { sync, release };
}
