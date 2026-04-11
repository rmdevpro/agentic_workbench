'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const fixtures = require('../fixtures/test-data');
const { freshRequire } = require('../helpers/module');

async function setupEnv(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'bp-su-'));
  const workspace = path.join(root, 'workspace');
  const claudeHome = path.join(root, 'claude');
  const dataDir = path.join(root, 'data');
  const configDir = path.join(root, 'config');
  const promptsDir = path.join(configDir, 'prompts');
  await fsp.mkdir(path.join(claudeHome, 'projects'), { recursive: true });
  await fsp.mkdir(workspace, { recursive: true });
  await fsp.mkdir(dataDir, { recursive: true });
  await fsp.mkdir(promptsDir, { recursive: true });
  await fsp.writeFile(path.join(configDir, 'defaults.json'), JSON.stringify(fixtures.validDefaultsJson, null, 2));
  await fsp.writeFile(path.join(promptsDir, 'summarize-session.md'), fixtures.promptTemplates.summarizeSession);

  const prev = { WORKSPACE: process.env.WORKSPACE, CLAUDE_HOME: process.env.CLAUDE_HOME, BLUEPRINT_DATA: process.env.BLUEPRINT_DATA };
  process.env.WORKSPACE = workspace; process.env.CLAUDE_HOME = claudeHome; process.env.BLUEPRINT_DATA = dataDir;
  const orig = { rfs: fs.readFileSync, rf: fs.readFile, wf: fs.watchFile };
  function rewrite(p) { const n = String(p).replace(/\\/g, '/'); if (n.includes('/config/defaults.json')) return path.join(configDir, 'defaults.json'); if (n.includes('/config/prompts/')) return path.join(promptsDir, path.basename(p)); return p; }
  t.mock.method(fs, 'readFileSync', function(p, ...a) { return orig.rfs.call(this, rewrite(p), ...a); });
  t.mock.method(fs, 'readFile', function(p, ...a) { return orig.rf.call(this, rewrite(p), ...a); });
  t.mock.method(fs, 'watchFile', function(p, o, l) { return orig.wf.call(this, rewrite(p), o, l); });
  const db = freshRequire(path.join(__dirname, '../../db.js'));
  const safe = freshRequire(path.join(__dirname, '../../safe-exec.js'));
  freshRequire(path.join(__dirname, '../../config.js'));
  const su = freshRequire(path.join(__dirname, '../../session-utils.js'));
  t.after(() => { for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  return { root, workspace, claudeHome, db, safe, su };
}

test('SU-01 / SES-15: parseSessionFile extracts name, timestamp, messageCount', async (t) => {
  const { su } = await setupEnv(t);
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bp-sf-'));
  const file = path.join(dir, 'session.jsonl');
  await fsp.writeFile(file, fixtures.sessionUtilsValidLines.join('\n') + '\n');
  const parsed = await su.parseSessionFile(file);
  assert.equal(parsed.name, 'First user message');
  assert.equal(parsed.messageCount, 5);
  assert.ok(parsed.timestamp);
});

test('SU-02: cache hit avoids reparse when mtime/size unchanged', async (t) => {
  const { su } = await setupEnv(t);
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bp-cache-'));
  const file = path.join(dir, 'cached.jsonl');
  await fsp.writeFile(file, fixtures.sessionUtilsValidLines.join('\n') + '\n');
  const first = await su.parseSessionFile(file);
  // Second call should hit cache (same mtime/size)
  const second = await su.parseSessionFile(file);
  assert.deepEqual(first, second);
});

test('SU-03: summary entry overrides name', async (t) => {
  const { su } = await setupEnv(t);
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bp-sum-'));
  const file = path.join(dir, 'summary.jsonl');
  await fsp.writeFile(file, fixtures.sessionUtilsSummaryOverrideLines.join('\n') + '\n');
  assert.equal((await su.parseSessionFile(file)).name, 'Human curated summary title');
});

test('SU-04: malformed JSONL lines tolerated', async (t) => {
  const { su } = await setupEnv(t);
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bp-mal-'));
  const file = path.join(dir, 'bad.jsonl');
  await fsp.writeFile(file, fixtures.sessionUtilsMalformedLines.join('\n') + '\n');
  const parsed = await su.parseSessionFile(file);
  assert.equal(parsed.name, 'Good line');
  assert.equal(parsed.messageCount, 2);
});

test('SU-09 / SU-10 / SU-11: getTokenUsage uses last real assistant, ignores synthetic, model context size', async (t) => {
  const { db, safe, su, workspace } = await setupEnv(t);
  const p = db.ensureProject('proj', path.join(workspace, 'proj'));
  const sd = safe.findSessionsDir(p.path);
  await fsp.mkdir(sd, { recursive: true });
  await fsp.writeFile(path.join(sd, 's1.jsonl'), fixtures.tokenUsageLines.join('\n') + '\n');
  const r = await su.getTokenUsage('s1', 'proj');
  // input_tokens(5000) + cache_read(300) + cache_create(200) = 5500
  assert.equal(r.input_tokens, 5500);
  assert.equal(r.model, 'claude-sonnet-4-6');
  assert.equal(r.max_tokens, 200000);
});

test('SU-11: opus model returns 1M max_tokens', async (t) => {
  const { db, safe, su, workspace } = await setupEnv(t);
  const p = db.ensureProject('projop', path.join(workspace, 'projop'));
  const sd = safe.findSessionsDir(p.path);
  await fsp.mkdir(sd, { recursive: true });
  const line = fixtures.makeJsonlLine(fixtures.makeAssistantEntry({ model: 'claude-opus-4-6', inputTokens: 1000 }));
  await fsp.writeFile(path.join(sd, 'op1.jsonl'), line + '\n');
  const r = await su.getTokenUsage('op1', 'projop');
  assert.equal(r.max_tokens, 1000000);
});

test('SU-08: summarizeSession falls back on Claude failure', async (t) => {
  const { db, safe, su, workspace } = await setupEnv(t);
  const p = db.ensureProject('proj', path.join(workspace, 'proj'));
  const sd = safe.findSessionsDir(p.path);
  await fsp.mkdir(sd, { recursive: true });
  await fsp.writeFile(path.join(sd, 's1.jsonl'), fixtures.sessionUtilsValidLines.join('\n') + '\n');
  t.mock.method(childProcess, 'execFile', (_c, _a, _o, cb) => cb(new Error('claude failed')));
  const r = await su.summarizeSession('s1', 'proj');
  assert.match(r.summary, /Failed to generate summary/);
  assert.ok(Array.isArray(r.recentMessages));
});

test('SES-20 / SU missing JSONL: parseSessionFile returns null, getTokenUsage returns zero', async (t) => {
  const { su } = await setupEnv(t);
  assert.equal(await su.parseSessionFile('/does/not/exist.jsonl'), null);
  const usage = await su.getTokenUsage('miss', 'miss');
  assert.equal(usage.input_tokens, 0);
  assert.equal(usage.model, null);
  assert.equal(usage.max_tokens, 200000);
});

test('SU-12 / SES-19: getSessionSlug extracts slug from JSONL', async (t) => {
  const { db, safe, su, workspace } = await setupEnv(t);
  const p = db.ensureProject('slugproj', path.join(workspace, 'slugproj'));
  const sd = safe.findSessionsDir(p.path);
  await fsp.mkdir(sd, { recursive: true });
  const lines = [
    JSON.stringify({ type: 'user', message: { content: 'hi' }, slug: 'my-session-slug' }),
  ];
  await fsp.writeFile(path.join(sd, 'slug1.jsonl'), lines.join('\n') + '\n');
  const slug = await su.getSessionSlug('slug1', p.path);
  assert.equal(slug, 'my-session-slug');
});

test('SU-12: getSessionSlug returns null when no slug entry', async (t) => {
  const { db, safe, su, workspace } = await setupEnv(t);
  const p = db.ensureProject('noslug', path.join(workspace, 'noslug'));
  const sd = safe.findSessionsDir(p.path);
  await fsp.mkdir(sd, { recursive: true });
  await fsp.writeFile(path.join(sd, 'ns1.jsonl'), fixtures.sessionUtilsValidLines.join('\n') + '\n');
  assert.equal(await su.getSessionSlug('ns1', p.path), null);
});

test('new_ session returns zero tokens', async (t) => {
  const { su } = await setupEnv(t);
  const r = await su.getTokenUsage('new_123', 'proj');
  assert.equal(r.input_tokens, 0);
});
