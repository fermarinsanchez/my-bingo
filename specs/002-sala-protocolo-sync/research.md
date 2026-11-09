# Research: Núcleo de sincronización de la sala compartida

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Fecha**: 2026-11-09

No quedaban `NEEDS CLARIFICATION` en la spec (5 decisiones resueltas en la sesión de clarify).
Este documento fija las decisiones técnicas del núcleo. Las decisiones de la feature 001
(R1-R9 de [../001-bombo-bingo-offline/research.md](../001-bombo-bingo-offline/research.md))
siguen vigentes.

---

## R1. Arquitectura: núcleo funcional + carcasa con efectos

- **Decision**: la lógica de sala son dos **reductores puros**, uno del cantador y otro del
  participante, con la forma `step(state, input) → { state, out }`. `input` es un hecho
  (cambio de partida, mensaje recibido, conexión caída, paso del tiempo) y `out` es la lista
  de mensajes a enviar. Ni leen el reloj ni tocan el transporte: el tiempo llega como
  `input.now` (ms). Dos **sesiones** delgadas (`src/room/`) conectan el reductor con un
  `Transport` y con un reloj inyectado.
- **Rationale**: un reductor puro se prueba con tablas de entradas/salidas y permite simular
  miles de sesiones sin esperas reales (SC-001). Cumple el Principio V (protocolo puro,
  independiente del DOM y del transporte) y sigue el estilo inmutable de `src/core/game.js`.
- **Alternatives considered**: clases con estado y `setInterval` internos (difíciles de
  probar con fallos simulados); máquina de estados con librería (XState: dependencia de
  ejecución innecesaria, contraria al Principio V).

## R2. Derivar eventos sin modificar el motor de partida

- **Decision**: el cantador **compara** la partida anterior con la nueva (`diffGames(prev,
  next)`) cada vez que el store notifica un cambio:

  | Cambio detectado | Evento |
  |---|---|
  | `id` distinto | `snapshot` (partida nueva) |
  | `drawn` crece en 1 conservando el prefijo | `ball` |
  | `drawn` decrece en 1 conservando el prefijo | `undo` |
  | `prizes` crece en 1 conservando los anteriores | `prize` |
  | `status` pasa de `in-progress` a `finished` | `end` con `scope: 'game'` |
  | Solo cambian `mode`, `intervalSec`, `autoPaused` o `undoLocked` | ninguno |
  | Cualquier otra combinación | `snapshot` (salvaguarda) |

- **Rationale**: FR-002 prohíbe tocar `game.js`. El store de la UI ya notifica cada estado
  nuevo (`subscribe`), así que la sala solo necesita el estado previo. La salvaguarda
  garantiza la convergencia aunque una futura acción cambie varias cosas a la vez.
- **Alternatives considered**: envolver las funciones de `game.js` para emitir eventos
  (acopla sala y motor, y se rompe si se añade una acción nueva); emitir siempre snapshot
  (correcto pero más pesado y sin eventos que probar, en contra de la spec).

## R3. Números de secuencia

- **Decision**: `seq` entero por sala, empieza en 0 al abrirla. **Cada cambio de estado
  compartido** (`ball`, `undo`, `prize`, `end` de partida y snapshot de partida nueva o de
  salvaguarda) incrementa `seq` en 1 y lleva ese valor. Un snapshot **de respuesta** (a `join`
  o `resync`) no incrementa: lleva el `seq` del estado que representa. `presence`,
  `host-online` (latido) y `end` de sala llevan `lastSeq` y no incrementan.
- **Rationale**: así "secuencia" significa siempre "versión del estado compartido". Dos
  snapshots con el mismo `seq` son idénticos y aplicar uno de ellos es idempotente (FR-017,
  FR-020). `seq` no se reinicia entre partidas (FR-004).
- **Alternatives considered**: numerar todos los mensajes (el latido rompería la regla "el
  siguiente evento es `seq + 1`"); relojes vectoriales (innecesarios con una sola fuente de
  verdad).

## R4. Reglas del participante

- **Decision**: con `seq` local `s`:
  - Evento con `seq ≤ s` → descartar.
  - Evento con `seq = s + 1` y coherente con el estado → aplicar.
  - Evento con `seq > s + 1`, evento incoherente (FR-022) o `lastSeq > s` en cualquier mensaje
    → pasar a `desynced` y enviar `resync`.
  - Snapshot con `seq ≥ s` → reemplazar el estado y pasar a `synced`; con `seq < s` → ignorar.
  - En `desynced` no se guardan eventos en un búfer: se espera al snapshot. Si no llega,
    `resync` se reintenta como mucho cada 2 s.
