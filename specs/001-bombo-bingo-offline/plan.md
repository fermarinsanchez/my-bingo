# Implementation Plan: Bombo de bingo de 90 bolas sin conexión

**Branch**: `001-bombo-bingo-offline` | **Date**: 2026-11-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-bombo-bingo-offline/spec.md`

## Summary

PWA de una sola página que hace de bombo de bingo de 90 bolas en el móvil, 100 % offline tras
la primera carga. El núcleo es un conjunto de módulos JavaScript puros (`src/core/`) para el
sorteo uniforme con `crypto.getRandomValues`, el estado inmutable de la partida (deshacer la
última bola, modo automático, premios) y la comprobación de línea/bingo con aviso de premio
tardío. Una capa UI sin framework renderiza tres vistas (Partida, Comprobación, Ajustes), guarda
el estado en `localStorage` tras cada acción, mantiene la pantalla encendida con Wake Lock y
ofrece español/gallego y tema claro/oscuro. Vite + vite-plugin-pwa generan el service worker
con precache completo y actualización diferida; se despliega en GitHub Pages con CI de lint,
tests, build, tamaño y accesibilidad. Detalle de decisiones en [research.md](./research.md).

## Technical Context

**Language/Version**: JavaScript ES2022 (módulos ES), JSDoc + `// @ts-check` en `src/core/`;
Node.js 22 LTS para herramientas.

**Primary Dependencies**: Vite (build/dev), vite-plugin-pwa (Workbox `generateSW`). Cero
dependencias de ejecución aparte del service worker generado.

**Storage**: `localStorage`, claves versionadas `my-bingo:game` y `my-bingo:prefs`
([contracts/storage-schema.md](./contracts/storage-schema.md)).

**Testing**: Vitest (entorno node) para `src/core/` y `src/i18n/`, cobertura ≥ 90 % en
`src/core/`; ESLint 9; Lighthouse CI (Accesibilidad ≥ 90); validación manual en móvil
([quickstart.md](./quickstart.md)).

**Target Platform**: navegadores móviles modernos: Chrome Android y Safari iOS (dos últimas
versiones mayores), instalable como PWA; servido por HTTPS desde GitHub Pages.

**Project Type**: aplicación web estática (PWA de una sola página, sin backend).

**Performance Goals**: bola visible < 500 ms tras pulsar (objetivo real < 100 ms); app operativa
< 2 s en gama media tras instalación; animaciones a 60 fps.

**Constraints**: offline total; JS+CSS iniciales ≤ 100 KB gzip; sin recursos de red en
ejecución; sin analíticas ni cookies; orientación vertical; contraste WCAG AA; no interrumpir
partida al actualizar.

**Scale/Scope**: 1 usuario por dispositivo, 1 partida guardada, 3 vistas, ~80 cadenas por
idioma, estado < 2 KB.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / sección | Cumplimiento en el plan | Estado |
|---|---|---|
| I. Offline-First Total | Precache de todos los assets (R4); sin CDN ni fuentes externas (R9); sin backend; manifest instalable; SW con actualización diferida, nunca recarga en partida. | ✅ |
| II. Alcance acotado | Solo bombo 90 bolas: sorteo manual/automático, tablero + historial, recuperación, comprobación. Deshacer y registro de premios son aclaraciones de la spec dentro de la funcionalidad del bombo; sin cartones, voz ni multijugador. | ✅ |
| III. Integridad y persistencia | `crypto.getRandomValues` + rechazo (R2); guardado síncrono tras cada acción y antes de mostrar la bola (R3); confirmaciones en acciones destructivas; comprobación pausa el automático; `schemaVersion` + `migrate()`. | ✅ |
| IV. Legibilidad y accesibilidad | Bola a `min(84vw, 46vh)` con cifra escalada a la bola (R9); controles en zona inferior ≥ 48 px; AA en ambos temas; tema sistema/claro/oscuro; Wake Lock con aviso; es/gl con test de paridad. | ✅ |
| V. Simplicidad y web estándar | Vanilla JS + Vite + vite-plugin-pwa; sin framework; núcleo puro separado del DOM; `<dialog>` nativo; sin librerías de i18n. | ✅ |
| VI. Tests en lógica clave | Vitest sobre sorteo, estado, persistencia (serialización) y comprobación; umbral de cobertura en CI; prueba manual en modo avión. | ✅ |
| Restricciones técnicas | GitHub Pages con `BASE_PATH`; `localStorage`; presupuesto 100 KB verificado en CI; Lighthouse Accesibilidad ≥ 90 en CI; instalabilidad verificada en DevTools y escenario 1 de [quickstart.md](./quickstart.md) (constitución v1.1.0). | ✅ |
| Flujo de desarrollo | Ramas + PR obligatorio; autorrevisión con checklist de plantilla de PR (única mantenedora); CI (lint, test, build) bloqueante; `main` protegida; deploy automático desde `main`. | ✅ |

