import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

export default defineConfig({
  base: process.env.BASE_PATH ?? '/my-bingo/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    VitePWA({
      // Actualización diferida: nunca recargar en mitad de una partida (research R4).
      registerType: 'prompt',
      injectRegister: false,
      // globPatterns ya precachea iconos y favicon; evitar entradas duplicadas.
      includeManifestIcons: false,
      manifest: {
        name: 'My Bingo',
        short_name: 'Bingo',
        description: 'Bombo de bingo de 90 bolas que funciona sin conexión.',
        lang: 'es',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        theme_color: '#a8201a',
        background_color: '#f6f4ef',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: true,
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**'],
      reporter: ['text', 'html'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
