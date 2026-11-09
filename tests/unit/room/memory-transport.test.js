import { describe, it, expect } from 'vitest';
import { createMemoryHub } from '../../support/memory-transport.js';

/** Monta un cantador y n participantes que registran lo que reciben. */
function setup(opts = {}, n = 2) {
  const hub = createMemoryHub({ seed: 1, ...opts });
  const host = hub.hostTransport();
  const hostGot = [];
  const hostLeft = [];
  host.onMessage((peerId, data) => hostGot.push({ peerId, data }));
  host.onPeerLeave((peerId) => hostLeft.push(peerId));
  const parts = [];
  for (let i = 0; i < n; i++) {
    const t = hub.participantTransport();
    const got = [];
    const statuses = [];
    t.onMessage((d) => got.push(d));
    t.onStatus((s) => statuses.push(s));
    parts.push({ t, got, statuses });
  }
  hub.advance(0);
  return { hub, host, hostGot, hostLeft, parts };
}

/** Envía 40 mensajes en ambos sentidos y devuelve el log serializado. */
function scenario(seed, faults) {
  const { hub, host, parts } = setup({ seed, ...faults }, 3);
  for (let i = 0; i < 40; i++) {
    host.broadcast(`b${i}`);
    parts[i % 3].t.send(`p${i}`);
    hub.advance(100);
  }
  hub.advance(10_000);
  return JSON.stringify(hub.log);
}

describe('memory hub: determinismo', () => {
  it('la misma semilla produce el mismo log de entregas', () => {
    const f = { drop: 0.3, duplicate: 0.3, maxDelayMs: 2000 };
    const a = scenario(7, f);
    const b = scenario(7, f);
    expect(a).toBe(b);
    expect(JSON.parse(a).length).toBeGreaterThan(0);
    expect(scenario(8, f)).not.toBe(a);
  });
});

describe('memory hub: fallos de canal', () => {
  it('sin fallos entrega cada mensaje una vez y en orden', () => {
    const { hub, host, hostGot, parts } = setup({}, 2);
    host.broadcast('uno');
    host.broadcast('dos');
    parts[0].t.send('hola');
    hub.advance(1);
    expect(parts[0].got).toEqual(['uno', 'dos']);
    expect(parts[1].got).toEqual(['uno', 'dos']);
    expect(hostGot.map((m) => m.data)).toEqual(['hola']);
    expect(hostGot[0].peerId).toMatch(/\S/);
  });

  it('send(peerId) llega solo a ese participante', () => {
    const { hub, host, hostGot, parts } = setup({}, 2);
    parts[1].t.send('x');
    hub.advance(1);
    host.send(hostGot[0].peerId, 'solo-tu');
    hub.advance(1);
    expect(parts[1].got).toEqual(['solo-tu']);
    expect(parts[0].got).toEqual([]);
  });

  it('drop: 1 no entrega nada (pero sí los estados de conexión)', () => {
    const { hub, host, hostGot, parts } = setup({ drop: 1 }, 2);
    host.broadcast('a');
    parts[0].t.send('b');
    hub.advance(10_000);
    expect(hub.log).toEqual([]);
    expect(hostGot).toEqual([]);
    expect(parts[0].got).toEqual([]);
    expect(parts[0].statuses).toEqual(['connected']);
  });

  it('duplicate: 1 entrega cada mensaje dos veces', () => {
    const { hub, host, hostGot, parts } = setup({ duplicate: 1 }, 1);
    host.broadcast('a');
    parts[0].t.send('b');
    hub.advance(1);
    expect(parts[0].got).toEqual(['a', 'a']);
    expect(hostGot.map((m) => m.data)).toEqual(['b', 'b']);
  });

  it('con maxDelayMs > 0 alguna semilla desordena mensajes', () => {
    let reordered = false;
    for (let seed = 1; seed <= 50 && !reordered; seed++) {
      const { hub, host, parts } = setup({ seed, maxDelayMs: 1000 }, 1);
      host.broadcast('1');
      host.broadcast('2');
      host.broadcast('3');
      hub.advance(5000);
      reordered = parts[0].got.join('') !== '123';
      expect(parts[0].got.slice().sort()).toEqual(['1', '2', '3']);
    }
    expect(reordered).toBe(true);
  });

  it('el retraso respeta el reloj virtual', () => {
    const { hub, host, parts } = setup({ maxDelayMs: 500 }, 1);
    host.broadcast('a');
    hub.advance(500);
    expect(parts[0].got).toEqual(['a']);
    expect(hub.now()).toBeGreaterThanOrEqual(500);
  });

  it('setFaults cambia los fallos en caliente', () => {
    const { hub, host, parts } = setup({ drop: 1 }, 1);
    host.broadcast('perdido');
    hub.advance(10);
    hub.setFaults({ drop: 0 });
    host.broadcast('llega');
    hub.advance(10);
    expect(parts[0].got).toEqual(['llega']);
  });
});

