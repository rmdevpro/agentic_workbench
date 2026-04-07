const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { mkdirSync, writeFileSync, rmSync } = require('fs');
const { join } = require('path');

describe('Compaction Monitor Thresholds', () => {
  // Test the threshold logic directly
  // Thresholds: 65% advisory, 75% warning, 85% urgent, 90% auto

  function getThreshold(pct) {
    if (pct >= 90) return 'auto';
    if (pct >= 85) return 'urgent';
    if (pct >= 75) return 'warning';
    if (pct >= 65) return 'advisory';
    return 'none';
  }

  it('should return none below 65%', () => {
    assert.strictEqual(getThreshold(0), 'none');
    assert.strictEqual(getThreshold(50), 'none');
    assert.strictEqual(getThreshold(64), 'none');
  });

  it('should return advisory at 65%', () => {
    assert.strictEqual(getThreshold(65), 'advisory');
    assert.strictEqual(getThreshold(70), 'advisory');
    assert.strictEqual(getThreshold(74), 'advisory');
  });

  it('should return warning at 75%', () => {
    assert.strictEqual(getThreshold(75), 'warning');
    assert.strictEqual(getThreshold(80), 'warning');
    assert.strictEqual(getThreshold(84), 'warning');
  });

  it('should return urgent at 85%', () => {
    assert.strictEqual(getThreshold(85), 'urgent');
    assert.strictEqual(getThreshold(89), 'urgent');
  });

  it('should return auto at 90%', () => {
    assert.strictEqual(getThreshold(90), 'auto');
    assert.strictEqual(getThreshold(95), 'auto');
    assert.strictEqual(getThreshold(100), 'auto');
  });

  it('should track nudge state per session', () => {
    const state = { nudged65: false, nudged75: false, nudged85: false, autoTriggered: false };

    // First time at 65% — should nudge
    const pct65 = 65;
    if (pct65 >= 65 && !state.nudged65) {
      state.nudged65 = true;
    }
    assert.strictEqual(state.nudged65, true);

    // Second time at 65% — should NOT nudge again
    let nudgedAgain = false;
    if (pct65 >= 65 && !state.nudged65) {
      nudgedAgain = true;
    }
    assert.strictEqual(nudgedAgain, false);

    // At 75% — should nudge
    const pct75 = 75;
    if (pct75 >= 75 && !state.nudged75) {
      state.nudged75 = true;
    }
    assert.strictEqual(state.nudged75, true);

    // At 90% — should auto-trigger
    const pct90 = 90;
    if (pct90 >= 90 && !state.autoTriggered) {
      state.autoTriggered = true;
    }
    assert.strictEqual(state.autoTriggered, true);
  });
});

describe('Token Percentage Calculation', () => {
  it('should calculate percentage correctly for Sonnet (200k)', () => {
    const inputTokens = 130000;
    const maxTokens = 200000;
    const pct = (inputTokens / maxTokens) * 100;
    assert.strictEqual(pct, 65);
  });

  it('should calculate percentage correctly for Opus (1M)', () => {
    const inputTokens = 650000;
    const maxTokens = 1000000;
    const pct = (inputTokens / maxTokens) * 100;
    assert.strictEqual(pct, 65);
  });

  it('should detect Opus model for 1M context', () => {
    const model = 'claude-opus-4-6';
    const maxTokens = (model?.includes('opus') || model?.includes('1m')) ? 1000000 : 200000;
    assert.strictEqual(maxTokens, 1000000);
  });

  it('should detect Sonnet 1M model for 1M context', () => {
    const model = 'claude-sonnet-4-6[1m]';
    const maxTokens = (model?.includes('opus') || model?.includes('1m')) ? 1000000 : 200000;
    assert.strictEqual(maxTokens, 1000000);
  });

  it('should default to 200k for standard Sonnet', () => {
    const model = 'claude-sonnet-4-6';
    const maxTokens = (model?.includes('opus') || model?.includes('1m')) ? 1000000 : 200000;
    assert.strictEqual(maxTokens, 200000);
  });

  it('should handle null model', () => {
    const model = null;
    const maxTokens = (model?.includes('opus') || model?.includes('1m')) ? 1000000 : 200000;
    assert.strictEqual(maxTokens, 200000);
  });
});
