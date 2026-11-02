# Feature Specification: Bombo de bingo de 90 bolas sin conexión

**Feature Branch**: `001-bombo-bingo-offline`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Bombo/cantador de bingo de 90 bolas para móvil que funcione sin conexión. Solo bombo, sin cartones. Sorteo manual y automático cada X segundos, tablero 1-90 con números salidos e historial de últimas bolas, recuperación de la partida en curso si se cierra la app o se apaga el móvil, pantalla de comprobación donde se introducen los números de una línea o bingo cantado y se verifica contra las bolas salidas; si no es correcto se vuelve a la partida sin perder estado. Interfaz en español y gallego, números muy grandes, pantalla siempre encendida, uso vertical con una mano, modo claro y oscuro."

## Clarifications

### Session 2026-11-02

- Q: Si el cantador saca una bola por error, ¿debe poder deshacerla? → A: Sí, solo la última
  bola, con confirmación; vuelve al bombo como pendiente.
- Q: En la comprobación, ¿cómo se introducen los números del cartón? → A: Ambos métodos:
  cuadrícula 1-90 por defecto y opción de cambiar a teclado numérico.
- Q: ¿Debe la app recordar qué premios se han dado ya en la partida? → A: Sí, registra línea y
  bingo correctos (con la bola en que se dieron); tras una línea, la comprobación propone bingo
  por defecto, pero se pueden seguir comprobando líneas.
- Q: ¿Debe la comprobación avisar si el premio se cantó tarde? → A: Sí, avisa sin invalidar:
  indica con qué bola se completó y cuántas bolas han salido después; decide el cantador.
- Q: Al volver de la comprobación, ¿se reanuda solo el sorteo automático? → A: No; sigue en
  pausa y el cantador lo reanuda manualmente.

## User Scenarios & Testing *(mandatory)*

**Actor principal**: la persona que dirige la partida (el "cantador"), con el móvil en la
mano, delante de un grupo de jugadores que usan cartones en papel.

### User Story 1 - Sacar bolas manualmente y ver la última bola (Priority: P1)

El cantador inicia una partida nueva y pulsa un botón para sacar una bola. La app muestra
el número en tamaño muy grande para poder leerlo y cantarlo. Cada pulsación saca un número
distinto del 1 al 90, hasta agotar las 90 bolas.

**Why this priority**: es el núcleo del bombo. Con solo esta historia ya se puede jugar una
partida completa sustituyendo al bombo físico.

**Independent Test**: iniciar partida, pulsar "sacar bola" 90 veces y comprobar que salen
los 90 números, sin repetir, y que cada uno se muestra en grande.

**Acceptance Scenarios**:

1. **Given** no hay partida en curso, **When** el cantador pulsa "Nueva partida", **Then** se
   crea una partida con 0 bolas salidas y 90 pendientes.
2. **Given** una partida en curso, **When** el cantador pulsa "Sacar bola", **Then** aparece
   un número entre 1 y 90 que no había salido antes, mostrado en tamaño grande, y el contador
   de bolas salidas aumenta en 1.
3. **Given** han salido las 90 bolas, **When** el cantador intenta sacar otra, **Then** la app
   indica que no quedan bolas y no muestra ningún número nuevo.
4. **Given** acaba de salir el 42 por un toque accidental, **When** el cantador pulsa
   "Deshacer" y confirma, **Then** el 42 vuelve a estar pendiente, se muestra de nuevo la bola
   anterior como última y el contador disminuye en 1.
5. **Given** el cantador acaba de deshacer una bola, **When** intenta deshacer otra vez,
   **Then** la opción no está disponible hasta que saque una nueva bola.

---

### User Story 2 - Tablero 1-90 e historial de últimas bolas (Priority: P1)

Mientras juega, el cantador ve un tablero con los 90 números en el que se distinguen los ya
salidos, y una franja con las últimas bolas en orden, para repetir números a quien lo pida.

