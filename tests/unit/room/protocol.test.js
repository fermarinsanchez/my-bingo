import { describe, it, expect } from 'vitest';
import { encodeMessage, decodeMessage } from '../../../src/core/room/protocol.js';
import { MAX_MESSAGE_BYTES } from '../../../src/core/room/constants.js';
import { createRng } from '../../support/prng.js';

const PID = '3f1c9a2e-7b4d-4e0a-9c1f-2b8e6d5a4c3b';
const VIEW = {
  gameId: 'g-1',
  status: 'in-progress',
  drawn: [12, 45, 7],
  prizes: [{ type: 'line', completionPosition: 3, awardedAtPosition: 3 }],
};

/** Ejemplos válidos por origen (contracts/room-protocol.md). */
const FROM_PARTICIPANT = [
  { type: 'join', participantId: PID, alias: '  Lola  ' },
  { type: 'resync' },
];
const FROM_HOST = [
  { type: 'snapshot', seq: 14, alias: 'Lola', participantCount: 12, view: VIEW },
  { type: 'snapshot', seq: 15, view: VIEW },
  { type: 'reject', reason: 'room-full' },
  { type: 'ball', seq: 15, ball: 42 },
  { type: 'undo', seq: 16, ball: 42 },
  { type: 'prize', seq: 17, prize: VIEW.prizes[0] },
  { type: 'end', scope: 'game', seq: 18 },
  { type: 'end', scope: 'room', lastSeq: 18 },
  { type: 'host-online', lastSeq: 18 },
  { type: 'presence', count: 13, lastSeq: 18 },
];

const enc = (o) => JSON.stringify({ v: 1, ...o });
const hostOk = (o) => decodeMessage(enc(o), 'host');
const partOk = (o) => decodeMessage(enc(o), 'participant');

describe('encodeMessage', () => {
  it('añade v si falta y la conserva si existe', () => {
    expect(JSON.parse(encodeMessage({ type: 'resync' }))).toEqual({ v: 1, type: 'resync' });
    expect(JSON.parse(encodeMessage({ v: 2, type: 'resync' })).v).toBe(2);
  });

  it('devuelve una cadena', () => {
    expect(typeof encodeMessage({ type: 'host-online', lastSeq: 3 })).toBe('string');
  });
});

describe('decodeMessage: ida y vuelta válida', () => {
  it.each(FROM_PARTICIPANT)('participante → cantador: $type', (msg) => {
    const r = decodeMessage(encodeMessage(msg), 'participant');
    expect(r).toEqual({ ok: true, msg: { v: 1, ...msg } });
  });

  it.each(FROM_HOST)('cantador → participante: $type', (msg) => {
    const r = decodeMessage(encodeMessage(msg), 'host');
    expect(r).toEqual({ ok: true, msg: { v: 1, ...msg } });
  });

  it('ignora campos desconocidos', () => {
    const r = decodeMessage(enc({ type: 'ball', seq: 1, ball: 5, extra: 'x' }), 'host');
    expect(r.ok).toBe(true);
    expect(r.msg).toEqual({ v: 1, type: 'ball', seq: 1, ball: 5 });
  });
});

