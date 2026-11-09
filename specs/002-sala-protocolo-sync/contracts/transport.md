# Contract: Interfaz `Transport`

Frontera entre la lógica de sala y la red (Principio V: transporte intercambiable). En esta
feature solo existen la definición (JSDoc en `src/room/transport.js`) y el transporte falso
en memoria de los tests. Los transportes reales (relé, WebRTC) son features posteriores y
MUST cumplir este contrato. Decisión en [../research.md](../research.md) (R10, R11).

Reglas comunes:

- `data` es siempre una **cadena** ya codificada ([room-protocol.md](./room-protocol.md)).
- El transporte **no** garantiza entrega, orden ni unicidad: puede perder, duplicar, retrasar
  y desordenar. El protocolo lo tolera.
- Las funciones `on*` registran un único manejador y devuelven una función para darse de baja.
- Ningún método lanza por fallos de red: los fallos se notifican por eventos o se ignoran.

## `HostTransport` (lado del cantador)

| Miembro | Firma | Contrato |
|---|---|---|
| `send` | `(peerId: string, data: string) => void` | Envía a una conexión. Sin efecto si ya no existe. |
| `broadcast` | `(data: string) => void` | Envía a todas las conexiones abiertas. |
| `onMessage` | `(fn: (peerId: string, data: string) => void) => () => void` | `peerId` es opaco y estable mientras dure esa conexión. |
| `onPeerLeave` | `(fn: (peerId: string) => void) => () => void` | Conexión cerrada o caída detectada. |
| `close` | `() => void` | Cierra todas las conexiones. Idempotente. |

## `ParticipantTransport` (lado del participante)

| Miembro | Firma | Contrato |
|---|---|---|
| `send` | `(data: string) => void` | Envía al cantador. Sin efecto si no hay conexión. |
| `onMessage` | `(fn: (data: string) => void) => () => void` | Mensajes del cantador. |
| `onStatus` | `(fn: (status: TransportStatus) => void) => () => void` | Ver tabla. |
| `close` | `() => void` | Idempotente. |

`TransportStatus`:

| Valor | Significado | Reacción del participante |
|---|---|---|
| `connected` | Hay canal con la sala (inicial o tras reconectar). | Envía `join` (unión o reconexión). |
| `disconnected` | Se perdió el canal; el transporte reintentará. | `connection = 'joining'`. |
| `host-offline` | El relé sabe que el cantador no está. | `connection = 'host-offline'` (FR-023). |
| `room-unavailable` | La sala ya no existe. | `connection = 'unavailable'` (FR-025a). |

## Transporte falso (`tests/support/memory-transport.js`, solo tests)

`createMemoryHub({ seed, drop, duplicate, maxDelayMs })` devuelve un hub con reloj virtual:

| Miembro | Uso |
|---|---|
| `hostTransport()` | `HostTransport` del cantador. |
| `participantTransport()` | Nuevo `ParticipantTransport` (una conexión; `peerId` nuevo). |
| `advance(ms)` | Avanza el reloj virtual y entrega los mensajes vencidos en orden de entrega. |
| `now()` | Reloj virtual (se inyecta en las sesiones). |
| `disconnect(p)` / `reconnect(p)` | Corta / restablece una conexión de participante (`reconnect` crea `peerId` nuevo). |
| `hostOffline()` / `hostOnline()` | Corta / restablece al cantador (notifica `host-offline` a todos). |
| `destroyRoom()` | Notifica `room-unavailable` a todos. |
| `setFaults({ drop, duplicate, maxDelayMs })` | Cambia los fallos en caliente (p. ej. canal estable al final). |

Cada mensaje se pierde con probabilidad `drop`, se duplica con probabilidad `duplicate` y se
entrega tras un retraso uniforme en `[0, maxDelayMs]` (de ahí el desorden). Todo azar sale de
un PRNG con semilla (mulberry32), así que una semilla reproduce exactamente la sesión.
