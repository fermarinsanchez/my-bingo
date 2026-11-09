import { describe, it, expect } from 'vitest';
import { openRoom, hostStep, getPresence } from '../../../src/core/room/host.js';
import { toSpectatorView } from '../../../src/core/room/view.js';
import {
  createGame,
  drawBall,
  undoLastBall,
  awardPrize,
  finishGame,
  setMode,
  setIntervalSec,
} from '../../../src/core/game.js';
import { HEARTBEAT_MS, MAX_PARTICIPANTS, RESERVATION_MS } from '../../../src/core/room/constants.js';

const NOW = 1000;
const newGame = (id = 'g-1') => createGame({ id, now: new Date('2026-11-09T10:00:00Z') });
const draw = (g, n = 1) => {
  let x = g;
  for (let i = 0; i < n; i++) x = drawBall(x, () => 0).game;
  return x;
};
const pid = (n) => `participant-${String(n).padStart(3, '0')}`;
const joinData = (participantId, alias, v = 1) =>
  JSON.stringify({ v, type: 'join', participantId, alias });
const resyncData = JSON.stringify({ v: 1, type: 'resync' });

const msg = (room, peerId, data, now = NOW) => hostStep(room, { type: 'message', peerId, data, now });
const join = (room, n, alias = `Jugador ${n}`, peerId = `peer-${n}`, now = NOW) =>
  msg(room, peerId, joinData(pid(n), alias), now);
const only = (out, type) => out.filter((o) => o.msg.type === type);

/** Sala abierta con `n` miembros conectados (peer-1…peer-n). */
function roomWith(n, game = newGame()) {
  let room = openRoom({ game, now: NOW });
  for (let i = 1; i <= n; i++) room = join(room, i).state;
  return room;
}

describe('openRoom', () => {
  it('abre la sala con seq 0, sin miembros y sin salida', () => {
    const game = draw(newGame(), 3);
    const room = openRoom({ game, now: NOW });
    expect(room.status).toBe('open');
    expect(room.seq).toBe(0);
    expect(room.members.size).toBe(0);
    expect(room.peers.size).toBe(0);
    expect(room.lastGame).toBe(game);
    expect(room.view).toEqual(toSpectatorView(game));
    expect(room.lastHeartbeatAt).toBe(NOW);
  });
});

describe('hostStep: game-changed', () => {
  it('difunde cada cambio compartido con seq incrementado de 1 en 1', () => {
    let room = openRoom({ game: newGame(), now: NOW });
    let game = newGame();
    const seen = [];
    const apply = (next) => {
      const r = hostStep(room, { type: 'game-changed', game: next, now: NOW });
      room = r.state;
      seen.push(...r.out);
      game = next;
    };
    const d1 = drawBall(game, () => 0);
    apply(d1.game);
    const d2 = drawBall(game, () => 0);
    apply(d2.game);
    const u = undoLastBall(game);
    apply(u.game);
    const prized = awardPrize(
      game,
      { type: 'line', numbers: [1, 2, 3, 4, 5] },
      { valid: true, completionPosition: 1 },
    );
    apply(prized);
    apply(finishGame(game));
    const next = newGame('g-2');
    apply(next);

    expect(seen.map((o) => o.to)).toEqual(Array(6).fill('all'));
    expect(seen.map((o) => o.msg)).toEqual([
      { type: 'ball', seq: 1, ball: d1.ball },
      { type: 'ball', seq: 2, ball: d2.ball },
      { type: 'undo', seq: 3, ball: u.ball },
      { type: 'prize', seq: 4, prize: { type: 'line', completionPosition: 1, awardedAtPosition: 1 } },
      { type: 'end', scope: 'game', seq: 5 },
      { type: 'snapshot', seq: 6, view: toSpectatorView(next) },
    ]);
    expect(room.seq).toBe(6);
    expect(room.lastGame).toBe(next);
    expect(room.view).toEqual(toSpectatorView(next));
  });

  it('no reinicia seq entre partidas', () => {
    let room = openRoom({ game: newGame(), now: NOW });
    room = hostStep(room, { type: 'game-changed', game: draw(newGame()), now: NOW }).state;
    room = hostStep(room, { type: 'game-changed', game: newGame('g-2'), now: NOW }).state;
    const r = hostStep(room, { type: 'game-changed', game: draw(newGame('g-2')), now: NOW });
    expect(r.out[0].msg.seq).toBe(3);
  });

  it('no emite nada por cambios de modo o intervalo, y conserva seq', () => {
    const room = openRoom({ game: draw(newGame(), 2), now: NOW });
    const auto = setMode(room.lastGame, 'auto');
    const r1 = hostStep(room, { type: 'game-changed', game: auto, now: NOW });
    expect(r1.out).toEqual([]);
    expect(r1.state.seq).toBe(0);
    const r2 = hostStep(r1.state, { type: 'game-changed', game: setIntervalSec(auto, 10), now: NOW });
    expect(r2.out).toEqual([]);
    expect(r2.state.seq).toBe(0);
    expect(r2.state.lastGame.intervalSec).toBe(10);
  });

  it('una combinación rara difunde snapshot de salvaguarda', () => {
    const room = openRoom({ game: newGame(), now: NOW });
    const jump = draw(room.lastGame, 3);
    const r = hostStep(room, { type: 'game-changed', game: jump, now: NOW });
    expect(r.out).toEqual([{ to: 'all', msg: { type: 'snapshot', seq: 1, view: toSpectatorView(jump) } }]);
  });
});

