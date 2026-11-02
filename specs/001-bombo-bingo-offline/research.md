# Research: Bombo de bingo de 90 bolas sin conexión

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Fecha**: 2026-11-02

Cada decisión sigue el formato Decisión / Justificación / Alternativas. El stack base
(Vanilla JS + Vite + vite-plugin-pwa, GitHub Pages) viene fijado por la constitución; aquí se
resuelven los detalles.

---

## R1. Lenguaje y tipado

- **Decisión**: JavaScript ES2022 con módulos ES nativos. Tipos documentados con JSDoc y
  comprobación con `// @ts-check` en los módulos de `src/core/` (sin paso de compilación TS).
- **Justificación**: la constitución pide Vanilla JS. JSDoc da autocompletado y detección de
  errores en el editor sin añadir TypeScript al build.
- **Alternativas**: TypeScript (más seguridad, pero añade compilación y no fue la opción
  elegida); JS sin tipos (más errores silenciosos en la lógica clave).

## R2. Generador aleatorio y estrategia de sorteo

- **Decisión**: sorteo **bajo demanda**: en cada bola se elige un índice uniforme entre las
  bolas pendientes con `crypto.getRandomValues` y **muestreo por rechazo** (evita el sesgo del
  módulo). No se pre-baraja el orden completo.
- **Justificación**: el principio III exige `crypto.getRandomValues` y uniformidad. Sortear bajo
  demanda encaja con "deshacer" (la bola devuelta vuelve al bombo y puede salir en cualquier
  momento) y no guarda un orden futuro que se pueda filtrar o manipular.
- **Alternativas**: Fisher-Yates al inicio (equivalente en probabilidad, pero deshacer obliga a
  reinsertar en el orden y el futuro queda predeterminado en almacenamiento); `Math.random`
  (prohibido por la constitución).
- **Inyección para tests**: el motor recibe una función `randomInt(n)` inyectable para tener
  tests deterministas; la de producción usa `crypto`.

## R3. Persistencia local

- **Decisión**: `localStorage`, con dos claves versionadas: `my-bingo:game` y
  `my-bingo:prefs`. Cada valor es JSON con `schemaVersion`. Escritura síncrona tras cada cambio
  de estado de la partida.
