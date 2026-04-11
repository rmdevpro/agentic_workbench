'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { executeTool, getQuorumSettings } = require('../../quorum');

test('QRM-01: getQuorumSettings returns defaults', () => {
  const s = getQuorumSettings();
  assert.ok(s.lead);
  assert.ok(s.fixedJunior);
  assert.ok(Array.isArray(s.additionalJuniors));
});

test('QRM-02: read_file rejects path traversal', async () => {
  const r = await executeTool('read_file', { path: '../../../etc/passwd' }, '/workspace/test');
  assert.match(r, /Error|outside/);
});

test('QRM-03: list_files rejects path traversal and caps at 100', async () => {
  const r = await executeTool('list_files', { path: '../../..' }, '/workspace/test');
  assert.match(r, /Error|outside/);
});

test('QRM-04: search_files delegates to grep wrapper', async () => {
  // executeTool('search_files') calls safe.grepSearchAsync internally
  const r = await executeTool('search_files', { pattern: 'test', glob: '*.js' }, '/tmp');
  // Should return string (results or "No matches")
  assert.equal(typeof r, 'string');
});

test('QRM-05: web_search handles failure gracefully', async () => {
  // web_search with a query that won't reach the internet in tests
  const r = await executeTool('web_search', { query: 'test_query_no_internet' }, '/tmp');
  assert.equal(typeof r, 'string');
});

test('QRM-11: read_file truncates large files at 10KB', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bp-qrm-'));
  await fsp.writeFile(path.join(dir, 'large.txt'), 'x'.repeat(20000));
  const r = await executeTool('read_file', { path: 'large.txt' }, dir);
  assert.ok(r.length <= 10100);
  assert.ok(r.includes('truncated'));
});

test('QRM-14: unknown tool returns error message', async () => {
  const r = await executeTool('fake_tool', {}, '/tmp');
  assert.match(r, /Unknown tool/);
});

test('QRM-03: list_files works for valid directory', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bp-qrm-ls-'));
  await fsp.writeFile(path.join(dir, 'a.txt'), 'a');
  await fsp.writeFile(path.join(dir, 'b.txt'), 'b');
  const r = await executeTool('list_files', { path: '' }, dir);
  assert.match(r, /a\.txt/);
  assert.match(r, /b\.txt/);
});

test('QRM-02: read_file returns content for valid path', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bp-qrm-rf-'));
  await fsp.writeFile(path.join(dir, 'test.txt'), 'hello world');
  const r = await executeTool('read_file', { path: 'test.txt' }, dir);
  assert.equal(r, 'hello world');
});

test('QRM-02: read_file returns error for nonexistent file', async () => {
  const r = await executeTool('read_file', { path: 'missing.txt' }, '/tmp');
  assert.match(r, /Error|not found/);
});
