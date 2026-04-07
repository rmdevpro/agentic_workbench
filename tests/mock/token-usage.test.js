const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { mkdirSync, writeFileSync, rmSync } = require('fs');
const { join } = require('path');

describe('Token Usage Parsing', () => {
  let sessionUtils, db;
  const TEST_DIR = '/tmp/token-usage-test-' + process.pid;
  const SESSIONS_DIR = join(TEST_DIR, 'claude', 'projects', '-workspace-projects-testproj');

  before(() => {
    process.env.BLUEPRINT_DATA = join(TEST_DIR, 'data');
    process.env.CLAUDE_HOME = join(TEST_DIR, 'claude');
    process.env.WORKSPACE = '/workspace/projects';
    mkdirSync(process.env.BLUEPRINT_DATA, { recursive: true });
    mkdirSync(SESSIONS_DIR, { recursive: true });

    delete require.cache[require.resolve('../../db')];
    delete require.cache[require.resolve('../../safe-exec')];
    delete require.cache[require.resolve('../../session-utils')];

    db = require('../../db');
    sessionUtils = require('../../session-utils');

    // Create test project in DB
    db.ensureProject('testproj', '/workspace/projects/testproj');
  });

  after(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
  });

  it('should parse token usage from JSONL', async () => {
    const jsonl = [
      JSON.stringify({ type: 'user', message: { content: 'test' } }),
      JSON.stringify({
        type: 'assistant',
        message: {
          content: 'response',
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 5000, cache_read_input_tokens: 2000, cache_creation_input_tokens: 1000 },
        },
      }),
    ].join('\n');
    writeFileSync(join(SESSIONS_DIR, 'token-test-1.jsonl'), jsonl);

    const result = await sessionUtils.getTokenUsage('token-test-1', 'testproj');
    assert.strictEqual(result.input_tokens, 8000); // 5000 + 2000 + 1000
    assert.strictEqual(result.model, 'claude-sonnet-4-6');
    assert.strictEqual(result.max_tokens, 200000);
  });

  it('should return 1M max for opus model', async () => {
    const jsonl = JSON.stringify({
      type: 'assistant',
      message: {
        model: 'claude-opus-4-6',
        usage: { input_tokens: 10000 },
      },
    });
    writeFileSync(join(SESSIONS_DIR, 'token-test-opus.jsonl'), jsonl);

    const result = await sessionUtils.getTokenUsage('token-test-opus', 'testproj');
    assert.strictEqual(result.max_tokens, 1000000);
  });

  it('should return 1M max for sonnet 1m model', async () => {
    const jsonl = JSON.stringify({
      type: 'assistant',
      message: {
        model: 'claude-sonnet-4-6[1m]',
        usage: { input_tokens: 10000 },
      },
    });
    writeFileSync(join(SESSIONS_DIR, 'token-test-1m.jsonl'), jsonl);

    const result = await sessionUtils.getTokenUsage('token-test-1m', 'testproj');
    assert.strictEqual(result.max_tokens, 1000000);
  });

  it('should skip synthetic model entries', async () => {
    const jsonl = [
      JSON.stringify({
        type: 'assistant',
        message: { model: 'synthetic-model', usage: { input_tokens: 999 } },
      }),
      JSON.stringify({
        type: 'assistant',
        message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 5000 } },
      }),
    ].join('\n');
    writeFileSync(join(SESSIONS_DIR, 'token-test-skip.jsonl'), jsonl);

    const result = await sessionUtils.getTokenUsage('token-test-skip', 'testproj');
    assert.strictEqual(result.input_tokens, 5000);
    assert.strictEqual(result.model, 'claude-sonnet-4-6');
  });

  it('should return zeros for missing JSONL', async () => {
    const result = await sessionUtils.getTokenUsage('nonexistent-session', 'testproj');
    assert.strictEqual(result.input_tokens, 0);
    assert.strictEqual(result.model, null);
  });

  it('should return zeros for empty JSONL', async () => {
    writeFileSync(join(SESSIONS_DIR, 'token-test-empty.jsonl'), '');
    const result = await sessionUtils.getTokenUsage('token-test-empty', 'testproj');
    assert.strictEqual(result.input_tokens, 0);
  });

  it('should handle JSONL with no usage data', async () => {
    const jsonl = JSON.stringify({ type: 'assistant', message: { content: 'no usage' } });
    writeFileSync(join(SESSIONS_DIR, 'token-test-nousage.jsonl'), jsonl);

    const result = await sessionUtils.getTokenUsage('token-test-nousage', 'testproj');
    assert.strictEqual(result.input_tokens, 0);
  });

  it('should use last assistant message for tokens', async () => {
    const jsonl = [
      JSON.stringify({
        type: 'assistant',
        message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 1000 } },
      }),
      JSON.stringify({
        type: 'assistant',
        message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 5000 } },
      }),
    ].join('\n');
    writeFileSync(join(SESSIONS_DIR, 'token-test-last.jsonl'), jsonl);

    const result = await sessionUtils.getTokenUsage('token-test-last', 'testproj');
    assert.strictEqual(result.input_tokens, 5000);
  });
});
