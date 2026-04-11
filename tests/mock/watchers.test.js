'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const createWatchers = require('../../watchers.js');

function makeEnv(overrides = {}) {
  const watched = new Map(), unwatchCalls = [], timers = [];
  const origST = global.setTimeout, origCT = global.clearTimeout;
  global.setTimeout = (fn, ms) => { const h = { fn, ms, cleared: false }; timers.push(h); return h; };
  global.clearTimeout = h => { if (h) h.cleared = true; };
  const origW = fs.watchFile, origU = fs.unwatchFile;
  fs.watchFile = (p, o, l) => { watched.set(p, { options: o, listener: l }); };
  fs.unwatchFile = p => { unwatchCalls.push(p); watched.delete(p); };

  const ccCalls = [];
  const swc = overrides.sessionWsClients || new Map();
  const w = createWatchers({
    db: { getSessionByPrefix: p => overrides.sessionByPrefix?.[p], getProjectById: id => overrides.projectsById?.[id], getProjects: () => overrides.projects || [] },
    safe: { findSessionsDir: () => '/tmp/sessions' },
    config: { get: (k, fb) => fb },
    sessionUtils: { getTokenUsage: async () => ({ input_tokens: 500, model: 'claude-sonnet-4-6', max_tokens: 200000 }) },
    sessionWsClients: swc,
    checkCompactionNeeds: async (...a) => { ccCalls.push(a); },
    tmuxName: id => `bp_${id}`,
    tmuxExists: async () => false,
    CLAUDE_HOME: '/tmp/claude',
    logger: { info() {}, warn() {}, error() {}, debug() {} },
  });

  return { w, watched, unwatchCalls, timers, ccCalls, swc, cleanup() { fs.watchFile = origW; fs.unwatchFile = origU; global.setTimeout = origST; global.clearTimeout = origCT; } };
}

test('WAT-03: debounces rapid changes into one callback', async () => {
  const wsMessages = [];
  const ws = { readyState: 1, send: m => wsMessages.push(JSON.parse(m)) };
  const env = makeEnv({ sessionByPrefix: { abc123: { id: 'abc123', project_id: 1 } }, projectsById: { 1: { id: 1, name: 'p', path: '/workspace/p' } }, sessionWsClients: new Map([['bp_abc123', ws]]) });
  try {
    env.w.startJsonlWatcher('bp_abc123');
    const entry = [...env.watched.values()][0];
    // Fire 3 rapid changes
    entry.listener(); entry.listener(); entry.listener();
    // Only one non-cleared timer should exist
    const active = env.timers.filter(t => !t.cleared);
    assert.equal(active.length, 1);
    await active[0].fn();
    assert.equal(wsMessages.length, 1);
    assert.equal(wsMessages[0].type, 'token_update');
    assert.equal(env.ccCalls.length, 1);
  } finally { env.cleanup(); }
});

test('WAT-04: stopJsonlWatcher removes watch and timer', () => {
  const env = makeEnv({ sessionByPrefix: { abc: { id: 'abc', project_id: 1 } }, projectsById: { 1: { id: 1, name: 'p', path: '/tmp' } } });
  try {
    env.w.startJsonlWatcher('bp_abc');
    [...env.watched.values()][0].listener(); // trigger debounce timer
    env.w.stopJsonlWatcher('bp_abc');
    assert.equal(env.unwatchCalls.length, 1);
    assert.equal(env.timers[0].cleared, true);
  } finally { env.cleanup(); }
});

test('WAT: watcher does not start for new_ or t_ sessions', () => {
  const env = makeEnv({ sessionByPrefix: {} });
  try {
    env.w.startJsonlWatcher('bp_new_123');
    assert.equal(env.watched.size, 0);
    env.w.startJsonlWatcher('bp_t_456');
    assert.equal(env.watched.size, 0);
  } finally { env.cleanup(); }
});

test('WAT: watcher does not start when session not in DB', () => {
  const env = makeEnv({ sessionByPrefix: {} });
  try {
    env.w.startJsonlWatcher('bp_unknown');
    assert.equal(env.watched.size, 0);
  } finally { env.cleanup(); }
});
