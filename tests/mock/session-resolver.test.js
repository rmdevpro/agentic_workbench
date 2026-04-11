'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const createSessionResolver = require('../../session-resolver.js');

function makeResolver({ filesByDir = new Map(), tmuxAlive = new Set(), configValues = {} } = {}) {
  const sessions = new Map();
  const db = {
    sessions,
    getProjects: () => [{ id: 1, name: 'proj', path: '/workspace/proj' }],
    getSessionsForProject: (pid) => [...sessions.values()].filter(s => s.project_id === pid),
    getSession: (id) => sessions.get(id),
    upsertSession: (id, pid, name) => { const e = sessions.get(id) || {}; const r = { id, project_id: pid, name: e.name ?? name, notes: e.notes || '', state: e.state || 'active', user_renamed: e.user_renamed || 0 }; sessions.set(id, r); return r; },
    renameSession: (id, name) => { const r = sessions.get(id); if (r) { r.name = name; r.user_renamed = 1; } },
    setSessionNotes: (id, notes) => { const r = sessions.get(id); if (r) r.notes = notes; },
    setSessionState: (id, state) => { const r = sessions.get(id); if (r) r.state = state; },
    deleteSession: (id) => sessions.delete(id),
  };
  const renameCalls = [];
  const safe = {
    findSessionsDir: () => '/sessions/_workspace_proj',
    tmuxExecAsync: async (args) => { if (args[0] === 'rename-session') { renameCalls.push(args); return ''; } throw new Error('unexpected'); },
  };
  const sleepCalls = [];
  const resolver = createSessionResolver({
    db, safe,
    tmuxName: id => `bp_${id}`,
    tmuxExists: async n => tmuxAlive.has(n),
    sleep: async ms => { sleepCalls.push(ms); },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    config: { get: (k, fb) => configValues[k] ?? fb },
  });
  const readdirMock = async (dir) => {
    if (!filesByDir.has(dir)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
    const v = filesByDir.get(dir);
    return typeof v === 'function' ? v() : v;
  };
  return { resolver, db, renameCalls, sleepCalls, readdirMock };
}

test('RES-02: resolution preserves name, notes, state', async (t) => {
  const dir = '/sessions/_workspace_proj';
  const env = makeResolver({ filesByDir: new Map([[dir, ['real123.jsonl']]]), configValues: { 'resolver.maxAttempts': 1, 'resolver.sleepMs': 1 } });
  env.db.sessions.set('new_1', { id: 'new_1', project_id: 1, name: 'Custom', notes: 'note', state: 'hidden', user_renamed: 1 });
  t.mock.method(require('node:fs/promises'), 'readdir', env.readdirMock);
  await env.resolver.resolveSessionId('new_1', { tmux: 'bp_new_1', sessionsDir: dir, existingFiles: new Set(), projectId: 1 });
  const real = env.db.getSession('real123');
  assert.equal(real.name, 'Custom');
  assert.equal(real.notes, 'note');
  assert.equal(real.state, 'hidden');
  assert.equal(env.db.getSession('new_1'), undefined);
});

test('RES-03: duplicate resolution suppressed', async (t) => {
  const dir = '/sessions/_workspace_proj';
  let reads = 0;
  const env = makeResolver({ filesByDir: new Map([[dir, () => { reads++; return ['r.jsonl']; }]]), configValues: { 'resolver.maxAttempts': 1, 'resolver.sleepMs': 1 } });
  env.db.sessions.set('new_1', { id: 'new_1', project_id: 1, name: 'T', notes: '', state: 'active', user_renamed: 0 });
  t.mock.method(require('node:fs/promises'), 'readdir', env.readdirMock);
  await Promise.all([
    env.resolver.resolveSessionId('new_1', { tmux: 'bp_new_1', sessionsDir: dir, existingFiles: new Set(), projectId: 1 }),
    env.resolver.resolveSessionId('new_1', { tmux: 'bp_new_1', sessionsDir: dir, existingFiles: new Set(), projectId: 1 }),
  ]);
  assert.equal(reads, 1);
});

test('RES-04: timeout with dead tmux deletes temp session', async (t) => {
  const dir = '/sessions/_workspace_proj';
  const env = makeResolver({ filesByDir: new Map([[dir, []]]), configValues: { 'resolver.maxAttempts': 2, 'resolver.sleepMs': 1 } });
  env.db.sessions.set('new_1', { id: 'new_1', project_id: 1, name: 'T', notes: '', state: 'active', user_renamed: 0 });
  t.mock.method(require('node:fs/promises'), 'readdir', env.readdirMock);
  await env.resolver.resolveSessionId('new_1', { tmux: 'bp_new_1', sessionsDir: dir, existingFiles: new Set(), projectId: 1 });
  assert.equal(env.db.getSession('new_1'), undefined);
});

test('RES-05: timeout with live tmux keeps temp session', async (t) => {
  const dir = '/sessions/_workspace_proj';
  const env = makeResolver({ filesByDir: new Map([[dir, []]]), tmuxAlive: new Set(['bp_new_1']), configValues: { 'resolver.maxAttempts': 2, 'resolver.sleepMs': 1 } });
  env.db.sessions.set('new_1', { id: 'new_1', project_id: 1, name: 'T', notes: '', state: 'active', user_renamed: 0 });
  t.mock.method(require('node:fs/promises'), 'readdir', env.readdirMock);
  await env.resolver.resolveSessionId('new_1', { tmux: 'bp_new_1', sessionsDir: dir, existingFiles: new Set(), projectId: 1 });
  assert.ok(env.db.getSession('new_1'));
});

test('RES-07: startup removes orphans when no sessions dir', async (t) => {
  const env = makeResolver({ filesByDir: new Map(), configValues: { 'resolver.maxAttempts': 1, 'resolver.sleepMs': 1 } });
  env.db.sessions.set('new_1', { id: 'new_1', project_id: 1, name: 'T', notes: '', state: 'active', user_renamed: 0 });
  t.mock.method(require('node:fs/promises'), 'readdir', env.readdirMock);
  await env.resolver.resolveStaleNewSessions();
  assert.equal(env.db.getSession('new_1'), undefined);
});

test('RES-08: concurrent JSONL creation resolves to first file', async (t) => {
  const dir = '/sessions/_workspace_proj';
  const env = makeResolver({ filesByDir: new Map([[dir, ['file_a.jsonl', 'file_b.jsonl']]]), configValues: { 'resolver.maxAttempts': 1, 'resolver.sleepMs': 1 } });
  env.db.sessions.set('new_1', { id: 'new_1', project_id: 1, name: 'T', notes: '', state: 'active', user_renamed: 0 });
  t.mock.method(require('node:fs/promises'), 'readdir', env.readdirMock);
  await env.resolver.resolveSessionId('new_1', { tmux: 'bp_new_1', sessionsDir: dir, existingFiles: new Set(), projectId: 1 });
  assert.ok(env.db.getSession('file_a'));
  assert.equal(env.db.getSession('new_1'), undefined);
});
