import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/** @param {string} dir */
function walkJs(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkJs(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

describe('aislamiento de la sala', () => {
  it('ni main.js ni src/ui importan el código de sala', () => {
    const files = [join(root, 'src/main.js'), ...walkJs(join(root, 'src/ui'))];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/core\/room/);
      expect(src, file).not.toMatch(/['"][^'"]*\/room\//);
      expect(src, file).not.toMatch(/from ['"]\.\.\/room/);
    }
  });

  it('el código de sala no toca almacenamiento persistente', () => {
    const files = [...walkJs(join(root, 'src/core/room')), ...walkJs(join(root, 'src/room'))];
    const banned = /localStorage|sessionStorage|indexedDB|document\.cookie/;
    for (const file of files) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(banned);
    }
  });
});
