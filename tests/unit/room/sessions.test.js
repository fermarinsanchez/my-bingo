import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { createMemoryHub } from '../../support/memory-transport.js';
import { createHostSession } from '../../../src/room/host-session.js';
import { createParticipantSession } from '../../../src/room/participant-session.js';
import { toSpectatorView, viewsEqual } from '../../../src/core/room/view.js';
import { createRng } from '../../support/prng.js';
import {
  HOST_GONE_MS,
  HOST_SILENCE_MS,
  MAX_PARTICIPANTS,
  RESERVATION_MS,
  TICK_MS,
} from '../../../src/core/room/constants.js';
import {
  createGame,
  drawBall,
  undoLastBall,
  awardPrize,
  finishGame,
} from '../../../src/core/game.js';

const newGame = (id) => createGame({ id, now: new Date('2026-11-09T10:00:00Z') });

/** Monta hub, sala del cantador y utilidades para avanzar la partida. */
function setupRoom(hubOpts = {}) {
  const hub = createMemoryHub({ seed: 1, ...hubOpts });
  const rng = createRng(99);
  let game = newGame('g-1');
  const hostTransport = hub.hostTransport();
  const host = createHostSession({ transport: hostTransport, clock: hub.clock(), game });
  const update = (next) => {
    game = next;
    host.update(game);
    hub.advance(10);
  };
  const draw = (n = 1) => {
    for (let i = 0; i < n; i++) update(drawBall(game, (k) => rng.int(k)).game);
  };
  const join = (alias, opts = {}) => {
    const transport = hub.participantTransport();
    const p = createParticipantSession({
      transport,
      clock: hub.clock(),
      alias,
      ...opts,
    });
    hub.advance(10);
    return Object.assign(p, { transport });
  };
  return { hub, host, hostTransport, rng, getGame: () => game, update, draw, join };
}

const inSync = (p, game) => viewsEqual(p.getState().view, toSpectatorView(game));

describe('sesiones: escenario 1 (canal sin fallos)', () => {
  it('Lola sigue la partida paso a paso y la sala se cierra', () => {
    const { hub, host, getGame, update, draw, join } = setupRoom();

    draw(10);
    const lola = join('Lola');
    expect(lola.getState()).toMatchObject({ connection: 'connected', sync: 'synced', alias: 'Lola' });
    expect(inSync(lola, getGame())).toBe(true);

    draw(5);
    expect(inSync(lola, getGame())).toBe(true);
    expect(lola.getState().view.drawn).toHaveLength(15);

    update(undoLastBall(getGame()).game);
    expect(inSync(lola, getGame())).toBe(true);
    expect(lola.getState().view.drawn).toHaveLength(14);

    const g = getGame();
    update(
      awardPrize(g, { type: 'line', numbers: g.drawn.slice(0, 5) }, { valid: true, completionPosition: 5 }),
    );
    expect(inSync(lola, getGame())).toBe(true);
    expect(lola.getState().view.prizes).toHaveLength(1);

    update(finishGame(getGame()));
    expect(inSync(lola, getGame())).toBe(true);
    expect(lola.getState().view.status).toBe('finished');

    update(newGame('g-2'));
    expect(inSync(lola, getGame())).toBe(true);
    expect(lola.getState().view.gameId).toBe('g-2');
    draw(2);
    expect(inSync(lola, getGame())).toBe(true);

    host.close();
    hub.advance(10);
    expect(lola.getState().connection).toBe('closed');
    expect(inSync(lola, getGame())).toBe(true);
  });

  it('un alias en uso o inválido se rechaza y el participante queda rejected', () => {
    const { join } = setupRoom();
    join('Lola');
    const dup = join('lola');
    expect(dup.getState()).toMatchObject({ connection: 'rejected', rejectReason: 'alias-taken' });
    const bad = join('   ');
    expect(bad.getState()).toMatchObject({ connection: 'rejected', rejectReason: 'alias-invalid' });
  });

  it('subscribe notifica los cambios y permite darse de baja; leave cierra', () => {
    const { draw, join } = setupRoom();
    const p = join('Ana');
    const seen = [];
    const off = p.subscribe((s) => seen.push(s.seq));
    draw(2);
    expect(seen).toEqual([1, 2]);
    off();
    draw(1);
    expect(seen).toEqual([1, 2]);
    p.leave();
    draw(1);
    expect(p.getState().seq).toBe(3);
  });
});

