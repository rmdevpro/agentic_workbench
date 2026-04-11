'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const path = require('node:path');
const childProcess = require('node:child_process');
const fixtures = require('../fixtures/test-data');
const { freshRequire } = require('../helpers/module');

const SAFE_PATH = path.join(__dirname, '..', '..', 'safe-exec.js');

function freshSafe(env = {}) {
  const prev = { WORKSPACE: process.env.WORKSPACE, CLAUDE_HOME: process.env.CLAUDE_HOME, HOME: process.env.HOME };
  Object.assign(process.env, env);
  const safe = freshRequire(SAFE_PATH);
  return { safe, restore() { for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } } };
}

test('SAF-01: resolveProjectPath joins WORKSPACE correctly', () => {
  const { safe, restore } = freshSafe({ WORKSPACE: '/tmp/ws' });
  try { assert.equal(safe.resolveProjectPath('proj'), path.resolve('/tmp/ws', 'proj')); }
  finally { restore(); }
});

test('SAF-02: sanitizeTmuxName strips non-alphanumeric', () => {
  const { safe, restore } = freshSafe();
  try { assert.equal(safe.sanitizeTmuxName(fixtures.safeExec.tmuxDirtyName), 'a_b_c_d'); }
  finally { restore(); }
});

test('SAF-03: shellEscape prevents injection', () => {
  const { safe, restore } = freshSafe();
  try {
    const escaped = safe.shellEscape(fixtures.safeExec.maliciousShellInput);
    assert.equal(escaped, `''\\''; rm -rf /; '\\'''`);
  } finally { restore(); }
});

test('SAF-04: claudeExecAsync propagates timeout error', async (t) => {
  t.mock.method(childProcess, 'execFile', (_c, _a, _o, cb) => cb(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
  const { safe, restore } = freshSafe();
  try { await assert.rejects(safe.claudeExecAsync(['--print'], { timeout: 1 }), /timeout/); }
  finally { restore(); }
});

test('SAF-05: tmuxExecAsync rejects on error', async (t) => {
  t.mock.method(childProcess, 'execFile', (_c, _a, _o, cb) => cb(new Error('tmux failed')));
  const { safe, restore } = freshSafe();
  try { await assert.rejects(safe.tmuxExecAsync(['bad']), /tmux failed/); }
  finally { restore(); }
});

test('SAF-06: findSessionsDir encodes project path correctly', () => {
  const { safe, restore } = freshSafe({ CLAUDE_HOME: '/tmp/ch' });
  try { assert.equal(safe.findSessionsDir('/my/project'), path.join('/tmp/ch', 'projects', '-my-project')); }
  finally { restore(); }
});

test('SAF-07: gitCloneAsync rejects invalid URL and accepts valid', async (t) => {
  t.mock.method(childProcess, 'execFile', (_c, _a, _o, cb) => cb(null, 'cloned', ''));
  const { safe, restore } = freshSafe();
  try {
    await assert.rejects(safe.gitCloneAsync(fixtures.safeExec.invalidGitUrl, '/tmp/out'), /Invalid git URL/);
    assert.equal(await safe.gitCloneAsync(fixtures.safeExec.validGitUrl, '/tmp/out'), 'cloned');
  } finally { restore(); }
});

test('SAF-08: tmuxKill ignores session-not-found and no-server-running', async (t) => {
  t.mock.method(childProcess, 'execFile', (_c, _a, _o, cb) => cb(new Error('session not found')));
  const { safe, restore } = freshSafe();
  try { await assert.doesNotReject(safe.tmuxKill('missing')); }
  finally { restore(); }
});

test('SAF-09: tmuxSendKeysAsync writes temp file, load-buffer, paste-buffer, send-keys Enter, cleans up', async (t) => {
  const calls = [];
  t.mock.method(childProcess, 'execFile', (_c, args, _o, cb) => { calls.push(args); cb(null, '', ''); });
  const { safe, restore } = freshSafe();
  try {
    await safe.tmuxSendKeysAsync('sess', fixtures.safeExec.sendText);
    assert.equal(calls.length, 3);
    assert.equal(calls[0][0], 'load-buffer');
    assert.equal(calls[1][0], 'paste-buffer');
    assert.ok(calls[1].includes('-t'));
    assert.equal(calls[2][0], 'send-keys');
    assert.ok(calls[2].includes('Enter'));
  } finally { restore(); }
});

test('SAF-10: grepSearchAsync caps results and returns fallback on error', async (t) => {
  t.mock.method(childProcess, 'execFile', (_c, _a, _o, cb) => cb(null, fixtures.safeExec.grepOutput, ''));
  const { safe, restore } = freshSafe();
  try {
    const r = await safe.grepSearchAsync('needle', '/tmp', '*.js');
    assert.match(r, /a\.js:1:needle/);
  } finally { restore(); }
});

test('SAF-10: grepSearchAsync returns no-matches on error', async (t) => {
  t.mock.method(childProcess, 'execFile', (_c, _a, _o, cb) => cb(new Error('fail'), '', ''));
  const { safe, restore } = freshSafe();
  try {
    const r = await safe.grepSearchAsync('x', '/tmp');
    assert.match(r, /No matches/);
  } finally { restore(); }
});

test('SAF-11: curlFetchAsync truncates long body and falls back on error', async (t) => {
  t.mock.method(childProcess, 'execFile', (_c, _a, _o, cb) => cb(null, fixtures.safeExec.curlLongBody, ''));
  const { safe, restore } = freshSafe();
  try { assert.equal((await safe.curlFetchAsync('https://x.com')).length, 20000); }
  finally { restore(); }
});

test('SAF-11: curlFetchAsync returns error string on failure', async (t) => {
  t.mock.method(childProcess, 'execFile', (_c, _a, _o, cb) => cb(new Error('fail'), '', ''));
  const { safe, restore } = freshSafe();
  try {
    const r = await safe.curlFetchAsync('https://fail.com');
    assert.match(r, /Error/);
  } finally { restore(); }
});
