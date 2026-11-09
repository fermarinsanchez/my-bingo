---

description: "Task list for feature 002-sala-protocolo-sync"
---

# Tasks: Núcleo de sincronización de la sala compartida

**Input**: Design documents from `/specs/002-sala-protocolo-sync/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: OBLIGATORIOS (constitución, Principio VI; spec SC-009): snapshot, duplicados,
perdidos, desordenados, versión incompatible, límite de 40 y alias saneado. Cada módulo se
implementa con TDD: la tarea de pruebas va antes y sus pruebas deben fallar primero. No hay
UI: toda la validación es automática ([quickstart.md](./quickstart.md)).

**Organization**: tareas agrupadas por historia de usuario en orden de prioridad: US1 (P1) →
US2 (P1) → US3 (P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario de la spec (US1…US3)
- Rutas relativas a la raíz del repositorio (proyecto único, ver plan.md)

**Reglas comunes para todas las tareas**:

- `src/core/room/*.js`: `// @ts-check` y tipos JSDoc; **sin** DOM, reloj, timers ni
  transporte; funciones inmutables; **nunca lanzan** ante datos de la red (devuelven
  `{ ok: false, ... }` o ignoran).
- `src/room/*.js`: `// @ts-check`; reloj y transporte siempre inyectados; sin DOM.
- **Prohibido modificar** `src/core/game.js`, `src/core/errors.js` y el resto de módulos de la
  001 (FR-002). Ningún archivo de `src/ui/` ni `src/main.js` importa la sala en esta feature.
- Sin dependencias nuevas (ni de ejecución ni de desarrollo).
- Las pruebas usan reloj virtual (`now` explícito) y el PRNG con semilla de `tests/support/`;
  nunca `Math.random`, `Date.now` ni esperas reales.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: preparar estructura, cobertura y lint para el código de sala

- [ ] T001 Create directories `src/core/room/`, `src/room/`, `tests/support/` and `tests/unit/room/` (plan.md › Source Code)
- [ ] T002 Extend Vitest coverage in `vite.config.js`: `coverage.include: ['src/core/**', 'src/room/**']`, keeping thresholds lines/functions/branches/statements = 90 (the existing `test.include: ['tests/unit/**/*.test.js']` already covers `tests/unit/room/`)
- [ ] T003 [P] Ensure `eslint.config.js` applies the tests config (node + vitest globals) to `tests/support/**` as well as `tests/unit/**`, and browser globals to `src/room/**`; run `npm run lint` with no errors

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: constantes, codificación de mensajes, vista de espectador y transporte falso que
necesitan todas las historias

**⚠️ CRITICAL**: ninguna historia puede empezar hasta completar esta fase