describe('memory hub: conexiones', () => {
  it('disconnect corta en ambos sentidos y avisa al cantador', () => {
    const { hub, host, hostGot, hostLeft, parts } = setup({}, 2);
    parts[0].t.send('antes');
    hub.advance(1);
    const peer = hostGot[0].peerId;
    hub.disconnect(parts[0].t);
    hub.advance(1);
    expect(hostLeft).toEqual([peer]);
    expect(parts[0].statuses).toEqual(['connected', 'disconnected']);
    parts[0].t.send('despues');
    host.send(peer, 'no-llega');
    host.broadcast('tampoco-a-0');
    hub.advance(1000);
    expect(hostGot.map((m) => m.data)).toEqual(['antes']);
    expect(parts[0].got).toEqual([]);
    expect(parts[1].got).toEqual(['tampoco-a-0']);
  });

  it('un mensaje en vuelo se pierde si la conexión cae antes de entregarse', () => {
    const { hub, host, parts } = setup({ maxDelayMs: 1000 }, 1);
    host.broadcast('en-vuelo');
    hub.disconnect(parts[0].t);
    hub.advance(5000);
    expect(parts[0].got).toEqual([]);
  });

  it('reconnect crea un peerId nuevo y notifica connected', () => {
    const { hub, hostGot, parts } = setup({}, 1);
    parts[0].t.send('a');
    hub.advance(1);
    hub.disconnect(parts[0].t);
    hub.reconnect(parts[0].t);
    hub.advance(1);
    parts[0].t.send('b');
    hub.advance(1);
    expect(parts[0].statuses).toEqual(['connected', 'disconnected', 'connected']);
    expect(hostGot[1].peerId).not.toBe(hostGot[0].peerId);
  });

  it('hostOffline / hostOnline: corta el tráfico y notifica estados', () => {
    const { hub, host, hostGot, hostLeft, parts } = setup({}, 1);
    hub.hostOffline();
    hub.advance(1);
    expect(parts[0].statuses).toEqual(['connected', 'host-offline']);
    host.broadcast('perdido');
    parts[0].t.send('perdido-tambien');
    hub.advance(1000);
    expect(parts[0].got).toEqual([]);
    expect(hostGot).toEqual([]);
    hub.hostOnline();
    hub.advance(1);
    expect(parts[0].statuses.at(-1)).toBe('connected');
    host.broadcast('ok');
    hub.advance(1);
    expect(parts[0].got).toEqual(['ok']);
    expect(hostLeft).toEqual([]);
  });

  it('una desconexión durante la caída del cantador se le notifica al volver', () => {
    const { hub, host, hostGot, hostLeft, parts } = setup({}, 1);
    parts[0].t.send('x');
    hub.advance(1);
    const peer = hostGot[0].peerId;
    host.broadcast('ping');
    hub.hostOffline();
    hub.disconnect(parts[0].t);
    hub.advance(1);
    expect(hostLeft).toEqual([]);
    hub.hostOnline();
    hub.advance(1);
    expect(hostLeft).toEqual([peer]);
  });

  it('destroyRoom notifica room-unavailable y corta el tráfico', () => {
    const { hub, host, parts } = setup({}, 2);
    hub.destroyRoom();
    hub.advance(1);
    for (const p of parts) expect(p.statuses.at(-1)).toBe('room-unavailable');
    host.broadcast('x');
    hub.advance(1000);
    expect(parts[0].got).toEqual([]);
  });

  it('close() de un participante avisa al cantador; close() del cantador es idempotente', () => {
    const { hub, host, hostGot, hostLeft, parts } = setup({}, 1);
    parts[0].t.send('x');
    hub.advance(1);
    parts[0].t.close();
    parts[0].t.close();
    hub.advance(1);
    expect(hostLeft).toEqual([hostGot[0].peerId]);
    host.close();
    expect(() => host.close()).not.toThrow();
  });

  it('los manejadores devuelven función de baja', () => {
    const { hub, host, parts } = setup({}, 1);
    const got = [];
    const off = parts[0].t.onMessage((d) => got.push(d));
    host.broadcast('a');
    hub.advance(1);
    off();
    host.broadcast('b');
    hub.advance(1);
    expect(got).toEqual(['a']);
  });
});

describe('memory hub: reloj virtual', () => {
  it('setInterval dispara en orden temporal y salta de suceso en suceso', () => {
    const hub = createMemoryHub({ seed: 1 });
    const clock = hub.clock();
    const calls = [];
    clock.setInterval(() => calls.push(['a', clock.now()]), 250);
    clock.setInterval(() => calls.push(['b', clock.now()]), 400);
    hub.advance(1000);
    expect(calls).toEqual([
      ['a', 250],
      ['b', 400],
      ['a', 500],
      ['a', 750],
      ['b', 800],
      ['a', 1000],
    ]);
    expect(hub.now()).toBe(1000);
  });

  it('empates se resuelven por orden de inserción y clearInterval funciona', () => {
    const hub = createMemoryHub({ seed: 1 });
    const clock = hub.clock();
    const calls = [];
    const a = clock.setInterval(() => calls.push('a'), 100);
    clock.setInterval(() => calls.push('b'), 100);
    hub.advance(100);
    clock.clearInterval(a);
    hub.advance(100);
    expect(calls).toEqual(['a', 'b', 'b']);
  });

  it('un temporizador puede cancelarse a sí mismo', () => {
    const hub = createMemoryHub({ seed: 1 });
    const clock = hub.clock();
    let n = 0;
    const id = clock.setInterval(() => {
      n++;
      clock.clearInterval(id);
    }, 10);
    hub.advance(100);
    expect(n).toBe(1);
  });
});
