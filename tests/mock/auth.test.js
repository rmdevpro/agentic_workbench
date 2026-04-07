const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { mkdirSync, writeFileSync, rmSync } = require('fs');
const { join } = require('path');

describe('Auth Status Checking', () => {
  const TEST_DIR = '/tmp/auth-test-' + process.pid;
  const CREDS_FILE = join(TEST_DIR, '.credentials.json');
  let checkAuthStatus;

  before(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    process.env.CLAUDE_HOME = TEST_DIR;
    // Import the real function from server.js
    delete require.cache[require.resolve('../../server')];
    const server = require('../../server');
    checkAuthStatus = server.checkAuthStatus;
  });

  after(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
  });

  it('should return no_credentials_file when file missing', async () => {
    const result = await checkAuthStatus();
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.reason, 'no_credentials_file');
  });

  it('should return no_credentials when accessToken missing', async () => {
    writeFileSync(CREDS_FILE, JSON.stringify({ claudeAiOauth: {} }));
    const result = await checkAuthStatus();
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.reason, 'no_credentials');
  });

  it('should return no_credentials when claudeAiOauth key missing', async () => {
    writeFileSync(CREDS_FILE, JSON.stringify({ someOtherKey: {} }));
    const result = await checkAuthStatus();
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.reason, 'no_credentials');
  });

  it('should return invalid_credentials for dummy expired tokens', async () => {
    writeFileSync(CREDS_FILE, JSON.stringify({
      claudeAiOauth: { accessToken: 'expired', refreshToken: 'expired', expiresAt: 0 },
    }));
    const result = await checkAuthStatus();
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.reason, 'invalid_credentials');
  });

  it('should return expired_no_refresh when expired without refresh token', async () => {
    writeFileSync(CREDS_FILE, JSON.stringify({
      claudeAiOauth: { accessToken: 'some-token', expiresAt: 1000 },
    }));
    const result = await checkAuthStatus();
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.reason, 'expired_no_refresh');
  });

  it('should return valid when token and refresh token present', async () => {
    writeFileSync(CREDS_FILE, JSON.stringify({
      claudeAiOauth: {
        accessToken: 'valid-token',
        refreshToken: 'valid-refresh',
        expiresAt: Date.now() + 3600000,
      },
    }));
    const result = await checkAuthStatus();
    assert.strictEqual(result.valid, true);
    assert.ok(result.expiresAt > Date.now());
  });

  it('should return valid even with expired access token if refresh token present', async () => {
    writeFileSync(CREDS_FILE, JSON.stringify({
      claudeAiOauth: {
        accessToken: 'old-token',
        refreshToken: 'valid-refresh',
        expiresAt: 1000,
      },
    }));
    const result = await checkAuthStatus();
    assert.strictEqual(result.valid, true);
  });

  it('should handle malformed JSON', async () => {
    writeFileSync(CREDS_FILE, 'not json at all');
    const result = await checkAuthStatus();
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.reason, 'no_credentials_file');
  });

  it('should handle missing expiresAt with refresh token', async () => {
    writeFileSync(CREDS_FILE, JSON.stringify({
      claudeAiOauth: { accessToken: 'token', refreshToken: 'refresh' },
    }));
    const result = await checkAuthStatus();
    assert.strictEqual(result.valid, true);
  });
});
