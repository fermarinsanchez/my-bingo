# Feature Specification: Núcleo de sincronización de la sala compartida (sin red real)

**Feature Branch**: `002-sala-protocolo-sync`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "sala-protocolo-sync — núcleo de sincronización de una partida compartida (sin red real). Ampliación de specs/001-bombo-bingo-offline (referenciar src/core/game.js y specs/001-bombo-bingo-offline/contracts/game-engine.md). Constitución v2.0.0. Solo la lógica pura y testeable: sin transporte real, enlace, QR ni pantallas. Actores: cantador (host, fuente de verdad) y participantes (espectadores de solo lectura). Historias: P1 crear sala y emitir cada cambio como evento, con snapshot completo al unirse; P1 reconexión y reconciliación con snapshot ante mensajes duplicados, perdidos o desordenados; P2 presencia (alias conectados y número de participantes). Decisiones: participantes solo ven; 10-40 habituales, límite duro 40; alias obligatorio, efímero, 1-20, saneado y único; cantador desconectado sin migración de host; cierre explícito de sala; protocolo versionado con rechazo claro; mensajes join, snapshot, ball, undo, prize, end, host-offline/host-online, presence; eventos con número de secuencia y snapshot idempotente que prevalece; reutilizar el modelo de partida sin modificarlo; interfaz Transport + transporte falso en memoria para tests."

## Contexto y relación con la feature 001

Esta feature amplía [001-bombo-bingo-offline](../001-bombo-bingo-offline/spec.md) y no repite
su contenido. La partida (bolas salidas en orden, premios, estado en curso/terminada, deshacer)
se rige por el motor existente descrito en
[contracts/game-engine.md](../001-bombo-bingo-offline/contracts/game-engine.md)
(`src/core/game.js`), que esta feature **lee pero no modifica** (modelo, sorteo, deshacer,
premios, persistencia). Un parche de preview en LAN de la 001 (CORS de Vite y `randomUUID()`
para HTTP) no es protocolo de sala: está en el plan de esta feature y en el motor/quickstart
de la 001.

Aquí solo se especifican las **reglas de sincronización** entre el dispositivo del cantador y
los de los participantes, como lógica pura verificable con un canal simulado. El transporte
real, el enlace para unirse, el QR y cualquier pantalla quedan para features posteriores.

## Clarifications

### Session 2026-11-09

- Q: ¿Cómo se distinguen en el protocolo el fin de la partida y el cierre de la sala? → A: Un
  único mensaje `end` con un campo de alcance: `game` (fin de partida, evento numerado; la sala
  sigue abierta) o `room` (cierre de sala, definitivo).
- Q: Si se pierde el último mensaje y no pasa nada más, ¿cómo detecta el participante que va
  por detrás? → A: Latido periódico del cantador cada 2 s con la última secuencia (hueco
  detectado en ≤ 2 s); tras 6 s sin ningún mensaje del cantador, el participante pasa a
  "cantador desconectado" y pide un snapshot al recuperar contacto. 15 s se descartó por
  dejar al espectador perdido demasiado tiempo.
- Q: ¿Los participantes ven los alias de los demás o solo cuántos son? → A: Solo el número;
  la lista de alias únicamente la conoce el cantador y nunca se envía a los participantes.
- Q: Al desconectarse un participante, ¿se reservan su alias y su plaza? → A: Sí, durante 30 s
  y solo para esa misma identidad; pasado ese plazo se liberan.
- Q: Si la app del cantador se cierra o recarga y la sala desaparece, ¿qué pasa con los
  participantes? → A: Si al reintentar unirse la sala ya no existe, o tras 5 minutos seguidos
  en "cantador desconectado", el participante pasa a "sala no disponible" y deja de reintentar.
- Q: ¿CORS de preview y el fallback de UUID en HTTP forman parte de esta spec? → A: No. No
  cambian historias ni reglas de sala. El modelo de `Game` sigue igual. Se documentan en
  [plan.md](./plan.md) (Complexity Tracking), T038/T044 y en el motor/quickstart de la 001.

## User Scenarios & Testing *(mandatory)*