- [ ] T004 [P] Create `src/core/room/constants.js` exporting `PROTOCOL_VERSION = 1`, `MAX_PARTICIPANTS = 40`, `ALIAS_MAX = 20`, `MAX_MESSAGE_BYTES = 16384`, `HEARTBEAT_MS = 2000`, `HOST_SILENCE_MS = 6000`, `RESERVATION_MS = 30000`, `HOST_GONE_MS = 300000`, `RESYNC_RETRY_MS = 2000`, `TICK_MS = 250` (contracts/room-core.md)
- [ ] T005 [P] Create JSDoc-only typedefs `HostTransport`, `ParticipantTransport` and `TransportStatus` (`'connected' | 'disconnected' | 'host-offline' | 'room-unavailable'`) plus `Clock` (`{ now(): number, setInterval(fn, ms), clearInterval(id) }`) in `src/room/transport.js`, exactly as in contracts/transport.md; no executable code besides `export {}`
- [ ] T006 [P] Write failing tests for `toSpectatorView`, `applyChange` and `viewsEqual` in `tests/unit/room/view.test.js`: projection keeps only `gameId`, `status`, `drawn` (copy) and `prizes` as `{ type, completionPosition, awardedAtPosition }` (no `numbers`, `mode`, `intervalSec`, `autoPaused`, `undoLocked`, `startedAt`) and never mutates the `Game`; `applyChange` coherence rules from data-model.md: `ball` requires `status = 'in-progress'`, `ball ∉ drawn`, `drawn.length < 90`; `undo` requires `drawn.length > 0`, `ball = drawn.at(-1)` and no prize with `awardedAtPosition = drawn.length`; `prize` requires `1 ≤ completionPosition ≤ awardedAtPosition = drawn.length`; `end-game` requires `status = 'in-progress'`; any violation → `{ ok: false }` and input view unchanged
- [ ] T007 Implement `toSpectatorView`, `applyChange` and `viewsEqual` in `src/core/room/view.js` until T006 passes (`diffGames` is added in US1)
- [ ] T008 [P] Write failing tests for `encodeMessage`/`decodeMessage` in `tests/unit/room/protocol.test.js` covering every type and field of contracts/room-protocol.md for both origins (`from: 'host' | 'participant'`): valid round-trip for each example; `malformed` for non-string input, invalid JSON, non-object, missing/extra-typed fields, `ball` outside 1-90, negative or non-integer `seq`/`lastSeq`/`count`, `count > 40`, `end` without valid `scope`, `end{scope:'game'}` without `seq`, snapshot `view` breaking SpectatorView rules (duplicates, values outside 1-90, length > 90, prize positions out of range), unknown `type`, a host-only type sent `from: 'participant'` and vice versa; `too-large` for strings over `MAX_MESSAGE_BYTES` (16384 bytes measured in UTF-8); `incompatible-version` for `v ≠ 1`, except `reject`, which decodes with any `v`; unknown extra fields ignored; decoding never throws (wrap a fuzz loop of 1 000 random strings/objects with seeded PRNG in `expect(() => …).not.toThrow()`)
- [ ] T009 Implement `encodeMessage` and `decodeMessage` in `src/core/room/protocol.js` (adds `v: PROTOCOL_VERSION` if absent; size check before `JSON.parse`; strict per-type validators reusing SpectatorView validation) until T008 passes
- [ ] T010 [P] Create seeded PRNG `mulberry32(seed)` and helpers (`chance(p)`, `int(n)`) in `tests/support/prng.js`
- [ ] T011 Create in-memory hub `createMemoryHub({ seed, drop = 0, duplicate = 0, maxDelayMs = 0 })` in `tests/support/memory-transport.js` per contracts/transport.md: virtual clock `now()`/`advance(ms)` backed by a single time-ordered event queue (messages and `clock.setInterval` timers; ties by insertion order) that jumps from event to event instead of stepping in fixed increments, `hostTransport()`, `participantTransport()` (new opaque `peerId` per connection), `disconnect(p)`/`reconnect(p)` (new `peerId`, emits `disconnected`/`connected` and `onPeerLeave` on host), `hostOffline()`/`hostOnline()` (drops host traffic and emits `host-offline`/`connected` to participants), `destroyRoom()` (emits `room-unavailable`), `setFaults(...)`, a `clock()` adapter implementing `Clock` on the virtual time, and a `log` of every delivered message for assertions; each message independently dropped with probability `drop`, duplicated with probability `duplicate`, delayed uniformly in `[0, maxDelayMs]`, all from the seeded PRNG of T010
- [ ] T012 [P] Write self-tests for the hub in `tests/unit/room/memory-transport.test.js`: same seed ⇒ identical delivery log; `drop: 1` delivers nothing; `duplicate: 1` delivers each message twice; with `maxDelayMs > 0` some seed produces reordering; `disconnect` stops delivery both ways and fires `onPeerLeave`

**Checkpoint**: mensajes, vista y transporte falso listos; empiezan las historias

---

## Phase 3: User Story 1 - Abrir sala y seguir la partida en vivo (Priority: P1) 🎯 MVP

**Goal**: el cantador abre sala, cada cambio de partida se difunde como evento numerado, un
participante se une con alias válido, recibe snapshot y sigue la partida; el cantador puede
cerrar la sala.

