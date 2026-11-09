// Simulación de una sala completa con semilla (quickstart escenarios 2 y 9).
import { createMemoryHub } from './memory-transport.js';
import { createRng } from './prng.js';
import { createHostSession } from '../../src/room/host-session.js';
import { createParticipantSession } from '../../src/room/participant-session.js';
import { diffGames, toSpectatorView } from '../../src/core/room/view.js';
import {
  canDraw,
  canUndo,
  createGame,
  drawBall,
  finishGame,
  undoLastBall,
  awardPrize,
} from '../../src/core/game.js';

/**
 * @typedef {import('../../src/core/game.js').Game} Game
 * @typedef {import('../../src/core/room/view.js').SpectatorView} SpectatorView
 */

/** @param {SpectatorView} v */
function copyView(v) {
  return {
    gameId: v.gameId,
    status: v.status,
    drawn: v.drawn.slice(),
    prizes: v.prizes.map((p) => ({ ...p })),
  };
}

/**
 * Reproduce el log de partida sin sala (para SC-008).
 * @param {{ initialId: string, startedAt: string, ops: object[] }} log
 * @returns {Game}
 */
export function replayGameLog(log) {
  let game = createGame({ id: log.initialId, now: new Date(log.startedAt) });
  for (const op of log.ops) {
    switch (op.type) {
      case 'draw':
        game = drawBall(game, () => op.pick).game;
        break;
      case 'undo':
        game = undoLastBall(game).game;
        break;
      case 'prize':
        game = awardPrize(
          game,
          { type: op.prizeType, numbers: op.numbers },
          { valid: true, completionPosition: op.completionPosition },
        );
        break;
      case 'finish':
        game = finishGame(game);
        break;
      case 'new':
        game = createGame({ id: op.id, now: new Date(op.startedAt) });
        break;
      default:
        break;
    }
  }
  return game;
}

/**
 * Ejecuta una sesión completa determinista por semilla.
 * @param {{ seed: number, participants?: number, faults?: { drop?: number, duplicate?: number, maxDelayMs?: number }, steps?: number }} opts
 */
