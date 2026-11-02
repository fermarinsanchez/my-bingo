# Contract: Pantallas y controles

Contrato de interfaz para el cantador: qué pantallas existen, qué controles muestran y cuándo
están habilitados. Los textos son claves de i18n (`es` / `gl`); se muestran en español como
referencia. Diseño en vertical; zona inferior = alcance del pulgar (constitución, principio IV).

## Navegación

```text
Arranque ──(hay partida guardada)──▶ Diálogo "¿Continuar partida?" ──Sí──▶ Partida
   │                                         └──No (confirma descartar)──▶ Partida nueva
   └──(sin partida)──▶ Partida (vacía, botón "Nueva partida")

Partida ⇄ Comprobación   (al abrir: pausa automático; al volver: estado idéntico)
Partida ⇄ Ajustes        (idioma, tema, intervalo; al abrir: pausa automático)
```

Una sola página; las pantallas son vistas que se muestran/ocultan. El botón "atrás" del sistema
en Comprobación o Ajustes vuelve a Partida.

## Pantalla Partida

| Zona | Elemento | Comportamiento |
|---|---|---|
| Superior | Barra: contador "Bolas: 23 / 90 · Quedan 67", botón Ajustes | Siempre visible. |
| Superior | Premios concedidos ("Línea · bola 32") | Solo si hay premios. |
| Central | **Última bola** en tamaño máximo | Vacío / "—" sin bolas. `aria-live="assertive"`. |
| Central | Historial: últimas 5 bolas (más reciente primero) | Toque → abre tablero completo con secuencia. |
| Central | Tablero 1-90 (10 columnas × 9 filas) | Salidas: fondo relleno **y** marca/negrita (no solo color, FR-010). |
| Inferior | **Sacar bola** (botón principal, ≥ 64 px alto) | Deshabilitado si ¬`canDraw` o si automático en marcha. |
| Inferior | Automático: **Iniciar / Pausa / Reanudar** + intervalo visible | Muestra cuenta atrás hasta la próxima bola. |
| Inferior | **Comprobar** | Siempre habilitado si hay partida. |
| Inferior | **Deshacer** (secundario) | Habilitado solo si `canUndo`; pide confirmación. |
| Menú | **Nueva partida**, **Terminar partida** | Ambas con confirmación (FR-006). |

Estados especiales: sin bolas pendientes → mensaje "No quedan bolas" y oferta de terminar.
Partida terminada → controles de sorteo ocultos, se muestra resumen y "Nueva partida".

## Pantalla Comprobación

| Zona | Elemento | Comportamiento |
|---|---|---|
| Superior | Selector **Línea / Bingo** | Por defecto `defaultCheckType`. Cambiar conserva números. |
| Superior | Contador "3 / 5 · faltan 2" | Rojo/aviso si sobran. |
| Central | Números introducidos (chips con ✕ para quitar) | |
| Central | Entrada: **Cuadrícula 1-90** o **Teclado** (conmutador) | Cambiar conserva números; se recuerda el método. |
| Inferior | **Comprobar** | Habilitado solo con la cantidad exacta. |
| Inferior | **Volver a la partida** | Siempre; no altera la partida. |

Resultado (misma pantalla, panel superpuesto):

- Correcto: "Línea correcta" / "¡Bingo correcto!"; si `ballsSince > 0`: "Completada con el 23,
  hace 3 bolas". Botones: **Conceder premio** (registra `Prize`) y **Volver sin conceder**.
  Tras conceder un bingo: **Terminar partida** / **Seguir jugando**.
- No válido: "Línea no válida"; lista de números no salidos resaltados en la cuadrícula/chips.
  Botones: **Corregir números** y **Volver a la partida**.

Teclado: dígitos 0-9, ⌫, **Añadir**. Errores en línea bajo el campo: "Ese número no existe
(1-90)", "Ya lo has añadido".

## Pantalla Ajustes

- Idioma: Español / Galego.
- Tema: Sistema / Claro / Oscuro.
- Intervalo automático: 3-30 s (control deslizante + valor numérico).
- Información: versión de la app, estado offline ("Lista para usar sin conexión").

## Avisos no bloqueantes (una vez)

- No se puede mantener la pantalla encendida en este dispositivo.
- No se puede guardar la partida en este navegador (p. ej. modo privado).
- Hay una actualización disponible: se aplicará al volver a abrir (o "Actualizar ahora" si no hay
  partida en curso).
- Partida guardada dañada: no se ha podido recuperar.

## Accesibilidad

- Áreas táctiles ≥ 48 × 48 px; botón principal ≥ 64 px de alto.
- Contraste AA en ambos temas; foco visible.
- Diálogos con `<dialog>` modal; el foco vuelve al control que lo abrió.
- `<html lang>` acorde al idioma elegido.
