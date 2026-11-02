---

description: "Task list for feature 001-bombo-bingo-offline"
---

# Tasks: Bombo de bingo de 90 bolas sin conexión

**Input**: Design documents from `/specs/001-bombo-bingo-offline/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: OBLIGATORIOS para la lógica clave (constitución, principio VI): sorteo, estado de
partida, persistencia (serialización) y comprobación de línea/bingo, más paridad de
traducciones. Se escriben **antes** de implementar cada módulo de `src/core/` y deben fallar
primero. La UI se valida manualmente con [quickstart.md](./quickstart.md).

**Organization**: tareas agrupadas por historia de usuario. Orden de fases según prioridad de la
spec: P1 (US1, US2, US3, US6) → P2 (US4, US5).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario de la spec (US1…US6)
- Rutas relativas a la raíz del repositorio (proyecto único, ver plan.md)

**Reglas comunes para todas las tareas**:

- Módulos de `src/core/` con `// @ts-check` y tipos JSDoc; **sin** DOM, `localStorage` ni
  temporizadores; funciones inmutables (devuelven objetos nuevos).
- Todo texto visible se añade como clave en **ambos** `src/i18n/es.js` y `src/i18n/gl.js`.
- Ningún recurso de red externo (CDN, fuentes web, analíticas).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: inicializar el proyecto Vite + PWA, herramientas y CI básico