**Why this priority**: sin tablero ni historial el cantador no puede responder a "¿ha salido
el 37?" ni repetir las últimas bolas, algo que ocurre en todas las partidas.

**Independent Test**: sacar varias bolas y comprobar que el tablero marca exactamente esas
y que el historial las lista en orden inverso de salida.

**Acceptance Scenarios**:

1. **Given** han salido las bolas 12, 45 y 7 (en ese orden), **When** el cantador mira el
   tablero, **Then** el 7, el 12 y el 45 aparecen marcados y los otros 87 sin marcar.
2. **Given** la misma situación, **When** el cantador mira el historial, **Then** ve 7, 45, 12
   (de la más reciente a la más antigua).
3. **Given** una partida en curso, **When** el cantador consulta el tablero, **Then** puede
   ver el número total de bolas salidas y pendientes.

---

### User Story 3 - Recuperar la partida tras un cierre (Priority: P1)

Si la app se cierra, el navegador se recarga, el móvil se queda sin batería o se reinicia, al
volver a abrir la app el cantador puede continuar exactamente donde lo dejó.

**Why this priority**: perder una partida a medias delante de los jugadores es el peor fallo
posible; es una garantía exigida por la constitución.

**Independent Test**: sacar 20 bolas, cerrar la app por completo (o reiniciar el móvil),
volver a abrirla y comprobar que se ofrece continuar con las mismas 20 bolas en el mismo orden.

**Acceptance Scenarios**:

1. **Given** una partida con 20 bolas salidas, **When** la app se cierra y se vuelve a abrir,
   **Then** se ofrece continuar la partida y, al aceptar, el tablero y el historial muestran las
   mismas 20 bolas en el mismo orden.
2. **Given** una partida en curso, **When** el cantador pulsa "Nueva partida", **Then** la app
   pide confirmación antes de descartar la partida actual.
3. **Given** una partida en curso, **When** el cantador cancela la confirmación, **Then** la
   partida sigue intacta.

---

### User Story 4 - Comprobar una línea o un bingo cantado (Priority: P2)

Cuando un jugador canta "¡línea!" o "¡bingo!", el cantador abre la pantalla de comprobación,
elige el tipo (línea o bingo) e introduce los números del cartón del jugador. La app indica si
todos han salido o señala cuáles no. Después vuelve a la partida exactamente como estaba.

**Why this priority**: aporta mucho valor y evita discusiones, pero se puede jugar sin ella
comprobando a mano con el tablero.

**Independent Test**: con una partida en curso, introducir una línea de 5 números ya salidos
(resultado correcto) y otra con un número no salido (resultado incorrecto, señalando cuál),
volviendo cada vez a la partida sin cambios.

**Acceptance Scenarios**:

1. **Given** han salido 3, 18, 25, 61 y 77, **When** el cantador comprueba una línea con esos
   5 números, **Then** la app indica "Línea correcta".
2. **Given** no ha salido el 61, **When** el cantador comprueba una línea con 3, 18, 25, 61 y
   77, **Then** la app indica "Línea no válida" y señala que el 61 no ha salido.
3. **Given** cualquier resultado de comprobación, **When** el cantador pulsa "Volver a la
   partida", **Then** la partida se muestra con las mismas bolas, sin haber sacado ninguna
   nueva durante la comprobación, y si el sorteo automático estaba en marcha queda en pausa.
4. **Given** el sorteo automático está activo, **When** el cantador abre la comprobación,
   **Then** el sorteo automático se pausa y no sale ninguna bola mientras está abierta.
5. **Given** una comprobación de bingo, **When** el cantador ha introducido menos o más de 15
   números, **Then** la app no permite comprobar e indica cuántos faltan o sobran.
6. **Given** el método de entrada es el teclado numérico, **When** el cantador escribe un
   número repetido o fuera del rango 1-90, **Then** la app lo rechaza con un aviso claro.
