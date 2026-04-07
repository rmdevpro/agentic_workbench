const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { mkdirSync, writeFileSync, rmSync } = require('fs');
const { join } = require('path');

describe('Session Meta Cache', () => {
  let db;
  const TEST_DIR = '/tmp/session-meta-test-' + process.pid;

  before(() => {
    process.env.BLUEPRINT_DATA = TEST_DIR;
    mkdirSync(TEST_DIR, { recursive: true });
    delete require.cache[require.resolve('../../db')];
    db = require('../../db');
  });

  after(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
  });

  it('should upsert session metadata', () => {
    db.upsertSessionMeta('test-session-1', '/tmp/test.jsonl', 1234567890, 5000, 'Test Session', '2026-01-01T00:00:00Z', 10);
    const meta = db.getSessionMeta('test-session-1');
    assert.ok(meta);
    assert.strictEqual(meta.name, 'Test Session');
    assert.strictEqual(meta.message_count, 10);
    assert.strictEqual(meta.file_mtime, 1234567890);
    assert.strictEqual(meta.file_size, 5000);
  });

  it('should return null for uncached session', () => {
    const meta = db.getSessionMeta('nonexistent-session');
    assert.strictEqual(meta, undefined);
  });

  it('should update on re-upsert with new mtime', () => {
    db.upsertSessionMeta('test-session-2', '/tmp/test2.jsonl', 1000, 500, 'Old Name', '2026-01-01T00:00:00Z', 5);
    db.upsertSessionMeta('test-session-2', '/tmp/test2.jsonl', 2000, 600, 'New Name', '2026-01-02T00:00:00Z', 8);
    const meta = db.getSessionMeta('test-session-2');
    assert.strictEqual(meta.name, 'New Name');
    assert.strictEqual(meta.message_count, 8);
    assert.strictEqual(meta.file_mtime, 2000);
  });

  it('should delete session metadata', () => {
    db.upsertSessionMeta('test-session-3', '/tmp/test3.jsonl', 1000, 500, 'Delete Me', '2026-01-01T00:00:00Z', 1);
    db.deleteSessionMeta('test-session-3');
    const meta = db.getSessionMeta('test-session-3');
    assert.strictEqual(meta, undefined);
  });
});

describe('Session JSONL Parsing with Cache', () => {
  let sessionUtils;
  const TEST_DIR = '/tmp/session-parse-cache-test-' + process.pid;
  const JSONL_DIR = join(TEST_DIR, 'sessions');

  before(() => {
    process.env.BLUEPRINT_DATA = join(TEST_DIR, 'data');
    mkdirSync(process.env.BLUEPRINT_DATA, { recursive: true });
    mkdirSync(JSONL_DIR, { recursive: true });

    delete require.cache[require.resolve('../../db')];
    delete require.cache[require.resolve('../../session-utils')];
    sessionUtils = require('../../session-utils');

    // Write a test JSONL file
    const jsonl = [
      JSON.stringify({ type: 'user', message: { content: 'Hello world' }, timestamp: '2026-01-01T00:00:00Z' }),
      JSON.stringify({ type: 'assistant', message: { content: 'Hi there' }, timestamp: '2026-01-01T00:01:00Z' }),
    ].join('\n');
    writeFileSync(join(JSONL_DIR, 'cached-test.jsonl'), jsonl);
  });

  after(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
  });

  it('should parse and cache session file', async () => {
    const result = await sessionUtils.parseSessionFile(join(JSONL_DIR, 'cached-test.jsonl'));
    assert.ok(result);
    assert.strictEqual(result.name, 'Hello world');
    assert.strictEqual(result.messageCount, 2);
  });

  it('should return cached result on second parse', async () => {
    const result = await sessionUtils.parseSessionFile(join(JSONL_DIR, 'cached-test.jsonl'));
    assert.ok(result);
    assert.strictEqual(result.name, 'Hello world');
  });
});
