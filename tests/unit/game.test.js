import { describe, it, expect } from 'vitest';
import {
  TOTAL_BALLS,
  INTERVAL_DEFAULT,
  createGame,
  drawBall,
  finishGame,
  getPending,
  getLastBalls,
  canDraw,
} from '../../src/core/game.js';
import { GameError } from '../../src/core/errors.js';

/** randomInt determinista: siempre elige el primer pendiente. */
const first = () => 0;
/** randomInt determinista: siempre elige el último pendiente. */
const last = (n) => n - 1;

/** Saca bolas con un randomInt dado hasta tener `count`. */
function drawN(game, count, rnd = first) {
  let g = game;
  for (let i = 0; i < count; i++) g = drawBall(g, rnd).game;
  return g;
}

/** Construye una partida con un orden de salida concreto. */
function withDrawn(drawn, extra = {}) {
  return { ...createGame({ id: 'test', now: new Date('2026-11-02T00:00:00Z') }), drawn, ...extra };
}

describe('createGame', () => {
  it('crea una partida nueva con los valores por defecto', () => {
    const now = new Date('2026-11-02T18:30:00.000Z');
    const g = createGame({ now, id: 'abc' });
    expect(g).toEqual({
      id: 'abc',
      startedAt: '2026-11-02T18:30:00.000Z',
      status: 'in-progress',
      drawn: [],
      mode: 'manual',
      intervalSec: INTERVAL_DEFAULT,
      autoPaused: true,
      undoLocked: false,
      prizes: [],
    });
    expect(INTERVAL_DEFAULT).toBe(5);
  });

  it('genera un id si no se indica', () => {
    const a = createGame();
    const b = createGame();
    expect(typeof a.id).toBe('string');
    expect(a.id).not.toBe(b.id);
  });
});

describe('drawBall', () => {
  it('elige pending[randomInt(pending.length)] con pending en orden ascendente', () => {
    const g0 = createGame();
    expect(drawBall(g0, first).ball).toBe(1);
    expect(drawBall(g0, last).ball).toBe(90);
    expect(drawBall(g0, () => 41).ball).toBe(42);
    const g1 = withDrawn([1, 2, 3]);
    expect(drawBall(g1, first).ball).toBe(4);
  });

  it('pasa a randomInt el número de bolas pendientes', () => {
    const seen = [];
    let g = createGame();
    for (let i = 0; i < 3; i++) g = drawBall(g, (n) => (seen.push(n), 0)).game;
    expect(seen).toEqual([90, 89, 88]);
  });

  it('90 extracciones dan los 90 números sin repetir (randomInt real)', () => {
    const g = drawN(createGame(), TOTAL_BALLS, undefined);
    expect(g.drawn).toHaveLength(90);
    expect(new Set(g.drawn).size).toBe(90);
    expect([...g.drawn].sort((a, b) => a - b)).toEqual(Array.from({ length: 90 }, (_, i) => i + 1));
  });

  it('100 partidas completas con randomInt real producen siempre los 90 números (SC-001)', () => {
    for (let k = 0; k < 100; k++) {
      let g = createGame();
      for (let i = 0; i < TOTAL_BALLS; i++) g = drawBall(g).game;
      expect(new Set(g.drawn).size).toBe(90);
      expect(Math.min(...g.drawn)).toBe(1);
      expect(Math.max(...g.drawn)).toBe(90);
    }
  });

  it('la bola 91 lanza no-balls-left', () => {
    const g = drawN(createGame(), 90);
    expect(() => drawBall(g)).toThrowError(GameError);
    try {
      drawBall(g);
    } catch (e) {
      expect(e.code).toBe('no-balls-left');
    }
  });

  it('sacar en una partida terminada lanza game-finished', () => {
    const g = finishGame(createGame());
    expect(() => drawBall(g)).toThrow(expect.objectContaining({ code: 'game-finished' }));
  });

  it('no modifica la partida recibida', () => {
    const g = createGame();
    const frozen = structuredClone(g);
    const { game: next } = drawBall(g, first);
    expect(g).toEqual(frozen);
    expect(next).not.toBe(g);
    expect(next.drawn).toEqual([1]);
  });

  it('desbloquea deshacer al sacar una bola', () => {
    const g = withDrawn([5], { undoLocked: true });
    expect(drawBall(g, first).game.undoLocked).toBe(false);
  });
});

describe('derivados', () => {
  it('getPending devuelve los pendientes en orden ascendente', () => {
    const g = withDrawn([90, 1, 45]);
    const p = getPending(g);
    expect(p).toHaveLength(87);
    expect(p[0]).toBe(2);
    expect(p).not.toContain(45);
    expect(p.at(-1)).toBe(89);
  });

  it('getLastBalls devuelve las últimas k de la más reciente a la más antigua', () => {
    const g = withDrawn([12, 45, 7, 33, 81, 2, 60]);
    expect(getLastBalls(g, 5)).toEqual([60, 2, 81, 33, 7]);
    expect(getLastBalls(withDrawn([12, 45, 7]), 5)).toEqual([7, 45, 12]);
    expect(getLastBalls(createGame(), 5)).toEqual([]);
  });

  it('canDraw es true en curso con pendientes y false si no quedan o está terminada', () => {
    expect(canDraw(createGame())).toBe(true);
    expect(canDraw(drawN(createGame(), 90))).toBe(false);
    expect(canDraw(finishGame(createGame()))).toBe(false);
  });

  it('finishGame marca la partida como terminada y pausa el automático', () => {
    const g = finishGame({ ...createGame(), mode: 'auto', autoPaused: false });
    expect(g.status).toBe('finished');
    expect(g.autoPaused).toBe(true);
  });
});
