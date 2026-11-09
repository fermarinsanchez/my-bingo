// @ts-check
// Solo definiciones de tipos (contracts/transport.md). Sin código ejecutable.

/**
 * Estado del canal que notifica un `ParticipantTransport`.
 * @typedef {'connected' | 'disconnected' | 'host-offline' | 'room-unavailable'} TransportStatus
 */

/**
 * Transporte del lado del cantador. `data` es siempre una cadena ya codificada; el canal no
 * garantiza entrega, orden ni unicidad. Las suscripciones devuelven la función de baja.
 * @typedef {object} HostTransport
 * @property {(peerId: string, data: string) => void} send
 * @property {(data: string) => void} broadcast
 * @property {(fn: (peerId: string, data: string) => void) => () => void} onMessage
 * @property {(fn: (peerId: string) => void) => () => void} onPeerLeave
 * @property {() => void} close
 */

/**
 * Transporte del lado del participante.
 * @typedef {object} ParticipantTransport
 * @property {(data: string) => void} send
 * @property {(fn: (data: string) => void) => () => void} onMessage
 * @property {(fn: (status: TransportStatus) => void) => () => void} onStatus
 * @property {() => void} close
 */

/**
 * Reloj inyectado.
 * @typedef {object} Clock
 * @property {() => number} now
 * @property {(fn: () => void, ms: number) => any} setInterval
 * @property {(id: any) => void} clearInterval
 */

export {};