**Independent Test**: canal sin fallos: abrir sala, sacar 10 bolas, unir a "Lola", sacar 5,
deshacer, conceder línea, terminar, empezar otra partida y cerrar; tras cada paso la vista de
Lola es igual a `toSpectatorView` de la partida del cantador (quickstart escenario 1).

### Tests for User Story 1 ⚠️

> Escribir primero y comprobar que fallan

- [ ] T013 [P] [US1] Write failing tests for `sanitizeAlias` in `tests/unit/room/alias.test.js` (research R7, FR-008-010): non-string → `{ ok: false }`; trims and collapses inner whitespace (`"  Lola   Pérez "` → `"Lola Pérez"`); removes `\p{Cc}`, `\p{Cf}` (zero-width joiner alone, U+200B, bidi overrides U+202E), `\p{Co}`, `\p{Cn}` and the characters `< > & " ' \``; `"<b>Ana</b>"` → `"bAna/b"`; empty or only spaces/controls → invalid; exactly 20 graphemes valid, 21 invalid; 20 composed emojis (e.g. 👩‍👩‍👧 with ZWJ kept inside the cluster) count as 20 via `Intl.Segmenter`; NFC applied (`"Jose\u0301"` → `"José"`); `key` = `alias.normalize('NFKC').toLowerCase()` so `"LOLA"`, `"lola"` and full-width `"ＬＯＬＡ"` share key; Galician diacritics kept (`"Uxía Núñez"`)
- [ ] T014 [P] [US1] Add failing tests for `diffGames(prev, next)` to `tests/unit/room/view.test.js` using real `game.js` functions with deterministic `randomInt`: different `id` → `[{ type: 'snapshot' }]`; `drawBall` → `[{ type: 'ball', ball }]`; `undoLastBall` → `[{ type: 'undo', ball }]`; `awardPrize` → `[{ type: 'prize', prize: { type, completionPosition, awardedAtPosition } }]`; `finishGame` → `[{ type: 'end-game' }]`; `setMode`, `setIntervalSec`, `pauseAuto`, `resumeAuto`, `restoreForResume` → `[]`; same object → `[]`; two balls at once, or ball + prize at once, or any other mismatch → `[{ type: 'snapshot' }]` (research R2)
- [ ] T015 [P] [US1] Write failing tests for the host reducer in `tests/unit/room/host.test.js` (data-model.md › HostRoom): `openRoom({ game, now })` → `status: 'open'`, `seq: 0`, no members, no output; `game-changed` emits one broadcast per change with `seq` incremented by 1 each (`ball`, `undo`, `prize`, `end{scope:'game'}`, broadcast `snapshot` with `view` for new game), never resetting `seq` across games, and emits nothing for mode/interval changes; `join` validation **in order** with exactly one `reject` reason: `v ≠ 1` → `incompatible-version`, room `closed` → `room-closed`, known `participantId` (connected or reserved) → accepted as reconnection without validating the alias (even with an invalid alias or a full room), invalid alias → `alias-invalid`, alias key used by another member → `alias-taken`, `occupiedSeats = 40` → `room-full` (41st identity rejected); accepted join → unicast `snapshot` with current `seq` (not incremented), current `view`, sanitized `alias` and `participantCount`; `join` from an already connected `participantId` on a new `peerId` replaces the old peer without taking a new seat or colliding with its own alias (FR-012); a reconnection `join` carrying a different alias keeps the original alias and never answers `alias-taken` (FR-021); messages of any other type or malformed from participants are ignored and the room state is unchanged (FR-006, FR-028); `close` → `status: 'closed'`, broadcast `end{scope:'room', lastSeq}`, idempotent; after close, `game-changed` updates `lastGame` without output
- [ ] T016 [P] [US1] Write failing tests for the participant reducer happy path in `tests/unit/room/participant.test.js`: `createParticipant({ participantId, alias, now })` → `connection: 'joining'`, `sync: 'waiting'`, `view: null`; status `connected` → outputs `join` with `participantId` and alias; welcome `snapshot` → `connection: 'connected'`, `sync: 'synced'`, `seq`, `view`, `participantCount` set; `ball`/`undo`/`prize`/`end{scope:'game'}` with `seq = s + 1` are applied via `applyChange`; `reject` → `connection: 'rejected'` with `rejectReason`, final; `end{scope:'room'}` → `connection: 'closed'`, final, keeps last `view`; in final states every input is ignored and nothing is sent; message with `v ≠ 1` (not `reject`) → `rejected` with `incompatible-version`
- [ ] T017 [P] [US1] Write failing session tests (clean channel, `drop: 0`) in `tests/unit/room/sessions.test.js` implementing quickstart scenario 1 end to end with `createHostSession`, `createParticipantSession` and the memory hub, asserting `viewsEqual(participant.getState().view, toSpectatorView(game))` after each step, and that closing the room leaves the participant `closed`

