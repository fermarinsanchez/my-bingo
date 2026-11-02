import { t } from '../i18n/index.js';

/** Evento global que se emite al abrir un diálogo modal (lo usa el sorteo automático). */
export const DIALOG_OPEN_EVENT = 'app:dialog-open';

/**
 * Diálogo de confirmación con <dialog> nativo. Devuelve el foco al control que lo abrió.
 *
 * @param {{ titleKey: string, messageKey?: string, confirmKey?: string, cancelKey?: string,
 *   params?: Record<string, string | number>, danger?: boolean }} opts
 * @returns {Promise<boolean>}
 */
export function confirm({
  titleKey,
  messageKey,
  confirmKey = 'common.confirm',
  cancelKey = 'common.cancel',
  params,
  danger = false,
}) {
  const dialog = /** @type {HTMLDialogElement} */ (document.getElementById('confirm-dialog'));
  const opener = /** @type {HTMLElement | null} */ (document.activeElement);
  const title = /** @type {HTMLElement} */ (dialog.querySelector('#confirm-title'));
  const message = /** @type {HTMLElement} */ (dialog.querySelector('#confirm-message'));
  const okBtn = /** @type {HTMLButtonElement} */ (dialog.querySelector('[data-action="confirm"]'));
  const cancelBtn = /** @type {HTMLButtonElement} */ (
    dialog.querySelector('[data-action="cancel"]')
  );

  title.textContent = t(titleKey, params);
  message.textContent = messageKey ? t(messageKey, params) : '';
  message.hidden = !messageKey;
  okBtn.textContent = t(confirmKey, params);
  cancelBtn.textContent = t(cancelKey, params);
  okBtn.classList.toggle('btn-danger', danger);
  okBtn.classList.toggle('btn-primary', !danger);

  return new Promise((resolve) => {
    /** @param {boolean} result */
    const finish = (result) => {
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      dialog.removeEventListener('cancel', onEsc);
      dialog.close();
      opener?.focus?.();
      resolve(result);
    };
    const onOk = () => finish(true);
    const onCancel = () => finish(false);
    /** @param {Event} e */
    const onEsc = (e) => {
      e.preventDefault();
      finish(false);
    };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    dialog.addEventListener('cancel', onEsc);
    window.dispatchEvent(new Event(DIALOG_OPEN_EVENT));
    dialog.showModal();
    cancelBtn.focus();
  });
}
