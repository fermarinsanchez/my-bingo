import { describe, it, expect } from 'vitest';
import {
  toSpectatorView,
  applyChange,
  viewsEqual,
  diffGames,
} from '../../../src/core/room/view.js';
import {
  createGame,
  drawBall,
  undoLastBall,
  awardPrize,
  finishGame,
  setMode,
  setIntervalSec,
  pauseAuto,
  resumeAuto,
  restoreForResume,
} from '../../../src/core/game.js';

/** @returns {import('../../../src/core/game.js').Game} */
function makeGame(extra = {}) {
  return {
    id: 'g-1',
    startedAt: '2026-11-09T10:00:00.000Z',
    status: 'in-progress',
    drawn: [12, 45, 7],
    mode: 'auto',
    intervalSec: 9,
    autoPaused: false,
    undoLocked: true,
    prizes: [
      { type: 'line', numbers: [12, 45, 7, 1, 2], completionPosition: 3, awardedAtPosition: 3 },
    ],
    ...extra,
  };
}

const view = (extra = {}) => ({
  gameId: 'g-1',
  status: 'in-progress',
  drawn: [12, 45, 7],
  prizes: [],
  ...extra,
});

describe('toSpectatorView', () => {
  it('conserva solo gameId, status, drawn y prizes sin números', () => {
    const v = toSpectatorView(makeGame());
    expect(v).toEqual({
      gameId: 'g-1',
      status: 'in-progress',
      drawn: [12, 45, 7],
      prizes: [{ type: 'line', completionPosition: 3, awardedAtPosition: 3 }],
    });
    for (const k of ['numbers', 'mode', 'intervalSec', 'autoPaused', 'undoLocked', 'startedAt']) {
      expect(v).not.toHaveProperty(k);
    }
    expect(v.prizes[0]).not.toHaveProperty('numbers');
  });

  it('copia drawn y no muta la partida', () => {
    const game = makeGame();
    const snapshot = JSON.parse(JSON.stringify(game));
    const v = toSpectatorView(game);
    expect(v.drawn).not.toBe(game.drawn);
    v.drawn.push(99);
    expect(game).toEqual(snapshot);
  });
});

describe('applyChange', () => {
  it('ball: añade la bola', () => {
    const r = applyChange(view(), { type: 'ball', ball: 42 });
    expect(r).toEqual({ ok: true, view: view({ drawn: [12, 45, 7, 42] }) });
  });

  it('ball: exige partida en curso, bola nueva en 1-90 y hueco', () => {
    expect(applyChange(view({ status: 'finished' }), { type: 'ball', ball: 42 }).ok).toBe(false);
    expect(applyChange(view(), { type: 'ball', ball: 45 }).ok).toBe(false);
    expect(applyChange(view(), { type: 'ball', ball: 0 }).ok).toBe(false);
    expect(applyChange(view(), { type: 'ball', ball: 91 }).ok).toBe(false);
    expect(applyChange(view(), { type: 'ball', ball: 1.5 }).ok).toBe(false);
    const full = view({ drawn: Array.from({ length: 90 }, (_, i) => i + 1) });
    expect(applyChange(full, { type: 'ball', ball: 5 }).ok).toBe(false);
  });

  it('undo: quita la última bola', () => {
    const r = applyChange(view(), { type: 'undo', ball: 7 });
    expect(r).toEqual({ ok: true, view: view({ drawn: [12, 45] }) });
  });

  it('undo: exige bolas, que sea la última y sin premio concedido con ella', () => {
    expect(applyChange(view({ drawn: [] }), { type: 'undo', ball: 7 }).ok).toBe(false);
    expect(applyChange(view(), { type: 'undo', ball: 45 }).ok).toBe(false);
    const withPrize = view({
      prizes: [{ type: 'line', completionPosition: 2, awardedAtPosition: 3 }],
    });
    expect(applyChange(withPrize, { type: 'undo', ball: 7 }).ok).toBe(false);
    const earlier = view({
      prizes: [{ type: 'line', completionPosition: 2, awardedAtPosition: 2 }],
    });
    expect(applyChange(earlier, { type: 'undo', ball: 7 }).ok).toBe(true);
  });

  it('prize: añade el premio coherente', () => {
    const prize = { type: 'line', completionPosition: 2, awardedAtPosition: 3 };
    const r = applyChange(view(), { type: 'prize', prize });
    expect(r).toEqual({ ok: true, view: view({ prizes: [prize] }) });
  });

  it('prize: valida posiciones', () => {
    const bad = [
      { type: 'line', completionPosition: 0, awardedAtPosition: 3 },
      { type: 'line', completionPosition: 4, awardedAtPosition: 3 },
      { type: 'line', completionPosition: 2, awardedAtPosition: 2 },
      { type: 'line', completionPosition: 2, awardedAtPosition: 4 },
      { type: 'line', completionPosition: 1.5, awardedAtPosition: 3 },
    ];
    for (const prize of bad) {
      expect(applyChange(view(), { type: 'prize', prize }).ok).toBe(false);
    }
  });

  it('end-game: exige partida en curso', () => {
    expect(applyChange(view(), { type: 'end-game' })).toEqual({
      ok: true,
      view: view({ status: 'finished' }),
    });
    expect(applyChange(view({ status: 'finished' }), { type: 'end-game' }).ok).toBe(false);
  });

  it('cambios desconocidos o snapshot no se aplican', () => {
    expect(applyChange(view(), { type: 'snapshot' }).ok).toBe(false);
    expect(applyChange(view(), /** @type {any} */ ({ type: 'x' })).ok).toBe(false);
    expect(applyChange(view(), /** @type {any} */ (null)).ok).toBe(false);
  });

  it('no muta la vista de entrada, ni al aplicar ni al fallar', () => {
    const v = view();
    const copy = JSON.parse(JSON.stringify(v));
    applyChange(v, { type: 'ball', ball: 42 });
    applyChange(v, { type: 'undo', ball: 7 });
    applyChange(v, { type: 'ball', ball: 45 });
    applyChange(v, { type: 'end-game' });
    expect(v).toEqual(copy);
  });
});