### Implementation for User Story 1

- [ ] T018 [P] [US1] Implement `sanitizeAlias` in `src/core/room/alias.js` until T013 passes (steps of research R7; grapheme count with `new Intl.Segmenter(undefined, { granularity: 'grapheme' })`; length 1-`ALIAS_MAX`)
- [ ] T019 [US1] Implement `diffGames` in `src/core/room/view.js` until T014 passes (table of research R2)
- [ ] T020 [US1] Implement `openRoom`, `hostStep` (inputs `game-changed`, `message` with `join`/ignore-others, `close`) in `src/core/room/host.js` until T015 passes; members map `participantId → { participantId, alias, aliasKey, status: 'connected', peerId, reservedUntil: null }` and `peers` map `peerId → participantId`; output `{ to: 'all' | peerId, msg }`
- [ ] T021 [US1] Implement `createParticipant` and `participantStep` (status `connected` → `join`; in-order apply; `reject`; `end` both scopes; version check; final states) in `src/core/room/participant.js` until T016 passes
- [ ] T022 [US1] Implement `createHostSession({ transport, clock, game })` in `src/room/host-session.js` (contracts/room-core.md): opens room, routes `transport.onMessage` → `hostStep({ type: 'message', … })`, `update(game)` → `game-changed`, `close()` → `close` + `transport.close()`; encodes every outgoing `msg` with `encodeMessage` and sends via `send`/`broadcast`; wraps every step and transport call in `try/catch` so no error ever escapes to the caller (FR-030)
- [ ] T023 [US1] Implement `createParticipantSession({ transport, clock, alias, participantId = crypto.randomUUID() })` in `src/room/participant-session.js`: routes `onStatus`/`onMessage` → `participantStep`, sends encoded output, exposes `getState()`, `subscribe(fn)` (returns unsubscribe; notifies on every state change) and `leave()` (unsubscribes and `transport.close()`); same `try/catch` isolation; then make T017 pass

**Checkpoint**: US1 completa: sala funcional sobre canal fiable (MVP)

---

## Phase 4: User Story 2 - Reconexión y reconciliación ante una red poco fiable (Priority: P1)

**Goal**: el participante converge con el cantador pese a pérdidas, duplicados, desorden y
caídas de cualquiera de los dos; reserva de 30 s; latido de 2 s; "cantador desconectado" y
"sala no disponible".

**Independent Test**: 1 000 semillas con fallos aleatorios, desconexiones y caídas del
cantador; al estabilizarse el canal, todas las vistas son iguales a la del cantador
(quickstart escenarios 2, 3, 4 y 7).

### Tests for User Story 2 ⚠️