- [x] T001 Initialize git repository and create `.gitignore` (node_modules, dist, coverage, .lighthouseci) in `.gitignore`
- [x] T002 Make the initial commit on `main`, then create the public GitHub repo and push: `gh repo create my-bingo --public --source . --push` (skip if `origin` already exists)
- [x] T003 Configure GitHub: enable Pages with build type "workflow" (`gh api -X POST repos/{owner}/my-bingo/pages -f build_type=workflow`); protect `main` with required pull request (0 approvals, solo maintainer per constitution v1.1.0), required status check `ci`, no force pushes, no deletions, enforced for admins (done 2026-11-02; Pages URL https://marusheena.github.io/my-bingo/); document the settings in `README.md` as part of T011
- [x] T004 [P] Create PR template with the constitution self-review checklist (offline in airplane mode on a real phone, scope per Principle II, core tests added/passing, es/gl strings complete, contrast/tap targets, no external network resources) in `.github/pull_request_template.md`
- [x] T005 Create `package.json` with `"type": "module"`, `"engines": { "node": ">=22" }` and scripts `dev`, `build`, `preview`, `lint`, `test` (`vitest run`), `test:watch`, `test:coverage`; install dev deps `vite`, `vite-plugin-pwa`, `vitest`, `@vitest/coverage-v8`, `eslint`, `@eslint/js`, `globals` in `package.json`
- [x] T006 [P] Create `.nvmrc` with `22`
- [x] T007 [P] Create ESLint 9 flat config (recommended rules, browser globals for `src/`, node globals for `scripts/` and config files, vitest globals for `tests/`) in `eslint.config.js`
- [x] T008 Create `vite.config.js` with `base: process.env.BASE_PATH ?? '/my-bingo/'`, Vitest config (`environment: 'node'`, `include: ['tests/unit/**/*.test.js']`, coverage on `src/core/**` with thresholds lines/functions/branches/statements = 90) and a placeholder `VitePWA()` call (configured in T029)
- [x] T009 Create directory skeleton from plan.md: `src/core/`, `src/i18n/`, `src/ui/screens/`, `src/ui/components/`, `src/styles/`, `tests/unit/`, `public/icons/`, `scripts/`, `.github/workflows/`
- [x] T010 [P] Create CI workflow running on `pull_request` to `main` with a single job whose id and name are `ci` (required status check of the `main` protection): checkout, setup-node from `.nvmrc` with npm cache, `npm ci`, `npm run lint`, `npm run test:coverage`, `npm run build` in `.github/workflows/ci.yml`
- [x] T011 [P] Create `README.md` with project purpose, link to constitution and spec, and the commands from quickstart.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: núcleo mínimo de partida, i18n, estilos base, shell de la app, PWA instalable
offline y despliegue, que todas las historias necesitan

**⚠️ CRITICAL**: ninguna historia puede empezar hasta completar esta fase

### Tests (escribir primero, deben fallar)

- [x] T012 [P] Write unit tests for `randomInt(n)`: returns integers in `[0, n)` for n = 1, 2, 90; throws `RangeError` for 0, -1, 1.5, `2**32 + 1`; chi-square-style uniformity check over 90 000 samples of `randomInt(90)` (each bucket within ±15 % of 1000) in `tests/unit/rng.test.js`
- [x] T013 [P] Write unit tests for `createGame` and `drawBall` per contracts/game-engine.md: new game has `status: 'in-progress'`, `drawn: []`, `mode: 'manual'`, `intervalSec: 5`, `autoPaused: true`, `undoLocked: false`, `prizes: []`; `drawBall` with injected deterministic `randomInt` picks `pending[randomInt(pending.length)]` from ascending pending; 90 draws yield 90 unique numbers 1-90; 91st draw throws `GameError('no-balls-left')`; drawing on a finished game throws `GameError('game-finished')`; input game is not mutated; `getPending`, `getLastBalls(game, 5)` (most recent first), `canDraw` in `tests/unit/game.test.js`
- [x] T014 [P] Write unit test that `src/i18n/es.js` and `src/i18n/gl.js` export exactly the same set of keys, no value is empty, and every `{param}` placeholder in one language exists in the other in `tests/unit/i18n.test.js`

### Implementation

- [x] T015 [P] Implement `GameError extends Error` with `code` property; codes: `no-balls-left`, `game-finished`, `undo-not-allowed`, `invalid-interval`, `invalid-prize`, `wrong-count` in `src/core/errors.js`
- [x] T016 [P] Implement `randomInt(n)` using `crypto.getRandomValues(new Uint32Array(1))` with rejection sampling (`limit = 2**32 - (2**32 % n)`), throwing `RangeError` if `n` is not an integer in `1..2**32` in `src/core/rng.js`
- [x] T017 Implement in `src/core/game.js`: constants `TOTAL_BALLS = 90`, `INTERVAL_MIN = 3`, `INTERVAL_MAX = 30`, `INTERVAL_DEFAULT = 5`; JSDoc typedefs `Game` and `Prize` exactly as data-model.md; `createGame({ now, id })` (id default `crypto.randomUUID()`), `drawBall(game, randomInt = rngRandomInt)` returning `{ game, ball }` and setting `undoLocked = false`, `getPending`, `getLastBalls`, `canDraw`, `finishGame` (`status = 'finished'`, `autoPaused = true`) — make T013 pass
- [x] T018 Implement i18n runtime: `detectLang(navigatorLanguages)` → `'gl'` if first language starts with `gl`, else `'es'`; `setLang(lang)` updates `<html lang>`; `t(key, params)` with `{name}` interpolation and fallback to `es` then to the key; `applyTranslations(root)` fills `[data-i18n]` textContent and `[data-i18n-aria]` aria-label in `src/i18n/index.js`
- [x] T019 [P] Create Spanish dictionary with app-level keys (`app.title`, `common.confirm`, `common.cancel`, `common.back`, `common.close`, `game.newGame`, `game.finish`, `game.counter` "Bolas: {drawn} / 90 · Quedan {pending}", `notice.updateAvailable` "Hay una versión nueva. Se aplicará al volver a abrir la app.", `notice.updateNow` "Actualizar ahora", `notice.offlineReady` "Lista para usar sin conexión") in `src/i18n/es.js`
- [x] T020 [P] Create Galician dictionary with the same keys as T019 (`game.counter` "Bólas: {drawn} / 90 · Quedan {pending}", `notice.updateAvailable` "Hai unha versión nova. Aplicarase ao volver abrir a app.", `notice.updateNow` "Actualizar agora", `notice.offlineReady` "Lista para usar sen conexión") in `src/i18n/gl.js` — make T014 pass
- [x] T021 [P] Create design tokens: light palette on `:root`, dark palette under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])` and repeated under `:root[data-theme="dark"]`; all text/background pairs WCAG AA (≥ 4.5:1 text, ≥ 3:1 large text/UI); spacing scale; `--tap-min: 48px`; `--tap-primary: 64px` in `src/styles/tokens.css`
- [x] T022 [P] Create base styles: reset, `system-ui` font stack, `font-variant-numeric: tabular-nums`, explicit `body` background from tokens, visible `:focus-visible` outline, `.view[hidden]` handling, mobile-first portrait layout with bottom action bar (`position: sticky; bottom: 0`, safe-area insets) in `src/styles/base.css`
- [x] T023 Create SPA shell: `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `<meta name="theme-color">`, `<html lang="es">`, three `<section class="view">` containers (`#view-game`, `#view-check`, `#view-settings`), `<dialog id="confirm-dialog">`, notice region `#notices` with `role="status"`, script `type="module" src="/src/main.js"` in `index.html`
- [x] T024 Implement observable store: `createStore(initialGame)` with `getState()`, `dispatch(updaterFn)` (applies pure core function, then calls an injected `onChange(state)` before notifying subscribers), `subscribe(fn)` returning unsubscribe in `src/ui/store.js`
- [x] T025 [P] Implement confirmation dialog helper `confirm({ titleKey, messageKey, confirmKey })` → `Promise<boolean>` using `<dialog>.showModal()`, returning focus to the opener on close in `src/ui/dialog.js`
- [x] T026 [P] Implement non-blocking notices `showNotice(key, { once: prefKey })` rendering into `#notices`, auto-dismiss after 6 s, with a close button in `src/ui/notices.js`
- [x] T027 Implement view router `showView('game' | 'check' | 'settings')` toggling `hidden` and handling the system back button via `history.pushState`/`popstate` (back from check/settings → game) in `src/ui/router.js`
- [x] T028 [P] Create app icons: `public/favicon.svg`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png` (safe zone 80 %), bingo-ball motif with the app's primary token color
- [x] T029 Configure `VitePWA` in `vite.config.js`: `registerType: 'prompt'`, `injectRegister: false`, `workbox.globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}']`, `workbox.navigateFallback: 'index.html'`, no `skipWaiting`/`clientsClaim`; manifest `name: 'My Bingo'`, `short_name: 'Bingo'`, `lang: 'es'`, `display: 'standalone'`, `orientation: 'portrait'`, `start_url: '.'`, `scope: '.'`, `theme_color`/`background_color` from tokens, icons 192/512/maskable; `devOptions.enabled: true`
- [x] T030 Implement SW registration with `registerSW` from `virtual:pwa-register`: on `onNeedRefresh` show notice `notice.updateAvailable` ("se aplicará al volver a abrir"); if no game in progress (`store.getState().drawn.length === 0` until US3 adds persistence) offer "Actualizar ahora" calling `updateSW(true)`; never reload automatically during a game; on `onOfflineReady` show `notice.offlineReady` once in `src/ui/sw-update.js`
- [x] T031 Implement `src/main.js` bootstrap: import styles, `setLang(detectLang(navigator.languages))`, `applyTranslations(document)`, create store with `createGame()`, export a `mountScreens(store)` hook (initially empty, filled by each story) and show `#view-game`; call `registerSW` setup (T030)
- [x] T032 Create GitHub Pages deploy workflow on push to `main`: `npm ci`, `npm run build` with `BASE_PATH=/${{ github.event.repository.name }}/`, `actions/configure-pages`, `actions/upload-pages-artifact` (path `dist`), `actions/deploy-pages`; permissions `pages: write`, `id-token: write` in `.github/workflows/deploy.yml`
- [x] T033 [P] Create bundle budget script: gzip-size every initial `.js` and `.css` in `dist/assets/`, fail with exit code 1 if the total exceeds 100 KB (102 400 bytes), print a table; add `check-size` script in `scripts/check-size.mjs` and `package.json`
- [x] T034 [P] Add Lighthouse CI: dev dep `@lhci/cli`, `lighthouserc.json` with `staticDistDir: './dist-lhci'`, mobile preset, `numberOfRuns: 1`, assertion `categories:accessibility >= 0.9` (error level); add scripts `build:lhci` (`BASE_PATH=/ vite build --outDir dist-lhci`) and `lhci` (`npm run build:lhci && lhci autorun`) in `lighthouserc.json` and `package.json`; add `dist-lhci/` to `.gitignore`
- [x] T035 Extend the `ci` job with `npm run check-size` and `npm run lhci` after `npm run build` in `.github/workflows/ci.yml`

