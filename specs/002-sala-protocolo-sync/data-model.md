# Data Model: Núcleo de sincronización de la sala compartida

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Fecha**: 2026-11-09

Todo vive **solo en memoria** (Principio I): nada de esta feature se persiste. `Game` y
`Prize` son los de la feature 001
([../001-bombo-bingo-offline/data-model.md](../001-bombo-bingo-offline/data-model.md)) y no se
modifican. El formato de los mensajes está en
[contracts/room-protocol.md](./contracts/room-protocol.md).

Tiempos en milisegundos (`now` inyectado). Constantes: `MAX_PARTICIPANTS = 40`,
`ALIAS_MAX = 20`, `HEARTBEAT_MS = 2000`, `HOST_SILENCE_MS = 6000`, `RESERVATION_MS = 30000`,
`HOST_GONE_MS = 300000`, `RESYNC_RETRY_MS = 2000`, `TICK_MS = 250`, `PROTOCOL_VERSION = 1`.

---

## SpectatorView (lo que ve un espectador)

Proyección de una `Game`, calculada con `toSpectatorView(game)`. Es el contenido del snapshot.

| Campo | Tipo | Reglas |
|---|---|---|
| `gameId` | string | `= game.id`. |
| `status` | `'in-progress' \| 'finished'` | `= game.status`. |
| `drawn` | number[] | Copia de `game.drawn`: enteros 1-90, sin duplicados, longitud 0-90. |
| `prizes` | SpectatorPrize[] | En orden de concesión. |

**SpectatorPrize**: `{ type: 'line' | 'bingo', completionPosition, awardedAtPosition }`, con
`1 ≤ completionPosition ≤ awardedAtPosition ≤ drawn.length`.

Validación (al decodificar un snapshot): si no se cumple alguna regla, el mensaje es
`malformed` y se ignora.

---

## HostRoom (estado del cantador)

| Campo | Tipo | Reglas |
|---|---|---|
| `status` | `'open' \| 'closed'` | `closed` es final. |
| `seq` | integer ≥ 0 | Versión del estado compartido; 0 al abrir. Ver R3. |
| `lastGame` | Game | Última partida vista; base de `diffGames`. |
| `view` | SpectatorView | `toSpectatorView(lastGame)`; se envía en los snapshots de respuesta. |
| `members` | Map<participantId, Member> | Conectados + reservados; tamaño ≤ 40. |
| `peers` | Map<peerId, participantId> | Conexión actual de cada miembro conectado. |
| `lastHeartbeatAt` | number | Momento del último `host-online` emitido. |

**Member**:

| Campo | Tipo | Reglas |
|---|---|---|
| `participantId` | string | 8-64 caracteres `[A-Za-z0-9-]`. Nunca se envía a otros. |
| `alias` | string | Saneado (R7), 1-20 grafemas. |
| `aliasKey` | string | `alias.normalize('NFKC').toLowerCase()`; único entre miembros. |
| `status` | `'connected' \| 'reserved'` | |
| `peerId` | string \| null | `null` si `reserved`. |
| `reservedUntil` | number \| null | `now + RESERVATION_MS` al desconectarse; `null` si conectado. |

**Derivados**: `connectedCount` = miembros `connected` (lo que ven todos, FR-026/027);
`occupiedSeats` = `members.size` (para "sala llena", FR-011); `presence` = alias de los
`connected` ordenados por orden de llegada (solo para el cantador).

### Transiciones (cantador)

```text
 openRoom(game, now) ──▶ open (seq 0, sin miembros)
   open ── game-changed ──▶ open (seq += 1 por cada evento; broadcast)
   open ── join válido ───▶ open (+ miembro connected; snapshot al peer; presence a todos)
   open ── join inválido ─▶ open (reject al peer; sin cambios)
   open ── peer-left ─────▶ open (miembro → reserved, reservedUntil = now + 30 s; presence)
   open ── tick ──────────▶ open (expira reservas vencidas; latido si toca)
   open ── closeRoom ─────▶ closed (end{scope:'room'} a todos)
 closed ── join ──────────▶ closed (reject 'room-closed')
```

**Validación de `join`** (en este orden; primer fallo = motivo de `reject`):

1. `v ≠ PROTOCOL_VERSION` → `incompatible-version`.
2. Sala `closed` → `room-closed`.
3. `participantId` existente (conectado o reservado) → se acepta como **reconexión** sin
   validar el alias: sustituye `peerId`, vuelve a `connected` y conserva su alias original (el
   alias del nuevo `join` se ignora). Ni "sala llena" ni "alias en uso" aplican.
4. Alias inválido tras sanear → `alias-invalid`.
5. `aliasKey` usado por otro miembro (conectado o reservado) → `alias-taken`.
6. `occupiedSeats = 40` → `room-full`.
7. Aceptar.

---

## ParticipantState (estado de cada espectador)

| Campo | Tipo | Reglas |
|---|---|---|
| `participantId` | string | Generado una vez por sesión (inyectado). |
| `alias` | string | El pedido; el saneado definitivo lo confirma el snapshot de bienvenida. |
| `connection` | ver abajo | |
| `sync` | `'waiting' \| 'synced' \| 'desynced'` | `waiting` hasta el primer snapshot. |
| `view` | SpectatorView \| null | Último estado válido conocido; nunca se borra al desconectar. |
| `seq` | integer \| null | Última secuencia aplicada. |
| `participantCount` | integer \| null | De `presence`. |
| `rejectReason` | RejectReason \| null | Solo si `connection = 'rejected'`. |
| `lastHostMessageAt` | number | Para el silencio de 6 s. |
| `hostOfflineSince` | number \| null | Para los 5 min. |
| `lastResyncAt` | number \| null | Para limitar `resync` a uno cada 2 s. |

**connection**: `'joining' | 'connected' | 'host-offline' | 'closed' | 'unavailable' |
'rejected'`. Los tres últimos son **finales**: no se reintenta ni se aplican más mensajes.

### Transiciones (participante)

```text
 start ──▶ joining ── snapshot ──▶ connected/synced
 joining ── reject ─▶ rejected (final)
 connected ── evento seq = s+1 coherente ─▶ connected/synced (aplica)
 connected ── hueco / incoherente / lastSeq > s ─▶ connected/desynced (+ resync)
 desynced ── snapshot seq ≥ s ─▶ synced
 connected ── 6 s sin mensajes del cantador ó host-offline ─▶ host-offline
 host-offline ── cualquier mensaje del cantador ─▶ connected (resync si va por detrás)
 host-offline ── 5 min seguidos ─▶ unavailable (final)
 cualquiera no final ── canal 'disconnected' ─▶ joining (reenvía join al reconectar)
 cualquiera no final ── canal 'room-unavailable' ─▶ unavailable (final)
 cualquiera no final ── end{scope:'room'} ─▶ closed (final)
 cualquiera ── end{scope:'game'} seq = s+1 ─▶ view.status = 'finished'
```

**Coherencia de eventos (FR-022)** sobre `view` sincronizada:

- `ball`: `status = 'in-progress'`, `ball ∉ drawn`, `drawn.length < 90`.
- `undo`: `drawn.length > 0` y `ball = drawn.at(-1)`; ningún premio con
  `awardedAtPosition = drawn.length`.
- `prize`: `1 ≤ completionPosition ≤ awardedAtPosition = drawn.length`.
- `end{scope:'game'}`: `status = 'in-progress'`.

---

## RejectReason

`'alias-invalid' | 'alias-taken' | 'room-full' | 'incompatible-version' | 'room-closed'`.
Las cadenas visibles ("alias no válido", etc.) se traducirán a es/gl en la feature de UI.
