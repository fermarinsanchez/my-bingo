import { registerSW } from 'virtual:pwa-register';
import { showNotice } from './notices.js';

/**
 * Registra el service worker con actualización diferida (constitución, principio I):
 * la versión nueva queda en espera y se activa al volver a abrir la app. Solo se ofrece
 * "Actualizar ahora" si no hay una partida en curso.
 *
 * @param {{ isGameInProgress: () => boolean }} deps
 */
export function initSwUpdate({ isGameInProgress }) {
  if (!('serviceWorker' in navigator)) return;

  const updateSW = registerSW({
    onNeedRefresh() {
      if (isGameInProgress()) {
        showNotice('notice.updateAvailable', { persistent: true });
      } else {
        showNotice('notice.updateAvailable', {
          action: { labelKey: 'notice.updateNow', onClick: () => updateSW(true) },
        });
      }
    },
    onOfflineReady() {
      showNotice('notice.offlineReady', { once: 'offlineReady' });
    },
  });
}