- **Rationale**: sin búfer el modelo es más simple y demostrable. El snapshot de una partida
  completa es pequeño (< 2 KB, ver R6), así que el coste de resincronizar es bajo.
- **Alternatives considered**: búfer de eventos fuera de orden con retransmisión selectiva
  (más código y más casos para un beneficio pequeño con ≤ 40 espectadores).

## R5. Formato de mensaje y versión

- **Decision**: mensajes como objetos JSON planos `{ v, type, ...campos }` codificados como
  **cadena** (`JSON.stringify`) antes de pasar al transporte. `PROTOCOL_VERSION = 1`.
  `decodeMessage(raw)` nunca lanza: devuelve `{ ok: true, msg }` o `{ ok: false, reason:
  'malformed' | 'incompatible-version' | 'too-large' }`. Límite de 16 KB por mensaje. El
  mensaje `reject` tiene una forma **congelada** (`{ v, type: 'reject', reason }`) que
  cualquier versión futura debe seguir emitiendo y entendiendo, para que el rechazo por
  versión incompatible se pueda leer siempre.
- **Rationale**: JSON es nativo, legible en depuración y suficiente para el tamaño en juego.
  Validar en el borde (decodificar) mantiene los reductores libres de comprobaciones de forma.
- **Alternatives considered**: formato binario (MessagePack, CBOR: dependencia y opacidad sin
  ganancia real); negociar versiones (descartado en la spec).

## R6. Contenido del snapshot

- **Decision**: `{ gameId, status, drawn, prizes: [{ type, completionPosition,
  awardedAtPosition }] }` más `seq`. No incluye los números del cartón de cada premio, ni
  `mode`, `intervalSec`, `autoPaused`, `undoLocked` ni `startedAt`.
- **Rationale**: es lo mínimo para FR-016 (la bola de compleción es
  `drawn[completionPosition - 1]`). Peor caso: 90 bolas + 20 premios ≈ 1,5 KB.
- **Alternatives considered**: enviar la `Game` completa (expone estado irrelevante y acopla el
  protocolo al formato persistido de la 001).

## R7. Alias: saneado, longitud y unicidad

- **Decision**: `sanitizeAlias(raw)`:
  1. Si no es string → inválido.
  2. `normalize('NFC')`.
  3. Eliminar `\p{Cc}`, `\p{Cf}` (controles, ancho cero, marcas bidi) y `\p{Co}`, `\p{Cn}`.
  4. Eliminar `< > & " ' \``.
  5. Reducir `\s+` a un espacio y recortar.
  6. Contar **grafemas** con `Intl.Segmenter` (`granularity: 'grapheme'`): válido si 1-20.

  Clave de unicidad: `alias.normalize('NFKC').toLowerCase()`.
- **Rationale**: los grafemas cuentan "caracteres visibles" como los percibe la persona (un
  emoji con modificadores es 1). `Intl.Segmenter` está en Node 22, Chrome 87+ y Safari 14.1+
  (dentro de la plataforma objetivo). NFKC en la clave evita alias "iguales a la vista" con
  distinta codificación.
- **Alternatives considered**: lista blanca de caracteres (excluye nombres gallegos con
  diacríticos o emojis); contar unidades UTF-16 (`length`: un emoji contaría 2-11).

## R8. Identidad del participante y conexiones

- **Decision**: el participante genera un `participantId` aleatorio (`crypto.randomUUID()`,
  inyectado en el núcleo) que vive solo en memoria y va en `join`. El transporte identifica
  cada conexión con un `peerId` opaco. El cantador mantiene `participantId → { alias, peerId,
  status: 'connected' | 'reserved', reservedUntil }`. Si llega un `join` con un `participantId`
  conocido desde otro `peerId`, este sustituye al anterior (FR-012). Los `participantId` nunca
  se envían a otros participantes.
- **Rationale**: separa "quién es" de "por dónde llega", que es justo lo que pide la reconexión
  con reserva de 30 s. Como el id no se difunde (presencia solo con el número), no se puede
  suplantar a otro participante a partir de los mensajes.
- **Alternatives considered**: usar el alias como identidad (choca con la reserva y permite
  suplantación trivial); usar `peerId` (cambia en cada reconexión).

## R9. Tiempo: latido, silencio, reserva y sala perdida