**Checkpoint**: `npm test` pasa (rng, game base, i18n); `npm run dev` muestra la vista de
partida vacía traducida; `npm run build && npm run preview` → en DevTools el service worker está
activo y la recarga en modo offline funciona; el push a `main` despliega en GitHub Pages. A
partir de aquí, cada PR se valida en un móvil en modo avión (constitución, principio VI). El CI
comprueba en cada PR el tamaño de la app (≤ 100 KB gzip) y Lighthouse Accesibilidad ≥ 90.

---

## Phase 3: User Story 1 - Sacar bolas manualmente y ver la última bola (Priority: P1) 🎯 MVP

**Goal**: el cantador inicia una partida y saca bolas una a una, viendo la última en grande;
puede deshacer la última bola sacada por error.

**Independent Test**: nueva partida → 90 pulsaciones de "Sacar bola" → 90 números distintos,
cada uno en grande; después "No quedan bolas". Deshacer devuelve la bola y se bloquea hasta la
siguiente (quickstart escenarios 2 y 3).

### Tests for User Story 1 (escribir primero) ⚠️

- [x] T036 [US1] Add unit tests for `undoLastBall` and `canUndo` in `tests/unit/game.test.js`: undo removes last ball and returns it, sets `undoLocked = true`; second undo throws `GameError('undo-not-allowed')`; after a new `drawBall` undo is allowed again; undo on empty game throws; `canUndo` is false when `mode = 'auto'` and `autoPaused = false`, when `status = 'finished'`, and when a prize has `awardedAtPosition === drawn.length` (FR-021c); undone ball returns to `getPending`

