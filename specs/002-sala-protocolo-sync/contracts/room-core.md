# Contract: Núcleo de sala (`src/core/room/`) y sesiones (`src/room/`)

Interfaz pública de los módulos de esta feature. Complementa
[../../001-bombo-bingo-offline/contracts/game-engine.md](../../001-bombo-bingo-offline/contracts/game-engine.md),
que **no cambia**. Entidades en [../data-model.md](../data-model.md); mensajes en
[room-protocol.md](./room-protocol.md); transporte en [transport.md](./transport.md).

Convenciones:

- `src/core/room/` es **puro**: sin DOM, sin reloj, sin timers, sin transporte. Las funciones
  son inmutables (devuelven objetos nuevos) y **nunca lanzan** ante datos que llegan de la red;
  los datos inválidos se ignoran o se rechazan con un motivo.
- Los reductores devuelven `{ state, out }`, donde `out` es una lista de `Outgoing`:
  `{ to: 'all', msg }` o `{ to: peerId, msg }` en el cantador, y `msg` en el participante. Los
  `msg` son objetos del protocolo **sin codificar**; las sesiones los codifican.

---

## `src/core/room/constants.js`

`PROTOCOL_VERSION` (1), `MAX_PARTICIPANTS` (40), `ALIAS_MAX` (20), `MAX_MESSAGE_BYTES`
(16384), `HEARTBEAT_MS` (2000), `HOST_SILENCE_MS` (6000), `RESERVATION_MS` (30000),
`HOST_GONE_MS` (300000), `RESYNC_RETRY_MS` (2000), `TICK_MS` (250).

## `src/core/room/alias.js`

| Export | Firma | Contrato |
|---|---|---|
| `sanitizeAlias` | `(raw: unknown) => { ok: true, alias: string, key: string } \| { ok: false }` | Pasos de [research.md](../research.md) R7. `key` = clave de unicidad. Nunca lanza. |

## `src/core/room/protocol.js`

| Export | Firma | Contrato |
|---|---|---|
| `encodeMessage` | `(msg: Message) => string` | `JSON.stringify` con `v` añadido si falta. |
| `decodeMessage` | `(raw: unknown, from: 'host' \| 'participant') => { ok: true, msg } \| { ok: false, reason: 'malformed' \| 'incompatible-version' \| 'too-large' }` | Valida la forma exacta del tipo según su origen. `reject` se acepta con cualquier `v`. Nunca lanza. |

## `src/core/room/view.js`

| Export | Firma | Contrato |
|---|---|---|
| `toSpectatorView` | `(game: Game) => SpectatorView` | Proyección de R6; no modifica `game`. |
| `diffGames` | `(prev: Game, next: Game) => Change[]` | Tabla de R2. `Change` = `{ type: 'ball' \| 'undo', ball }` \| `{ type: 'prize', prize }` \| `{ type: 'end-game' }` \| `{ type: 'snapshot' }`. Lista vacía si no hay cambios compartidos. |
| `applyChange` | `(view: SpectatorView, change: Change) => { ok: true, view } \| { ok: false }` | Aplica `ball`, `undo`, `prize`, `end-game` con las reglas de coherencia del data model (FR-022). |
| `viewsEqual` | `(a, b) => boolean` | Igualdad estructural (para pruebas de convergencia). |

## `src/core/room/host.js`

| Export | Firma | Contrato |
|---|---|---|
| `openRoom` | `({ game, now }) => HostRoom` | `status: 'open'`, `seq: 0`, sin miembros. No emite nada. |
| `hostStep` | `(room, input: HostInput) => { state: HostRoom, out: Outgoing[] }` | Ver tabla de entradas. |
| `getPresence` | `(room) => { count: number, aliases: string[] }` | Solo conectados, en orden de llegada (FR-026). |

`HostInput`:

| `type` | Campos | Efecto |
|---|---|---|
| `game-changed` | `game`, `now` | `diffGames(lastGame, game)`; por cada cambio, `seq += 1` y difusión. Si la sala está cerrada, solo actualiza `lastGame`. |
| `message` | `peerId`, `data` (cadena), `now` | `decodeMessage(data, 'participant')`. `join` → validación del data model (snapshot + `presence`, o `reject`). `resync` de un conectado → snapshot de respuesta. Resto → ignorado. |
| `peer-left` | `peerId`, `now` | Miembro → `reserved` (30 s); `presence` a todos. Peer desconocido → nada. |
| `tick` | `now` | Expira reservas vencidas; si `now − lastHeartbeatAt ≥ HEARTBEAT_MS`, difunde `host-online`. |
| `resume` | `now` | Tras recuperar la red: difunde `host-online` inmediato (FR-024). |
| `close` | `now` | `status = 'closed'`; difunde `end{scope:'room'}`. Idempotente. |

## `src/core/room/participant.js`

| Export | Firma | Contrato |
|---|---|---|
| `createParticipant` | `({ participantId, alias, now }) => ParticipantState` | `connection: 'joining'`, `sync: 'waiting'`, `view: null`. |
| `participantStep` | `(state, input: ParticipantInput) => { state, out: Message[] }` | Reglas de R4 y transiciones del data model. En estados finales, toda entrada se ignora. |

`ParticipantInput`: `{ type: 'status', status: TransportStatus, now }`,
`{ type: 'message', data, now }`, `{ type: 'tick', now }`.

---

## `src/room/transport.js`

Solo `@typedef` JSDoc de `HostTransport`, `ParticipantTransport` y `TransportStatus`
([transport.md](./transport.md)). Sin código ejecutable.

## `src/room/host-session.js`

| Export | Firma | Contrato |
|---|---|---|
| `createHostSession` | `({ transport, clock, game }) => HostSession` | Abre la sala y conecta `hostStep` con el transporte; tick cada `TICK_MS` (250 ms) con `clock.setInterval`. Nunca lanza hacia fuera: cualquier error interno se captura y no afecta a la partida (FR-030). |

`HostSession`: `update(game)` (llamar desde `store.subscribe`), `resume()`, `close()`,
`getPresence()`, `subscribe(fn: (presence) => void) => () => void`.

`clock`: `{ now(): number, setInterval(fn, ms): id, clearInterval(id): void }`.

## `src/room/participant-session.js`

| Export | Firma | Contrato |
|---|---|---|
| `createParticipantSession` | `({ transport, clock, alias, participantId? }) => ParticipantSession` | `participantId` por defecto `randomUUID()` (`src/core/rng.js`). Conecta `participantStep` con el transporte y el tick. |

`ParticipantSession`: `getState()`, `subscribe(fn: (state) => void) => () => void`, `leave()`.