- **Decision**: constantes exportadas `HEARTBEAT_MS = 2000`, `HOST_SILENCE_MS = 6000`,
  `RESERVATION_MS = 30000`, `HOST_GONE_MS = 300000`, `RESYNC_RETRY_MS = 2000` y `TICK_MS = 250`. Los reductores
  reciben `{ type: 'tick', now }`; las sesiones generan un tick cada 250 ms (`TICK_MS = 250`)
  con el reloj inyectado (`{ now(), setInterval(), clearInterval() }`). El cantador emite
  `host-online`
  cuando `now − lastHeartbeatAt ≥ HEARTBEAT_MS`; el participante cambia a `host-offline`
  cuando `now − lastHostMessageAt ≥ HOST_SILENCE_MS`, y a `unavailable` tras `HOST_GONE_MS`
  seguidos en `host-offline`.
- **Rationale**: un reloj inyectado hace los tests deterministas e instantáneos. Con un tick de
  250 ms el latido sale entre 2,00 y 2,25 s después del anterior, así que un hueco se muestra en
  ≤ 2,5 s con canal sin retraso (SC-003a).
- **Alternatives considered**: temporizadores dentro del núcleo (impuros, tests lentos o con
  `vi.useFakeTimers` global y frágil).

## R10. Interfaz `Transport`

- **Decision**: dos interfaces mínimas (JSDoc, sin implementación real en esta feature):
  - `HostTransport`: `send(peerId, data)`, `broadcast(data)`,
    `onMessage((peerId, data) => void)`, `onPeerLeave((peerId) => void)`, `close()`.
  - `ParticipantTransport`: `send(data)`, `onMessage((data) => void)`,
    `onStatus((status: 'connected' | 'disconnected' | 'host-offline' | 'room-unavailable')
    => void)`, `close()`.

  `data` siempre es una cadena. Las suscripciones devuelven una función para darse de baja.
- **Rationale**: es lo mínimo que puede ofrecer cualquier relé o WebRTC, y deja fuera
  detalles (reconexión automática, colas) que decidirá la feature de transporte real
  (Principio V: transporte intercambiable).
- **Alternatives considered**: interfaz con promesas y acuses de recibo (presupone un
  transporte fiable, justo lo que el protocolo no asume).

## R11. Transporte falso en memoria y simulación de fallos

- **Decision**: `tests/support/memory-transport.js` (solo tests, no se publica): un "hub" con
  reloj virtual y PRNG con semilla (mulberry32) que, por mensaje, puede **perder**,
  **duplicar** y **retrasar** (retraso aleatorio ⇒ **desorden**), además de desconectar y
  reconectar peers y simular la caída del cantador y la desaparición de la sala.
  `tests/support/simulate.js` ejecuta sesiones completas con una semilla y devuelve el estado
  final del cantador y de cada participante. Las pruebas de convergencia recorren 1 000
  semillas. El hub mantiene una única cola de sucesos (mensajes y temporizadores de
  `clock.setInterval`) ordenada por tiempo, y `advance(ms)` salta de suceso en suceso en vez de
  avanzar en pasos fijos. En la simulación de convergencia, las caídas del cantador duran como
  máximo 60 s, porque el paso a "sala no disponible" a los 5 minutos es definitivo y se prueba
  aparte.
- **Rationale**: reproducible (una semilla que falla se puede repetir), sin dependencias
  nuevas y sin tiempo real. El PRNG con semilla es solo de tests; el sorteo sigue usando
  `crypto.getRandomValues` (Principio III).
- **Alternatives considered**: fast-check (pruebas basadas en propiedades con reducción de
  contraejemplos: útil, pero añade una dependencia y el bucle con semillas cubre SC-001);
  `vi.useFakeTimers` (reloj global, se mezcla mal con varias sesiones).

## R12. Ubicación, carga y presupuesto

- **Decision**: reductores y utilidades puras en `src/core/room/`; sesiones en `src/room/`.
  Ningún módulo de la app los importa todavía; cuando llegue la UI de sala se cargarán con
  `import()` dinámico (Principio V: carga bajo demanda). Sin dependencias de ejecución nuevas.
  La cobertura (≥ 90 %) se amplía a `src/room/**`.
- **Rationale**: el bundle inicial no cambia (0 bytes nuevos en el grafo de `main.js`). Los
  futuros transportes reales se añadirán en `src/room/transports/`.
- **Alternatives considered**: meter las sesiones en `src/core/` (rompería la regla de la 001
  "núcleo sin timers"); todo en `src/ui/` (no es UI y quedaría fuera de la cobertura).