**Actores**:

- **Cantador (host)**: dirige la partida en su móvil; es la única fuente de verdad. Abre la
  sala, la partida sigue funcionando aunque la sala falle, y puede cerrarla.
- **Participante (espectador)**: sigue la partida en su propio dispositivo en solo lectura.
  Elige un alias para entrar y no puede alterar la partida.

### User Story 1 - Abrir sala y seguir la partida en vivo (Priority: P1)

El cantador abre una sala para su partida. Cada cambio que hace (sacar bola, deshacer la
última, conceder un premio, terminar la partida o empezar una nueva) se emite a la sala como
un evento numerado. Un participante que entra con un alias válido recibe primero el estado
completo de la partida (snapshot) y a partir de ahí aplica los eventos en orden, de modo que ve
exactamente las mismas bolas, en el mismo orden, y los mismos premios que el cantador.

**Why this priority**: es la razón de ser de la sala; sin esto no hay nada que compartir.

**Independent Test**: con un canal simulado sin fallos, el cantador abre sala, saca 10 bolas,
un participante se une, el cantador saca 5 bolas más, deshace la última y concede una línea;
el estado visto por el participante coincide con el del cantador tras cada paso.

**Acceptance Scenarios**:

1. **Given** una partida en curso con 0 bolas, **When** el cantador abre una sala, **Then** la
   sala queda abierta, sin participantes, y la partida no cambia en nada.
2. **Given** una sala abierta con 12 bolas salidas y un premio de línea, **When** un
   participante se une con el alias "Lola", **Then** recibe un snapshot con las 12 bolas en el
   mismo orden, el premio, el estado de la partida y el número de secuencia actual.
3. **Given** un participante sincronizado, **When** el cantador saca el 42, **Then** el
   participante recibe el evento de bola con el siguiente número de secuencia y su tablero
   incluye el 42 como última bola.
4. **Given** un participante sincronizado, **When** el cantador deshace la última bola,
   **Then** el participante la quita de su estado y la bola anterior pasa a ser la última.
5. **Given** un participante sincronizado, **When** el cantador concede un bingo, **Then** el
   participante ve el premio con su tipo y las bolas de compleción y de concesión.
6. **Given** un participante sincronizado, **When** el cantador termina la partida, **Then**
   el participante ve la partida como terminada y la sala sigue abierta.
7. **Given** un participante sincronizado, **When** el cantador empieza una partida nueva con
   la sala abierta, **Then** el participante recibe un snapshot de la partida nueva (0 bolas)
   que sustituye por completo a la anterior.
8. **Given** una sala abierta con participantes, **When** el cantador cierra la sala,
   **Then** todos los participantes reciben el cierre, pasan a estado "sala cerrada" y no
   intentan reconectarse; nuevas uniones se rechazan.

---

### User Story 2 - Reconexión y reconciliación ante una red poco fiable (Priority: P1)

Un participante pierde la conexión (túnel, cambio de wifi a datos, pantalla bloqueada) y
vuelve. Mientras tanto pueden haberse perdido, duplicado o desordenado mensajes. Al volver, o
en cuanto detecta un hueco en la numeración, el participante pide y aplica un snapshot y queda
de nuevo idéntico al cantador, sin bolas duplicadas ni perdidas. Si quien se desconecta es el
cantador, los participantes muestran "cantador desconectado" y se resincronizan solos cuando
vuelve; la sala no se cierra por ello.

**Why this priority**: en locales y fiestas la red falla a menudo; si la sala se descuadra,
los espectadores dejan de confiar en ella y la feature no aporta valor.

**Independent Test**: simular una partida de 90 bolas con deshacer y premios sobre un canal
que pierde, duplica y desordena mensajes de forma aleatoria (con semilla reproducible), con
desconexiones intermedias de participantes y del cantador; tras estabilizarse el canal, el
estado de todos los participantes coincide exactamente con el del cantador.

**Acceptance Scenarios**:

1. **Given** un participante en la secuencia 20, **When** recibe de nuevo el evento 20 (o
   cualquier anterior), **Then** lo descarta y su estado no cambia.
