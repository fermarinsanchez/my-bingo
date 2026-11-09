import { describe, it, expect } from 'vitest';
import { createParticipant, participantStep } from '../../../src/core/room/participant.js';
import { encodeMessage } from '../../../src/core/room/protocol.js';
import {
  HOST_GONE_MS,
  HOST_SILENCE_MS,
  RESYNC_RETRY_MS,
} from '../../../src/core/room/constants.js';

const PID = 'participant-001';
const NOW = 1000;
const VIEW = {
  gameId: 'g-1',
  status: 'in-progress',
  drawn: [12, 45, 7],
  prizes: [],
};
const welcome = (extra = {}) =>
  encodeMessage({
    type: 'snapshot',
    seq: 4,
    view: VIEW,
    alias: 'Lola',
    participantCount: 3,
    ...extra,
  });
const data = (m) => encodeMessage(m);

const start = () => createParticipant({ participantId: PID, alias: 'Lola', now: NOW });
const step = (s, input) => participantStep(s, input);
const message = (s, d, now = NOW) => step(s, { type: 'message', data: d, now });
const status = (s, st, now = NOW) => step(s, { type: 'status', status: st, now });
const tick = (s, now) => step(s, { type: 'tick', now });

/** Participante ya sincronizado con VIEW y seq 4. */
function synced() {
  let s = start();
  s = status(s, 'connected').state;
  s = message(s, welcome()).state;
  return s;
}

describe('createParticipant', () => {
  it('empieza uniéndose, sin vista', () => {
    const s = start();
    expect(s).toMatchObject({
      participantId: PID,
      alias: 'Lola',
      connection: 'joining',
      sync: 'waiting',
      view: null,
      seq: null,
      participantCount: null,
      rejectReason: null,
      lastHostMessageAt: NOW,
      hostOfflineSince: null,
      lastResyncAt: null,
    });
  });
});

describe('participantStep: unión (camino feliz)', () => {
  it('al conectar el canal envía join con su id y alias', () => {
    const r = status(start(), 'connected');
    expect(r.out).toEqual([{ type: 'join', participantId: PID, alias: 'Lola' }]);
    expect(r.state.connection).toBe('joining');
  });

  it('el snapshot de bienvenida sincroniza y confirma el alias', () => {
    const r = message(status(start(), 'connected').state, welcome({ alias: 'Lola P' }));
    expect(r.out).toEqual([]);
    expect(r.state).toMatchObject({
      connection: 'connected',
      sync: 'synced',
      seq: 4,
      view: VIEW,
      participantCount: 3,
      alias: 'Lola P',
    });
  });

  it('aplica en orden ball, undo, prize y end de partida', () => {
    let s = synced();
    s = message(s, data({ type: 'ball', seq: 5, ball: 42 })).state;
    expect(s.view.drawn).toEqual([12, 45, 7, 42]);
    expect(s.seq).toBe(5);
    s = message(s, data({ type: 'undo', seq: 6, ball: 42 })).state;
    expect(s.view.drawn).toEqual([12, 45, 7]);
    s = message(s, data({ type: 'prize', seq: 7, prize: { type: 'line', completionPosition: 2, awardedAtPosition: 3 } })).state;
    expect(s.view.prizes).toEqual([{ type: 'line', completionPosition: 2, awardedAtPosition: 3 }]);
    s = message(s, data({ type: 'end', scope: 'game', seq: 8 })).state;
    expect(s.view.status).toBe('finished');
    expect(s.seq).toBe(8);
    expect(s.sync).toBe('synced');
    expect(s.connection).toBe('connected');
  });

  it('un snapshot de difusión con seq + 1 (partida nueva) reemplaza la vista', () => {
    const s = synced();
    const next = { gameId: 'g-2', status: 'in-progress', drawn: [], prizes: [] };
    const r = message(s, data({ type: 'snapshot', seq: 5, view: next }));
    expect(r.state.view).toEqual(next);
    expect(r.state.seq).toBe(5);
    expect(r.state.sync).toBe('synced');
    expect(r.out).toEqual([]);
  });

  it('antes del snapshot de bienvenida ignora los eventos', () => {
    const s = status(start(), 'connected').state;
    const r = message(s, data({ type: 'ball', seq: 5, ball: 42 }));
    expect(r.state.view).toBeNull();
    expect(r.state.connection).toBe('joining');
    expect(r.out).toEqual([]);
  });

  it('presence actualiza el número de participantes sin tocar la vista', () => {
    const s = synced();
    const r = message(s, data({ type: 'presence', count: 9, lastSeq: 4 }));
    expect(r.state.participantCount).toBe(9);
    expect(r.state.view).toBe(s.view);
    expect(r.state.seq).toBe(4);
  });
});

