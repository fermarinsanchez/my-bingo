# Contract: Esquema de almacenamiento local

Formato persistido en `localStorage`. Es un contrato con **versiones anteriores de la propia
app** (principio III: formato versionado con migración). Cualquier cambio incompatible MUST
incrementar `schemaVersion` y añadir una migración en `migrate()`.

## Clave `my-bingo:game`

```json
{
  "schemaVersion": 1,
  "id": "3f1c…",
  "startedAt": "2026-11-02T18:30:00.000Z",
  "status": "in-progress",
  "drawn": [12, 45, 7],
  "mode": "auto",
  "intervalSec": 5,
  "autoPaused": false,
  "undoLocked": false,
  "prizes": [
    {
      "type": "line",
      "numbers": [3, 18, 25, 61, 77],
      "completionPosition": 31,
      "awardedAtPosition": 32
    }
  ]
}
```

Reglas de validación en lectura (cualquier fallo → `corrupt`):

- `schemaVersion` entero; mayor que el soportado → `unsupported-version`.
- `status` ∈ {`in-progress`, `finished`}; `mode` ∈ {`manual`, `auto`}.
- `drawn`: array de enteros 1-90 sin duplicados, longitud ≤ 90.
- `intervalSec` entero 3-30; `autoPaused`, `undoLocked` booleanos.
- Cada premio: `type` válido; `numbers` con 5 / 15 enteros únicos, todos en `drawn`;
  `1 ≤ completionPosition ≤ awardedAtPosition ≤ drawn.length`.

Al cargar para continuar, se aplica `restoreForResume` (`autoPaused = true`) aunque el valor
guardado sea `false`.

Escritura: tras `drawBall`, `undoLastBall`, `awardPrize`, `finishGame`, `setMode`,
`setIntervalSec`, `pauseAuto`, `resumeAuto` y `createGame` (FR-012). La escritura se hace
**antes** de mostrar la nueva bola.

## Clave `my-bingo:prefs`

```json
{
  "schemaVersion": 1,
  "lang": "gl",
  "theme": "system",
  "inputMethod": "grid",
  "wakeLockNoticeShown": false
}
```

Cualquier campo ausente o inválido se sustituye por su valor por defecto (sin aviso).

## Sin otros datos

No se guardan cookies ni otras claves. No se envía nada fuera del dispositivo.