export function runSession({ seed, participants = 10, faults = {}, steps = 48 } = {}) {
  const rng = createRng(seed);
  const hub = createMemoryHub({
    seed: (seed * 1_000_003) >>> 0,
    drop: faults.drop ?? 0,
    duplicate: faults.duplicate ?? 0,
    maxDelayMs: faults.maxDelayMs ?? 0,
  });
  const startedAt = '2026-11-09T10:00:00.000Z';
  let game = createGame({ id: 'g-1', now: new Date(startedAt) });
  let lastGame = game;
  let seq = 0;
  const gameLog = { initialId: 'g-1', startedAt, ops: /** @type {object[]} */ ([]) };
  /** @type {Map<number, SpectatorView>} */
  const hostViews = new Map();
  hostViews.set(0, copyView(toSpectatorView(game)));

  const host = createHostSession({
    transport: hub.hostTransport(),
    clock: hub.clock(),
    game,
  });

  /** @param {Game} next */
  function recordHost(next) {
    const changes = diffGames(lastGame, next);
    game = next;
    host.update(game);
    for (let i = 0; i < changes.length; i++) {
      seq += 1;
      hostViews.set(seq, copyView(toSpectatorView(game)));
    }
    lastGame = game;
  }

  let nextId = 0;
  /** @type {{ p: ReturnType<typeof createParticipantSession>, t: ReturnType<ReturnType<typeof createMemoryHub>['participantTransport']>, seen: { seq: number, view: SpectatorView }[], id: string }[]} */
  const sessions = [];

  /** @param {string} alias */
  function addParticipant(alias) {
    const id = `part-${String(++nextId).padStart(4, '0')}`;
    const t = hub.participantTransport();
    const p = createParticipantSession({
      transport: t,
      clock: hub.clock(),
      alias,
      participantId: id,
    });
    /** @type {{ seq: number, view: SpectatorView }[]} */
    const seen = [];
    let lastSeq = /** @type {number | null} */ (null);
    p.subscribe((s) => {
      if (s.sync === 'synced' && s.view && s.seq != null && s.seq !== lastSeq) {
        lastSeq = s.seq;
        seen.push({ seq: s.seq, view: copyView(s.view) });
      }
    });
    const row = { p, t, seen, id };
    sessions.push(row);
    return row;
  }

  for (let i = 0; i < participants; i++) addParticipant(`P${i}`);
  hub.advance(30);

  function doDraw() {
    if (!canDraw(game)) return;
    let pick = 0;
    const next = drawBall(game, (n) => {
      pick = rng.int(n);
      return pick;
    }).game;
    gameLog.ops.push({ type: 'draw', pick });
    recordHost(next);
  }

  function doUndo() {
    if (!canUndo(game)) return;
    gameLog.ops.push({ type: 'undo' });
    recordHost(undoLastBall(game).game);
  }

  function doPrize(type) {
    const need = type === 'line' ? 5 : 15;
    if (game.drawn.length < need) return;
    if (game.prizes.some((p) => p.type === type)) return;
    const numbers = game.drawn.slice(0, need);
    gameLog.ops.push({
      type: 'prize',
      prizeType: type,
      numbers,
      completionPosition: need,
    });
    recordHost(
      awardPrize(game, { type, numbers }, { valid: true, completionPosition: need }),
    );
  }

  function doFinish() {
    if (game.status !== 'in-progress') return;
    gameLog.ops.push({ type: 'finish' });
    recordHost(finishGame(game));
  }

  function doNewGame() {
    const id = `g-${gameLog.ops.length + 2}`;
    const at = '2026-11-09T11:00:00.000Z';
    gameLog.ops.push({ type: 'new', id, startedAt: at });
    recordHost(createGame({ id, now: new Date(at) }));
  }

  /** @type {{ t: (typeof sessions)[0]['t'], at: number }[]} */
  const pendingRecon = [];

  function maybeDisconnect() {
    const live = sessions.filter((s) => !pendingRecon.some((x) => x.t === s.t));
    if (live.length === 0) return;
    const s = live[rng.int(live.length)];
    hub.disconnect(s.t);
    const within = rng.chance(0.7);
    const delay = within ? 200 + rng.int(20_000) : RESYNC_AFTER;
    pendingRecon.push({ t: s.t, at: hub.now() + delay });
  }

  const RESYNC_AFTER = 31_000 + rng.int(4_000);

  function flushReconnects() {
    const now = hub.now();
    for (let i = pendingRecon.length - 1; i >= 0; i--) {
      if (pendingRecon[i].at <= now) {
        hub.reconnect(pendingRecon[i].t);
        pendingRecon.splice(i, 1);
      }
    }
  }

  function hostOutage() {
    hub.hostOffline();
    const extraDraws = rng.int(3);
    for (let i = 0; i < extraDraws; i++) doDraw();
    hub.advance(40 + rng.int(400));
    hub.hostOnline();
    host.resume();
  }

  addParticipant('Late-0');
  hub.advance(20);

  for (let i = 0; i < steps; i++) {
    flushReconnects();
    const r = rng.rnd();
    if (r < 0.55) doDraw();
    else if (r < 0.63) doUndo();
    else if (r < 0.7) doPrize('line');
    else if (r < 0.74) doPrize('bingo');
    else if (r < 0.84) maybeDisconnect();
    else if (r < 0.9) hostOutage();
    else if (game.status === 'in-progress' && game.drawn.length >= 8) doFinish();
    else if (game.status === 'finished') doNewGame();
    else doDraw();
    hub.advance(4 + rng.int(16));
  }

  if (game.status === 'in-progress' && game.drawn.length >= 5) doFinish();
  addParticipant('Late-1');
  hub.advance(20);
  if (game.status === 'finished') doNewGame();
  if (seed % 17 === 0) {
    while (canDraw(game)) doDraw();
  } else {
    for (let i = 0; i < 4; i++) doDraw();
  }
  addParticipant('Late-2');
  hub.advance(20);

  flushReconnects();
  for (const x of pendingRecon) hub.reconnect(x.t);
  pendingRecon.length = 0;

  hub.setFaults({ drop: 0, duplicate: 0, maxDelayMs: 0 });
  hub.hostOnline();
  host.resume();
  hub.advance(10_000);

  return {
    hostGame: game,
    gameLog,
    hostViews,
    participants: sessions.map((s) => s.p.getState()),
    intermediate: sessions.flatMap((s) => s.seen),
  };
}