### Implementation for User Story 1

- [x] T037 [US1] Implement `undoLastBall(game)` → `{ game, ball }` and `canUndo(game)` exactly per data-model.md derived rule (`drawn.length > 0` ∧ ¬`undoLocked` ∧ ¬(`mode = 'auto'` ∧ ¬`autoPaused`) ∧ no prize with `awardedAtPosition = drawn.length` ∧ `status = 'in-progress'`) in `src/core/game.js` — make T036 pass
- [x] T038 [US1] Create game screen module `mountGameScreen(root, store)` and call it from `mountScreens` in `src/main.js`, rendering top bar with counter (`game.counter`), central last-ball slot and bottom action bar with "Sacar bola", "Deshacer" and a menu with "Nueva partida" / "Terminar partida"; re-render on store change in `src/ui/screens/game-screen.js`
- [x] T039 [P] [US1] Create last-ball component: shows `lastBall` or "—", bola `min(84vw, 46vh)` con cifra `font-size: 44cqi` (R9), `aria-live="assertive"`, short scale-in animation respecting `prefers-reduced-motion` in `src/ui/components/last-ball.js`
- [x] T040 [P] [US1] Create game screen styles: last ball as dominant element, primary "Sacar bola" button `min-height: var(--tap-primary)` full width in bottom bar, secondary buttons ≥ `var(--tap-min)`, controls in the lower half in portrait in `src/styles/game.css`
- [x] T041 [US1] Wire "Sacar bola": disabled when `!canDraw(state)`; on tap dispatch `drawBall` (single dispatch per tap; ignore taps while a dispatch is in progress to handle rapid double taps); when no balls left show "No quedan bolas" message and offer "Terminar partida" in `src/ui/screens/game-screen.js`
- [x] T042 [US1] Wire "Deshacer": enabled only if `canUndo(state)`; on tap `confirm({ titleKey: 'undo.confirmTitle' })` then dispatch `undoLastBall`; show previous ball as last in `src/ui/screens/game-screen.js`
- [x] T043 [US1] Wire "Nueva partida" and "Terminar partida" with confirmation dialogs (FR-006); cancel leaves game intact; finished game hides draw controls and shows summary + "Nueva partida" in `src/ui/screens/game-screen.js`
- [x] T044 [P] [US1] Add US1 strings (`game.draw`, `game.undo`, `game.noBallsLeft`, `game.finished`, `undo.confirmTitle`, `undo.confirmMessage`, `newGame.confirmTitle`, `newGame.confirmMessage`, `finish.confirmTitle`, `finish.confirmMessage`) to `src/i18n/es.js` and `src/i18n/gl.js`

**Checkpoint**: MVP jugable en el navegador: sacar 90 bolas, deshacer, nueva partida.

---

## Phase 4: User Story 2 - Tablero 1-90 e historial de últimas bolas (Priority: P1)

**Goal**: ver qué números han salido (tablero) y las últimas bolas en orden.

**Independent Test**: sacar 12, 45, 7 → tablero marca exactamente esos 3; historial muestra
7, 45, 12; contador "Bolas: 3 / 90 · Quedan 87" (quickstart escenario 4).

### Implementation for User Story 2

- [x] T045 [P] [US2] Create reusable board component `renderBoard(container, { marked: Set<number>, highlighted?: Set<number>, onToggle?: (n) => void })`: 10 columns × 9 rows (1-90), drawn cells with filled background **and** bold + check mark (not color only, FR-010); interactive mode (buttons with `aria-pressed`) when `onToggle` is passed, otherwise static in `src/ui/components/board.js`
- [x] T046 [P] [US2] Create history component showing the last 5 balls (`getLastBalls(game, 5)`, most recent first); tapping it opens a `<dialog>` with the full draw sequence numbered by position in `src/ui/components/history.js`
- [x] T047 [US2] Integrate board and history into the game screen central area (board below history, scrollable if needed without hiding the bottom bar) in `src/ui/screens/game-screen.js`
- [x] T048 [P] [US2] Add board/history styles: cells ≥ 32 px, high-contrast drawn state in both themes, history chips in `src/styles/game.css`
- [x] T049 [P] [US2] Add US2 strings (`history.title`, `history.fullSequence`, `board.title`, `board.cellDrawn` "{n}, salido", `board.cellPending` "{n}, pendiente") to `src/i18n/es.js` and `src/i18n/gl.js`

**Checkpoint**: US1 + US2 funcionan juntas; el tablero refleja también los "deshacer".