describe('hostStep: join', () => {
  it('acepta y responde con un snapshot sin incrementar seq', () => {
    let room = openRoom({ game: newGame(), now: NOW });
    room = hostStep(room, { type: 'game-changed', game: draw(newGame(), 3), now: NOW }).state;
    const r = join(room, 1, '  Lola  ');
    const snaps = only(r.out, 'snapshot');
    expect(snaps).toEqual([
      {
        to: 'peer-1',
        msg: {
          type: 'snapshot',
          seq: 1,
          view: toSpectatorView(draw(newGame(), 3)),
          alias: 'Lola',
          participantCount: 1,
        },
      },
    ]);
    expect(r.state.seq).toBe(1);
    expect(r.state.members.size).toBe(1);
    expect(r.state.members.get(pid(1))).toEqual({
      participantId: pid(1),
      alias: 'Lola',
      aliasKey: 'lola',
      status: 'connected',
      peerId: 'peer-1',
      reservedUntil: null,
    });
    expect(r.state.peers.get('peer-1')).toBe(pid(1));
  });

  it('v ≠ 1 → incompatible-version', () => {
    const room = openRoom({ game: newGame(), now: NOW });
    const r = msg(room, 'peer-1', joinData(pid(1), 'Lola', 2));
    expect(r.out).toEqual([{ to: 'peer-1', msg: { type: 'reject', reason: 'incompatible-version' } }]);
    expect(r.state.members.size).toBe(0);
  });

  it('sala cerrada → room-closed', () => {
    const closed = hostStep(openRoom({ game: newGame(), now: NOW }), { type: 'close', now: NOW }).state;
    const r = join(closed, 1);
    expect(r.out).toEqual([{ to: 'peer-1', msg: { type: 'reject', reason: 'room-closed' } }]);
  });

  it('alias inválido → alias-invalid', () => {
    const room = openRoom({ game: newGame(), now: NOW });
    for (const alias of ['', '   ', '<>', 'x'.repeat(21), '\u200b']) {
      const r = msg(room, 'peer-1', joinData(pid(1), alias));
      expect(r.out).toEqual([{ to: 'peer-1', msg: { type: 'reject', reason: 'alias-invalid' } }]);
      expect(r.state.members.size).toBe(0);
    }
  });

  it('alias en uso por otro (sin distinguir mayúsculas ni formas Unicode) → alias-taken', () => {
    const room = roomWith(1, newGame());
    const r0 = join(room, 2, 'Jugador 1');
    expect(r0.out).toEqual([{ to: 'peer-2', msg: { type: 'reject', reason: 'alias-taken' } }]);
    const r1 = join(room, 2, 'JUGADOR 1');
    expect(r1.out[0].msg.reason).toBe('alias-taken');
    const a = join(openRoom({ game: newGame(), now: NOW }), 1, 'José').state;
    expect(join(a, 2, 'Jose\u0301').out[0].msg.reason).toBe('alias-taken');
  });

  it('sala llena: la identidad 41 se rechaza con room-full', () => {
    const room = roomWith(MAX_PARTICIPANTS);
    expect(room.members.size).toBe(40);
    const r = join(room, 41);
    expect(r.out).toEqual([{ to: 'peer-41', msg: { type: 'reject', reason: 'room-full' } }]);
    expect(r.state.members.size).toBe(40);
  });

  it('orden de validación: versión > cerrada > alias inválido > alias en uso > llena', () => {
    const full = roomWith(MAX_PARTICIPANTS);
    // v ≠ 1 gana a todo.
    const closedFull = hostStep(full, { type: 'close', now: NOW }).state;
    expect(msg(closedFull, 'p', joinData(pid(50), '', 2)).out[0].msg.reason).toBe('incompatible-version');
    // cerrada gana a alias inválido.
    expect(msg(closedFull, 'p', joinData(pid(50), '')).out[0].msg.reason).toBe('room-closed');
    // alias inválido gana a llena.
    expect(msg(full, 'p', joinData(pid(50), '')).out[0].msg.reason).toBe('alias-invalid');
    // alias en uso gana a llena.
    expect(msg(full, 'p', joinData(pid(50), 'Jugador 3')).out[0].msg.reason).toBe('alias-taken');
    expect(msg(full, 'p', joinData(pid(50), 'Nuevo')).out[0].msg.reason).toBe('room-full');
  });

  it('un mismo participantId reconectando desde otro peer sustituye al anterior sin ocupar plaza', () => {
    const room = roomWith(3);
    const r = join(room, 2, 'Jugador 2', 'peer-2b');
    expect(r.state.members.size).toBe(3);
    expect(r.state.members.get(pid(2)).peerId).toBe('peer-2b');
    expect(r.state.members.get(pid(2)).status).toBe('connected');
    expect(r.state.peers.has('peer-2')).toBe(false);
    expect(r.state.peers.get('peer-2b')).toBe(pid(2));
    expect(only(r.out, 'snapshot')[0].to).toBe('peer-2b');
    // El peer antiguo ya no es miembro: su resync se ignora.
    const old = msg(r.state, 'peer-2', resyncData);
    expect(old.out).toEqual([]);
  });

  it('la reconexión conserva el alias original aunque el nuevo join traiga otro (o uno inválido, o la sala esté llena)', () => {
    const room = roomWith(MAX_PARTICIPANTS);
    for (const alias of ['Otro', '', 'Jugador 7', '<>']) {
      const r = msg(room, 'peer-3b', joinData(pid(3), alias));
      const snap = only(r.out, 'snapshot');
      expect(snap).toHaveLength(1);
      expect(snap[0].msg.alias).toBe('Jugador 3');
      expect(only(r.out, 'reject')).toEqual([]);
      expect(r.state.members.size).toBe(40);
    }
  });

  it('un peer que cambia de identidad deja reservada la anterior', () => {
    const room = roomWith(2);
    const r = msg(room, 'peer-1', joinData(pid(9), 'Nueva'));
    expect(r.state.members.get(pid(9)).peerId).toBe('peer-1');
    expect(r.state.members.get(pid(1)).status).toBe('reserved');
    expect(r.state.members.get(pid(1)).peerId).toBeNull();
    expect(r.state.peers.get('peer-1')).toBe(pid(9));
  });
});

