<!--
Sync Impact Report
==================
Cambio de versión: 1.1.0 → 2.0.0 (MAJOR)
Motivo: el multijugador pasa de "fuera de alcance" a "dentro del alcance en modo espectador"
(sala compartida) y se admite un servicio externo opcional (relé/señalización), lo que redefine
de forma incompatible el Principio I (sin backend/servicios externos) y el alcance del
Principio II. El modo offline del cantador se preserva íntegro.

Principios modificados:
- I. Offline-First Total (NO NEGOCIABLE): se mantiene para el cantador; se añade la sala
  compartida como capacidad opcional cuyo fallo no afecta al juego; se permite un único relé
  gratuito y opcional; sala y alias efímeros (solo en memoria); sigue prohibido el CDN.
- II. Alcance Acotado: "Solo Bombo de 90 Bolas" → "Bombo de 90 Bolas con Sala de Espectadores".
  Multijugador pasa a estar dentro del alcance solo como ESPECTADOR (enlace, alias, vista en
  vivo de solo lectura). Siguen fuera: cartones digitales, reclamar premios desde el móvil del
  jugador, bingo de 75 bolas, voz, dinero/apuestas, cuentas de usuario y migración de host.
- V. Simplicidad y Plataforma Web Estándar: se permite como máximo UNA dependencia de ejecución
  nueva para el transporte de sala (justificada en el plan, carga lazy, bundle inicial
  ≤ 100 KB gzip), tras una interfaz `Transport` intercambiable, con protocolo puro y testeable.
- VI. Tests Obligatorios en la Lógica Clave: se añaden tests obligatorios del protocolo de sala
  (snapshot, duplicados, perdidos, desordenados, versión incompatible, límites).
Principios sin cambios: III, IV.

Secciones modificadas: Restricciones Técnicas y de Producto (Despliegue, Almacenamiento,
Privacidad; nuevo requisito de Conectividad de la sala); Gobernanza (línea de versión).
Secciones añadidas: ninguna (solo el punto "Conectividad de la sala").
Secciones eliminadas: ninguna.

Plantillas revisadas (no requieren cambios; leen la constitución en tiempo de ejecución):
- ✅ .specify/templates/plan-template.md ("Constitution Check" aplica estos principios)
- ✅ .specify/templates/spec-template.md
- ✅ .specify/templates/tasks-template.md
- ✅ .specify/templates/checklist-template.md
- ✅ .github/pull_request_template.md: casilla "Alcance" y encabezado de versión alineados con
  la v2.0.0 (multijugador solo como sala de espectadores).

TODOs diferidos: ninguno.

--- Historial ---
v1.1.0: Lighthouse 12+ ya no tiene categoría PWA (instalabilidad verificada con DevTools y
instalación real); la revisión obligatoria de PR pasa a autorrevisión con checklist para una
única persona mantenedora.
v1.0.0 (ratificación inicial): principios I-VI, Restricciones Técnicas y de Producto, Flujo de
Desarrollo y Calidad, Gobernanza.
-->

# My Bingo Constitution

## Core Principles

### I. Offline-First Total (NO NEGOCIABLE)

- Tras la primera carga, la partida del cantador MUST funcionar al 100 % sin conexión a
  internet, incluso en modo avión y tras reiniciar el dispositivo.
- Todos los recursos (HTML, CSS, JS, fuentes, iconos, traducciones) MUST estar precacheados
  por el service worker. Sigue prohibido cargar recursos (JS, CSS, fuentes) desde CDN o
  servicios externos en tiempo de ejecución.
- **Sala compartida**: compartir sala es una capacidad **opcional** que MUST activarse de forma
  explícita por el cantador. Su fallo (sin red, relé caído, error de protocolo) NUNCA MUST
  afectar al sorteo, a la persistencia de la partida ni a la comprobación.
- No existe backend propio: no hay APIs propias, cuentas de usuario, persistencia de datos de
  partida ni de jugadores, analíticas, publicidad ni telemetría. La única excepción es **un
  único servicio externo GRATUITO y opcional** (relé/señalización) usado exclusivamente para
  la sala.
- Los datos de la partida MUST persistir únicamente en el dispositivo del cantador. El código
  de sala y el alias de los participantes son **efímeros**: MUST existir solo en memoria
  durante la sala y NUNCA MUST guardarse en servidor ni en almacenamiento persistente.
- La app MUST ser instalable como PWA (manifest válido, iconos, `display: standalone`).
- Las actualizaciones de la app NUNCA MUST interrumpir ni borrar una partida en curso.

**Justificación**: el bombo se usa en locales, fiestas o casas sin cobertura fiable; si falla
la red, la partida no puede detenerse. La sala solo añade comodidad y jamás puede ser una
dependencia del juego.

### II. Alcance Acotado: Bombo de 90 Bolas con Sala de Espectadores

- La app es el **bombo/cantador** de un bingo europeo de 90 bolas (números del 1 al 90). Los
  jugadores usan sus propios cartones físicos.