2. **Given** un participante en la secuencia 20, **When** recibe el evento 22 sin haber
   recibido el 21, **Then** no aplica el 22 fuera de orden, marca que está desincronizado y
   pide un snapshot.
3. **Given** un participante desincronizado, **When** recibe un snapshot con secuencia 25,
   **Then** sustituye su estado por el del snapshot, queda en la secuencia 25 y descarta
   cualquier evento con secuencia ≤ 25 que llegue después.
4. **Given** un participante en la secuencia 30, **When** recibe un snapshot antiguo con
   secuencia 27, **Then** lo ignora y su estado no retrocede.
5. **Given** que se perdió el último evento emitido y el cantador no hace nada más, **When**
   al participante le llega el siguiente latido (como mucho 2 s después), **Then** detecta que
   va por detrás y pide un snapshot.
5a. **Given** un participante conectado, **When** pasan 6 s sin recibir ningún mensaje del
   cantador, **Then** pasa a "cantador desconectado" sin perder la última partida conocida.
6. **Given** un participante que se desconectó en la secuencia 10 mientras salían 8 bolas,
   **When** vuelve a unirse con el mismo alias, **Then** recibe un snapshot y ve las 8 bolas
   nuevas sin duplicar ninguna.
7. **Given** una sala con participantes, **When** el cantador pierde la conexión, **Then** los
   participantes pasan a estado "cantador desconectado", conservan la última partida conocida y
   no la dan por terminada.
7a. **Given** un participante en "cantador desconectado", **When** pasan 5 minutos sin
   noticias del cantador, o al reintentar se le indica que la sala no existe, **Then** pasa a
   "sala no disponible", conserva la última partida conocida y deja de reintentar.
8. **Given** el cantador desconectado ha seguido sacando bolas sin red, **When** recupera la
   conexión, **Then** los participantes pasan a "cantador conectado", detectan que van por
   detrás y convergen al estado actual mediante snapshot.
9. **Given** un participante que vuelve a unirse con el mismo alias antes de que se haya
   detectado la caída de su conexión anterior, **When** el cantador procesa la unión, **Then**
   la nueva conexión sustituye a la anterior y no se rechaza por alias duplicado.

---

### User Story 3 - Presencia de participantes (Priority: P2)

El cantador ve en todo momento cuántos participantes hay conectados y sus alias, y cada
participante ve cuántas personas siguen la partida. La información se actualiza cuando alguien
entra o sale.

**Why this priority**: da confianza y ambiente al cantador, pero la sala ya es útil sin ella.

**Independent Test**: unir 3 participantes, desconectar 1 y volver a unirlo; tras cada paso, la
lista de alias y el contador del cantador, y el contador de los participantes, son correctos.

**Acceptance Scenarios**:

1. **Given** una sala abierta sin participantes, **When** se unen "Ana", "Brais" y "Carme",
   **Then** el cantador ve esos 3 alias y el número 3.
2. **Given** la situación anterior, **When** "Brais" se desconecta, **Then** el cantador ve
   "Ana" y "Carme" y el número 2, y los participantes conectados ven el número 2.
3. **Given** 40 participantes conectados, **When** uno se desconecta, **Then** el número
   pasa a 39, pero su plaza queda reservada 30 s y una identidad nueva que intente unirse en
   ese plazo se rechaza con "sala llena".
4. **Given** la situación anterior, **When** pasan 30 s sin que vuelva y se une una identidad
   nueva, **Then** el nuevo entra y el número vuelve a 40.

---

### Edge Cases

- **Sala llena**: con 40 plazas ocupadas (conectados más reservados), el 41.º se rechaza con
  el motivo "sala llena". La reconexión de un participante que ya ocupaba plaza o la tiene
  reservada (misma identidad) no cuenta como nuevo y se acepta.
- **Alias inválido**: vacío, solo espacios o con más de 20 caracteres tras sanearlo se rechaza
  con el motivo "alias no válido".
- **Alias duplicado**: un alias igual a uno ya conectado (sin distinguir mayúsculas/minúsculas
  ni espacios sobrantes) de otro participante se rechaza con el motivo "alias en uso".