describe('hostStep: mensajes ignorados', () => {
  const garbage = [
    'no es json',
    '{',
    '[]',
    'null',
    JSON.stringify({ v: 1, type: 'ball', seq: 1, ball: 5 }),
    JSON.stringify({ v: 1, type: 'snapshot', seq: 1, view: toSpectatorView(newGame()) }),
    JSON.stringify({ v: 1, type: 'end', scope: 'room', lastSeq: 1 }),
    JSON.stringify({ v: 1, type: 'host-online', lastSeq: 1 }),
    JSON.stringify({ v: 1, type: 'join', participantId: 'corto', alias: 'x' }),
    JSON.stringify({ v: 1, type: 'join', participantId: pid(1) }),
    JSON.stringify({ v: 1, type: 'desconocido' }),
    JSON.stringify({ v: 2, type: 'resync' }),
    JSON.stringify({ v: 2, type: 'ball', seq: 1, ball: 5 }),
    'x'.repeat(20000),
    JSON.stringify({ v: 1, type: 'join', participantId: pid(1), alias: 'a'.repeat(20000) }),
    42,
    undefined,
    null,
  ];

  it('no cambian el estado ni producen salida', () => {
    const room = roomWith(2);
    for (const data of garbage) {
      const r = msg(room, 'peer-1', /** @type {any} */ (data));
      expect(r.state).toBe(room);
      expect(r.out).toEqual([]);
    }
  });

  it('un resync de un peer desconocido se ignora', () => {
    const room = roomWith(1);
    const r = msg(room, 'peer-desconocido', resyncData);
    expect(r.state).toBe(room);
    expect(r.out).toEqual([]);
  });

  it('entradas desconocidas no rompen el reductor', () => {
    const room = roomWith(1);
    const r = hostStep(room, /** @type {any} */ ({ type: 'otra-cosa' }));
    expect(r.state).toBe(room);
    expect(r.out).toEqual([]);
  });
});