---

## Phase 5: User Story 3 - Recuperar la partida tras un cierre (Priority: P1)

**Goal**: la partida sobrevive a cierres, recargas y reinicios; se ofrece continuarla.

**Independent Test**: sacar 20 bolas, cerrar la app por completo, reabrir → "¿Continuar
partida?" → mismas 20 bolas en orden (quickstart escenario 5).

### Tests for User Story 3 (escribir primero) ⚠️

- [ ] T050 [US3] Write unit tests per contracts/storage-schema.md in `tests/unit/storage.test.js`: `serializeGame` → `parseGame` round-trip equals input (including prizes); `parseGame(null)` → `{ ok: false, reason: 'empty' }`; invalid JSON → `corrupt`; `schemaVersion` greater than supported → `unsupported-version`; `corrupt` when `drawn` has a value outside 1-90, a duplicate, length > 90, `intervalSec` outside 3-30, unknown `status`/`mode`, a prize with wrong count, a prize number not in `drawn`, or positions not satisfying `1 ≤ completionPosition ≤ awardedAtPosition ≤ drawn.length`; `parsePrefs` returns defaults (`lang` from argument, `theme: 'system'`, `inputMethod: 'grid'`, `wakeLockNoticeShown: false`) for missing/invalid fields; `parseGame` never throws
- [ ] T051 [US3] Add unit test for `restoreForResume(game)` forcing `autoPaused = true` while keeping `mode` and `intervalSec` in `tests/unit/game.test.js`

### Implementation for User Story 3

- [ ] T052 [US3] Implement `GAME_SCHEMA_VERSION = 1`, `PREFS_SCHEMA_VERSION = 1`, `serializeGame`, `parseGame`, `serializePrefs`, `parsePrefs(raw, defaultLang)` and identity `migrate(data)` with all validation rules from contracts/storage-schema.md in `src/core/storage.js` — make T050 pass
- [ ] T053 [US3] Implement `restoreForResume` in `src/core/game.js` — make T051 pass
- [ ] T054 [US3] Implement localStorage adapter with keys `my-bingo:game` and `my-bingo:prefs`: `loadGame()`, `saveGame(game)` → `{ saved: boolean }`, `clearGame()`, `loadPrefs(defaultLang)`, `savePrefs(prefs)`, every access wrapped in `try/catch` in `src/ui/persistence.js`
- [ ] T055 [US3] Connect store `onChange` to `saveGame` so the state is written synchronously **before** subscribers re-render the new ball (FR-012); if a save fails show notice `notice.storageUnavailable` once per session in `src/ui/store.js` and `src/main.js`
- [ ] T056 [US3] On startup in `src/main.js`: `loadGame()`; if `ok` and `status = 'in-progress'` and `drawn.length > 0`, show "¿Continuar partida?" dialog — yes → `restoreForResume` and load into store; no → confirm discard then `createGame()`; if `corrupt`/`unsupported-version` show notice `notice.gameCorrupt` and start a new game (FR-014); if `ok` and `finished`, show it as finished
- [ ] T057 [P] [US3] Add US3 strings (`resume.title`, `resume.message` "Hay una partida con {n} bolas. ¿Quieres continuarla?", `resume.continue`, `resume.discard`, `notice.storageUnavailable`, `notice.gameCorrupt`) to `src/i18n/es.js` and `src/i18n/gl.js`

**Checkpoint**: recargar la página en mitad de una partida la recupera intacta.

---

## Phase 6: User Story 6 - Uso cómodo en el móvil sin conexión (Priority: P1)

**Goal**: pantalla siempre encendida e idioma es/gl y tema claro/oscuro seleccionables. (La
instalación offline y el despliegue ya llegan desde la Fase 2; aquí se valida de punta a punta.)

**Independent Test**: abrir una vez con conexión desde GitHub Pages, instalar, modo avión,
reiniciar, jugar una partida completa en gallego y modo oscuro sin que se apague la pantalla
(quickstart escenarios 1, 8, 9, 10, 11).

### Implementation for User Story 6