**Resultado**: gate superada (pre-research y post-design). Sin violaciones que justificar.

## Project Structure

### Documentation (this feature)

```text
specs/001-bombo-bingo-offline/
├── plan.md              # Este archivo
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── game-engine.md   # API de los módulos puros
│   ├── storage-schema.md# Formato persistido versionado
│   └── ui-screens.md    # Pantallas, controles y estados
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks; no lo crea /speckit-plan)
```

### Source Code (repository root)

```text
index.html                    # Shell de la SPA (vistas, <dialog>, meta theme-color)
vite.config.js                # base = BASE_PATH, VitePWA (manifest, workbox, prompt)
eslint.config.js
package.json                  # scripts: dev, build, preview, lint, test, test:coverage,
                              #          check-size, lhci
.nvmrc
lighthouserc.json
scripts/
└── check-size.mjs            # presupuesto 100 KB gzip
public/
├── favicon.svg
└── icons/                    # icon-192.png, icon-512.png, icon-maskable-512.png
src/
├── main.js                   # arranque: prefs, i18n, tema, recuperación, registro SW
├── core/                     # PURO: sin DOM, sin storage, sin timers (contracts/game-engine.md)
│   ├── errors.js             # GameError
│   ├── rng.js                # randomInt con crypto + rechazo
│   ├── game.js               # Game inmutable: draw, undo, modos, premios, derivados
│   ├── checker.js            # validateEntry, toggleNumber, countStatus, checkClaim
│   └── storage.js            # serialize/parse/migrate de Game y Preferences
├── i18n/
│   ├── index.js              # t(), setLang(), detectLang(), applyTranslations()
│   ├── es.js
│   └── gl.js
├── ui/
│   ├── store.js              # estado actual + suscriptores; persiste tras cada cambio
│   ├── persistence.js        # adaptador localStorage con try/catch
│   ├── auto-draw.js          # setTimeout encadenado + pausa en visibilitychange
│   ├── wake-lock.js          # Wake Lock con re-adquisición y aviso
│   ├── theme.js              # data-theme + meta theme-color
│   ├── sw-update.js          # registro SW (virtual:pwa-register), aviso de actualización
│   ├── dialog.js             # confirmaciones con <dialog>
│   ├── dom.js                # helper h() para crear elementos (añadido en implementación)
│   ├── icons.js              # iconos SVG en línea (sustituyen símbolos de texto; ver nota)
│   ├── router.js             # vistas + botón "atrás" del sistema
│   ├── notices.js            # avisos no bloqueantes "una vez"
│   ├── screens/
│   │   ├── game-screen.js
│   │   ├── check-screen.js
│   │   └── settings-screen.js
│   └── components/
│       ├── last-ball.js
│       ├── history.js
│       ├── board.js          # tablero 1-90 (reutilizado en comprobación)
│       ├── number-pad.js     # teclado numérico propio
│       └── prizes.js
└── styles/
    ├── tokens.css            # colores claro/oscuro, espacios, tamaños
    ├── base.css
    ├── game.css
    ├── check.css
    └── settings.css
tests/
└── unit/
    ├── rng.test.js
    ├── game.test.js
    ├── checker.test.js
    ├── storage.test.js
    └── i18n.test.js          # paridad de claves es/gl, sin vacías
.github/
└── workflows/
    ├── ci.yml                # PR: npm ci, lint, test:coverage, build, check-size, lhci
    └── deploy.yml            # push a main: build + deploy-pages
```

**Nota de implementación (iconos)**: los símbolos de texto (⚙ ⋮ ✕ ← ⌫) obligaban a cargar una
fuente de reserva en la primera maquetación (TBT 450 ms en Lighthouse móvil). Con iconos SVG en
línea el rendimiento pasa de 88 a 96-99 y la interactividad queda en 1,5-1,8 s.

**Structure Decision**: proyecto único de frontend estático en la raíz. `src/core/` concentra
la lógica pura testeada (principio V y VI); `src/ui/` contiene todo lo que toca DOM, timers,
almacenamiento y APIs del navegador. Los tests unitarios viven en `tests/unit/` y solo importan
de `src/core/` y `src/i18n/`.

## Complexity Tracking

Sin violaciones de la constitución que justificar.