describe('hostStep: close', () => {
  it('cierra la sala y difunde end{scope: room} con lastSeq', () => {
    let room = roomWith(2);
    room = hostStep(room, { type: 'game-changed', game: draw(newGame()), now: NOW }).state;
    const r = hostStep(room, { type: 'close', now: NOW });
    expect(r.state.status).toBe('closed');
    expect(r.out).toEqual([{ to: 'all', msg: { type: 'end', scope: 'room', lastSeq: 1 } }]);
  });

  it('es idempotente', () => {
    const closed = hostStep(roomWith(1), { type: 'close', now: NOW }).state;
    const r = hostStep(closed, { type: 'close', now: NOW + 1 });
    expect(r.state).toBe(closed);
    expect(r.out).toEqual([]);
  });

  it('tras cerrar, game-changed solo actualiza lastGame sin salida ni seq', () => {
    const closed = hostStep(roomWith(1), { type: 'close', now: NOW }).state;
    const game = draw(newGame(), 2);
    const r = hostStep(closed, { type: 'game-changed', game, now: NOW });
    expect(r.out).toEqual([]);
    expect(r.state.seq).toBe(closed.seq);
    expect(r.state.lastGame).toBe(game);
    expect(r.state.status).toBe('closed');
  });
});

describe('hostStep: reserva, latido y resync', () => {
  it('peer-left reserva 30 s y un peer desconocido no cambia nada', () => {
    const room = roomWith(2);
    const unknown = hostStep(room, { type: 'peer-left', peerId: 'nadie', now: NOW });
    expect(unknown.state).toBe(room);
    expect(unknown.out).toEqual([]);
    const r = hostStep(room, { type: 'peer-left', peerId: 'peer-1', now: NOW });
    const m = r.state.members.get(pid(1));
    expect(m).toMatchObject({
      status: 'reserved',
      peerId: null,
      reservedUntil: NOW + RESERVATION_MS,
      alias: 'Jugador 1',
    });
    expect(r.state.peers.has('peer-1')).toBe(false);
    expect(r.state.members.size).toBe(2);
    expect(only(r.out, 'presence')).toEqual([
      { to: 'all', msg: { type: 'presence', count: 1, lastSeq: 0 } },
    ]);
  });

  it('un reservado ocupa plaza y alias: 39 conectados + 1 reservado → room-full y alias-taken', () => {
    let room = roomWith(MAX_PARTICIPANTS);
    room = hostStep(room, { type: 'peer-left', peerId: 'peer-1', now: NOW }).state;
    expect(room.members.size).toBe(40);
    expect(getPresence(room).count).toBe(39);
    expect(join(room, 41, 'Nuevo').out[0].msg.reason).toBe('room-full');
    expect(join(room, 41, 'Jugador 1').out[0].msg.reason).toBe('alias-taken');
  });

  it('el reservado reconecta antes de caducar aunque la sala esté llena y conserva el alias', () => {
    let room = roomWith(MAX_PARTICIPANTS);
    room = hostStep(room, { type: 'peer-left', peerId: 'peer-2', now: NOW }).state;
    const r = msg(room, 'peer-2b', joinData(pid(2), 'OtroAlias'), NOW + 20_000);
    const snap = only(r.out, 'snapshot');
    expect(snap).toHaveLength(1);
    expect(snap[0].msg.alias).toBe('Jugador 2');
    expect(r.state.members.get(pid(2))).toMatchObject({
      status: 'connected',
      peerId: 'peer-2b',
      reservedUntil: null,
      alias: 'Jugador 2',
    });
    expect(r.state.members.size).toBe(40);
    expect(only(r.out, 'reject')).toEqual([]);
  });

  it('tick en reservedUntil libera plaza y alias', () => {
    let room = roomWith(2);
    room = hostStep(room, { type: 'peer-left', peerId: 'peer-1', now: NOW }).state;
    const early = hostStep(room, { type: 'tick', now: NOW + RESERVATION_MS - 1 });
    expect(early.state.members.has(pid(1))).toBe(true);
    const r = hostStep(room, { type: 'tick', now: NOW + RESERVATION_MS });
    expect(r.state.members.has(pid(1))).toBe(false);
    expect(join(r.state, 3, 'Jugador 1').out[0].msg.type).toBe('snapshot');
  });

  it('tick emite host-online cada HEARTBEAT_MS y resume lo emite al instante', () => {
    const room = roomWith(1);
    expect(hostStep(room, { type: 'tick', now: NOW + HEARTBEAT_MS - 1 }).out).toEqual([]);
    const beat = hostStep(room, { type: 'tick', now: NOW + HEARTBEAT_MS });
    expect(beat.out).toEqual([{ to: 'all', msg: { type: 'host-online', lastSeq: 0 } }]);
    expect(beat.state.lastHeartbeatAt).toBe(NOW + HEARTBEAT_MS);
    expect(hostStep(beat.state, { type: 'tick', now: NOW + HEARTBEAT_MS + HEARTBEAT_MS - 1 }).out).toEqual(
      [],
    );
    const resumed = hostStep(room, { type: 'resume', now: NOW + 50 });
    expect(resumed.out).toEqual([{ to: 'all', msg: { type: 'host-online', lastSeq: 0 } }]);
    expect(resumed.state.lastHeartbeatAt).toBe(NOW + 50);
  });

  it('resync de un conectado responde snapshot sin subir seq; desconocido o cerrado se ignora', () => {
    let room = roomWith(1);
    room = hostStep(room, { type: 'game-changed', game: draw(newGame(), 2), now: NOW }).state;
    const r = msg(room, 'peer-1', resyncData);
    expect(only(r.out, 'snapshot')).toEqual([
      {
        to: 'peer-1',
        msg: {
          type: 'snapshot',
          seq: 1,
          view: toSpectatorView(draw(newGame(), 2)),
          alias: 'Jugador 1',
          participantCount: 1,
        },
      },
    ]);
    expect(r.state.seq).toBe(1);
    expect(r.state.lastGame).toBe(room.lastGame);
    expect(msg(room, 'peer-x', resyncData).out).toEqual([]);
    const closed = hostStep(room, { type: 'close', now: NOW }).state;
    expect(msg(closed, 'peer-1', resyncData).out).toEqual([]);
  });

  it('una ráfaga de resync no cambia seq, lastGame ni el resto de miembros', () => {
    const room = roomWith(3);
    const game = room.lastGame;
    let state = room;
    for (let i = 0; i < 20; i++) {
      state = msg(state, 'peer-2', resyncData, NOW + i).state;
    }
    expect(state.seq).toBe(room.seq);
    expect(state.lastGame).toBe(game);
    expect(state.members.size).toBe(3);
    expect([...state.members.keys()]).toEqual([...room.members.keys()]);
  });
});

