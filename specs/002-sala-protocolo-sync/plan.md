# Implementation Plan: Núcleo de sincronización de la sala compartida

**Branch**: `002-sala-protocolo-sync` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-sala-protocolo-sync/spec.md`

## Summary

Lógica pura y testeable para sincronizar una partida del cantador con hasta 40 espectadores
de solo lectura, sin transporte real. Dos reductores puros (`src/core/room/`): el del
cantador deduce eventos numerados (`ball`, `undo`, `prize`, `end`) comparando la partida
anterior con la nueva, sin cambiar el modelo de `Game`, y gestiona uniones, alias, reservas de 30 s,
presencia y latido cada 2 s. El del participante aplica eventos en orden estricto y se
reconcilia con snapshots idempotentes ante pérdidas, duplicados o desorden. Dos sesiones
delgadas (`src/room/`) conectan los reductores con una interfaz `Transport` y un reloj
inyectado. Se prueba con un transporte falso en memoria con fallos reproducibles por semilla
(1 000 simulaciones de convergencia). Decisiones en [research.md](./research.md).

## Technical Context

**Language/Version**: JavaScript ES2022 (módulos ES), JSDoc + `// @ts-check`; Node.js 22 para
herramientas (igual que la 001).

**Primary Dependencies**: ninguna nueva. Usa APIs estándar: `JSON`, `Intl.Segmenter`,
`String.prototype.normalize`, `randomUUID()` de `src/core/rng.js` (UUID v4; fallback con
`crypto.getRandomValues` fuera de contexto seguro).

**Storage**: N/A. Todo en memoria (Principio I: sala y alias efímeros).

**Testing**: Vitest (entorno node) con transporte falso y reloj virtual
(`tests/support/`); simulación de convergencia con 1 000 semillas; cobertura ≥ 90 % ampliada
a `src/room/**`; ESLint.

**Target Platform**: los mismos navegadores móviles que la 001 (Chrome Android, Safari iOS de
las dos últimas versiones mayores); `Intl.Segmenter` disponible desde Safari 14.1 / Chrome 87.

**Project Type**: biblioteca interna pura dentro de la PWA estática existente.

**Performance Goals**: aplicar un evento o un snapshot < 1 ms; cambio perdido mostrado en
≤ 2,5 s con canal sin retraso (SC-003a); suite completa de sala < 10 s en CI.

**Constraints**: sin cambiar el **modelo** de `Game` (FR-002); reductores sin reloj, timers ni
transporte; ningún error de sala llega a la partida (FR-030); mensajes ≤ 16 KB; 0 bytes nuevos
en el bundle inicial (nada lo importa todavía; la UI futura lo cargará con `import()`).
Parche de la 001 (no es protocolo de sala): `createGame` pasa a `randomUUID()` de `rng.js` y
Vite refleja CORS a IPs de LAN para que `preview --host` en el móvil no quede en negro.

**Scale/Scope**: 1 cantador, ≤ 40 participantes por sala; snapshot ≤ ~1,5 KB; 6 módulos de
núcleo, 3 de sesión, ~8 archivos de pruebas.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / sección | Cumplimiento en el plan | Estado |
|---|---|---|
| I. Offline-First Total | La sala es opcional y aislada: las sesiones capturan cualquier error y nunca modifican la partida (FR-030, R12); sala, alias e identidades solo en memoria; sin recursos externos (no hay transporte real en esta feature). | ✅ |
| II. Alcance acotado | Solo modo espectador: los participantes únicamente envían `join` y `resync`; sin cartones, reclamaciones, cuentas ni migración de host. Transporte real, enlace, QR y UI fuera de esta feature. | ✅ |
| III. Integridad y persistencia | El cantador sigue siendo la única fuente de verdad; el modelo y el sorteo de la 001 no cambian (`getRandomValues`). `game.js` solo cambia el origen del `id` (helper `randomUUID`, ver Complexity Tracking). | ✅ |
| IV. Legibilidad y accesibilidad | Sin UI ni textos visibles en esta feature; los motivos de rechazo son códigos que la feature de UI traducirá a es/gl. | ✅ (N/A) |
| V. Simplicidad y web estándar | 0 dependencias nuevas (la única permitida para transporte queda libre para la feature de transporte real); interfaz `Transport` intercambiable; protocolo puro e independiente del DOM y del transporte; carga bajo demanda prevista vía `import()`. | ✅ |
| VI. Tests en lógica clave | Pruebas de snapshot, duplicados, perdidos, desordenados, versión incompatible, límite de 40 y alias saneado (quickstart, escenarios 2-6); cobertura ≥ 90 % en CI. Verificación manual en móvil real en modo avión de la app existente antes de fusionar (T044): esta feature no debe alterarla. | ✅ |
| Restricciones técnicas | Sin cambios en despliegue, almacenamiento ni presupuesto (CI `check-size`); conectividad desde cualquier red: depende del transporte real, fuera de esta feature. | ✅ |
| Flujo de desarrollo | Rama `002-sala-protocolo-sync`, PR con autorrevisión y CI (lint, test:coverage, build, size, lhci). | ✅ |