- [ ] T024 [P] [US2] Add failing reconciliation tests to `tests/unit/room/participant.test.js` (research R4, FR-017-022): event with `seq ≤ s` discarded (state identical, nothing sent); `seq > s + 1` → `sync: 'desynced'`, event not applied, outputs `resync`; incoherent event with `seq = s + 1` (ball already drawn, undo of a non-last ball) → `desynced` + `resync`; any host message with `lastSeq > s` → `desynced` + `resync`; while `desynced`, further `resync` only if `now − lastResyncAt ≥ RESYNC_RETRY_MS` (2000); snapshot with `seq ≥ s` replaces `view` and → `synced` (applying the same snapshot twice yields an equal state); snapshot with `seq < s` ignored; broadcast snapshot (new game) with `seq = s + 1` replaces view
- [ ] T025 [US2] Add failing liveness tests to `tests/unit/room/participant.test.js` (FR-004b, FR-023-025a): `tick` with `now − lastHostMessageAt ≥ 6000` → `connection: 'host-offline'` keeping `view`; status `host-offline` from transport → same; any host message while `host-offline` → `connected` (+ `resync` if `lastSeq > s`); `tick` with `now − hostOfflineSince ≥ 300000` → `connection: 'unavailable'`, final; status `room-unavailable` → `unavailable`, final; status `disconnected` → `joining`, and the next `connected` re-sends `join` with the same `participantId` and alias
- [ ] T026 [P] [US2] Add failing tests to `tests/unit/room/host.test.js` for reservation, heartbeat and resync (FR-004a, FR-012a, FR-024): `peer-left` → member `status: 'reserved'`, `peerId: null`, `reservedUntil = now + 30000`; unknown `peerId` → no change; a reserved member still occupies a seat (new identity with 39 connected + 1 reserved → `room-full`) and its alias (other identity asking it → `alias-taken`); `join` from the reserved `participantId` before expiry → `connected` again with same alias even if room is full; `tick` at `now ≥ reservedUntil` frees seat and alias; `tick` emits `host-online{lastSeq}` broadcast when `now − lastHeartbeatAt ≥ 2000` and not otherwise; `resume` emits `host-online` immediately; `resync` from a connected peer → unicast snapshot with current `seq`; `resync` from unknown peer or after close → ignored; repeated `resync` bursts never change `seq`, `lastGame` or other members
- [ ] T027 [US2] Create `tests/support/simulate.js`: `runSession({ seed, participants = 10, faults, steps })` builds a hub (T011), one host session and N participant sessions; plays a random but seed-determined script of `drawBall` (with a seeded `randomInt`), `undoLastBall` when `canUndo`, `awardPrize` on valid checks, `finishGame`, new `createGame`, participant `disconnect`/`reconnect` (some within 30 s, some after), `hostOffline`/`hostOnline` with draws while offline (host outages ≤ 60 s), and late joiners: at least 3 new participants (count and moments from the seed) joining mid-game, one after `finishGame` and one with all 90 balls drawn; records `hostViews: Map<seq, SpectatorView>` after every state change; advances virtual time between actions; then `setFaults({ drop: 0, duplicate: 0, maxDelayMs: 0 })` and advances 10 s; returns host game, every participant final state and every intermediate participant `view` observed
- [ ] T028 [US2] Write convergence tests in `tests/unit/room/convergence.test.js` (SC-001, SC-002, SC-003, SC-008): for seeds `1..1000` (or only `process.env.ROOM_SEED` when set) with `drop`, `duplicate` in `[0, 0.3]` and `maxDelayMs` in `[0, 3000]` drawn from the seed: every non-final participant ends `synced` and `viewsEqual` to `toSpectatorView(hostGame)`; every intermediate participant `view` observed with `sync = 'synced'` satisfies `viewsEqual(view, hostViews.get(seq))` and no view ever contains duplicate balls; host game equals the game obtained by replaying the same script without a room; failure message includes the seed; the full 1 000-seed run finishes in < 8 s (if not, optimise the hub before reducing seeds)
- [ ] T029 [P] [US2] Add targeted session tests to `tests/unit/room/sessions.test.js`: only the last `ball` dropped → participant shows it within 2 500 ms of virtual time with `maxDelayMs: 0` (SC-003a); 40 connected, one disconnects, a new identity gets `room-full`, the disconnected one reconnects at 20 s and recovers alias and seat, another that never returns frees its seat at 30 s (SC-004, quickstart scenario 4); host silent 6 s → `host-offline`; host draws 3 balls offline and returns → participants converge; `destroyRoom()` or 5 min without host → `unavailable` and no further `join` sent (quickstart scenario 7)

### Implementation for User Story 2

