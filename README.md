# My Bingo

Bombo de bingo de 90 bolas para el móvil. Es una PWA que funciona **sin conexión** tras la
primera carga: saca bolas (manual o automático), muestra el tablero 1-90 y el historial,
recupera la partida si se cierra la app y comprueba líneas y bingos cantados. Interfaz en
español y gallego, tema claro y oscuro.

- App: <https://marusheena.github.io/my-bingo/>
- Constitución del proyecto: [.specify/memory/constitution.md](.specify/memory/constitution.md)
- Especificación: [specs/001-bombo-bingo-offline/spec.md](specs/001-bombo-bingo-offline/spec.md)
- Plan técnico: [specs/001-bombo-bingo-offline/plan.md](specs/001-bombo-bingo-offline/plan.md)

## Requisitos

Node.js 22 LTS (ver `.nvmrc`) y npm.

## Comandos

```bash
npm ci                 # instalar dependencias
npm run dev            # servidor de desarrollo
npm run lint           # ESLint
npm test               # tests unitarios (lógica del juego e i18n)
npm run test:coverage  # cobertura; umbral 90 % en src/core y src/room
npm run build          # build de producción en dist/
npm run preview -- --host   # dist/ en LAN: http://<IP>:4173/my-bingo/
npm run check-size     # falla si JS+CSS iniciales (gzip) > 100 KB
npm run lhci           # Lighthouse CI: Accesibilidad ≥ 90
```

Las pruebas manuales en móvil están en
[specs/001-bombo-bingo-offline/quickstart.md](specs/001-bombo-bingo-offline/quickstart.md).

## Sala compartida (núcleo)

Lógica pura para sincronizar la partida del cantador con hasta 40 espectadores de solo
lectura. En esta versión **no hay UI ni transporte real**: el núcleo vive en `src/core/room/`
y `src/room/`, y se valida con un hub en memoria. Ningún módulo de la app lo importa todavía
(se cargará bajo demanda en una feature posterior).

- Spec, plan y contratos: [specs/002-sala-protocolo-sync/](specs/002-sala-protocolo-sync/)
- Reproducir una semilla de convergencia:

```bash
ROOM_SEED=1234 npx vitest run tests/unit/room/convergence.test.js
```

## Flujo de trabajo y configuración de GitHub

- `main` está protegida: no se permiten pushes directos, force push ni borrado; las reglas
  aplican también a administradores.
- Todo cambio entra por **Pull Request** con el check de CI **`ci`** en verde
  (`.github/workflows/ci.yml`: lint, tests con cobertura, build, tamaño y Lighthouse).
- Con una única persona mantenedora no se exigen aprobaciones: cada PR se **autorrevisa** con la
  checklist de [.github/pull_request_template.md](.github/pull_request_template.md)
  (constitución v1.1.0).
- **GitHub Pages** publica desde GitHub Actions (`.github/workflows/deploy.yml`) en cada push a
  `main`. La ruta base se configura con la variable `BASE_PATH` (por defecto `/my-bingo/`).