- [ ] T058 [P] [US6] Implement wake lock module: `acquire()` with `navigator.wakeLock.request('screen')` while a game is in progress and the game view is visible; re-acquire on `visibilitychange` → `visible`; `release()` when the game finishes; if unsupported or rejected show `notice.wakeLockUnsupported` once (persist `wakeLockNoticeShown` in prefs) and continue in `src/ui/wake-lock.js`
- [ ] T059 [P] [US6] Implement theme module: `applyTheme('system' | 'light' | 'dark')` sets/removes `data-theme` on `<html>` and updates `<meta name="theme-color">` from computed tokens; listen to `prefers-color-scheme` changes when `system` in `src/ui/theme.js`
- [ ] T060 [US6] Create settings screen `mountSettingsScreen(root, { prefs, onChange })`: language (Español / Galego) and theme (Sistema / Claro / Oscuro) as radio groups, app version and offline status ("Lista para usar sin conexión"); back button returns to game in `src/ui/screens/settings-screen.js`
- [ ] T061 [P] [US6] Create settings styles (radio groups as large tappable rows ≥ `var(--tap-min)`) in `src/styles/settings.css`
- [ ] T062 [US6] Wire prefs in `src/main.js`: `loadPrefs(detectLang(navigator.languages))` at startup → `setLang`, `applyTheme`; settings changes → `savePrefs`, `setLang` + `applyTranslations(document)`, `applyTheme`; add settings button to game screen top bar; initialize `wake-lock`
- [ ] T063 [P] [US6] Add US6 strings (`settings.title`, `settings.language`, `settings.theme`, `settings.themeSystem`, `settings.themeLight`, `settings.themeDark`, `settings.version`, `settings.offlineReady`, `notice.wakeLockUnsupported`) to `src/i18n/es.js` and `src/i18n/gl.js`

**Checkpoint**: P1 completo. Validar quickstart escenarios 1-5 y 8-11 en un móvil real.

---

## Phase 7: User Story 4 - Comprobar una línea o un bingo cantado (Priority: P2)

**Goal**: introducir los números de una línea (5) o bingo (15), verificar contra las bolas
salidas, avisar de premio tardío, registrar premios y volver a la partida sin cambios.

**Independent Test**: línea con 5 salidos → correcta; con un no salido → no válida señalando
cuál; volver → partida idéntica; cambio cuadrícula↔teclado conserva números (quickstart
escenario 6).

### Tests for User Story 4 (escribir primero) ⚠️

- [ ] T064 [US4] Write unit tests per contracts/game-engine.md in `tests/unit/checker.test.js`: `REQUIRED = { line: 5, bingo: 15 }`; `validateEntry` rejects 0, 91, 1.5 (`not-integer`) and duplicates, accepts 1 and 90; `toggleNumber` adds/removes; `countStatus` reports missing/extra/canSubmit for 3/5, 5/5, 16/15 and `countStatus('bingo', five numbers)` reports `missing: 10`; `checkClaim` throws `GameError('wrong-count')` on wrong count; all drawn → `valid: true`, `missing: []`; one not drawn → `valid: false`, `missing` ascending; with drawn `[..., 23, 50, 8, 66]` and card completed by 23 → `completionNumber: 23`, `ballsSince: 3`; completed by last ball → `ballsSince: 0`; `checkClaim` does not mutate `drawn`; `defaultCheckType` returns `bingo` iff the game has a `line` prize
- [ ] T065 [US4] Add unit tests for `awardPrize` and `hasLine` in `tests/unit/game.test.js`: valid result appends `Prize { type, numbers, completionPosition, awardedAtPosition: drawn.length }`; invalid result throws `GameError('invalid-prize')`; after awarding at current position `canUndo` is false; `hasLine` true after a line prize; multiple line prizes allowed

### Implementation for User Story 4

