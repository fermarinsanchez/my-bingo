# Quickstart: validar el núcleo de sincronización de la sala

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

Esta feature no tiene interfaz: se valida **solo con pruebas automáticas** sobre el
transporte falso en memoria ([contracts/transport.md](./contracts/transport.md)). No hace
falta red, móvil ni navegador.

## Requisitos previos

- Node.js 22 (`.nvmrc`) y dependencias instaladas: `npm ci`.

## Comandos

```bash
npm test                      # todas las pruebas unitarias
npx vitest run tests/unit/room   # solo las de sala
npm run test:coverage         # cobertura ≥ 90 % en src/core/** y src/room/**
npm run lint
npm run build && npm run check-size   # el bundle inicial no debe crecer
```

Para reproducir una semilla concreta de la simulación de convergencia:

```bash
ROOM_SEED=1234 npx vitest run tests/unit/room/convergence.test.js
```

## Escenarios de validación

Cada escenario corresponde a una o varias pruebas; entre paréntesis, los requisitos y
criterios que cubre.

1. **Unión y seguimiento en vivo** (US1, FR-001-003, FR-014, FR-016). Canal sin fallos:
   abrir sala, sacar 10 bolas, unir a "Lola", sacar 5, deshacer, conceder línea, terminar,
   empezar otra partida. Tras cada paso, `viewsEqual(vistaLola, toSpectatorView(partida))`.
2. **Duplicados, perdidos, desordenados** (US2, FR-017-022, SC-001, SC-002). 1 000 semillas con
   `drop ≤ 0.3`, `duplicate ≤ 0.3`, `maxDelayMs ≤ 3000`, partidas de hasta 90 bolas con
   deshacer, premios y partida nueva; al final, canal estable y 10 s simulados. Esperado: todas
   las vistas iguales a la del cantador y ninguna vista intermedia con bolas repetidas.
3. **Último evento perdido** (FR-004a, SC-003a). Perder solo el último `ball`; con canal sin
   retraso, el participante lo muestra en ≤ 2,5 s simulados.
4. **Reconexión con reserva** (FR-012, FR-012a, SC-004). Con 40 conectados, desconectar uno;
   un nuevo recibe `room-full`; el desconectado vuelve a los 20 s y recupera alias y plaza; otro
   que no vuelve libera la plaza a los 30 s.
5. **Alias** (FR-008-010, SC-005). Tabla de casos: vacío, espacios, 21 grafemas, 20 emojis
   compuestos, controles y ancho cero, `<b>`, mayúsculas distintas, formas Unicode equivalentes.
6. **Versión y mensajes basura** (FR-013, FR-028, SC-006). `join` con `v: 2` → `reject
   incompatible-version`; mensajes no JSON, de 17 KB, con campos erróneos o tipos desconocidos →
   ignorados sin excepciones y sin cambios de estado.
7. **Cantador caído y sala perdida** (FR-004b, FR-023-025a). Sin latidos 6 s → `host-offline`;
   el cantador saca 3 bolas sin red y vuelve → participantes convergen; 5 min sin cantador o
   `room-unavailable` → `unavailable` y no reintentan; `end{scope:'room'}` → `closed`.
8. **Presencia** (US3, FR-026-027, SC-007). Unir "Ana", "Brais", "Carme", desconectar a
   "Brais": `getPresence` = 2 alias; los participantes reciben `count: 2` y ningún mensaje
   que reciben contiene alias ajenos.
9. **Aislamiento del juego** (FR-030, SC-008). En todas las simulaciones, la `Game` del
   cantador es idéntica a la de una ejecución sin sala con el mismo `randomInt`; un transporte
   cuyos métodos lanzan no rompe `update(game)`.

## Resultado esperado

Todas las pruebas en verde, cobertura ≥ 90 % y `check-size` sin cambios respecto a `main`.