- [ ] T030 [US2] Extend `participantStep` in `src/core/room/participant.js` with gap/incoherence detection, `resync` throttling, snapshot precedence, `tick`-based host silence (6 s) and host gone (5 min), transport statuses `disconnected`/`host-offline`/`room-unavailable`, until T024 and T025 pass
- [ ] T031 [US2] Extend `hostStep` in `src/core/room/host.js` with `peer-left` (30 s reservation), reservation-aware seat and alias checks, `tick` (expiry + heartbeat every `HEARTBEAT_MS`), `resume` and `resync`, until T026 passes
- [ ] T032 [US2] Wire timing into sessions: `clock.setInterval(tick, TICK_MS)` in both `src/room/host-session.js` and `src/room/participant-session.js` (cleared on `close`/`leave`), `transport.onPeerLeave` → `peer-left`, and `HostSession.resume()` → `resume`; make T029 and T028 pass

**Checkpoint**: US1 + US2: sala robusta ante red poco fiable

---

## Phase 5: User Story 3 - Presencia de participantes (Priority: P2)

**Goal**: el cantador ve alias y número de conectados; los participantes ven solo el número.

**Independent Test**: unir "Ana", "Brais", "Carme", desconectar a "Brais" y volver a unirlo;
lista y número del cantador y número de los participantes correctos tras cada paso
(quickstart escenario 8).

### Tests for User Story 3 ⚠️

- [ ] T033 [P] [US3] Add failing presence tests to `tests/unit/room/host.test.js` (FR-026, FR-027): `getPresence(room)` returns `{ count, aliases }` of **connected** members only, in arrival order (reserved excluded); every accepted join, replacement and `peer-left` broadcasts `presence{ count, lastSeq }`; expiry of a reservation does not change `count`; scan every message ever produced for participants in the test and assert none contains another participant's alias or any `participantId`
- [ ] T034 [P] [US3] Add failing tests to `tests/unit/room/participant.test.js`: `presence` updates `participantCount` without touching `view` or `seq`, and `lastSeq > s` triggers `resync`
- [ ] T035 [P] [US3] Add a session test to `tests/unit/room/sessions.test.js` for quickstart scenario 8, including `HostSession.subscribe(fn)` being called with the new presence after each change, and 40 → 39 → 40 (`SC-007`)

### Implementation for User Story 3

- [ ] T036 [US3] Implement `getPresence` and `presence` broadcasts in `src/core/room/host.js`, and `participantCount` handling in `src/core/room/participant.js`, until T033 and T034 pass
- [ ] T037 [US3] Implement `HostSession.getPresence()` and `HostSession.subscribe(fn)` (returns unsubscribe; notifies only when presence changes) in `src/room/host-session.js` until T035 passes

**Checkpoint**: las tres historias completas

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T038 [P] Add isolation tests to `tests/unit/room/sessions.test.js` (FR-030, SC-008): a transport whose `send`/`broadcast`/`close` throw, and a host step fed with garbage, never make `HostSession.update(game)` or `close()` throw, and the store's game is untouched; then confirm `git diff --exit-code main -- src/core/game.js src/core/errors.js` reports no changes (FR-002)
- [ ] T039 [P] Verify no app module imports the room code: add a test in `tests/unit/room/isolation.test.js` that reads `src/main.js` and every file under `src/ui/` and asserts none contains `core/room` or `/room/` imports (Principle V lazy loading; initial bundle unchanged), and that no file under `src/core/room/` or `src/room/` contains `localStorage`, `sessionStorage`, `indexedDB` or `document.cookie` (FR-015)
- [ ] T040 Run `npm run test:coverage` and raise coverage of `src/core/room/**` and `src/room/**` to ≥ 90 % on lines, functions, branches and statements with extra cases where needed
- [ ] T041 [P] Run `npm run lint`, `npm run build` and `npm run check-size`; confirm the initial bundle size equals `main`'s
- [ ] T042 [P] Update `README.md` with a short "Sala compartida (núcleo)" section linking to `specs/002-sala-protocolo-sync/` and the command to reproduce a convergence seed (`ROOM_SEED=… npx vitest run tests/unit/room/convergence.test.js`)
- [ ] T043 Execute every scenario of `specs/002-sala-protocolo-sync/quickstart.md`, measure the room suite time (< 10 s in CI per plan.md) and fix any divergence between code and contracts (`contracts/room-protocol.md`, `contracts/room-core.md`, `contracts/transport.md`)
- [ ] T044 Manual smoke test before merge (constitución, Principio VI): on a real phone, open the PR build (`npm run build && npm run preview -- --host`) once online, switch to airplane mode, play a game (draw, undo, check a line, close and reopen) and confirm the 001 behaviour is unchanged; record device and result in the PR "Pruebas manuales" section

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup; **bloquea** todas las historias.
- **US1 (Phase 3)**: depende de Foundational. Es el MVP.
- **US2 (Phase 4)**: depende de US1 (extiende `host.js`, `participant.js` y las sesiones).
- **US3 (Phase 5)**: depende de US1; puede hacerse en paralelo con US2 salvo en los archivos
  compartidos (`host.js`, `participant.js`, `host-session.js`, tests de host/participant):
  si se paraleliza, coordinar esos archivos o hacer US3 después de US2.
