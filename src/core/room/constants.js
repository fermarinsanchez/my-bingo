// @ts-check

/** Versión vigente del protocolo de sala (contracts/room-protocol.md). */
export const PROTOCOL_VERSION = 1;
/** Plazas máximas de una sala (conectados + reservados). */
export const MAX_PARTICIPANTS = 40;
/** Longitud máxima del alias en grafemas. */
export const ALIAS_MAX = 20;
/** Tamaño máximo de un mensaje codificado, en bytes UTF-8. */
export const MAX_MESSAGE_BYTES = 16384;
/** Periodo del latido `host-online` del cantador. */
export const HEARTBEAT_MS = 2000;
/** Silencio del cantador tras el cual el participante lo da por desconectado. */
export const HOST_SILENCE_MS = 6000;
/** Duración de la reserva de plaza y alias tras desconectarse. */
export const RESERVATION_MS = 30000;
/** Tiempo seguido en `host-offline` tras el cual la sala se da por perdida. */
export const HOST_GONE_MS = 300000;
/** Mínimo entre dos peticiones `resync` seguidas. */
export const RESYNC_RETRY_MS = 2000;
/** Periodo del tick que generan las sesiones. */
export const TICK_MS = 250;
/** Total de bolas del bombo (igual que `TOTAL_BALLS` en game.js, sin importarlo). */
export const TOTAL_BALLS = 90;
