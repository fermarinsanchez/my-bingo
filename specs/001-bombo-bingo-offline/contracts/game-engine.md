# Contract: Motor de juego (`src/core/`)

Interfaz pública de los módulos puros de lógica. No acceden al DOM, al almacenamiento ni a
temporizadores; reciben y devuelven datos. Son la superficie cubierta por los tests unitarios
obligatorios (constitución, principio VI). Entidades en [../data-model.md](../data-model.md).

Convención: todas las funciones son **inmutables**: devuelven un objeto `Game` nuevo y nunca
modifican el recibido. Los errores de uso se lanzan como `GameError` con un `code` estable.

---

## `src/core/rng.js`

| Export | Firma | Contrato |
|---|---|---|
| `randomInt` | `(n: number) => number` | Entero uniforme en `[0, n)`. Usa `crypto.getRandomValues` con muestreo por rechazo. Lanza `RangeError` si `n` no es entero en `1..2^32`. |

## `src/core/game.js`

| Export | Firma | Contrato |
|---|---|---|
| `TOTAL_BALLS` | `90` | |
| `INTERVAL_MIN`, `INTERVAL_MAX`, `INTERVAL_DEFAULT` | `3`, `30`, `5` | |
| `createGame` | `(opts?: { now?: Date, id?: string }) => Game` | `status: 'in-progress'`, `drawn: []`, `mode: 'manual'`, `intervalSec: 5`, `autoPaused: true`, `undoLocked: false`, `prizes: []`. |
| `drawBall` | `(game: Game, randomInt?: (n) => number) => { game: Game, ball: number }` | Elige `pending[randomInt(pending.length)]` con `pending` ordenado ascendente. Lanza `GameError('no-balls-left')` si no quedan, `GameError('game-finished')` si está terminada. |
| `undoLastBall` | `(game: Game) => { game: Game, ball: number }` | Requiere `canUndo(game)`; si no, `GameError('undo-not-allowed')`. |
| `setMode` | `(game, mode: 'manual' \| 'auto') => Game` | Al pasar a `auto`, `autoPaused = false`. Al pasar a `manual`, `autoPaused = true`. |
| `setIntervalSec` | `(game, sec: number) => Game` | `GameError('invalid-interval')` si no es entero en 3-30. |
| `pauseAuto` / `resumeAuto` | `(game) => Game` | Sin efecto si `mode = 'manual'`. `resumeAuto` lanza `GameError('no-balls-left')` si no quedan. |
| `awardPrize` | `(game, check: Check, result: CheckResult) => Game` | Requiere `result.valid`; si no, `GameError('invalid-prize')`. Añade `Prize` con `awardedAtPosition = drawn.length`. |
| `finishGame` | `(game) => Game` | `status = 'finished'`, `autoPaused = true`. |
| `getPending` | `(game) => number[]` | Ascendente. |
| `getLastBalls` | `(game, k: number) => number[]` | Últimas `k`, de la más reciente a la más antigua. |
| `canDraw`, `canUndo`, `hasLine` | `(game) => boolean` | Según [data-model.md](../data-model.md#game-partida). |
| `restoreForResume` | `(game) => Game` | Fuerza `autoPaused = true` (FR-013). |

## `src/core/checker.js`

| Export | Firma | Contrato |
|---|---|---|
| `REQUIRED` | `{ line: 5, bingo: 15 }` | |
| `validateEntry` | `(numbers: number[], value: number) => { ok: true } \| { ok: false, reason: 'out-of-range' \| 'duplicate' \| 'not-integer' }` | Para entrada por teclado (FR-017). |
| `toggleNumber` | `(numbers: number[], value: number) => number[]` | Para la cuadrícula: añade si no está, quita si está. |
| `countStatus` | `(type, numbers) => { required, current, missing: number, extra: number, canSubmit: boolean }` | FR-018. |
| `checkClaim` | `(drawn: number[], type, numbers: number[]) => CheckResult` | Lanza `GameError('wrong-count')` si `numbers.length ≠ REQUIRED[type]`. `missing` ascendente. `completionNumber/Position` y `ballsSince` solo si `valid` (FR-019, FR-019a). Nunca modifica `drawn` (FR-022). |
| `defaultCheckType` | `(game) => 'line' \| 'bingo'` | `bingo` si `hasLine(game)` (FR-021b). |

## `src/core/storage.js` (serialización pura)

| Export | Firma | Contrato |
|---|---|---|
| `GAME_SCHEMA_VERSION`, `PREFS_SCHEMA_VERSION` | `1` | |
| `serializeGame` | `(game) => string` | JSON según [storage-schema.md](./storage-schema.md). |
| `parseGame` | `(raw: string \| null) => { ok: true, game } \| { ok: false, reason: 'empty' \| 'corrupt' \| 'unsupported-version' }` | Valida todas las reglas del modelo. Nunca lanza. |
| `serializePrefs` / `parsePrefs` | análogos | `parsePrefs` devuelve valores por defecto ante cualquier error. |
| `migrate` | `(data: object) => object` | Punto de extensión para futuras versiones; v1 → v1 identidad. |

El adaptador con efectos (`src/ui/persistence.js`) envuelve `localStorage` en `try/catch` y
devuelve `{ saved: boolean }`; no forma parte del núcleo puro.

## Códigos de `GameError`

`no-balls-left`, `game-finished`, `undo-not-allowed`, `invalid-interval`, `invalid-prize`,
`wrong-count`.
