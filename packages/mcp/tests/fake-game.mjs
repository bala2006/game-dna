// A stand-in native game for session tests: a counter sim with a protocol v1 adapter that ports the
// reference loop, launched by the MCP server through a declared command. Argument "silent" never connects.
import { writeFileSync } from 'node:fs';
import net from 'node:net';

writeFileSync('fake-game.pid', String(process.pid));
const bridge = process.env.GAMEDNA_BRIDGE;
const token = process.env.GAMEDNA_TOKEN;
if (process.argv[2] === 'silent' || !bridge || !token) {
  setInterval(() => {}, 1000);
} else {
  const sim = { tick: 0, count: 0, step: 1, held: new Set(), prev: new Set(), events: [], params: {} };
  const reset = (params) => {
    Object.assign(sim, { tick: 0, count: 0, held: new Set(), prev: new Set(), events: [], params });
    sim.step = typeof params['counter.step'] === 'number' ? params['counter.step'] : 1;
  };
  const step = () => {
    sim.tick++;
    if (sim.held.has('inc') && !sim.prev.has('inc')) {
      sim.count += sim.step;
      sim.events.push({ type: 'inc', data: { id: sim.count, by: sim.step } });
    }
    sim.prev = new Set(sim.held);
  };
  const snapshot = () => ({ count: sim.count, tick: sim.tick });
  const drain = () => sim.events.splice(0);
  const advance = (req) => {
    const events = [];
    const samples = [];
    let truncated = false;
    let next = 0;
    while (sim.tick < req.to) {
      const tick = sim.tick;
      for (let input = req.inputs[next]; input && input.tick <= tick; input = req.inputs[++next]) {
        if (input.tick === tick) input.down ? sim.held.add(input.key) : sim.held.delete(input.key);
      }
      step();
      const now = sim.tick;
      for (const raw of drain()) {
        if (events.length >= req.maxEvents) {
          truncated = true;
          break;
        }
        events.push({ tick: now, type: raw.type, data: raw.data ?? {} });
      }
      if (now % req.sampleEvery === 0 || now === req.lastTick) samples.push({ tick: now, state: snapshot() });
    }
    return { tick: sim.tick, events, samples, truncated };
  };
  const methods = {
    reset: (p) => (reset(p.params), drain(), { tick: sim.tick, state: snapshot() }),
    advance,
    snapshot: () => ({ tick: sim.tick, state: snapshot() }),
    events: (p) => ({ events: [], nextCursor: p.cursor, dropped: 0 }),
    parameters: () => ({ values: { 'counter.step': 1, ...sim.params } }),
    control: (p) => ({ mode: p.mode }),
  };
  const [host, port] = bridge.split(':');
  const socket = net.connect(Number(port), host, () => {
    socket.write(`${JSON.stringify({ type: 'hello', protocol: 1, token, engine: 'fake-native', engineVersion: '1.0.0', game: 'counter', tickRateHz: 60, capabilities: [] })}\n`);
  });
  let buffer = '';
  let welcomed = false;
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    for (let nl = buffer.indexOf('\n'); nl !== -1; nl = buffer.indexOf('\n')) {
      const msg = JSON.parse(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
      if (!welcomed) {
        welcomed = true;
        continue;
      }
      const fn = methods[msg.method];
      const reply = fn ? { id: msg.id, result: fn(msg.params) } : { id: msg.id, error: { code: 'UNSUPPORTED', message: `no ${msg.method}` } };
      socket.write(`${JSON.stringify(reply)}\n`);
    }
  });
  socket.on('close', () => process.exit(0));
}