- **Alias y plaza reservados**: cuando un participante se desconecta, su alias y su plaza
  quedan reservados 30 s para su misma identidad; otra identidad que pida ese alias en ese plazo
  recibe "alias en uso". Si vuelve pasados los 30 s y entretanto otro ha ocupado su alias o la
  sala se ha llenado, se le rechaza con el motivo correspondiente.
- **Versión de protocolo incompatible**: una unión con versión distinta se rechaza con el
  motivo "versión incompatible"; un participante que recibe mensajes del cantador de una
  versión que no entiende muestra ese motivo en vez de fallar.
- **Mensajes mal formados o de tipo desconocido**: se ignoran sin errores y sin alterar el
  estado de nadie.
- **Mensajes que un participante no puede enviar**: si llega de un participante cualquier cosa
  distinta de unirse o pedir resincronización (p. ej. una bola), el cantador la ignora; la
  partida no cambia.
- **Unión con la sala cerrada**: se rechaza con el motivo "sala cerrada".
- **Partida terminada**: los participantes pueden seguir uniéndose y reciben un snapshot de la
  partida terminada mientras la sala siga abierta.
- **Participante que entra con 90 bolas salidas**: recibe el snapshot completo en un solo
  mensaje y queda sincronizado igual que con 0 bolas.
- **Ráfagas de peticiones de snapshot**: varias peticiones seguidas del mismo participante no
  alteran la partida ni el estado de los demás.
- **Fallo de la sala**: cualquier error de sincronización (canal caído, mensaje inválido,
  rechazo) NUNCA afecta al sorteo, a los premios ni a la persistencia de la partida del
  cantador (constitución, Principio I).
- **Reinicio de la app del cantador**: la sala vive solo en memoria; si la app del cantador se
  cierra o recarga, la sala desaparece y la partida se recupera como en la feature 001, sin
  sala. Los participantes pasan a "sala no disponible" en cuanto el canal indica que la sala ya
  no existe o tras 5 minutos seguidos en "cantador desconectado" (FR-025a).

## Requirements *(mandatory)*

### Functional Requirements

**Sala (lado del cantador)**

- **FR-001**: El cantador MUST poder abrir una sala para la partida en curso. Abrir la sala
  MUST NOT modificar la partida.
- **FR-002**: La sala MUST derivar todo lo que comparte del estado de la partida del motor
  existente (`src/core/game.js`), sin modificar ese modelo de datos ni las reglas de sorteo,
  deshacer, premios o persistencia. El origen del `id` de partida (`randomUUID()` en `rng.js`)
  es un parche de preview de la 001, no un cambio de modelo.
- **FR-003**: Cada cambio de la partida relevante para los espectadores MUST emitirse como un
  evento: bola sacada (`ball`), última bola deshecha (`undo`), premio concedido (`prize`) y
  partida terminada (`end` con alcance `game`). Empezar una partida nueva con la sala abierta
  MUST emitirse como un snapshot de la partida nueva.
- **FR-004**: Cada **cambio de estado** compartido (`ball`, `undo`, `prize`, `end` con alcance
  `game` y el snapshot de una partida nueva) MUST llevar un número de secuencia que crece de uno
  en uno durante toda la vida de la sala, también entre partidas sucesivas. Un snapshot enviado
  en respuesta a una unión o a una petición de resincronización lleva la secuencia del estado que
  representa, sin incrementarla. El resto de mensajes del cantador (presencia, cantador
  conectado, cierre de sala) MUST indicar el último número de secuencia emitido.
- **FR-004a**: Mientras la sala esté abierta, el cantador MUST emitir un latido cada 2
  segundos (`host-online` con la última secuencia emitida), haya o no cambios en la partida.
- **FR-004b**: Si un participante pasa 6 segundos sin recibir ningún mensaje del cantador,
  MUST pasar a "cantador desconectado"; en cuanto vuelva a recibir un mensaje suyo, MUST volver
  a "cantador conectado" y resincronizarse si va por detrás (FR-019, FR-024).
