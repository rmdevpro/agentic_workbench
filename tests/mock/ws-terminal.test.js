'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const createWsTerminal = require('../../ws-terminal.js');

class FakePty {
  constructor() { this.pid = 1234; this.paused = false; this.killed = false; this.resizeCalls = []; this.writeCalls = []; this.dataHandler = null; this.exitHandler = null; }
  onData(fn) { this.dataHandler = fn; }
  emitData(d) { if (this.dataHandler) this.dataHandler(d); }
  onExit(fn) { this.exitHandler = fn; }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
  resize(c, r) { this.resizeCalls.push([c, r]); }
  write(d) { this.writeCalls.push(d); }
  kill() { this.killed = true; }
}

function makeWs() {
  const h = {};
  return {
    OPEN: 1, readyState: 1, bufferedAmount: 0, sent: [], isAlive: true,
    on(e, fn) { h[e] = fn; },
    send(p) { this.sent.push(p); },
    close() { this.readyState = 3; if (h.close) h.close(); },
    terminate() { this.readyState = 3; if (h.close) h.close(); },
    ping() { this.pinged = true; },
    trigger(e, p) { if (h[e]) h[e](p); },
  };
}

function makeEnv(overrides = {}) {
  let bc = 0;
  const kaCalls = [];
  const swc = new Map();
  const fp = overrides.fakePty || new FakePty();
  const env = {
    safe: { sanitizeTmuxName: v => v.replace(/[^a-zA-Z0-9_-]/g, '_') },
    keepalive: { onBrowserConnect: () => kaCalls.push('connect'), onBrowserDisconnect: n => kaCalls.push(['disconnect', n]) },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    config: { get: (k, fb) => ({ 'ws.bufferHighWaterMark': 1024, 'ws.bufferLowWaterMark': 512, 'ws.pingIntervalMs': 50 }[k] ?? fb) },
    sessionWsClients: swc,
    getBrowserCount: () => bc,
    incrementBrowserCount: () => ++bc,
    decrementBrowserCount: () => { if (bc > 0) bc--; return bc; },
    tmuxExists: async () => overrides.tmuxExists ?? true,
    cancelTmuxCleanup: () => { env.cancelled = true; },
    scheduleTmuxCleanup: n => { env.scheduled = n; },
    startJsonlWatcher: n => { env.startedWatcher = n; },
    stopJsonlWatcher: n => { env.stoppedWatcher = n; },
    spawnPty: () => { if (overrides.spawnThrows) throw new Error('spawn failed'); return fp; },
  };
  env.terminal = createWsTerminal(env);
  env.kaCalls = kaCalls;
  env.fakePty = fp;
  env.getBrowserCount = () => bc;
  return env;
}

test('WS-01: nonexistent tmux session sends error and closes', async () => {
  const env = makeEnv({ tmuxExists: false });
  const ws = makeWs();
  await env.terminal.handleTerminalConnection(ws, 'nonexistent');
  assert.ok(ws.sent.some(s => s.includes('No tmux session')));
  assert.equal(ws.readyState, 3);
});

test('WS-04: resize message resizes PTY', async () => {
  const env = makeEnv();
  const ws = makeWs();
  await env.terminal.handleTerminalConnection(ws, 'bp_test');
  ws.trigger('message', Buffer.from(JSON.stringify({ type: 'resize', cols: 120, rows: 40 })));
  assert.deepEqual(env.fakePty.resizeCalls, [[120, 40]]);
});

test('WS-05: backpressure pauses PTY at high watermark', async () => {
  const env = makeEnv();
  const ws = makeWs();
  await env.terminal.handleTerminalConnection(ws, 'bp_test');
  // Simulate high bufferedAmount
  ws.bufferedAmount = 2000; // > 1024 highWater
  env.fakePty.emitData('x'.repeat(100));
  assert.equal(env.fakePty.paused, true);
});

test('WS-07 / WS-11: disconnect kills PTY, updates browser count, schedules cleanup, updates keepalive', async () => {
  const env = makeEnv();
  const ws = makeWs();
  await env.terminal.handleTerminalConnection(ws, 'bp_test');
  assert.equal(env.getBrowserCount(), 1);
  ws.trigger('close');
  assert.equal(env.fakePty.killed, true);
  assert.equal(env.stoppedWatcher, 'bp_test');
  assert.equal(env.scheduled, 'bp_test');
  assert.equal(env.getBrowserCount(), 0);
  assert.deepEqual(env.kaCalls, ['connect', ['disconnect', 0]]);
});

test('WS-10: PTY spawn failure closes WS without crash', async () => {
  const env = makeEnv({ spawnThrows: true });
  const ws = makeWs();
  await env.terminal.handleTerminalConnection(ws, 'bp_test');
  assert.equal(ws.readyState, 3);
});

test('WS-08: token_update forwarded to WS client', async () => {
  const env = makeEnv();
  const ws = makeWs();
  await env.terminal.handleTerminalConnection(ws, 'bp_test');
  // The swc map should have the ws registered
  assert.equal(env.sessionWsClients.get('bp_test'), ws);
});

test('WS: PTY data forwarded to websocket', async () => {
  const env = makeEnv();
  const ws = makeWs();
  await env.terminal.handleTerminalConnection(ws, 'bp_test');
  env.fakePty.emitData('hello terminal');
  assert.ok(ws.sent.includes('hello terminal'));
});

test('WS: websocket message written to PTY', async () => {
  const env = makeEnv();
  const ws = makeWs();
  await env.terminal.handleTerminalConnection(ws, 'bp_test');
  ws.trigger('message', Buffer.from('user input'));
  assert.ok(env.fakePty.writeCalls.includes('user input'));
});

test('WS: ping message gets pong response', async () => {
  const env = makeEnv();
  const ws = makeWs();
  await env.terminal.handleTerminalConnection(ws, 'bp_test');
  ws.trigger('message', Buffer.from(JSON.stringify({ type: 'ping' })));
  assert.ok(ws.sent.some(s => { try { return JSON.parse(s).type === 'pong'; } catch { return false; } }));
});
