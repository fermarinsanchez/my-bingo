## Qué cambia

<!-- Historia(s) de usuario y tareas (T0xx) que cubre este PR -->

## Autorrevisión (constitución v2.0.0)

- [ ] **Offline**: probado en un móvil real en **modo avión** tras una primera carga (Principio I y VI)
- [ ] **Alcance**: solo bombo de 90 bolas; multijugador únicamente como sala de espectadores (solo lectura); sin cartones digitales, reclamar premios desde el móvil del jugador, voz, dinero/apuestas, cuentas ni migración de host (Principio II)
- [ ] **Integridad**: no se pierden bolas ni partida al cerrar/recargar; acciones destructivas con confirmación (Principio III)
- [ ] **Tests**: la lógica de `src/core/` tocada tiene tests nuevos o actualizados y pasan (Principio VI)
- [ ] **Idiomas**: todos los textos nuevos existen en `es` y `gl`
- [ ] **Accesibilidad**: contraste AA en claro y oscuro; áreas táctiles ≥ 48 px; controles principales abajo (Principio IV)
- [ ] **Sin red externa**: ningún recurso de CDN, fuentes web, analíticas ni cookies
- [ ] **CI en verde**: lint, tests con cobertura, build, tamaño y Lighthouse

## Pruebas manuales

<!-- Escenarios de specs/001-bombo-bingo-offline/quickstart.md ejecutados y dispositivo usado -->