- [ ] T066 [US4] Implement `REQUIRED`, `validateEntry`, `toggleNumber`, `countStatus`, `checkClaim`, `defaultCheckType` in `src/core/checker.js` — make T064 pass
- [ ] T067 [US4] Implement `awardPrize(game, check, result)` and `hasLine(game)` in `src/core/game.js` — make T065 pass
- [ ] T068 [P] [US4] Create on-screen number pad component: digits 0-9, ⌫, "Añadir"; max 2 digits; calls `validateEntry` and shows inline errors (`check.errorOutOfRange`, `check.errorDuplicate`) in `src/ui/components/number-pad.js`
- [ ] T069 [P] [US4] Create prizes component listing awarded prizes ("Línea · bola 32", "Bingo · bola 58") in `src/ui/components/prizes.js`
- [ ] T070 [US4] Create check screen `mountCheckScreen(root, { getGame, onAward, onBack })`: Línea/Bingo selector defaulting to `defaultCheckType` (changing type keeps the entered numbers and recomputes `countStatus` against the new required count, 5 ↔ 15); counter from `countStatus`; entered numbers as removable chips; input toggle Cuadrícula (reusing `renderBoard` with `onToggle`) / Teclado (`number-pad`), switching preserves numbers and saves `inputMethod` in prefs; "Comprobar" enabled only when `canSubmit`; "Volver a la partida" always in `src/ui/screens/check-screen.js`
- [ ] T071 [US4] Implement result panel in check screen: valid → "Línea correcta" / "¡Bingo correcto!" + late notice "Completada con el {n}, hace {k} bolas" when `ballsSince > 0`, buttons "Conceder premio" (→ `onAward` dispatching `awardPrize`) and "Volver sin conceder"; after awarding a bingo offer "Terminar partida" / "Seguir jugando"; invalid → "Línea/Bingo no válido" with missing numbers highlighted on chips and board, buttons "Corregir números" / "Volver a la partida" in `src/ui/screens/check-screen.js`
- [ ] T072 [US4] Integrate check flow: "Comprobar" button in game bottom bar opens check view via router with a fresh `Check`; returning shows the game unchanged (FR-020, FR-022) and auto mode stays paused on return (no auto-resume); render prizes component in game top area in `src/ui/screens/game-screen.js` and `src/main.js`
- [ ] T073 [P] [US4] Create check screen styles: chips, selector, pad keys ≥ `var(--tap-min)`, primary action in bottom bar, missing numbers marked with color **and** strike/icon in `src/styles/check.css`
- [ ] T074 [P] [US4] Add US4 strings (`check.title`, `check.open`, `check.line`, `check.bingo`, `check.counter` "{current} / {required}", `check.missing` "faltan {n}", `check.extra` "sobran {n}", `check.inputGrid`, `check.inputKeypad`, `check.add`, `check.submit`, `check.backToGame`, `check.lineValid`, `check.bingoValid`, `check.lineInvalid`, `check.bingoInvalid`, `check.notDrawn`, `check.late` "Completada con el {n}, hace {k} bolas", `check.award`, `check.backWithoutAward`, `check.fix`, `check.errorOutOfRange`, `check.errorDuplicate`, `prizes.line` "Línea · bola {pos}", `prizes.bingo` "Bingo · bola {pos}", `prizes.afterBingo`, `prizes.keepPlaying`) to `src/i18n/es.js` and `src/i18n/gl.js`

**Checkpoint**: comprobación completa; los premios se guardan y se recuperan con la partida.

---

## Phase 8: User Story 5 - Sorteo automático (Priority: P2)

**Goal**: sacar bolas solas cada N segundos (3-30, por defecto 5), con pausa/reanudación y
pausas automáticas.

**Independent Test**: intervalo 5 s durante 30 s → ~6 bolas; pausa → no salen más; abrir
comprobación o cambiar de app → se pausa (quickstart escenario 7).

### Tests for User Story 5 (escribir primero) ⚠️

- [ ] T075 [US5] Add unit tests in `tests/unit/game.test.js`: `setMode(game, 'auto')` sets `autoPaused = false`, `setMode(game, 'manual')` sets `autoPaused = true`; `setIntervalSec` accepts 3 and 30, throws `GameError('invalid-interval')` for 2, 31, 4.5; `pauseAuto`/`resumeAuto` toggle `autoPaused` only in auto mode; `resumeAuto` with no balls left throws `GameError('no-balls-left')`

### Implementation for User Story 5

- [ ] T076 [US5] Implement `setMode`, `setIntervalSec`, `pauseAuto`, `resumeAuto` in `src/core/game.js` — make T075 pass
- [ ] T077 [US5] Implement auto-draw controller `createAutoDraw(store)`: chained `setTimeout` every `intervalSec` while `mode = 'auto'` ∧ ¬`autoPaused` ∧ `canDraw`; exposes `secondsToNext` for a countdown; dispatches `pauseAuto` on `visibilitychange` → `hidden`, when the check or settings view opens, when a confirm dialog opens, and when no balls are left in `src/ui/auto-draw.js`
- [ ] T078 [US5] Add auto controls to the game bottom bar: "Automático" start, "Pausa" / "Reanudar", "Manual"; show interval and countdown; disable "Sacar bola" and "Deshacer" while auto is running in `src/ui/screens/game-screen.js`
- [ ] T079 [US5] Add interval control (range 3-30 step 1 + numeric value, default 5) to settings, dispatching `setIntervalSec` in `src/ui/screens/settings-screen.js`
- [ ] T080 [P] [US5] Add US5 strings (`auto.start`, `auto.pause`, `auto.resume`, `auto.manual`, `auto.next` "Próxima bola en {s} s", `auto.interval` "Cada {s} s", `settings.interval`) to `src/i18n/es.js` and `src/i18n/gl.js`

**Checkpoint**: todas las historias funcionan de forma independiente y conjunta.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: quality gates de la constitución y validación final