7. **Given** han salido, en este orden, ..., 23, 50, 8, 66 y el cartón comprobado se completó
   con el 23, **When** se muestra el resultado, **Then** la app indica "Línea correcta" y avisa
   "Completada con el 23, hace 3 bolas".
8. **Given** el cantador ha marcado 3 números en la cuadrícula, **When** cambia al teclado
   numérico, **Then** los 3 números siguen introducidos y puede añadir el resto escribiéndolos.
9. **Given** una comprobación de bingo correcta, **When** el cantador pulsa "Conceder premio",
   **Then** el bingo queda registrado y la app ofrece terminar la partida o seguir jugando.

---

### User Story 5 - Sorteo automático (Priority: P2)

El cantador activa el modo automático y elige cada cuántos segundos sale una bola. La app
saca bolas sola a ese ritmo; el cantador puede pausar, reanudar o volver al modo manual.

**Why this priority**: es cómodo en partidas largas, pero el modo manual ya cubre lo esencial.

**Independent Test**: activar el modo automático con un intervalo de 5 s, esperar 30 s y
comprobar que han salido unas 6 bolas; pausar y verificar que no salen más.

**Acceptance Scenarios**:

1. **Given** una partida en curso, **When** el cantador activa el modo automático con un
   intervalo de N segundos, **Then** sale una bola nueva cada N segundos.
2. **Given** el modo automático activo, **When** el cantador pulsa "Pausa", **Then** no salen
   más bolas hasta que pulse "Reanudar".
3. **Given** el modo automático activo, **When** se agotan las 90 bolas, **Then** el sorteo
   automático se detiene, se indica que no quedan bolas y se ofrece terminar la partida.
4. **Given** el modo automático activo, **When** la app se cierra y se recupera la partida,
   **Then** la partida se recupera en pausa, conservando el intervalo elegido.

---

### User Story 6 - Uso cómodo en el móvil sin conexión (Priority: P1)

El cantador instala la app en el móvil y la usa en un lugar sin cobertura. La pantalla no se
apaga durante la partida, los controles se alcanzan con el pulgar, puede elegir idioma
(español o gallego) y tema (claro u oscuro).

**Why this priority**: sin funcionamiento offline la app no sirve para su propósito; el resto
de aspectos condicionan que sea usable en una partida real.

**Independent Test**: abrir la app una vez con conexión, activar modo avión, reiniciar el
móvil y jugar una partida completa en gallego y modo oscuro sin que la pantalla se apague.

**Acceptance Scenarios**:

1. **Given** la app se ha abierto al menos una vez con conexión, **When** el dispositivo está
   en modo avión, **Then** la app se abre y todas las funciones operan con normalidad.
2. **Given** una partida en curso, **When** pasa el tiempo de bloqueo habitual del móvil sin
   tocar la pantalla, **Then** la pantalla sigue encendida.
3. **Given** el dispositivo no permite mantener la pantalla encendida, **When** empieza la
   partida, **Then** la app avisa una vez de ello y sigue funcionando.
4. **Given** cualquier pantalla, **When** el cantador cambia el idioma a gallego, **Then**
   todos los textos se muestran en gallego y la preferencia se recuerda.
5. **Given** el sistema está en modo oscuro, **When** se abre la app por primera vez, **Then**
   se muestra en tema oscuro; el cantador puede cambiarlo y la preferencia se recuerda.
6. **Given** el móvil en vertical en una mano, **When** el cantador juega, **Then** los botones
   de sacar bola, pausa y comprobar están en la mitad inferior de la pantalla.

---

### Edge Cases

- **Pulsaciones rápidas**: dos toques muy seguidos en "Sacar bola" no deben provocar errores
  ni perder bolas; cada toque válido saca exactamente una bola.
- **Fin de partida**: con 90 bolas salidas, "Sacar bola" y el modo automático quedan
  deshabilitados, se indica que no quedan bolas y se ofrece terminar la partida.