- **Justificación**: el estado ocupa < 2 KB; la escritura síncrona garantiza que el dato está
  guardado antes de mostrar la bola (principio III: "un cierre inesperado nunca pierde más que la
  acción en curso"). IndexedDB es asíncrono y más complejo sin ningún beneficio a este tamaño.
- **Alternativas**: IndexedDB (asíncrono, más código); Cache API (no pensada para estado).
- **Fallos**: toda lectura/escritura en `try/catch`. Si escribir falla (modo privado, cuota),
  la app sigue en memoria y muestra un aviso una vez (edge case de la spec). Datos ilegibles o de
  un `schemaVersion` desconocido → se descartan con aviso y se ofrece partida nueva (FR-014).

## R4. Service worker, precache y actualizaciones

- **Decisión**: `vite-plugin-pwa` en modo `generateSW` (Workbox) con precache de todos los
  assets del build (`globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}']`),
  `registerType: 'prompt'` y **sin `skipWaiting` automático**. La versión nueva queda en espera y
  se activa al reabrir la app; si no hay partida en curso se ofrece "Actualizar ahora".
- **Justificación**: principio I, "las actualizaciones nunca interrumpen ni borran una partida".
  Con `autoUpdate` la página podría recargarse sola en mitad de una partida.
- **Alternativas**: `autoUpdate` (riesgo de recarga en partida); `injectManifest` con SW propio
  (más control, más código; innecesario).
- **Manifest**: `name`, `short_name`, `lang: es`, `display: standalone`,
  `orientation: portrait`, `start_url` y `scope` relativos a la subruta de GitHub Pages,
  `theme_color`/`background_color`, iconos 192, 512 y 512 *maskable*.

## R5. Mantener la pantalla encendida

- **Decisión**: Screen Wake Lock API (`navigator.wakeLock.request('screen')`) mientras hay una
  partida en curso visible. Se vuelve a pedir en `visibilitychange` → `visible`, porque el
  navegador la libera al pasar a segundo plano. Si la API no existe o la petición falla, se
  muestra un aviso una vez y la app sigue (FR-025).
- **Justificación**: soporte en Chrome Android y Safari iOS 16.4+ (en PWA instalada en iOS desde
  18.4). Es la única vía estándar sin dependencias.
- **Alternativas**: truco del vídeo silencioso en bucle (NoSleep.js): frágil, consume batería y
  añade dependencia; descartado.

## R6. Sorteo automático y segundo plano

- **Decisión**: temporizador con `setTimeout` encadenado (no `setInterval`), gestionado por un
  módulo `auto-draw` de la capa UI. Se pausa en: apertura de comprobación, `visibilitychange` →
  `hidden`, fin de bolas y apertura de diálogos de confirmación. Al recuperar la partida tras un
  cierre, el modo automático se restaura en pausa (FR-013).
- **Justificación**: `setTimeout` encadenado evita disparos acumulados cuando el navegador
  ralentiza temporizadores; pausar en segundo plano cumple el edge case "no sacar bolas que nadie
  ve".
- **Alternativas**: `setInterval` (puede encadenar disparos al volver de segundo plano).

## R7. Internacionalización (es / gl)

- **Decisión**: diccionarios planos en `src/i18n/es.js` y `src/i18n/gl.js` (objetos clave →
  texto, con interpolación simple `{n}`), función `t(key, params)` y atributos `data-i18n` en el
  HTML para re-renderizar al cambiar idioma. Idioma inicial: `gl` si `navigator.languages`
  empieza por `gl`, si no `es` (FR-026). Se actualiza `<html lang>`.
- **Justificación**: dos idiomas y ~80 cadenas no justifican una librería. Un test unitario
  verifica que ambos diccionarios tienen exactamente las mismas claves y ninguna vacía (SC-009).
- **Alternativas**: i18next o similar (peso y dependencia innecesarios); `Intl.MessageFormat`
  (no estándar todavía).

## R8. Temas claro/oscuro y contraste

- **Decisión**: tokens de color como variables CSS en `:root`, redefinidos bajo
  `@media (prefers-color-scheme: dark)` y forzados con `<html data-theme="light|dark">`. Valor de
  preferencia `system | light | dark`. Se actualiza `<meta name="theme-color">`.
- **Justificación**: sin JS para el caso por defecto, sin parpadeo; contraste AA verificable por
  par de tokens.
- **Alternativas**: dos hojas CSS separadas (duplicación).

## R9. Tipografía y tamaño de la última bola

- **Decisión**: fuentes del sistema (`system-ui`), cifras tabulares
  (`font-variant-numeric: tabular-nums`). La última bola se dimensiona con
  `font-size: min(45vw, 32vh)` para ocupar la parte principal de la pantalla en vertical (SC-003:
  legible a 3 m ≈ cifras de > 4 cm de alto en un móvil de 6").
- **Justificación**: sin descarga de fuentes (offline y presupuesto de tamaño).
- **Alternativas**: fuente web incrustada (+20-40 KB sin beneficio claro).

## R10. Diálogos y entrada de números

- **Decisión**: confirmaciones con `<dialog>` nativo (`showModal()`), accesible y con foco
  gestionado por el navegador. Cuadrícula 1-90 de la comprobación como botones con
  `aria-pressed`. Teclado numérico propio en pantalla (botones 0-9, borrar, añadir) en lugar del
  teclado del sistema, para que no tape la lista y funcione igual en Android e iOS.
- **Justificación**: nativo, cero dependencias, buen soporte en móviles actuales.
- **Alternativas**: `<input type="number" inputmode="numeric">` (el teclado del sistema ocupa
  media pantalla y varía por plataforma).

## R11. Testing, lint y presupuesto de tamaño

- **Decisión**:
  - **Vitest** (entorno `node`) para `src/core/**` y `src/i18n/**`: sorteo, motor de partida,
    comprobación, serialización y paridad de diccionarios. Cobertura mínima del 90 % en
    `src/core/` como umbral en CI.
  - **ESLint 9** (flat config, `@eslint/js` recomendado) + Prettier opcional.
  - **Presupuesto**: script `check-size` en CI que falla si JS+CSS iniciales comprimidos con gzip
    superan 100 KB (constitución, restricciones técnicas).
  - **Lighthouse CI** (`@lhci/cli`) sobre el build servido en local: umbral Accesibilidad ≥ 90.
  - Verificación manual en móvil real en modo avión antes de fusionar (principio VI).
- **Justificación**: cumple principio VI y quality gates del flujo de desarrollo con
  herramientas estándar del ecosistema Vite.
- **Nota**: Lighthouse 12+ eliminó la categoría "PWA". La instalabilidad se verifica con el panel
  *Application* de Chrome DevTools y con la comprobación manual de instalación (ver
  [quickstart.md](./quickstart.md)), tal como recoge la constitución v1.1.0.
- **Alternativas**: Jest (más configuración con ESM); Playwright E2E (no exigido; se puede añadir
  después).

## R12. Despliegue en GitHub Pages

- **Decisión**: `base` de Vite configurable por la variable de entorno `BASE_PATH` (por defecto
  `/my-bingo/`). Workflow `deploy.yml` con
  `actions/upload-pages-artifact` + `actions/deploy-pages` al hacer push a `main`. Workflow
  `ci.yml` en cada PR: `npm ci`, lint, test con cobertura, build, check-size, Lighthouse CI.
- **Justificación**: el service worker y el manifest necesitan rutas absolutas coherentes con la
  subruta del repositorio; la variable permite cambiar de repo o dominio sin tocar código.
- **Alternativas**: rama `gh-pages` con `gh-pages` npm (método antiguo); base relativa `./`
  (rompe el `scope` del service worker en rutas profundas).

## R13. Versión de Node y herramientas

- **Decisión**: Node.js 22 LTS (fijado en `.nvmrc` y `engines`), npm. Versiones de dependencias
  fijadas en `package-lock.json`; se usan las últimas estables de Vite, vite-plugin-pwa, Vitest y
  ESLint en el momento de `/speckit-implement`.
- **Justificación**: LTS activa, soportada por GitHub Actions.