- **FR-005**: El cantador MUST poder cerrar la sala explícitamente; el cierre (`end` con
  alcance `room`) se comunica a todos los participantes conectados, indica la última secuencia
  emitida y, a partir de ese momento, toda unión se rechaza. Un `end` sin alcance válido es un
  mensaje mal formado (FR-028).
- **FR-006**: Los participantes no pueden alterar la partida: el cantador MUST aceptar de un
  participante únicamente la petición de unión (`join`) y la petición de resincronización;
  cualquier otro mensaje se ignora sin alterar la partida.

**Unión y alias**

- **FR-007**: Para unirse, un participante MUST enviar la versión de protocolo, un alias y una
  identidad efímera de participante que se mantiene mientras su dispositivo conserve la sesión
  en memoria.
- **FR-008**: El alias MUST sanearse antes de validarlo: eliminar caracteres de control y
  marcas no visibles, eliminar caracteres que puedan interpretarse como marcado, recortar
  espacios al inicio y al final y reducir espacios internos repetidos a uno.
- **FR-009**: Tras sanearlo, el alias MUST tener entre 1 y 20 caracteres visibles; en otro caso
  la unión se rechaza con el motivo "alias no válido".
- **FR-010**: El alias MUST ser único entre los participantes conectados o con plaza reservada
  (FR-012a), comparando sin
  distinguir mayúsculas/minúsculas; un alias en uso por otra identidad se rechaza con el
  motivo "alias en uso".
- **FR-011**: La sala MUST admitir como máximo 40 plazas ocupadas, contando conectados y
  reservados (FR-012a); una unión de una identidad nueva con las 40 plazas ocupadas se rechaza
  con el motivo "sala llena".
- **FR-012**: Una unión con la misma identidad que un participante ya conectado MUST sustituir
  a la conexión anterior (sin ocupar una plaza más ni chocar con su propio alias).
- **FR-012a**: Al desconectarse un participante, su alias y su plaza MUST quedar reservados
  durante 30 segundos solo para su misma identidad; si vuelve en ese plazo, recupera su plaza
  aunque la sala esté llena. Pasados los 30 s, la reserva se libera. La unicidad de alias
  (FR-010) tiene en cuenta también los alias reservados.
- **FR-013**: Una unión con una versión de protocolo distinta de la del cantador MUST
  rechazarse con el motivo "versión incompatible", sin errores en ningún extremo.
- **FR-014**: Toda unión aceptada MUST responderse con un snapshot completo; toda unión
  rechazada MUST responderse con un único motivo de entre: "alias no válido", "alias en uso",
  "sala llena", "versión incompatible", "sala cerrada".
- **FR-015**: El alias y la identidad de los participantes MUST existir solo en memoria
  mientras dure la sala y nunca persistirse (constitución, Principio I).

**Snapshot y reconciliación (lado del participante)**

- **FR-016**: El snapshot MUST contener el estado completo que necesita un espectador: bolas
  salidas en orden, premios registrados (tipo, bola de compleción y bola de concesión), estado
  de la partida (en curso / terminada), identificador de la partida y número de secuencia.
- **FR-017**: Aplicar un snapshot MUST ser idempotente: aplicar el mismo snapshot una o varias
  veces produce el mismo estado.
- **FR-018**: Un participante MUST aplicar un evento solo si su secuencia es exactamente la
  siguiente a la última aplicada; MUST descartar sin efecto los eventos con secuencia igual o
  inferior.
- **FR-019**: Si un participante recibe un evento con secuencia mayor que la siguiente, o
  cualquier mensaje del cantador que indique una secuencia posterior a la suya, MUST
  considerarse desincronizado, no aplicar eventos fuera de orden y pedir un snapshot. Mientras
  esté desincronizado conserva el último estado válido conocido.
- **FR-020**: Un snapshot con secuencia mayor o igual que la del participante MUST sustituir
  por completo su estado y dejarlo sincronizado; un snapshot con secuencia menor MUST
  ignorarse.