- **Comprobar sin bolas**: si aún no ha salido ninguna bola, la comprobación se puede abrir
  pero cualquier línea o bingo resultará no válido.
- **Comprobación con todas las casillas vacías o incompletas**: no se permite comprobar hasta
  tener exactamente 5 (línea) o 15 (bingo) números.
- **Cambiar tipo a mitad**: si el cantador cambia de línea a bingo con números ya introducidos,
  se conservan y se ajusta la cantidad requerida.
- **App en segundo plano**: si el cantador cambia de app o bloquea el móvil con el modo
  automático activo, el sorteo automático se pausa y no saca bolas que nadie ve.
- **Actualización de la app**: si hay una versión nueva mientras hay una partida en curso, la
  partida no se pierde ni se interrumpe.
- **Datos guardados dañados o de una versión antigua**: la app no se bloquea; si no puede
  recuperar la partida, lo indica y permite empezar una nueva.
- **Almacenamiento lleno o no disponible** (p. ej. navegación privada): la app funciona y
  avisa de que la partida podría no recuperarse tras un cierre.
- **Giro a horizontal**: la app sigue siendo usable, aunque el diseño está optimizado para
  vertical.

## Requirements *(mandatory)*

### Functional Requirements

**Partida y sorteo**

- **FR-001**: El sistema MUST permitir iniciar una partida nueva con las 90 bolas (1-90)
  pendientes.
- **FR-002**: El sistema MUST sacar, a petición del cantador, una bola elegida al azar entre
  las pendientes, con la misma probabilidad para todas, sin repetir nunca un número en la
  misma partida.
- **FR-003**: El sistema MUST mostrar la última bola en un tamaño que ocupe la parte principal
  de la pantalla y sea legible a varios metros.
- **FR-004**: El sistema MUST mostrar el número de bolas salidas y pendientes.
- **FR-005**: El sistema MUST impedir sacar bolas cuando no queden pendientes, indicar que no
  quedan bolas y ofrecer terminar la partida. Hasta que el cantador la termine, se pueden seguir
  comprobando premios.
- **FR-006**: El sistema MUST pedir confirmación antes de descartar una partida en curso.
- **FR-006a**: El cantador MUST poder deshacer únicamente la última bola sacada, previa
  confirmación; la bola vuelve a quedar pendiente y desaparece del tablero y del historial.
  No se puede deshacer más de una bola seguida (tras deshacer, hay que sacar una nueva bola
  antes de poder deshacer otra vez). Deshacer no está disponible con el sorteo automático en
  marcha.

**Sorteo automático**

- **FR-007**: El cantador MUST poder activar un modo automático que saque una bola cada N
  segundos, eligiendo N entre 3 y 30 segundos (por defecto 5).
- **FR-008**: El cantador MUST poder pausar y reanudar el sorteo automático, y volver al modo
  manual en cualquier momento.
- **FR-009**: El sistema MUST pausar el sorteo automático al abrir la comprobación, al pasar
  la app a segundo plano y al agotarse las bolas.

**Tablero e historial**

- **FR-010**: El sistema MUST mostrar un tablero con los números del 1 al 90 en el que los
  salidos se distingan claramente de los pendientes, no solo por color.
- **FR-011**: El sistema MUST mostrar un historial con, al menos, las 5 últimas bolas, de la
  más reciente a la más antigua, y permitir consultar la secuencia completa de la partida.

**Persistencia**

- **FR-012**: El sistema MUST guardar el estado de la partida en el dispositivo después de
  cada bola, de cada deshacer, de cada premio registrado y de cada cambio de modo o intervalo.
- **FR-013**: Al abrir la app con una partida sin terminar, el sistema MUST ofrecer
  continuarla, restaurando bolas salidas en orden, modo e intervalo; el modo automático se
  restaura siempre en pausa.
