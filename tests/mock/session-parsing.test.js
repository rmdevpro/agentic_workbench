const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { mkdirSync, writeFileSync, rmSync } = require('fs');
const { join } = require('path');

// Import real functions from server.js
let parseSessionFile;
before(() => {
  process.env.CLAUDE_HOME = '/tmp/session-parse-setup-' + process.pid;
  process.env.WORKSPACE = '/tmp/session-parse-ws-' + process.pid;
  mkdirSync(process.env.CLAUDE_HOME, { recursive: true });
  mkdirSync(process.env.WORKSPACE, { recursive: true });
  delete require.cache[require.resolve('../../server')];
  const server = require('../../server');
  parseSessionFile = server.parseSessionFile;
});

describe('Session JSONL Parsing', () => {
  const TEST_DIR = '/tmp/session-parse-test-' + process.pid;

  before(() => { mkdirSync(TEST_DIR, { recursive: true }); });
  after(() => { try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {} });

  it('should extract name from first user message', async () => {
    const file = join(TEST_DIR, 'test1.jsonl');
    writeFileSync(file, [
      JSON.stringify({ type: 'user', message: { content: 'Hello world' }, timestamp: '2026-01-01T00:00:00Z' }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hi!' }] }, timestamp: '2026-01-01T00:00:01Z' }),
    ].join('\n'));

    const meta = await parseSessionFile(file);
    assert.strictEqual(meta.name, 'Hello world');
    assert.strictEqual(meta.messageCount, 2);
  });

  it('should handle content as array', async () => {
    const file = join(TEST_DIR, 'test2.jsonl');
    writeFileSync(file, JSON.stringify({
      type: 'user', message: { content: [{ type: 'text', text: 'Array content' }] },
      timestamp: '2026-01-01T00:00:00Z',
    }));

    const meta = await parseSessionFile(file);
    assert.strictEqual(meta.name, 'Array content');
  });

  it('should truncate long names to 80 chars', async () => {
    const file = join(TEST_DIR, 'test3.jsonl');
    const longMessage = 'A'.repeat(100);
    writeFileSync(file, JSON.stringify({
      type: 'user', message: { content: longMessage }, timestamp: '2026-01-01T00:00:00Z',
    }));

    const meta = await parseSessionFile(file);
    assert.strictEqual(meta.name.length, 83); // 80 + '...'
    assert.ok(meta.name.endsWith('...'));
  });

  it('should use summary as name if present', async () => {
    const file = join(TEST_DIR, 'test4.jsonl');
    writeFileSync(file, [
      JSON.stringify({ type: 'user', message: { content: 'Original question' }, timestamp: '2026-01-01T00:00:00Z' }),
      JSON.stringify({ type: 'summary', summary: 'Better summary name' }),
    ].join('\n'));

    const meta = await parseSessionFile(file);
    assert.strictEqual(meta.name, 'Better summary name');
  });

  it('should return Untitled Session for empty content', async () => {
    const file = join(TEST_DIR, 'test5.jsonl');
    writeFileSync(file, JSON.stringify({ type: 'system', timestamp: '2026-01-01T00:00:00Z' }));

    const meta = await parseSessionFile(file);
    assert.strictEqual(meta.name, 'Untitled Session');
  });

  it('should return null for nonexistent file', async () => {
    const meta = await parseSessionFile(join(TEST_DIR, 'nonexistent.jsonl'));
    assert.strictEqual(meta, null);
  });

  it('should handle malformed JSON lines gracefully', async () => {
    const file = join(TEST_DIR, 'test6.jsonl');
    writeFileSync(file, [
      'not valid json',
      JSON.stringify({ type: 'user', message: { content: 'Valid message' }, timestamp: '2026-01-01T00:00:00Z' }),
      '{broken',
    ].join('\n'));

    const meta = await parseSessionFile(file);
    assert.strictEqual(meta.name, 'Valid message');
    assert.strictEqual(meta.messageCount, 1);
  });

  it('should use last timestamp', async () => {
    const file = join(TEST_DIR, 'test7.jsonl');
    writeFileSync(file, [
      JSON.stringify({ type: 'user', message: { content: 'First' }, timestamp: '2026-01-01T00:00:00Z' }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Reply' }] }, timestamp: '2026-01-01T12:00:00Z' }),
    ].join('\n'));

    const meta = await parseSessionFile(file);
    assert.strictEqual(meta.timestamp, '2026-01-01T12:00:00Z');
  });

  it('should count only user and assistant messages', async () => {
    const file = join(TEST_DIR, 'test8.jsonl');
    writeFileSync(file, [
      JSON.stringify({ type: 'system', timestamp: '2026-01-01T00:00:00Z' }),
      JSON.stringify({ type: 'user', message: { content: 'Q1' }, timestamp: '2026-01-01T00:00:01Z' }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'A1' }] }, timestamp: '2026-01-01T00:00:02Z' }),
      JSON.stringify({ type: 'summary', summary: 'sum' }),
      JSON.stringify({ type: 'user', message: { content: 'Q2' }, timestamp: '2026-01-01T00:00:03Z' }),
    ].join('\n'));

    const meta = await parseSessionFile(file);
    assert.strictEqual(meta.messageCount, 3);
  });

  it('should handle file with only user entries (no assistant)', async () => {
    const file = join(TEST_DIR, 'test9.jsonl');
    writeFileSync(file, JSON.stringify({
      type: 'user', message: { content: 'Just a question' }, timestamp: '2026-01-01T00:00:00Z',
    }));

    const meta = await parseSessionFile(file);
    assert.strictEqual(meta.messageCount, 1);
    assert.strictEqual(meta.name, 'Just a question');
  });
});
