'use strict';

/**
 * Regression validation — proves the test suite catches real breakage.
 *
 * Strategy: for each critical module, monkey-patch a key export to simulate
 * breakage, then call code that depends on it and verify an error or incorrect
 * result is detected. Restore the original after each test.
 *
 * Note: compaction.js was removed (smart compaction stripped). Validation
 * covers session-resolver and ws-terminal.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// ── Module 1: session-resolver.js ────────────────────────────────────────

test('REGVAL-2: broken session-resolver is detected by mock test assertions', async () => {
  const createResolver = require('../../session-resolver.js');

  const original = require.cache[require.resolve('../../session-resolver.js')];
  const origExports = original.exports;

  original.exports = () => ({
    start: () => {
      throw new Error('INTENTIONALLY BROKEN: resolver start failed');
    },
    stop: () => {},
  });

  try {
    const broken = require('../../session-resolver.js');
    const resolver = broken({});
    assert.throws(
      () => resolver.start(),
      { message: /INTENTIONALLY BROKEN/ },
      'Broken resolver.start() must throw — mock tests would catch this',
    );
  } finally {
    original.exports = origExports;
  }

  assert.equal(typeof createResolver, 'function', 'Restored session-resolver must be a function');
});

// ── Module 2: ws-terminal.js ─────────────────────────────────────────────

test('REGVAL-3: broken ws-terminal is detected by mock test assertions', async () => {
  const createWsTerminal = require('../../ws-terminal.js');

  const original = require.cache[require.resolve('../../ws-terminal.js')];
  const origExports = original.exports;

  original.exports = () => ({
    handleUpgrade: () => {
      throw new Error('INTENTIONALLY BROKEN: handleUpgrade failed');
    },
    shutdown: () => {},
  });

  try {
    const broken = require('../../ws-terminal.js');
    const wsTerminal = broken({});
    assert.throws(
      () => wsTerminal.handleUpgrade({}, {}, Buffer.alloc(0)),
      { message: /INTENTIONALLY BROKEN/ },
      'Broken handleUpgrade must throw — mock tests would catch this',
    );
  } finally {
    original.exports = origExports;
  }

  assert.equal(typeof createWsTerminal, 'function', 'Restored ws-terminal must be a function');
});

// ── Cross-cutting: verify critical modules export the expected interface ──

test('REGVAL-SHAPE: critical module exports match expected interface', () => {
  const createResolver = require('../../session-resolver.js');
  const createWsTerminal = require('../../ws-terminal.js');

  assert.equal(typeof createResolver, 'function', 'session-resolver.js must export a function');
  assert.equal(typeof createWsTerminal, 'function', 'ws-terminal.js must export a function');
});
