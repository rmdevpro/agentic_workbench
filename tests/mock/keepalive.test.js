const { describe, it, before, after, mock } = require('node:test');
const assert = require('node:assert');

describe('Keepalive Scheduling', () => {
  let keepalive;

  before(() => {
    // Mock execSync to prevent actual CLI calls
    process.env.KEEPALIVE_MODE = 'always';
    process.env.CLAUDE_HOME = '/tmp/keepalive-test-' + process.pid;
    const { mkdirSync, writeFileSync } = require('fs');
    mkdirSync(process.env.CLAUDE_HOME, { recursive: true });

    // Write a test credentials file
    const expiresAt = Date.now() + 3600000; // 1 hour from now
    writeFileSync(
      require('path').join(process.env.CLAUDE_HOME, '.credentials.json'),
      JSON.stringify({
        claudeAiOauth: {
          accessToken: 'test-token',
          refreshToken: 'test-refresh',
          expiresAt,
        },
      })
    );

    delete require.cache[require.resolve('../../keepalive')];
    keepalive = require('../../keepalive');
  });

  after(() => {
    keepalive.stop();
    try {
      const { rmSync } = require('fs');
      rmSync(process.env.CLAUDE_HOME, { recursive: true, force: true });
    } catch {}
  });

  it('should start in the configured mode', () => {
    assert.strictEqual(keepalive.getMode(), 'always');
  });

  it('should report not running before start', () => {
    assert.strictEqual(keepalive.isRunning(), false);
  });

  it('should have a getStatus method', () => {
    const status = keepalive.getStatus();
    assert.ok('running' in status);
    assert.ok('mode' in status);
    assert.ok('token_expires_in_minutes' in status);
    assert.ok('token_expires_at' in status);
  });

  it('should report token expiry from credentials file', () => {
    const status = keepalive.getStatus();
    assert.ok(status.token_expires_in_minutes > 0);
    assert.ok(status.token_expires_in_minutes <= 60);
  });

  it('should change mode with setMode', () => {
    keepalive.setMode('browser');
    assert.strictEqual(keepalive.getMode(), 'browser');
    keepalive.setMode('idle', 15);
    assert.strictEqual(keepalive.getMode(), 'idle');
    keepalive.setMode('always');
  });

  it('should handle expired token in status', () => {
    const { writeFileSync } = require('fs');
    const path = require('path');
    writeFileSync(
      path.join(process.env.CLAUDE_HOME, '.credentials.json'),
      JSON.stringify({
        claudeAiOauth: { accessToken: 'x', refreshToken: 'x', expiresAt: 0 },
      })
    );
    const status = keepalive.getStatus();
    assert.strictEqual(status.token_expires_in_minutes, 0);
  });

  it('should handle missing credentials file', () => {
    const { unlinkSync } = require('fs');
    const path = require('path');
    try { unlinkSync(path.join(process.env.CLAUDE_HOME, '.credentials.json')); } catch {}
    const status = keepalive.getStatus();
    assert.strictEqual(status.token_expires_in_minutes, 0);
  });
});