describe('sesiones: red poco fiable y reserva', () => {
  it('el último ball perdido se muestra en ≤ 2500 ms (SC-003a)', () => {
    const { hub, getGame, draw, join } = setupRoom({ drop: 0, maxDelayMs: 0 });
    const p = join('Lola');
    draw(5);
    expect(p.getState().view.drawn).toHaveLength(5);
    hub.setFaults({ drop: 1 });
    draw(1);
    hub.setFaults({ drop: 0, duplicate: 0, maxDelayMs: 0 });
    expect(p.getState().view.drawn).toHaveLength(5);
    const t0 = hub.now();
    hub.advance(2500);
    expect(p.getState().view.drawn).toHaveLength(6);
    expect(inSync(p, getGame())).toBe(true);
    expect(hub.now() - t0).toBeLessThanOrEqual(2500);
  });

  it('reserva de 30 s: 40 plazas, reconexión a los 20 s y liberación a los 30 s', () => {
    const { hub, host, join } = setupRoom();
    const seated = [];
    for (let i = 1; i <= MAX_PARTICIPANTS; i++) {
      seated.push(
        join(`Jugador ${i}`, { participantId: `participant-${String(i).padStart(3, '0')}` }),
      );
    }
    expect(host.getPresence().count).toBe(40);
    hub.disconnect(seated[0].transport);
    hub.disconnect(seated[1].transport);
    hub.advance(10);
    expect(host.getPresence().count).toBe(38);

    const extra = join('Intruso', { participantId: 'participant-041' });
    expect(extra.getState()).toMatchObject({ connection: 'rejected', rejectReason: 'room-full' });

    hub.advance(20_000);
    hub.reconnect(seated[0].transport);
    hub.advance(20);
    expect(seated[0].getState()).toMatchObject({
      connection: 'connected',
      sync: 'synced',
      alias: 'Jugador 1',
    });
    expect(host.getPresence().count).toBe(39);
    expect(host.getPresence().aliases).toContain('Jugador 1');

    hub.advance(RESERVATION_MS - 20_000 + TICK_MS);
    expect(host.getPresence().count).toBe(39);
    const late = join('Nuevo', { participantId: 'participant-042' });
    expect(late.getState()).toMatchObject({ connection: 'connected', alias: 'Nuevo' });
    expect(host.getPresence().count).toBe(40);
  });

  it('sin mensajes del cantador 6 s → host-offline', () => {
    const { hub, hostTransport, join } = setupRoom();
    const p = join('Lola');
    expect(p.getState().connection).toBe('connected');
    hostTransport.close();
    hub.advance(HOST_SILENCE_MS + 250);
    expect(p.getState().connection).toBe('host-offline');
    expect(p.getState().view).not.toBeNull();
  });

  it('el cantador saca 3 bolas offline y al volver los participantes convergen', () => {
    const { hub, host, getGame, draw, join } = setupRoom();
    const p = join('Lola');
    draw(4);
    hub.hostOffline();
    hub.advance(10);
    expect(p.getState().connection).toBe('host-offline');
    draw(3);
    hub.hostOnline();
    host.resume();
    hub.advance(50);
    expect(p.getState().connection).toBe('connected');
    expect(inSync(p, getGame())).toBe(true);
    expect(p.getState().view.drawn).toHaveLength(7);
  });

  it('destroyRoom o 5 min sin cantador → unavailable y no se reenvía join', () => {
    const { hub, join } = setupRoom();
    const a = join('Ana');
    hub.destroyRoom();
    hub.advance(10);
    expect(a.getState().connection).toBe('unavailable');
    const joinsBefore = hub.log.filter((m) => m.dir === 'participant→host').length;
    hub.hostOnline();
    hub.advance(100);
    const joinsAfter = hub.log.filter((m) => m.dir === 'participant→host').length;
    expect(joinsAfter).toBe(joinsBefore);

    const { hub: hub2, join: join2 } = setupRoom();
    const b = join2('Brais');
    hub2.hostOffline();
    hub2.advance(10);
    expect(b.getState().connection).toBe('host-offline');
    hub2.advance(HOST_GONE_MS + TICK_MS);
    expect(b.getState().connection).toBe('unavailable');
    const before = hub2.log.filter((m) => m.data.includes('"type":"join"')).length;
    hub2.hostOnline();
    hub2.advance(100);
    const after = hub2.log.filter((m) => m.data.includes('"type":"join"')).length;
    expect(after).toBe(before);
  });
});

