# Data Model: Bombo de bingo de 90 bolas sin conexión

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Fecha**: 2026-11-02

Todos los datos viven en el dispositivo. Las entidades persistidas son `Game` y `Preferences`;
`Check` y `CheckResult` son transitorios (solo en memoria). El formato en almacenamiento se
define en [contracts/storage-schema.md](./contracts/storage-schema.md).

Convención: una **posición** es el índice 1-based de una bola en el orden de salida
(`drawn[posición - 1]`).

---

## Game (Partida)

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | string | Identificador único de la partida (p. ej. `crypto.randomUUID()`). |
| `startedAt` | string ISO 8601 | Fecha/hora de creación. |
| `status` | `'in-progress' \| 'finished'` | Ver transiciones. |
| `drawn` | number[] | Bolas salidas en orden. Enteros 1-90, **sin duplicados**, longitud 0-90. |
| `mode` | `'manual' \| 'auto'` | Modo de sorteo. |
| `intervalSec` | integer | 3-30, por defecto 5 (FR-007). |
| `autoPaused` | boolean | Solo significativo si `mode = 'auto'`. Siempre `true` tras recuperar (FR-013). |
| `undoLocked` | boolean | `true` justo después de deshacer; vuelve a `false` al sacar una bola (FR-006a). |
| `prizes` | Prize[] | Premios concedidos, en orden de concesión. |

**Derivados (no se guardan)**

- `pending` = {1..90} \ `drawn`; `pendingCount` = 90 − `drawn.length`.
- `lastBall` = `drawn.at(-1)` o `null`.
- `canDraw` = `status = 'in-progress'` ∧ `pendingCount > 0`.
- `canUndo` = `drawn.length > 0` ∧ ¬`undoLocked` ∧ ¬(`mode = 'auto'` ∧ ¬`autoPaused`)
  ∧ no existe premio con `awardedAtPosition = drawn.length` (FR-021c) ∧ `status = 'in-progress'`.
- `hasLine` = existe premio de tipo `line` → la comprobación propone `bingo` (FR-021b).

**Validación al cargar**: si `drawn` contiene valores fuera de 1-90, duplicados, o algún premio
referencia posiciones > `drawn.length`, la partida se considera dañada (FR-014).

### Transiciones de estado

```text
           newGame()
 (ninguna) ─────────▶ in-progress ──draw() × n──▶ in-progress
                          │  ▲                         │
                  undo()  │  │ draw()                  │ drawn.length = 90
                          ▼  │                         ▼
                      in-progress (undoLocked)     in-progress (canDraw = false)
                          │
   finish()  (tras bingo correcto, o por el cantador)  │
                          ▼                            ▼
                       finished ◀──────────────────────┘ finish()

 in-progress / finished ──newGame() (con confirmación)──▶ nueva Game in-progress
```

- `draw()`: añade una bola pendiente aleatoria; pone `undoLocked = false`.
- `undo()`: quita la última bola; pone `undoLocked = true`.
- `setMode('auto' | 'manual')`, `setInterval(n)`, `pauseAuto()`, `resumeAuto()`.
- `awardPrize(check)`: añade un `Prize` a partir de un `CheckResult` válido.
- `finish()`: `status = 'finished'`; se detiene el sorteo automático. Una partida terminada sigue
  mostrándose (tablero, historial, premios) hasta iniciar otra.
- Con 90 bolas salidas la partida no pasa sola a `finished`: el cantador aún puede comprobar
  premios; la app muestra "no quedan bolas" y ofrece terminar.

---

## Prize (Premio)

| Campo | Tipo | Reglas |
|---|---|---|
| `type` | `'line' \| 'bingo'` | |
| `numbers` | number[] | 5 (línea) o 15 (bingo) números únicos 1-90, todos presentes en `drawn`. |
| `completionPosition` | integer | Máxima posición en `drawn` de cualquiera de `numbers` (FR-019a). |
| `awardedAtPosition` | integer | `drawn.length` en el momento de concederlo; ≥ `completionPosition`. |

Relación: `Game 1 ── 0..n Prize`. No hay límite de premios (varias líneas en la misma bola).

---

## Check (Comprobación, transitoria)

| Campo | Tipo | Reglas |
|---|---|---|
| `type` | `'line' \| 'bingo'` | Por defecto `bingo` si `hasLine`, si no `line`. |
| `numbers` | number[] | Únicos, 1-90. Se conservan al cambiar de tipo o de método de entrada. |
| `inputMethod` | `'grid' \| 'keypad'` | Inicial: el de `Preferences`. |

- `requiredCount` = 5 si `line`, 15 si `bingo`.
- `canSubmit` = `numbers.length = requiredCount` (FR-018); si no, se muestra
  `requiredCount − numbers.length` (faltan) o el exceso (sobran).
- Añadir desde teclado: rechazo con motivo `out-of-range` o `duplicate` (FR-017).

## CheckResult (transitorio)

| Campo | Tipo | Reglas |
|---|---|---|
| `valid` | boolean | `true` si todos los `numbers` están en `drawn`. |
| `missing` | number[] | Números del cartón que no han salido (orden ascendente). |
| `completionNumber` | number \| null | Número del cartón con mayor posición en `drawn` (solo si `valid`). |
| `completionPosition` | integer \| null | Posición de `completionNumber`. |
| `ballsSince` | integer | `drawn.length − completionPosition`; `> 0` → aviso "hace N bolas". |

Una comprobación no modifica `drawn` (FR-022). Solo `awardPrize` modifica la partida.

---

## Preferences (Preferencias)

| Campo | Tipo | Reglas |
|---|---|---|
| `lang` | `'es' \| 'gl'` | Inicial: `gl` si el idioma del dispositivo empieza por `gl`, si no `es`. |
| `theme` | `'system' \| 'light' \| 'dark'` | Inicial `system`. |
| `inputMethod` | `'grid' \| 'keypad'` | Inicial `grid`; guarda el último usado (FR-016). |
| `wakeLockNoticeShown` | boolean | Para avisar solo una vez si no se puede mantener la pantalla. |

Independiente de la partida: empezar una nueva no la borra.