describe('participantStep: rechazo, cierre y estados finales', () => {
  it('reject → rejected con el motivo (final)', () => {
    const s = status(start(), 'connected').state;
    const r = message(s, data({ type: 'reject', reason: 'alias-taken' }));
    expect(r.state.connection).toBe('rejected');
    expect(r.state.rejectReason).toBe('alias-taken');
    expect(r.out).toEqual([]);
  });

  it('reject se entiende con cualquier versión', () => {
    const s = status(start(), 'connected').state;
    const raw = JSON.stringify({ v: 7, type: 'reject', reason: 'incompatible-version' });
    expect(message(s, raw).state.rejectReason).toBe('incompatible-version');
  });

  it('end{room} → closed (final) y conserva la última vista', () => {
    const s = synced();
    const r = message(s, data({ type: 'end', scope: 'room', lastSeq: 4 }));
    expect(r.state.connection).toBe('closed');
    expect(r.state.view).toEqual(VIEW);
    expect(r.out).toEqual([]);
  });

  it.each([
    ['rejected', (s) => message(status(s, 'connected').state, data({ type: 'reject', reason: 'room-full' })).state],
    ['closed', (s) => message(s, data({ type: 'end', scope: 'room', lastSeq: 4 })).state],
  ])('en estado final %s se ignora toda entrada y no se envía nada', (_name, make) => {
    const final = make(synced());
    for (const input of [
      { type: 'status', status: 'connected', now: NOW + 1 },
      { type: 'status', status: 'disconnected', now: NOW + 1 },
      { type: 'status', status: 'host-offline', now: NOW + 1 },
      { type: 'message', data: data({ type: 'ball', seq: 5, ball: 1 }), now: NOW + 1 },
      { type: 'message', data: welcome({ seq: 99 }), now: NOW + 1 },
      { type: 'tick', now: NOW + 10_000_000 },
    ]) {
      const r = step(final, input);
      expect(r.state).toBe(final);
      expect(r.out).toEqual([]);
    }
  });

  it('un mensaje con v ≠ 1 (no reject) → rejected con incompatible-version', () => {
    const s = synced();
    const r = message(s, JSON.stringify({ v: 2, type: 'ball', seq: 5, ball: 1 }));
    expect(r.state.connection).toBe('rejected');
    expect(r.state.rejectReason).toBe('incompatible-version');
    expect(r.out).toEqual([]);
  });

  it('mensajes malformados o demasiado grandes se ignoran', () => {
    const s = synced();
    for (const d of ['basura', '{', 'x'.repeat(20000), undefined, 5, data({ type: 'join', participantId: PID, alias: 'x' })]) {
      const r = message(s, /** @type {any} */ (d));
      expect(r.state.connection).toBe('connected');
      expect(r.state.view).toBe(s.view);
      expect(r.state.seq).toBe(4);
      expect(r.out).toEqual([]);
    }
  });

  it('entradas desconocidas se ignoran', () => {
    const s = synced();
    const r = step(s, /** @type {any} */ ({ type: 'otra' }));
    expect(r.state).toBe(s);
    expect(r.out).toEqual([]);
  });
});