describe('decodeMessage: malformed', () => {
  it('entrada que no es cadena', () => {
    for (const raw of [undefined, null, 5, {}, [], true, () => 1]) {
      expect(decodeMessage(raw, 'host')).toEqual({ ok: false, reason: 'malformed' });
    }
  });

  it('JSON inválido o no objeto', () => {
    for (const raw of ['', '{', 'nope', '[]', '5', 'null', '"x"', 'true', '[1,2]']) {
      expect(decodeMessage(raw, 'host')).toEqual({ ok: false, reason: 'malformed' });
    }
  });

  it('tipo desconocido o ausente', () => {
    expect(hostOk({ type: 'nope' })).toEqual({ ok: false, reason: 'malformed' });
    expect(hostOk({})).toEqual({ ok: false, reason: 'malformed' });
    expect(hostOk({ type: 5 })).toEqual({ ok: false, reason: 'malformed' });
  });

  it('v ausente o no entera', () => {
    expect(decodeMessage('{"type":"resync"}', 'participant').reason).toBe('malformed');
    expect(decodeMessage('{"v":"1","type":"resync"}', 'participant').reason).toBe('malformed');
  });

  it('tipos de un origen enviados desde el otro', () => {
    for (const m of FROM_HOST) {
      if (m.type === 'reject') continue;
      expect(partOk(m)).toEqual({ ok: false, reason: 'malformed' });
    }
    for (const m of FROM_PARTICIPANT) {
      expect(hostOk(m)).toEqual({ ok: false, reason: 'malformed' });
    }
    expect(partOk({ type: 'reject', reason: 'room-full' })).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('origen desconocido', () => {
    expect(decodeMessage(enc({ type: 'resync' }), /** @type {any} */ ('x')).reason).toBe(
      'malformed',
    );
  });

  it('join con campos erróneos', () => {
    for (const bad of [
      { participantId: PID },
      { alias: 'a' },
      { participantId: 5, alias: 'a' },
      { participantId: PID, alias: 5 },
      { participantId: 'corto', alias: 'a' },
      { participantId: 'x'.repeat(65), alias: 'a' },
      { participantId: 'a b c d e f g h', alias: 'a' },
    ]) {
      expect(partOk({ type: 'join', ...bad }).reason).toBe('malformed');
    }
  });

  it('seq / lastSeq / count / ball inválidos', () => {
    const bads = [-1, 1.5, '3', null, NaN, undefined];
    for (const x of bads) {
      expect(hostOk({ type: 'ball', seq: x, ball: 5 }).ok).toBe(false);
      expect(hostOk({ type: 'undo', seq: x, ball: 5 }).ok).toBe(false);
      expect(hostOk({ type: 'prize', seq: x, prize: VIEW.prizes[0] }).ok).toBe(false);
      expect(hostOk({ type: 'end', scope: 'game', seq: x }).ok).toBe(false);
      expect(hostOk({ type: 'end', scope: 'room', lastSeq: x }).ok).toBe(false);
      expect(hostOk({ type: 'host-online', lastSeq: x }).ok).toBe(false);
      expect(hostOk({ type: 'presence', count: 1, lastSeq: x }).ok).toBe(false);
      expect(hostOk({ type: 'presence', count: x, lastSeq: 1 }).ok).toBe(false);
      expect(hostOk({ type: 'snapshot', seq: x, view: VIEW }).ok).toBe(false);
    }
    for (const b of [0, 91, -3, 1.5, '5', null, undefined]) {
      expect(hostOk({ type: 'ball', seq: 1, ball: b }).ok).toBe(false);
      expect(hostOk({ type: 'undo', seq: 1, ball: b }).ok).toBe(false);
    }
    expect(hostOk({ type: 'presence', count: 41, lastSeq: 1 }).ok).toBe(false);
    expect(hostOk({ type: 'presence', count: 40, lastSeq: 1 }).ok).toBe(true);
    expect(hostOk({ type: 'presence', count: 0, lastSeq: 0 }).ok).toBe(true);
  });

  it('end sin scope válido o game sin seq', () => {
    expect(hostOk({ type: 'end' }).ok).toBe(false);
    expect(hostOk({ type: 'end', scope: 'x', seq: 1 }).ok).toBe(false);
    expect(hostOk({ type: 'end', scope: 'game' }).ok).toBe(false);
    expect(hostOk({ type: 'end', scope: 'room' }).ok).toBe(false);
  });

  it('prize con posiciones fuera de rango', () => {
    for (const prize of [
      null,
      { type: 'x', completionPosition: 1, awardedAtPosition: 1 },
      { type: 'line', completionPosition: 0, awardedAtPosition: 1 },
      { type: 'line', completionPosition: 3, awardedAtPosition: 2 },
      { type: 'line', completionPosition: 1.5, awardedAtPosition: 2 },
    ]) {
      expect(hostOk({ type: 'prize', seq: 1, prize }).ok).toBe(false);
    }
  });

  it('snapshot con vista inválida', () => {
    const v = (x) => ({ ...VIEW, ...x });
    const bad = [
      null,
      'x',
      v({ gameId: 5 }),
      v({ gameId: '' }),
      v({ status: 'otra' }),
      v({ drawn: [1, 1] }),
      v({ drawn: [0] }),
      v({ drawn: [91] }),
      v({ drawn: [1.5] }),
      v({ drawn: 'x' }),
      v({ drawn: Array.from({ length: 91 }, (_, i) => (i % 90) + 1) }),
      v({ prizes: 'x' }),
      v({ prizes: [{ type: 'line', completionPosition: 0, awardedAtPosition: 1 }] }),
      v({ prizes: [{ type: 'line', completionPosition: 2, awardedAtPosition: 1 }] }),
      v({ prizes: [{ type: 'line', completionPosition: 1, awardedAtPosition: 4 }] }),
    ];
    for (const view of bad) {
      expect(hostOk({ type: 'snapshot', seq: 1, view }).reason).toBe('malformed');
    }
    expect(hostOk({ type: 'snapshot', seq: 1 }).ok).toBe(false);
  });

  it('snapshot: alias y participantCount van juntos y bien tipados', () => {
    expect(hostOk({ type: 'snapshot', seq: 1, view: VIEW, alias: 'a' }).ok).toBe(false);
    expect(hostOk({ type: 'snapshot', seq: 1, view: VIEW, participantCount: 1 }).ok).toBe(false);
    expect(
      hostOk({ type: 'snapshot', seq: 1, view: VIEW, alias: 5, participantCount: 1 }).ok,
    ).toBe(false);
    expect(
      hostOk({ type: 'snapshot', seq: 1, view: VIEW, alias: 'a', participantCount: 41 }).ok,
    ).toBe(false);
  });

  it('reject con motivo inválido', () => {
    expect(hostOk({ type: 'reject' }).ok).toBe(false);
    expect(hostOk({ type: 'reject', reason: 'otro' }).ok).toBe(false);
    for (const reason of [
      'alias-invalid',
      'alias-taken',
      'room-full',
      'incompatible-version',
      'room-closed',
    ]) {
      expect(hostOk({ type: 'reject', reason }).ok).toBe(true);
    }
  });
});

describe('decodeMessage: too-large', () => {
  it('rechaza cadenas de más de 16384 bytes UTF-8', () => {
    const ok = enc({ type: 'join', participantId: PID, alias: 'a'.repeat(16000) });
    expect(decodeMessage(ok, 'participant').ok).toBe(true);
    const big = enc({ type: 'join', participantId: PID, alias: 'a'.repeat(MAX_MESSAGE_BYTES) });
    expect(decodeMessage(big, 'participant')).toEqual({ ok: false, reason: 'too-large' });
  });

  it('mide bytes y no unidades UTF-16', () => {
    // 6000 "ñ" = 6000 unidades pero 12000 bytes: cabe; 9000 "ñ" = 18000 bytes: no cabe.
    const fits = enc({ type: 'join', participantId: PID, alias: 'ñ'.repeat(6000) });
    expect(decodeMessage(fits, 'participant').ok).toBe(true);
    const tooBig = enc({ type: 'join', participantId: PID, alias: 'ñ'.repeat(9000) });
    expect(tooBig.length).toBeLessThan(MAX_MESSAGE_BYTES);
    expect(decodeMessage(tooBig, 'participant')).toEqual({ ok: false, reason: 'too-large' });
  });
});

describe('decodeMessage: versión', () => {
  it('v ≠ 1 → incompatible-version (con el tipo para que el cantador pueda contestar)', () => {
    const r = decodeMessage(JSON.stringify({ v: 2, type: 'join', participantId: PID, alias: 'a' }), 'participant');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('incompatible-version');
    expect(r.type).toBe('join');
    expect(decodeMessage(JSON.stringify({ v: 0, type: 'ball', seq: 1, ball: 2 }), 'host').reason).toBe(
      'incompatible-version',
    );
  });

  it('reject se decodifica con cualquier v', () => {
    for (const v of [0, 1, 2, 99]) {
      const r = decodeMessage(
        JSON.stringify({ v, type: 'reject', reason: 'incompatible-version' }),
        'host',
      );
      expect(r.ok).toBe(true);
      expect(r.msg.reason).toBe('incompatible-version');
    }
  });
});

describe('decodeMessage: nunca lanza', () => {
  it('fuzz de 1 000 entradas con PRNG con semilla', () => {
    const rng = createRng(2026);
    const alphabet = '{}[]":,0123456789abcdefghijklmnopqrstuvwxyz -.\\ñ\u202e';
    const pieces = ['"type"', '"v"', '1', '"ball"', '"seq"', '"view"', '{', '}', 'null', '-1'];
    const randomString = () => {
      let s = '';
      const n = rng.int(60);
      for (let i = 0; i < n; i++) {
        s += rng.chance(0.4) ? pieces[rng.int(pieces.length)] : alphabet[rng.int(alphabet.length)];
      }
      return s;
    };
    const randomValue = (depth = 0) => {
      const k = rng.int(7);
      if (k === 0) return rng.int(200) - 50;
      if (k === 1) return randomString();
      if (k === 2) return null;
      if (k === 3) return rng.chance(0.5);
      if (k === 4 && depth < 3) return Array.from({ length: rng.int(4) }, () => randomValue(depth + 1));
      if (k === 5 && depth < 3) {
        const o = {};
        for (let i = rng.int(5); i > 0; i--) o[['v', 'type', 'seq', 'ball', 'view', 'alias'][rng.int(6)]] = randomValue(depth + 1);
        return o;
      }
      return undefined;
    };
    const inputs = [];
    for (let i = 0; i < 1000; i++) {
      const k = rng.int(3);
      inputs.push(k === 0 ? randomString() : k === 1 ? randomValue() : JSON.stringify(randomValue()));
    }
    expect(() => {
      for (const x of inputs) {
        decodeMessage(x, 'host');
        decodeMessage(x, 'participant');
      }
    }).not.toThrow();
  });
});
