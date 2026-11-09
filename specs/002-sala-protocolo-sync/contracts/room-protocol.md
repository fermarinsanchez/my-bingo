# Contract: Protocolo de sala v1 (mensajes)

Formato de los mensajes entre el cantador y los participantes. Cada mensaje es un objeto JSON
codificado como cadena (`JSON.stringify`) de **16 KB como máximo**. Todos llevan
`v: 1` (`PROTOCOL_VERSION`) y `type`. Entidades en [../data-model.md](../data-model.md);
decisiones en [../research.md](../research.md) (R3-R6).

`decodeMessage(raw)` ([room-core.md](./room-core.md)) valida la forma exacta de cada tipo;
cualquier campo ausente, de tipo erróneo o fuera de rango hace el mensaje `malformed` y se
ignora sin efectos (FR-028). Los campos desconocidos se ignoran.

---

## Participante → cantador

| `type` | Campos | Notas |
|---|---|---|
| `join` | `participantId: string`, `alias: string` | Unión o reconexión (FR-007, FR-021). `alias` sin sanear: el cantador lo sanea. |
| `resync` | — | Pide un snapshot. Se ignora si el peer no es miembro conectado. |

Cualquier otro `type` recibido de un participante se ignora (FR-006).

## Cantador → participante (respuestas individuales)

| `type` | Campos | Notas |
|---|---|---|
| `snapshot` | `seq`, `view: SpectatorView`, `alias: string`, `participantCount` | Respuesta a `join` aceptado o a `resync`. `alias` = alias saneado confirmado. No incrementa `seq`. |
| `reject` | `reason: RejectReason` | **Forma congelada**: todas las versiones futuras la emiten y la entienden igual (`{ v, type: 'reject', reason }`), para que `incompatible-version` siempre se pueda leer. |

## Cantador → todos (difusión)

| `type` | Campos | Incrementa `seq` | Notas |
|---|---|---|---|
| `ball` | `seq`, `ball: 1-90` | Sí | |
| `undo` | `seq`, `ball: 1-90` | Sí | `ball` = bola retirada (la última). |
| `prize` | `seq`, `prize: SpectatorPrize` | Sí | |
| `end` | `scope: 'game'`, `seq` | Sí | Partida terminada; la sala sigue abierta. |
| `snapshot` | `seq`, `view` | Sí | Partida nueva o salvaguarda de `diffGames` (R2). Sin `alias` ni `participantCount`. |
| `end` | `scope: 'room'`, `lastSeq` | No | Cierre de sala (final). |
| `host-online` | `lastSeq` | No | Latido cada 2 s y al reanudar tras caída (FR-004a). |
| `presence` | `count: 0-40`, `lastSeq` | No | Tras cada cambio de conectados. **Nunca** lleva alias (FR-027). |

`end` sin `scope` válido, o con `scope: 'game'` sin `seq`, es `malformed`.

## Canal → participante (no son mensajes del cantador)

`host-offline` y `room-unavailable` los notifica el transporte por `onStatus`
([transport.md](./transport.md)); no viajan como mensajes del protocolo.

---

## Ejemplos

```json
{ "v": 1, "type": "join", "participantId": "3f1c9a2e-7b4d-4e0a-9c1f-2b8e6d5a4c3b", "alias": "  Lola  " }
{ "v": 1, "type": "snapshot", "seq": 14, "alias": "Lola", "participantCount": 12,
  "view": { "gameId": "g-1", "status": "in-progress", "drawn": [12, 45, 7],
            "prizes": [{ "type": "line", "completionPosition": 3, "awardedAtPosition": 3 }] } }
{ "v": 1, "type": "ball", "seq": 15, "ball": 42 }
{ "v": 1, "type": "end", "scope": "game", "seq": 16 }
{ "v": 1, "type": "host-online", "lastSeq": 16 }
{ "v": 1, "type": "presence", "count": 13, "lastSeq": 16 }
{ "v": 1, "type": "reject", "reason": "room-full" }
{ "v": 1, "type": "end", "scope": "room", "lastSeq": 16 }
```

## Compatibilidad

- Un `join` con `v ≠ 1` recibe `reject` `incompatible-version` (FR-013).
- Un participante que recibe un mensaje con `v ≠ 1` (salvo `reject`) pasa a `rejected` con
  `incompatible-version` en lugar de fallar.
- Cualquier cambio incompatible de este documento exige `PROTOCOL_VERSION = 2`.
