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
npm run test:coverage  # cobertura; umbral 90 % en src/core
npm run build          # build de producción en dist/
npm run preview -- --host   # servir dist/ en la red local
npm run check-size     # falla si JS+CSS iniciales (gzip) > 100 KB
npm run lhci           # Lighthouse CI: Accesibilidad ≥ 90
```

Las pruebas manuales en móvil están en
[specs/001-bombo-bingo-offline/quickstart.md](specs/001-bombo-bingo-offline/quickstart.md).

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