describe('sesiones: presencia (escenario 8)', () => {
  it('Ana, Brais y Carme: lista del cantador y recuento de los participantes', () => {
    const { hub, host, join } = setupRoom();
    const seen = [];
    host.subscribe((p) => seen.push({ ...p, aliases: [...p.aliases] }));
    const ana = join('Ana');
    const brais = join('Brais');
    const carme = join('Carme');
    expect(host.getPresence()).toEqual({ count: 3, aliases: ['Ana', 'Brais', 'Carme'] });
    expect(ana.getState().participantCount).toBe(3);
    expect(brais.getState().participantCount).toBe(3);
    expect(carme.getState().participantCount).toBe(3);
    hub.disconnect(brais.transport);
    hub.advance(10);
    expect(host.getPresence()).toEqual({ count: 2, aliases: ['Ana', 'Carme'] });
    expect(ana.getState().participantCount).toBe(2);
    expect(carme.getState().participantCount).toBe(2);
    expect(seen.at(-1)).toEqual({ count: 2, aliases: ['Ana', 'Carme'] });
    for (const row of hub.log.filter((m) => m.dir === 'host→participant')) {
      expect(row.data).not.toContain('participant-');
      if (row.participant !== brais.transport && row.data.includes('Brais')) {
        // el snapshot unicast de Brais puede llevar su alias; el resto no
      }
    }
    const toOthers = hub.log.filter(
      (m) => m.dir === 'host→participant' && !m.data.includes('"alias":"Brais"'),
    );
    for (const row of toOthers) {
      if (row.data.includes('"type":"presence"')) expect(row.data).not.toContain('Brais');
    }
  });

  it('40 → 39 → 40 (SC-007)', () => {
    const { hub, host, join } = setupRoom();
    const seated = [];
    for (let i = 1; i <= 40; i++) {
      seated.push(join(`J${i}`, { participantId: `participant-${String(i).padStart(3, '0')}` }));
    }
    expect(host.getPresence().count).toBe(40);
    expect(seated[39].getState().participantCount).toBe(40);
    hub.disconnect(seated[5].transport);
    hub.advance(10);
    expect(host.getPresence().count).toBe(39);
    expect(seated[0].getState().participantCount).toBe(39);
    hub.reconnect(seated[5].transport);
    hub.advance(20);
    expect(host.getPresence().count).toBe(40);
    expect(seated[0].getState().participantCount).toBe(40);
  });
});

describe('sesiones: aislamiento (FR-030, SC-008)', () => {
  it('un transporte que lanza y un update basura no escapan ni mutan la partida', () => {
    const game = newGame('g-iso');
    const snapshot = structuredClone(game);
    const transport = {
      send() {
        throw new Error('send');
      },
      broadcast() {
        throw new Error('broadcast');
      },
      onMessage() {
        return () => {};
      },
      onPeerLeave() {
        return () => {};
      },
      close() {
        throw new Error('close');
      },
    };
    const clock = { now: () => 1_000, setInterval: () => 1, clearInterval() {} };
    const host = createHostSession({ transport, clock, game });
    expect(() => host.update(drawBall(game, () => 0).game)).not.toThrow();
    expect(() => host.update(/** @type {any} */ (null))).not.toThrow();
    expect(() => host.close()).not.toThrow();
    expect(game).toEqual(snapshot);
  });

  it('errors.js intacto; game.js solo cambia el origen del id (randomUUID)', () => {
    execSync('git diff --exit-code main -- src/core/errors.js');
    const diff = execSync('git diff main -- src/core/game.js', { encoding: 'utf8' });
    if (!diff.trim()) return;
    const hunks = diff
      .split('\n')
      .filter((line) => line.startsWith('+') || line.startsWith('-'))
      .filter((line) => !line.startsWith('+++') && !line.startsWith('---'))
      .join('\n');
    expect(hunks).toMatch(/randomUUID/);
    expect(hunks).not.toMatch(/drawBall|undoLastBall|awardPrize|TOTAL_BALLS/);
  });
});