- Funcionalidades dentro del alcance:
  - Sorteo **manual** (una bola por pulsación) y **automático** (una bola cada X segundos,
    configurable, con pausa/reanudación).
  - **Tablero 1-90** que marca los números ya salidos y **historial** de las últimas bolas.
  - **Recuperación de la partida** en curso tras cerrar la app o apagar el móvil.
  - **Pantalla de comprobación**: se introducen los números de una línea (5 números) o de un
    bingo (15 números) cantados y la app verifica si todos han salido, indicando cuáles no.
    Si la comprobación no es correcta, se MUST poder volver a la partida sin perder estado.
  - **Sala compartida en modo ESPECTADOR**: los participantes entran por enlace, eligen un
    alias y ven en vivo la partida en **solo lectura**. El cantador es el único que controla
    la partida.
- Fuera del alcance (requiere enmienda de esta constitución): cartones digitales, reclamar
  premios desde el móvil del jugador, bingo de 75 bolas, voz/locución de números, dinero o
  apuestas, cuentas de usuario y migración de host.

**Justificación**: un alcance pequeño y explícito mantiene la app fiable, ligera y fácil de
mantener; el modo espectador aporta valor social sin convertir la app en una plataforma de
juego online.

### III. Integridad y Persistencia de la Partida

- El sorteo MUST ser uniforme y sin repeticiones: cada número del 1 al 90 sale exactamente
  una vez por partida. Se MUST usar `crypto.getRandomValues` (no `Math.random`).
- El estado de la partida (bolas salidas en orden, modo, intervalo, estado de pausa) MUST
  guardarse en almacenamiento local tras **cada** bola, de forma que un cierre inesperado
  nunca pierda más que la acción en curso.
- Al abrir la app con una partida sin terminar, MUST ofrecerse continuarla.
- Acciones destructivas (nueva partida, reiniciar) MUST requerir confirmación explícita.
- Abrir la pantalla de comprobación MUST pausar el sorteo automático; volver de ella MUST
  restaurar exactamente el estado previo.
- El formato de datos persistidos MUST estar versionado; un cambio de formato MUST incluir
  migración o, como mínimo, no provocar errores con datos antiguos.

**Justificación**: un número repetido, perdido o un reinicio accidental arruina la partida
y la confianza de los jugadores.

### IV. Legibilidad y Accesibilidad Mobile-First

- Diseño mobile-first en orientación **vertical**, utilizable con **una mano**: los controles
  principales (sacar bola, pausar, comprobar) MUST estar en la mitad inferior de la pantalla
  y tener un área táctil mínima de 48×48 px.
- La última bola MUST mostrarse en tamaño muy grande, legible a varios metros de distancia.
- El contraste MUST cumplir WCAG 2.1 AA en todos los temas.
- MUST existir tema **claro** y **oscuro**, respetando por defecto la preferencia del sistema
  y permitiendo cambiarlo manualmente.
- Durante la partida la pantalla MUST mantenerse encendida mediante la Wake Lock API; si el
  navegador no la soporta, la app MUST seguir funcionando e informar al usuario.
- La interfaz MUST estar disponible en **español** y **gallego**, seleccionable por el
  usuario. No se permiten textos visibles sin traducir en ninguno de los dos idiomas.

**Justificación**: la app la usan personas de todas las edades, a menudo en ambientes con
ruido y luz variable, con el móvil en una mano.

### V. Simplicidad y Plataforma Web Estándar

- Stack: **JavaScript vanilla (ES modules) + Vite + vite-plugin-pwa**. No se usan frameworks
  de UI (React, Vue, Svelte, etc.).
- Las dependencias de ejecución MUST ser mínimas; cada nueva dependencia MUST justificarse en
  el plan de la feature. Las dependencias de desarrollo (build, test, lint) son aceptables.
- Para la sala compartida se permite como máximo **UNA** dependencia de ejecución nueva,
  dedicada al transporte, justificada en el plan y cargada **bajo demanda (lazy)** para no
  superar el presupuesto del bundle inicial (100 KB gzip). El código cargado bajo demanda MUST
  servirse desde el propio sitio (nunca desde CDN) y MUST quedar precacheado por el service
  worker.
- El transporte de sala MUST ir tras una interfaz `Transport` intercambiable, y la lógica del
  protocolo de sala MUST ser pura, independiente del DOM y del transporte, y testeable
  (Principio VI).
- La lógica del juego (sorteo, estado, comprobación) MUST vivir en módulos puros,
  independientes del DOM, separados de la capa de interfaz.
- Se aplica YAGNI: no se construye nada fuera del alcance del Principio II "por si acaso".

**Justificación**: menos código y menos dependencias significan menos peso, carga más rápida
en móviles modestos y menos puntos de fallo offline; aislar el transporte permite sustituir
el servicio de relé sin reescribir la sala.

### VI. Tests Obligatorios en la Lógica Clave