describe('getPresence y difusión de presencia', () => {
  it('solo cuenta conectados, en orden de llegada, y reserva no aparece', () => {
    let room = openRoom({ game: newGame(), now: NOW });
    room = join(room, 1, 'Ana').state;
    room = join(room, 2, 'Brais').state;
    room = join(room, 3, 'Carme').state;
    expect(getPresence(room)).toEqual({ count: 3, aliases: ['Ana', 'Brais', 'Carme'] });
    room = hostStep(room, { type: 'peer-left', peerId: 'peer-2', now: NOW }).state;
    expect(getPresence(room)).toEqual({ count: 2, aliases: ['Ana', 'Carme'] });
  });

  it('join aceptado, sustitución y peer-left difunden presence; caducar reserva no cambia count', () => {
    let room = openRoom({ game: newGame(), now: NOW });
    const j1 = join(room, 1, 'Ana');
    expect(only(j1.out, 'presence')).toEqual([
      { to: 'all', msg: { type: 'presence', count: 1, lastSeq: 0 } },
    ]);
    room = j1.state;
    const j2 = join(room, 2, 'Brais');
    expect(only(j2.out, 'presence')[0].msg.count).toBe(2);
    room = j2.state;
    const replaced = join(room, 1, 'Ana', 'peer-1b');
    expect(only(replaced.out, 'presence')[0].msg.count).toBe(2);
    room = replaced.state;
    const left = hostStep(room, { type: 'peer-left', peerId: 'peer-2', now: NOW });
    expect(only(left.out, 'presence')).toEqual([
      { to: 'all', msg: { type: 'presence', count: 1, lastSeq: 0 } },
    ]);
    room = left.state;
    const expired = hostStep(room, { type: 'tick', now: NOW + RESERVATION_MS });
    expect(only(expired.out, 'presence')).toEqual([]);
    expect(getPresence(expired.state).count).toBe(1);
  });

  it('ningún mensaje hacia participantes lleva alias ajenos ni participantId', () => {
    const seen = [];
    let room = openRoom({ game: newGame(), now: NOW });
    const collect = (r) => {
      seen.push(...r.out);
      return r.state;
    };
    room = collect(join(room, 1, 'Ana'));
    room = collect(join(room, 2, 'Brais'));
    room = collect(hostStep(room, { type: 'game-changed', game: draw(newGame()), now: NOW }));
    room = collect(hostStep(room, { type: 'peer-left', peerId: 'peer-2', now: NOW }));
    room = collect(msg(room, 'peer-1', resyncData));
    room = collect(join(room, 2, 'Brais', 'peer-2b'));
    room = collect(hostStep(room, { type: 'tick', now: NOW + HEARTBEAT_MS }));
    collect(hostStep(room, { type: 'close', now: NOW }));
    const ids = [pid(1), pid(2)];
    for (const o of seen) {
      const raw = JSON.stringify(o.msg);
      for (const id of ids) expect(raw).not.toContain(id);
      if (o.to === 'all') {
        expect(raw).not.toContain('Ana');
        expect(raw).not.toContain('Brais');
      }
      if (o.msg.type === 'presence') {
        expect(o.msg).not.toHaveProperty('alias');
        expect(o.msg).not.toHaveProperty('aliases');
      }
    }
    const toBrais = seen.filter((o) => o.to === 'peer-2' || o.to === 'peer-2b');
    for (const o of toBrais) {
      const raw = JSON.stringify(o.msg);
      expect(raw).not.toContain('Ana');
    }
  });
});
