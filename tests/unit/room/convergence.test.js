import { describe, it, expect } from 'vitest';
import { replayGameLog, runSession } from '../../support/simulate.js';
import { toSpectatorView, viewsEqual } from '../../../src/core/room/view.js';
import { createRng } from '../../support/prng.js';

const envSeed = process.env.ROOM_SEED;
const seeds = envSeed
  ? [Number(envSeed)]
  : Array.from({ length: 1000 }, (_, i) => i + 1);

describe('convergencia (SC-001, SC-002, SC-003, SC-008)', () => {
  it('al estabilizarse el canal, todas las vistas coinciden con la del cantador', () => {
    const t0 = performance.now();
    /** @type {string | null} */
    let failed = null;
    for (const seed of seeds) {
      const rng = createRng(seed);
      const faults = {
        drop: rng.rnd() * 0.3,
        duplicate: rng.rnd() * 0.3,
        maxDelayMs: rng.int(3001),
      };
      const result = runSession({ seed, participants: 10, faults, steps: 28 });
      const hostView = toSpectatorView(result.hostGame);
      const replayed = replayGameLog(result.gameLog);
      if (replayed.id !== result.hostGame.id || replayed.status !== result.hostGame.status
        || replayed.drawn.length !== result.hostGame.drawn.length
        || replayed.drawn.some((b, i) => b !== result.hostGame.drawn[i])
        || replayed.prizes.length !== result.hostGame.prizes.length) {
        failed = `seed ${seed} replay`;
        break;
      }

      for (const s of result.participants) {
        if (s.connection === 'rejected' || s.connection === 'closed' || s.connection === 'unavailable') {
          continue;
        }
        if (s.sync !== 'synced' || !viewsEqual(s.view, hostView)) {
          failed = `seed ${seed} ${s.alias} sync=${s.sync} conn=${s.connection} seq=${s.seq}`;
          break;
        }
      }
      if (failed) break;

      for (const obs of result.intermediate) {
        const hv = result.hostViews.get(obs.seq);
        if (!hv || new Set(obs.view.drawn).size !== obs.view.drawn.length || !viewsEqual(obs.view, hv)) {
          failed = `seed ${seed} seq ${obs.seq}`;
          break;
        }
      }
      if (failed) break;
    }
    expect(failed).toBeNull();
    if (!envSeed) {
      expect(performance.now() - t0, 'suite de 1000 semillas').toBeLessThan(8000);
    }
  }, 20_000);
});