- MUST existir tests unitarios automatizados (p. ej. Vitest) para:
  - El sorteo: 90 números únicos, rango 1-90, sin repetición, fin de partida correcto.
  - El estado de la partida: transiciones, pausa/reanudación y serialización/restauración.
  - La comprobación de línea y bingo: aciertos, fallos, números no salidos, entradas
    inválidas (fuera de rango, duplicados, cantidad incorrecta).
  - El **protocolo de sala**:
    - Reconciliación por **snapshot** (un espectador converge al estado del cantador).
    - Mensajes **duplicados**, **perdidos** y **desordenados**.
    - **Versión de protocolo incompatible** (rechazo controlado, sin errores).
    - **Límites**: máximo 40 participantes y alias saneado.
- Todo cambio en estos módulos MUST ir acompañado de sus tests, y los tests MUST pasar antes
  de fusionar.
- La interfaz no requiere tests automatizados obligatorios, pero cada feature MUST verificarse
  manualmente en un móvil real en modo avión antes de fusionarse.

**Justificación**: la lógica del juego y del protocolo es donde un error es invisible y grave;
la interfaz se valida mejor a simple vista.

## Restricciones Técnicas y de Producto

- **Plataforma objetivo**: navegadores móviles modernos (Chrome/Android y Safari/iOS de las
  dos últimas versiones mayores). En escritorio debe funcionar, pero no es prioritario.
- **Despliegue**: la app es un sitio estático publicado en **GitHub Pages** (HTTPS, requisito
  del service worker). La configuración de rutas MUST tener en cuenta la subruta del
  repositorio. El relé gratuito de la sala, si se usa, se declara como **excepción acotada**
  a "sin backend": no aloja la app, no almacena datos y es opcional.
- **Almacenamiento**: `localStorage` o IndexedDB, solo en el dispositivo del cantador. Los
  datos de partida nunca se persisten fuera de él; el código de sala y los alias solo viven en
  memoria.
- **Rendimiento**: el bundle inicial (JS + CSS, comprimido) SHOULD mantenerse por debajo de
  100 KB; la app MUST estar operativa en menos de 2 s en un móvil de gama media tras la
  primera instalación. El código de la sala no cuenta en el bundle inicial por cargarse bajo
  demanda.
- **Privacidad**: sin cookies de terceros, sin rastreo, sin analíticas ni telemetría y sin
  permisos del dispositivo más allá de Wake Lock. Se permite únicamente el tráfico **efímero**
  de sala (señalización y mensajes de partida) con el relé declarado, sin registro ni
  almacenamiento de dicho tráfico por parte del proyecto.
- **Conectividad de la sala**: la sala MUST funcionar desde cualquier red (wifi o datos
  móviles), sin requerir que cantador y espectadores compartan red local.
- **Calidad PWA**: la app MUST ser instalable, verificado sin errores en el panel
  *Application → Manifest / Service Workers* de Chrome DevTools y con la instalación real en
  un móvil. Lighthouse MUST obtener ≥ 90 en Accesibilidad.

## Flujo de Desarrollo y Calidad

- Cada feature sigue el flujo de Spec Kit: `/speckit-specify` → `/speckit-clarify` (si hace
  falta) → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.
- La rama `main` está protegida: todo cambio entra mediante **Pull Request** desde una rama de
  feature; no se permiten pushes directos a `main`. El CI MUST pasar antes de fusionar.
- Mientras el proyecto tenga una única persona mantenedora, la revisión es una
  **autorrevisión** con la checklist de la plantilla de PR (offline, alcance, tests, es/gl,
  prueba en móvil en modo avión). Si se incorporan más personas, MUST exigirse al menos una
  revisión aprobada de otra persona.
- **CI (GitHub Actions)** MUST ejecutar en cada PR: lint, tests unitarios y build de
  producción. Un PR con CI fallido no se fusiona.
- El despliegue a GitHub Pages se hace automáticamente desde `main` tras un build correcto.
- El revisor MUST comprobar el cumplimiento de esta constitución, en especial: funcionamiento
  offline, alcance (Principio II), tests de lógica clave y traducciones es/gl completas.
- Commits con mensajes descriptivos (se recomienda Conventional Commits).

## Gobernanza

- Esta constitución prevalece sobre cualquier otra práctica o preferencia del proyecto. La
  sección "Constitution Check" de cada plan MUST verificarse contra ella.
- Cualquier desviación MUST justificarse por escrito en el plan de la feature (sección de
  complejidad); si es permanente, requiere enmienda.
- **Enmiendas**: se proponen mediante un PR que modifique este archivo, explicando el motivo y
  el impacto en features existentes, y siguen la misma regla de revisión que cualquier PR
  (ver Flujo de Desarrollo y Calidad).
- **Versionado** (SemVer):
  - MAJOR: eliminación o redefinición incompatible de un principio o del alcance.
  - MINOR: nuevo principio o sección, o ampliación material de una guía.
  - PATCH: aclaraciones, redacción o erratas sin cambio semántico.
- Se revisa el cumplimiento en cada PR y la vigencia de la constitución al inicio de cada
  nueva feature importante.

**Version**: 2.0.0 | **Ratified**: 2026-11-02 | **Last Amended**: 2026-11-09