- **FR-021**: Al recuperar la conexión, un participante MUST volver a unirse con su mismo alias
  e identidad y reconciliarse con el snapshot recibido. Mientras dure su reserva (FR-012a) o
  siga conectado, el cantador MUST conservarle su alias original (cualquier otro alias en el
  `join` de reconexión se ignora). Pasada la reserva, vuelve a pedir su alias y lo obtiene si
  sigue libre.
- **FR-022**: Un participante MUST tratar como inválido (y no aplicar) cualquier evento que
  contradiga su estado sincronizado (p. ej. una bola ya salida o un deshacer de una bola que no
  es la última), pasando a desincronizado y pidiendo un snapshot.

**Cantador desconectado y cierre**

- **FR-023**: Cuando el canal notifique que el cantador está desconectado (`host-offline`), los
  participantes MUST pasar a estado "cantador desconectado" conservando la última partida
  conocida; la sala no se cierra por ello y no hay migración de host.
- **FR-024**: Cuando el cantador vuelva (`host-online`), los participantes MUST pasar a
  "cantador conectado" y, si van por detrás de la secuencia indicada, resincronizarse por
  snapshot sin intervención del usuario.
- **FR-025**: Al recibir el cierre de sala, el participante MUST pasar a estado "sala cerrada",
  conservar la última partida conocida y no reintentar la unión.
- **FR-025a**: Un participante MUST pasar a estado "sala no disponible", conservar la última
  partida conocida y dejar de reintentar cuando (a) al intentar unirse o reunirse el canal
  indique que la sala no existe, o (b) lleve 5 minutos seguidos en "cantador desconectado".

**Presencia**

- **FR-026**: El cantador MUST conocer en todo momento la lista de alias conectados y su
  número, actualizados en cada unión aceptada, sustitución y desconexión. Los participantes
  con plaza reservada no cuentan como conectados.
- **FR-027**: Tras cada cambio de presencia, los participantes conectados MUST recibir el
  número de participantes conectados (`presence`). Ningún mensaje enviado a los participantes
  MUST contener alias de otros participantes; la lista de alias solo la conoce el cantador.

**Versión, robustez y aislamiento**

- **FR-028**: Todos los mensajes MUST llevar la versión de protocolo. Un mensaje de versión
  incompatible o mal formado MUST ignorarse o rechazarse de forma controlada, sin lanzar
  errores no gestionados ni modificar el estado.
- **FR-029**: La lógica de sala MUST funcionar sobre un canal de comunicación intercambiable, y
  MUST poder ejercitarse íntegramente con un canal simulado en memoria capaz de perder,
  duplicar, desordenar y retrasar mensajes de forma reproducible, y de simular desconexiones
  del cantador y de participantes.
- **FR-030**: Ningún fallo de la sala MUST afectar al sorteo, a los premios ni a la
  persistencia de la partida del cantador.

### Key Entities

- **Sala**: sesión efímera de compartición de una partida. Atributos: abierta / cerrada,
  versión de protocolo, último número de secuencia emitido, participantes conectados (máx.
  40). Solo existe en memoria del dispositivo del cantador.
- **Participante**: espectador conectado. Atributos: identidad efímera, alias saneado, estado
  de conexión (conectado / reservado durante 30 s tras desconectarse). Solo en memoria.
- **Mensaje**: unidad intercambiada por el canal. Atributos comunes: versión de protocolo y
  tipo (`join`, petición de resincronización, `snapshot`, `ball`, `undo`, `prize`, `end`,
  `host-online`, `presence`, rechazo). Los de estado llevan número de secuencia; los demás del
  cantador indican la última secuencia emitida. `host-offline` no lo envía el cantador: lo
  notifica el canal (relé) cuando detecta su caída.
- **Snapshot**: fotografía completa de lo que ve un espectador (ver FR-016). Prevalece sobre
  cualquier evento con secuencia igual o anterior.
- **Vista del participante**: estado local de cada espectador: copia de solo lectura de la
  partida (bolas en orden, premios, estado), última secuencia aplicada, estado de
  sincronización (sincronizado / desincronizado), estado de conexión (conectado / cantador
  desconectado / sala cerrada / sala no disponible / rechazado con motivo) y número de participantes.