describe('participantStep: reconciliación', () => {
  const sameView = (a, b) =>
    a.seq === b.seq && a.sync === b.sync && a.connection === b.connection && a.view === b.view;

  it('un evento con seq ≤ s se descarta sin enviar nada', () => {
    const s = synced();
    for (const seq of [4, 3, 0]) {
      const r = message(s, data({ type: 'ball', seq, ball: 42 }));
      expect(r.out).toEqual([]);
      expect(r.state.seq).toBe(4);
      expect(r.state.sync).toBe('synced');
      expect(r.state.view).toEqual(VIEW);
      expect(sameView(r.state, s) || r.state.lastHostMessageAt >= s.lastHostMessageAt).toBe(true);
    }
  });

  it('seq > s + 1 desincroniza, no aplica y pide resync', () => {
    const s = synced();
    const r = message(s, data({ type: 'ball', seq: 6, ball: 42 }));
    expect(r.state.sync).toBe('desynced');
    expect(r.state.view).toEqual(VIEW);
    expect(r.state.seq).toBe(4);
    expect(r.out).toEqual([{ type: 'resync' }]);
  });

  it('un evento incoherente con seq = s + 1 desincroniza y pide resync', () => {
    const s = synced();
    const already = message(s, data({ type: 'ball', seq: 5, ball: 12 }));
    expect(already.state.sync).toBe('desynced');
    expect(already.state.view).toEqual(VIEW);
    expect(already.out).toEqual([{ type: 'resync' }]);
    const undoWrong = message(s, data({ type: 'undo', seq: 5, ball: 45 }));
    expect(undoWrong.state.sync).toBe('desynced');
    expect(undoWrong.out).toEqual([{ type: 'resync' }]);
  });

  it('cualquier mensaje con lastSeq > s desincroniza y pide resync', () => {
    const s = synced();
    const r = message(s, data({ type: 'host-online', lastSeq: 9 }));
    expect(r.state.sync).toBe('desynced');
    expect(r.state.seq).toBe(4);
    expect(r.out).toEqual([{ type: 'resync' }]);
  });

  it('en desynced solo se reenvía resync cada RESYNC_RETRY_MS', () => {
    const s = synced();
    const first = message(s, data({ type: 'ball', seq: 8, ball: 1 }), NOW);
    expect(first.out).toEqual([{ type: 'resync' }]);
    const soon = message(first.state, data({ type: 'ball', seq: 9, ball: 2 }), NOW + RESYNC_RETRY_MS - 1);
    expect(soon.out).toEqual([]);
    expect(soon.state.sync).toBe('desynced');
    const later = message(soon.state, data({ type: 'host-online', lastSeq: 10 }), NOW + RESYNC_RETRY_MS);
    expect(later.out).toEqual([{ type: 'resync' }]);
  });

  it('un snapshot con seq ≥ s sustituye la vista y sincroniza; uno menor se ignora', () => {
    const s = synced();
    const next = { gameId: 'g-9', status: 'in-progress', drawn: [1, 2], prizes: [] };
    const a = message(s, data({ type: 'snapshot', seq: 4, view: next }));
    expect(a.state.sync).toBe('synced');
    expect(a.state.view).toEqual(next);
    const again = message(a.state, data({ type: 'snapshot', seq: 4, view: next }));
    expect(again.state.sync).toBe('synced');
    expect(again.state.view).toEqual(a.state.view);
    expect(again.state.seq).toBe(a.state.seq);
    const older = message(a.state, data({ type: 'snapshot', seq: 3, view: VIEW }));
    expect(older.state.view).toEqual(next);
    expect(older.state.seq).toBe(4);
  });

  it('el snapshot de difusión con seq = s + 1 (partida nueva) reemplaza la vista', () => {
    const s = synced();
    const next = { gameId: 'g-2', status: 'in-progress', drawn: [], prizes: [] };
    const r = message(s, data({ type: 'snapshot', seq: 5, view: next }));
    expect(r.state.view).toEqual(next);
    expect(r.state.seq).toBe(5);
    expect(r.state.sync).toBe('synced');
  });

  it('presence con lastSeq > s pide resync sin tocar vista ni seq', () => {
    const s = synced();
    const r = message(s, data({ type: 'presence', count: 11, lastSeq: 8 }));
    expect(r.state.participantCount).toBe(11);
    expect(r.state.view).toEqual(VIEW);
    expect(r.state.seq).toBe(4);
    expect(r.state.sync).toBe('desynced');
    expect(r.out).toEqual([{ type: 'resync' }]);
  });
});

describe('participantStep: liveness', () => {
  it('tick a los 6 s de silencio pasa a host-offline y conserva la vista', () => {
    const s = synced();
    expect(tick(s, NOW + HOST_SILENCE_MS - 1).state.connection).toBe('connected');
    const r = tick(s, NOW + HOST_SILENCE_MS);
    expect(r.state.connection).toBe('host-offline');
    expect(r.state.view).toEqual(VIEW);
    expect(r.state.hostOfflineSince).toBe(NOW + HOST_SILENCE_MS);
  });

  it('el estado host-offline del transporte hace lo mismo', () => {
    const s = synced();
    const r = status(s, 'host-offline', NOW + 10);
    expect(r.state.connection).toBe('host-offline');
    expect(r.state.view).toEqual(VIEW);
    expect(r.state.hostOfflineSince).toBe(NOW + 10);
  });

  it('un mensaje del cantador en host-offline recupera connected y resync si va por detrás', () => {
    const offline = status(synced(), 'host-offline', NOW + 10).state;
    const ok = message(offline, data({ type: 'host-online', lastSeq: 4 }), NOW + 20);
    expect(ok.state.connection).toBe('connected');
    expect(ok.state.hostOfflineSince).toBeNull();
    expect(ok.out).toEqual([]);
    const behind = message(offline, data({ type: 'host-online', lastSeq: 7 }), NOW + 20);
    expect(behind.state.connection).toBe('connected');
    expect(behind.state.sync).toBe('desynced');
    expect(behind.out).toEqual([{ type: 'resync' }]);
  });

  it('5 min en host-offline → unavailable final; room-unavailable también', () => {
    const offline = status(synced(), 'host-offline', NOW + 10).state;
    expect(tick(offline, NOW + 10 + HOST_GONE_MS - 1).state.connection).toBe('host-offline');
    const gone = tick(offline, NOW + 10 + HOST_GONE_MS);
    expect(gone.state.connection).toBe('unavailable');
    const more = message(gone.state, data({ type: 'ball', seq: 5, ball: 1 }));
    expect(more.state).toBe(gone.state);
    expect(more.out).toEqual([]);
    const gone2 = status(synced(), 'room-unavailable');
    expect(gone2.state.connection).toBe('unavailable');
    expect(status(gone2.state, 'connected').out).toEqual([]);
  });

  it('disconnected pasa a joining y el siguiente connected reenvía join', () => {
    const s = synced();
    const d = status(s, 'disconnected', NOW + 1);
    expect(d.state.connection).toBe('joining');
    expect(d.out).toEqual([]);
    const r = status(d.state, 'connected', NOW + 2);
    expect(r.out).toEqual([{ type: 'join', participantId: PID, alias: 'Lola' }]);
  });
});