- **FR-014**: Si el estado guardado no se puede leer, el sistema MUST informar al cantador y
  permitir iniciar una partida nueva sin bloquearse.

**Comprobación de línea y bingo**

- **FR-015**: El cantador MUST poder abrir una pantalla de comprobación desde la partida y
  elegir entre "Línea" (5 números) y "Bingo" (15 números).
- **FR-016**: La pantalla de comprobación MUST ofrecer dos métodos de entrada, usables con una
  mano: (a) **cuadrícula 1-90**, método por defecto, donde tocar un número lo añade y tocarlo
  otra vez lo quita; y (b) **teclado numérico**, donde se escribe cada número y se añade a la
  lista. El cantador MUST poder cambiar de método en cualquier momento sin perder los números
  ya introducidos, y borrar o corregir cualquiera de ellos. La app recuerda el último método
  usado.
- **FR-017**: Con el teclado numérico, el sistema MUST rechazar números fuera de 1-90 y números
  ya introducidos en la misma comprobación, avisando del motivo. En la cuadrícula estos errores
  no pueden producirse.
- **FR-018**: El sistema MUST permitir comprobar solo cuando la cantidad de números sea
  exactamente la requerida (5 o 15), indicando cuántos faltan o sobran.
- **FR-019**: El sistema MUST indicar si la línea o el bingo es correcto (todos los números
  han salido) y, si no lo es, señalar cuáles no han salido.