**Resultado**: gate superada antes de la investigación y revalidada tras el diseño (Fase 1).
Sin violaciones que justificar.

## Project Structure

### Documentation (this feature)

```text
specs/002-sala-protocolo-sync/
├── plan.md              # Este archivo
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── room-protocol.md # Mensajes v1 (formato, secuencias, compatibilidad)
│   ├── room-core.md     # API de src/core/room/ y src/room/
│   └── transport.md     # Interfaz Transport + transporte falso
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks; no lo crea /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── core/
│   ├── game.js                 # 001: solo `id` vía `randomUUID()` (LAN HTTP)
│   └── room/                   # PURO: sin DOM, reloj, timers ni transporte
│       ├── constants.js        # versión, límites y tiempos
│       ├── alias.js            # sanitizeAlias
│       ├── protocol.js         # encodeMessage / decodeMessage (validación estricta)
│       ├── view.js             # toSpectatorView, diffGames, applyChange, viewsEqual
│       ├── host.js             # openRoom, hostStep, getPresence
│       └── participant.js      # createParticipant, participantStep
└── room/                       # Carcasa con efectos (reloj y transporte inyectados)
    ├── transport.js            # typedefs HostTransport / ParticipantTransport
    ├── host-session.js         # createHostSession
    └── participant-session.js  # createParticipantSession
tests/
├── support/
│   ├── memory-transport.js     # hub en memoria: pérdidas, duplicados, retrasos, caídas
│   └── simulate.js             # sesiones completas por semilla
└── unit/
    └── room/
        ├── alias.test.js
        ├── protocol.test.js
        ├── view.test.js
        ├── host.test.js
        ├── participant.test.js
        ├── sessions.test.js
        └── convergence.test.js # 1 000 semillas (SC-001, SC-002, SC-008)
vite.config.js                  # coverage.include += src/room/** (tests/unit/**/*.test.js ya incluye room/)
```

**Structure Decision**: se mantiene el proyecto único de la 001. La lógica de protocolo vive
en `src/core/room/`, con las mismas reglas que el resto de `src/core/` (pura, inmutable,
testeada). Lo que necesita reloj o transporte va en `src/room/`, también sin DOM y cubierto
por la cobertura. Los soportes de prueba (`tests/support/`) no se publican. Ningún módulo de
`src/ui/` ni `src/main.js` importa la sala en esta feature.

## Complexity Tracking

Sin violaciones de la constitución que justificar.

**Parche 001 (T044, preview en móvil):** `crypto.randomUUID` y el CORS por defecto de Vite 8
fallan en `http://192.168.x.x` (no es contexto seguro; CORS solo localhost). No es alcance de
sala: no hay transporte real ni UI. Se documenta aquí porque T044 usa ese preview y porque
`game.js` queda con un diff mínimo respecto a `main` (`id = randomUUID()`). El test T038
sigue exigiendo `errors.js` intacto y, en `game.js`, solo ese cambio de identificador.