describe('viewsEqual', () => {
  it('igualdad estructural', () => {
    expect(viewsEqual(view(), view())).toBe(true);
    expect(viewsEqual(view(), view({ gameId: 'g-2' }))).toBe(false);
    expect(viewsEqual(view(), view({ status: 'finished' }))).toBe(false);
    expect(viewsEqual(view(), view({ drawn: [12, 45] }))).toBe(false);
    expect(viewsEqual(view(), view({ drawn: [12, 7, 45] }))).toBe(false);
    const p = { type: 'line', completionPosition: 2, awardedAtPosition: 3 };
    expect(viewsEqual(view({ prizes: [p] }), view({ prizes: [{ ...p }] }))).toBe(true);
    expect(viewsEqual(view({ prizes: [p] }), view())).toBe(false);
    expect(viewsEqual(view({ prizes: [p] }), view({ prizes: [{ ...p, type: 'bingo' }] }))).toBe(
      false,
    );
    expect(viewsEqual(view({ prizes: [p] }), view({ prizes: [{ ...p, completionPosition: 1 }] }))).toBe(
      false,
    );
    expect(
      viewsEqual(view({ prizes: [p] }), view({ prizes: [{ ...p, awardedAtPosition: 2 }] })),
    ).toBe(false);
  });

  it('null solo es igual a null', () => {
    expect(viewsEqual(null, null)).toBe(true);
    expect(viewsEqual(view(), null)).toBe(false);
    expect(viewsEqual(null, view())).toBe(false);
  });
});

