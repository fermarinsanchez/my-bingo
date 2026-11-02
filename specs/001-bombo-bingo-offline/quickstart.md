# Quickstart: validar el bombo de bingo

Guía para comprobar que la feature funciona de punta a punta. Detalles de datos y comandos en
[data-model.md](./data-model.md) y [contracts/](./contracts/).

## Requisitos

- Node.js 22 LTS y npm.
- Un móvil Android (Chrome) y, si es posible, un iPhone (Safari, iOS 16.4+) en la misma red Wi-Fi
  que el ordenador, o el despliegue en GitHub Pages.

## Comandos

```bash
npm ci                 # instalar dependencias
npm run dev            # servidor de desarrollo (el SW de PWA está activo en dev: devOptions)
npm run lint           # ESLint
npm test               # Vitest: lógica clave (src/core, src/i18n)
npm run test:coverage  # cobertura; umbral 90 % en src/core
npm run build          # build de producción en dist/
npm run preview -- --host   # servir dist/ en la red local para probar en el móvil
npm run check-size     # falla si JS+CSS iniciales (gzip) > 100 KB
npm run lhci           # Lighthouse CI: Accesibilidad ≥ 90
```

Resultado esperado: todos los comandos terminan con código 0.

> El service worker requiere HTTPS salvo en `localhost`. Para probar instalación y offline en el
> móvil usar el despliegue de GitHub Pages (o un túnel HTTPS).

## Escenarios de validación manual (móvil real)

Marcar cada uno antes de fusionar (constitución, principio VI).

1. **Instalación y offline** (US6, FR-023/024, SC-005)
   - Abrir la URL de GitHub Pages con conexión → "Añadir a pantalla de inicio".
   - Activar modo avión, cerrar la app del todo, reiniciar el móvil, abrir desde el icono.
   - ✅ La app abre en pantalla completa y se puede jugar una partida entera.
2. **Sorteo manual** (US1, SC-001/002)
   - Nueva partida → pulsar "Sacar bola" 90 veces.
   - ✅ Salen 90 números distintos; contador llega a 90/90; después aparece "No quedan bolas".
3. **Deshacer** (FR-006a, FR-021c)
   - Sacar una bola → Deshacer → confirmar. ✅ Vuelve la bola anterior; contador −1;
     "Deshacer" deshabilitado hasta sacar otra.
4. **Tablero e historial** (US2)
   - ✅ El tablero marca exactamente las salidas (distinguible también en escala de grises);
     el historial muestra las 5 últimas en orden inverso.
5. **Recuperación** (US3, SC-004)
   - Sacar 20 bolas en automático → cerrar la app desde el multitarea → reabrir.
   - ✅ Se ofrece continuar; mismas 20 bolas en orden; automático en pausa con el mismo intervalo.
6. **Comprobación** (US4, SC-006)
   - Línea con 5 números salidos → ✅ "Línea correcta"; conceder → aparece en premios.
   - Línea con uno no salido → ✅ "Línea no válida" y se señala cuál; volver → partida idéntica.
   - Línea completada hace varias bolas → ✅ aviso "Completada con el N, hace X bolas".
   - Marcar 3 en cuadrícula → cambiar a teclado → ✅ siguen los 3. Teclado: 0 o 95 o repetido →
     ✅ aviso.
   - Tras una línea concedida, nueva comprobación → ✅ propone "Bingo".
   - Bingo correcto → ✅ ofrece terminar o seguir.
7. **Automático** (US5)
   - Intervalo 5 s, 30 s de espera → ✅ ~6 bolas. Pausa → ✅ no salen más.
   - Abrir Comprobación o cambiar de app → ✅ se pausa.
8. **Pantalla encendida** (FR-025, SC-008)
   - Dejar la partida sin tocar más allá del bloqueo automático del móvil → ✅ sigue encendida.
9. **Idioma y tema** (FR-026/027, SC-009)
   - Cambiar a Galego → ✅ todos los textos en gallego; se mantiene al reabrir.
   - Sistema en oscuro → ✅ app oscura; forzar Claro → ✅ se mantiene al reabrir.
10. **Legibilidad y una mano** (FR-003/028, SC-003)
    - ✅ Última bola legible a 3 m; Sacar / Pausa / Comprobar alcanzables con el pulgar.
11. **Actualización sin interrupción** (constitución, principio I)
    - Con una partida en curso, desplegar una versión nueva y abrir la app con conexión.
    - ✅ La partida no se recarga ni se pierde; aparece el aviso de actualización.

## Verificación de instalabilidad (escritorio)

Chrome DevTools → *Application* → *Manifest*: sin errores, iconos 192/512 y *maskable*.
*Service Workers*: activo. *Cache Storage*: contiene todos los assets. Con *Offline* marcado, la
recarga funciona.
