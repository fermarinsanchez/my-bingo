/** @typedef {'system' | 'light' | 'dark'} Theme */

const media = window.matchMedia('(prefers-color-scheme: dark)');
/** @type {Theme} */
let current = 'system';

function updateThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (meta && bg) meta.setAttribute('content', bg);
}

/**
 * Aplica el tema (FR-027). `system` sigue la preferencia del dispositivo.
 * @param {Theme} theme
 */
export function applyTheme(theme) {
  current = theme;
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = theme;
  updateThemeColor();
}

media.addEventListener('change', () => {
  if (current === 'system') updateThemeColor();
});