- **FR-019a**: Si la comprobación es correcta, el sistema MUST indicar la **bola de
  compleción** (el número del cartón que salió en último lugar) y, si no es la última bola
  sacada, avisar de cuántas bolas han salido después (p. ej. "Completada con el 23, hace 3
  bolas"). El aviso es informativo: el resultado sigue siendo correcto y el cantador decide si
  concede el premio.
- **FR-020**: Desde el resultado, el cantador MUST poder volver a la partida, que se mantiene
  exactamente igual que antes de abrir la comprobación (mismas bolas, premios, modo e
  intervalo). Si el sorteo automático estaba en marcha, vuelve en pausa y el cantador decide
  cuándo reanudarlo.
- **FR-021**: Tras conceder un bingo correcto, el sistema MUST ofrecer terminar la partida o
  seguir jugando.
- **FR-021a**: Cada línea o bingo comprobado como correcto y confirmado por el cantador MUST
  quedar registrado en la partida como premio, indicando el tipo, la bola de compleción y la
  bola sacada en el momento de concederlo (posiciones en el orden de salida). Los premios registrados MUST mostrarse en la pantalla de
  partida y recuperarse junto con ella.
- **FR-021b**: Si ya hay una línea registrada, la comprobación MUST proponer "Bingo" como tipo
  por defecto; el cantador MUST poder seguir eligiendo "Línea" (p. ej. varias líneas en la misma
  bola).
- **FR-021c**: El sistema MUST NOT permitir deshacer una bola si con ella ya se ha registrado
  un premio.
- **FR-022**: Las comprobaciones MUST NOT modificar las bolas salidas ni su orden.

**Uso en el móvil, idioma y tema**

- **FR-023**: Tras la primera carga con conexión, todas las funciones MUST estar disponibles
  sin conexión, incluso tras reiniciar el dispositivo.
- **FR-024**: La app MUST poder instalarse en la pantalla de inicio del móvil y abrirse como
  una aplicación independiente.
- **FR-025**: Durante una partida, el sistema MUST mantener la pantalla encendida cuando el
  dispositivo lo permita, y avisar una vez si no lo permite.
- **FR-026**: La interfaz MUST estar disponible en español y gallego, seleccionable por el
  cantador; la elección MUST recordarse. Por defecto se usa el idioma del dispositivo si es
  gallego, y español en cualquier otro caso.
- **FR-027**: La app MUST ofrecer tema claro y oscuro, seguir por defecto la preferencia del
  sistema y recordar la elección manual.
- **FR-028**: Los controles principales (sacar bola, pausa/reanudar, comprobar) MUST estar en
  la mitad inferior de la pantalla en vertical y tener un tamaño táctil cómodo.
- **FR-029**: Todos los textos y números MUST cumplir un contraste suficiente para lectura
  con poca o mucha luz (nivel AA de accesibilidad) en ambos temas.

### Key Entities

- **Partida**: una sesión de juego. Atributos: bolas salidas en orden de salida, bolas
  pendientes, estado (en curso / terminada), modo (manual / automático), intervalo del modo
  automático, si el automático está en pausa, fecha de inicio, premios registrados.
- **Premio**: línea o bingo validado como correcto en la partida. Atributos: tipo (línea /
  bingo), bola de compleción, bola en que se concedió (posiciones en el orden de salida) y
  números del cartón comprobado.
- **Bola**: un número del 1 al 90. En una partida está pendiente o salida; si ha salido, tiene
  una posición en el orden de salida.
- **Comprobación**: verificación puntual de un cartón cantado. Atributos: tipo (línea /
  bingo), números introducidos, resultado (correcta / no válida) y números no salidos. Las
  comprobaciones no válidas no se guardan; las correctas confirmadas se convierten en Premio.
- **Preferencias**: idioma (español / gallego) y tema (claro / oscuro / sistema), recordados en
  el dispositivo con independencia de la partida.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En 100 partidas completas simuladas, cada partida produce los 90 números
  exactamente una vez, sin ninguna repetición ni omisión.
- **SC-002**: Desde que se pulsa "Sacar bola" hasta que el número es visible pasa menos de
  medio segundo.
- **SC-003**: La última bola es legible por una persona con visión normal a 3 metros del
  móvil.
- **SC-004**: Tras cerrar la app o reiniciar el móvil en mitad de una partida, el 100 % de las
  bolas salidas se recupera en el orden correcto.
- **SC-005**: La app se abre y permite jugar una partida completa en modo avión en el 100 % de
  las pruebas, tras una única carga previa con conexión.
- **SC-006**: Un cantador puede comprobar una línea (5 números) en menos de 20 segundos y un
  bingo (15 números) en menos de 45 segundos, y volver a la partida con un solo toque.
- **SC-007**: Una persona que no ha usado nunca la app consigue empezar una partida y sacar su
  primera bola en menos de 30 segundos, sin ayuda.
- **SC-008**: La pantalla no se apaga durante una partida de 60 minutos en los dispositivos que
  lo permiten.
- **SC-009**: El 100 % de los textos visibles está traducido a español y gallego.

## Assumptions

- **Usuarios**: un único cantador por dispositivo; no hay cuentas ni perfiles. Los jugadores
  usan cartones físicos y no interactúan con la app.
- **Variante de juego**: bingo europeo de 90 bolas; una línea son 5 números y un bingo son 15,
  como en los cartones estándar de 3×9.
- **Alcance de la comprobación**: como la app no conoce los cartones, solo verifica que los
  números introducidos han salido y que la cantidad es la correcta; no valida que formen una
  fila real de un cartón.
- **Orden de premios**: la app registra los premios correctos y propone bingo tras una línea,
  pero no impone el orden ni bloquea comprobaciones; la decisión final es del cantador.
- **Intervalo automático**: rango de 3 a 30 segundos, 5 por defecto, elegido como estándar
  razonable para ritmo de juego en grupo.
- **Historial**: solo existe una partida guardada a la vez; empezar una nueva (con
  confirmación) descarta la anterior. No hay historial de partidas pasadas.
- **Sin sonido ni voz**: la app no canta los números en voz alta (fuera de alcance según la
  constitución).
- **Dispositivos**: móviles modernos con Android o iOS y su navegador habitual; la primera
  carga requiere conexión para descargar e instalar la app.
- **Privacidad**: ningún dato sale del dispositivo; no hay analíticas ni registro remoto.