- **Polish (Phase 6)**: depende de las historias que se quieran entregar.

### Within Each User Story

- Tests primero (deben fallar) → reductores puros (`src/core/room/`) → sesiones (`src/room/`).
- `view.js` (T007, T019) antes de `host.js` y `participant.js`.
- `alias.js` (T018) antes de `host.js` (T020).
- `simulate.js` (T027) antes de `convergence.test.js` (T028).

### Parallel Opportunities

- Phase 1: T003 en paralelo con T002.
- Phase 2: T004, T005, T006, T008, T010 en paralelo; T012 tras T011.
- US1: T013, T014, T015, T016, T017 (tests) en paralelo; T018 en paralelo con T019.
- US2: T024 y T026 en paralelo; T025 tras T024 (mismo archivo); T029 en paralelo con T027.
- US3: T033, T034, T035 en paralelo.
- Polish: T038, T039, T041, T042 en paralelo.

---

## Parallel Example: User Story 1

```bash
# Tests de US1 a la vez (archivos distintos):
Task: "T013 [US1] sanitizeAlias tests in tests/unit/room/alias.test.js"
Task: "T015 [US1] host reducer tests in tests/unit/room/host.test.js"
Task: "T016 [US1] participant reducer tests in tests/unit/room/participant.test.js"
Task: "T017 [US1] clean-channel session tests in tests/unit/room/sessions.test.js"

# Implementación independiente:
Task: "T018 [US1] sanitizeAlias in src/core/room/alias.js"
Task: "T019 [US1] diffGames in src/core/room/view.js"
```

## Parallel Example: User Story 2

```bash
Task: "T024 [US2] reconciliation tests in tests/unit/room/participant.test.js"
Task: "T026 [US2] reservation/heartbeat/resync tests in tests/unit/room/host.test.js"
Task: "T027 [US2] tests/support/simulate.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 + Phase 2.
2. Phase 3 (US1).
3. **Parar y validar**: quickstart escenarios 1, 5 y 6 en verde; cobertura de lo hecho ≥ 90 %.

### Incremental Delivery

1. Setup + Foundational → base lista.
2. US1 → sala sobre canal fiable (MVP).
3. US2 → robustez ante red real (convergencia en 1 000 semillas). **Mínimo para habilitar un
   transporte real** en una feature posterior.
4. US3 → presencia.
5. Polish → cobertura, aislamiento, tamaño y documentación; PR con autorrevisión.

### Notes

- [P] = archivos distintos y sin dependencias pendientes.
- Confirmar que cada test falla antes de implementar.
- Commit tras cada tarea o grupo lógico (Conventional Commits, p. ej. `feat(room): …`,
  `test(room): …`).
- Una semilla que falle en la convergencia se reproduce con `ROOM_SEED`; añadirla como caso
  fijo en `convergence.test.js` tras arreglar el fallo.