describe('diffGames', () => {
  const first = () => createGame({ id: 'g-1', now: new Date('2026-11-09T10:00:00Z') });
  /** Saca `n` bolas con un sorteo determinista (siempre la primera pendiente). */
  const withBalls = (n, game = first()) => {
    let g = game;
    for (let i = 0; i < n; i++) g = drawBall(g, () => 0).game;
    return g;
  };
  const award = (g, type = 'line') =>
    awardPrize(g, { type, numbers: g.drawn.slice(0, 5) }, { valid: true, completionPosition: 5 });

  it('partida distinta → snapshot', () => {
    const next = createGame({ id: 'g-2', now: new Date('2026-11-09T11:00:00Z') });
    expect(diffGames(withBalls(3), next)).toEqual([{ type: 'snapshot' }]);
  });

  it('misma partida (mismo objeto o igual) → nada', () => {
    const g = withBalls(3);
    expect(diffGames(g, g)).toEqual([]);
    expect(diffGames(g, { ...g })).toEqual([]);
  });

  it('drawBall → ball', () => {
    const prev = withBalls(2);
    const { game, ball } = drawBall(prev, () => 0);
    expect(diffGames(prev, game)).toEqual([{ type: 'ball', ball }]);
  });

  it('undoLastBall → undo con la bola retirada', () => {
    const prev = withBalls(3);
    const { game, ball } = undoLastBall(prev);
    expect(diffGames(prev, game)).toEqual([{ type: 'undo', ball }]);
    expect(ball).toBe(prev.drawn[2]);
  });

  it('awardPrize → prize sin los números del cartón', () => {
    const prev = withBalls(6);
    const next = award(prev);
    expect(diffGames(prev, next)).toEqual([
      { type: 'prize', prize: { type: 'line', completionPosition: 5, awardedAtPosition: 6 } },
    ]);
    const next2 = award(next, 'bingo');
    expect(diffGames(next, next2)).toEqual([
      { type: 'prize', prize: { type: 'bingo', completionPosition: 5, awardedAtPosition: 6 } },
    ]);
  });

  it('finishGame → end-game', () => {
    const prev = withBalls(4);
    expect(diffGames(prev, finishGame(prev))).toEqual([{ type: 'end-game' }]);
  });

  it('cambios solo locales (modo, intervalo, pausa, reanudación) → nada', () => {
    const g = withBalls(4);
    const auto = setMode(g, 'auto');
    expect(diffGames(g, auto)).toEqual([]);
    expect(diffGames(auto, setIntervalSec(auto, 12))).toEqual([]);
    expect(diffGames(auto, pauseAuto(resumeAuto(auto)))).toEqual([]);
    expect(diffGames(auto, resumeAuto(auto))).toEqual([]);
    expect(diffGames(auto, restoreForResume(auto))).toEqual([]);
    expect(diffGames(g, { ...g, undoLocked: !g.undoLocked })).toEqual([]);
  });

  it('cualquier otra combinación → snapshot (salvaguarda)', () => {
    const prev = withBalls(6);
    const two = withBalls(2, prev);
    expect(diffGames(prev, two)).toEqual([{ type: 'snapshot' }]);
    const ballAndPrize = award(drawBall(prev, () => 0).game);
    expect(diffGames(prev, ballAndPrize)).toEqual([{ type: 'snapshot' }]);
    const swapped = { ...prev, drawn: [...prev.drawn.slice(0, 5), 99 - prev.drawn[5]] };
    expect(diffGames(prev, swapped)).toEqual([{ type: 'snapshot' }]);
    const replaced = { ...prev, drawn: [...prev.drawn.slice(0, -1)].reverse() };
    expect(diffGames(prev, replaced)).toEqual([{ type: 'snapshot' }]);
    const undoTwo = { ...prev, drawn: prev.drawn.slice(0, -2) };
    expect(diffGames(prev, undoTwo)).toEqual([{ type: 'snapshot' }]);
    const withPrize = award(prev);
    expect(diffGames(withPrize, prev)).toEqual([{ type: 'snapshot' }]);
    const twoPrizes = award(award(prev));
    expect(diffGames(prev, twoPrizes)).toEqual([{ type: 'snapshot' }]);
    const otherPrize = { ...withPrize, prizes: [{ ...withPrize.prizes[0], type: 'bingo' }] };
    expect(diffGames(withPrize, { ...otherPrize, prizes: [...otherPrize.prizes, withPrize.prizes[0]] })).toEqual([
      { type: 'snapshot' },
    ]);
  });

  it('terminar + sacar bola, o reabrir una partida terminada → snapshot', () => {
    const prev = withBalls(4);
    const finishedWithBall = { ...finishGame(prev), drawn: [...prev.drawn, 77] };
    expect(diffGames(prev, finishedWithBall)).toEqual([{ type: 'snapshot' }]);
    expect(diffGames(finishGame(prev), prev)).toEqual([{ type: 'snapshot' }]);
  });
});