- **Motivo de rechazo**: "alias no válido", "alias en uso", "sala llena", "versión
  incompatible", "sala cerrada".

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En al menos 1 000 sesiones simuladas reproducibles (partidas completas de hasta
  90 bolas con deshacer, premios, partida nueva y desconexiones), con hasta un 30 % de mensajes
  perdidos, duplicados o desordenados, el estado de cada participante converge al del cantador
  en el 100 % de los casos una vez el canal se estabiliza.
- **SC-002**: En ninguna de esas sesiones un participante muestra en ningún momento una bola
  repetida ni un orden de bolas distinto del del cantador (0 casos).
- **SC-003**: Un participante que se une en cualquier momento de la partida queda sincronizado
  tras recibir un único snapshot, en el 100 % de los casos.
- **SC-003a**: Si se pierde el último cambio y el canal sigue funcionando, el participante detecta
  el hueco con el siguiente latido y lo muestra tras una única resincronización: en simulación
  sin retraso de red, como máximo 2,5 s después del cambio perdido, en el 100 % de los casos.
- **SC-004**: Con 40 plazas ocupadas, el 100 % de los intentos de unión de una identidad
  nueva se rechazan con el motivo "sala llena", y el 100 % de los participantes que vuelven en
  menos de 30 s recuperan su plaza y su alias.
- **SC-005**: El 100 % de los alias inválidos o duplicados se rechazan con su motivo, y el
  100 % de los alias válidos y libres se aceptan.
- **SC-006**: El 100 % de las uniones o mensajes con versión incompatible o mal formados se
  gestionan sin errores no controlados.
- **SC-007**: Tras cada entrada o salida de participantes, el número y la lista mostrados al
  cantador coinciden con los participantes realmente conectados en el 100 % de los casos.
- **SC-008**: En todas las sesiones simuladas, la partida del cantador es idéntica a la que se
  obtendría jugando sin sala (la sala no altera el juego).
- **SC-009**: Cada categoría de pruebas del protocolo exigida por la constitución (snapshot,
  duplicados, perdidos, desordenados, versión incompatible, límite de 40 y alias saneado)
  tiene pruebas automatizadas que pasan.

## Assumptions

- **Alcance**: esta feature solo entrega la lógica de sincronización y un canal simulado para
  probarla. El transporte real, el relé, el enlace, el QR y las pantallas de sala y de
  espectador son features posteriores que se apoyarán en esta.
- **Petición de resincronización**: además de `join`, el participante puede pedir un snapshot
  cuando detecta un hueco; es la única otra cosa que puede enviar y no afecta a la partida.
- **Detección de desconexiones**: la caída del cantador se detecta por el canal (`host-offline`)
  o por ausencia de latidos durante 6 s (FR-004b). La caída de un participante la notifica el
  canal; aquí se modela como una notificación del canal simulado.
- **Tiempo en la lógica pura**: el latido y el plazo de 6 s se expresan con un reloj
  inyectable, de modo que las pruebas los simulan sin esperas reales.
- **Identidad efímera**: además de permitir recuperar la plaza reservada, evita falsos "alias
  en uso" cuando la caída de la conexión anterior aún no se ha detectado.
- **Datos compartidos**: el modo (manual/automático), el intervalo y la pausa del cantador no
  se comparten; un espectador solo necesita bolas, premios y estado de la partida.
- **Mismo protocolo en ambos extremos**: solo hay una versión vigente; no se negocian
  versiones ni hay compatibilidad hacia atrás.
- **Volumen**: entre 10 y 40 participantes habituales; un snapshot con 90 bolas y sus premios
  es pequeño y cabe en un solo mensaje.
- **Seguridad**: no hay cuentas ni autenticación; impedir que un tercero suplante al cantador
  es responsabilidad del transporte real y queda fuera de esta feature. El núcleo sí garantiza
  que nada enviado por un participante modifica la partida.
- **Dependencias**: motor de partida de la feature 001 (`src/core/game.js`) y constitución
  v2.0.0 (Principios I, II, V y VI).