- [ ] T081 [P] Accessibility pass: verify contrast of every token pair in both themes (document ratios as comments), tap targets ≥ 48 px, focus order, `aria-live` on last ball, dialogs return focus; fix issues in `src/styles/tokens.css` and affected components
- [ ] T082 [P] Landscape fallback: ensure game screen remains usable in landscape (two-column layout: last ball left, board right) in `src/styles/game.css`
- [ ] T083 Review all screens in Galician for untranslated or overflowing strings and fix in `src/i18n/gl.js`
- [ ] T084 Run `npm run lint`, `npm run test:coverage` (≥ 90 % in `src/core/`), `npm run build`, `npm run check-size`, `npm run lhci`; fix any failure
- [ ] T085 Execute all manual scenarios in `specs/001-bombo-bingo-offline/quickstart.md` on a real Android phone (and iPhone if available) in airplane mode and record results in the PR description

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup; **bloquea** todas las historias.
- **US1 (Phase 3)**: depende de Foundational. Es el MVP.
- **US2 (Phase 4)**: depende de Foundational y de la pantalla de partida de US1 (T038).
- **US3 (Phase 5)**: depende de Foundational; se integra con el store (T024) y `main.js`.
  Independiente de US2.
- **US6 (Phase 6)**: depende de Foundational. T060/T062 añaden Ajustes a la pantalla de US1.
- **US4 (Phase 7)**: depende de Foundational, US1 (pantalla de partida) y reutiliza el tablero
  de US2 (T045). Los premios se persisten gracias a US3.
- **US5 (Phase 8)**: depende de Foundational y US1; T079 depende de la pantalla de Ajustes
  (T060, US6).
- **Polish (Phase 9)**: tras las historias deseadas.

### User Story Dependencies

```text
Setup → Foundational ─┬─▶ US1 (MVP) ─┬─▶ US2 ──▶ US4
                      │              ├─▶ US5 (T079 necesita US6/T060)
                      ├─▶ US3        │
                      └─▶ US6 ───────┘
```

### Within Each User Story

- Tests de `src/core/` primero (deben fallar) → implementación del núcleo → componentes UI →
  integración en pantallas → textos i18n.
- Varias tareas editan `src/core/game.js`, `src/ui/screens/game-screen.js` y los diccionarios:
  dentro de una historia se hacen en orden; las tareas [P] tocan archivos distintos.

### Parallel Opportunities

- Setup: T004, T006, T007, T010, T011.
- Foundational: tests T012-T014 juntos; luego T015, T016, T019-T022, T025, T026, T028, T033, T034.
- US1: T039, T040, T044 en paralelo tras T038.
- US2: T045, T046, T048, T049 en paralelo.
- US6: T058, T059, T061, T063 en paralelo.
- US4: T068, T069, T073, T074 en paralelo tras T066-T067.
- Tras Foundational, US3 y US6 pueden avanzar en paralelo con US1.
- Polish: T081, T082.

---

## Parallel Example: Foundational

```bash
# Tests primero, en paralelo:
Task: "Write unit tests for randomInt in tests/unit/rng.test.js"
Task: "Write unit tests for createGame/drawBall in tests/unit/game.test.js"
Task: "Write i18n key parity test in tests/unit/i18n.test.js"

# Implementación independiente en paralelo:
Task: "Implement GameError in src/core/errors.js"
Task: "Implement randomInt in src/core/rng.js"
Task: "Create design tokens in src/styles/tokens.css"
Task: "Create base styles in src/styles/base.css"
```

## Parallel Example: User Story 4

```bash
# Tras T066 y T067:
Task: "Create number pad component in src/ui/components/number-pad.js"
Task: "Create prizes component in src/ui/components/prizes.js"
Task: "Create check screen styles in src/styles/check.css"
Task: "Add US4 strings to src/i18n/es.js and src/i18n/gl.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup.
2. Phase 2: Foundational (bloqueante).
3. Phase 3: US1 → **parar y validar** quickstart escenarios 2 y 3 en el navegador.

### Incremental Delivery (un PR por fase/historia)

1. Setup + Foundational → base lista.
2. US1 → MVP jugable.
3. US2 → tablero e historial.
4. US3 → recuperación de partida.
5. US6 → Wake Lock, idioma/tema → **primera versión usable en una partida real**.
6. US4 → comprobación de línea/bingo y premios.
7. US5 → sorteo automático.
8. Polish → quality gates completas.

Cada PR pasa CI (lint, tests, build) y la autorrevisión con la checklist de la plantilla de PR
antes de fusionar (constitución v1.1.0, flujo de desarrollo). Desde la Fase 2 cada fusión a
`main` se despliega en GitHub Pages.

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes.
- [USn] = trazabilidad con las historias de la spec.
- Verificar que los tests fallan antes de implementar.
- Commit tras cada tarea o grupo lógico; un PR por historia.
- Cualquier funcionalidad fuera del Principio II (cartones, voz, multijugador) requiere enmienda
  de la constitución antes de añadirse.
