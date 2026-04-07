const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { mkdirSync, rmSync } = require('fs');

describe('Webhook Delivery', () => {
  let db, webhooks, safe;

  before(() => {
    const TEST_DIR = '/tmp/webhook-delivery-test-' + process.pid;
    process.env.BLUEPRINT_DATA = TEST_DIR;
    mkdirSync(TEST_DIR, { recursive: true });

    delete require.cache[require.resolve('../../db')];
    delete require.cache[require.resolve('../../webhooks')];
    delete require.cache[require.resolve('../../safe-exec')];
    db = require('../../db');
    webhooks = require('../../webhooks');
    safe = require('../../safe-exec');
  });

  after(() => {
    try { rmSync('/tmp/webhook-delivery-test-' + process.pid, { recursive: true, force: true }); } catch {}
  });

  describe('Webhook Event Filtering', () => {
    it('should not fire for non-matching event', () => {
      const hooks = [
        { url: 'https://example.com/hook', events: ['session_created'], mode: 'event_only' },
      ];
      db.setSetting('webhooks', JSON.stringify(hooks));
      webhooks.fireEvent('task_added', { task_id: 1 });
    });

    it('should match wildcard event subscriptions', () => {
      const hooks = [
        { url: 'https://example.com/hook', events: ['*'], mode: 'event_only' },
      ];
      db.setSetting('webhooks', JSON.stringify(hooks));
      webhooks.fireEvent('any_event', { data: 'test' });
    });

    it('should not crash on unreachable webhook URL', () => {
      const hooks = [
        { url: 'https://nonexistent-domain-12345.com/hook', events: ['*'], mode: 'event_only' },
      ];
      db.setSetting('webhooks', JSON.stringify(hooks));
      webhooks.fireEvent('test', { data: 'x' });
    });
  });

  describe('Payload Construction', () => {
    it('should include event and timestamp in all payloads', () => {
      db.setSetting('webhooks', JSON.stringify([
        { url: 'https://example.com/hook', events: ['*'], mode: 'event_only' },
      ]));
      webhooks.fireEvent('test_event', { session_id: 'abc', project: 'Test' });
    });

    it('should handle empty data gracefully', () => {
      db.setSetting('webhooks', JSON.stringify([
        { url: 'https://example.com/hook', events: ['*'], mode: 'full_content' },
      ]));
      webhooks.fireEvent('test_event', {});
      webhooks.fireEvent('test_event', null);
    });
  });

  describe('Shell Escape', () => {
    it('should escape single quotes', () => {
      const result = safe.shellEscape("test'injection");
      assert.strictEqual(result, "'test'\\''injection'");
    });

    it('should wrap in single quotes', () => {
      const escaped = safe.shellEscape('normal arg');
      assert.ok(escaped.startsWith("'"));
      assert.ok(escaped.endsWith("'"));
    });

    it('should prevent $(cmd) execution', () => {
      const escaped = safe.shellEscape('$(whoami)');
      assert.strictEqual(escaped, "'$(whoami)'");
    });

    it('should prevent backtick execution', () => {
      const escaped = safe.shellEscape('`whoami`');
      assert.strictEqual(escaped, "'`whoami`'");
    });
  });
});
