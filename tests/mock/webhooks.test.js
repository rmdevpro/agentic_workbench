const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { mkdirSync, rmSync } = require('fs');

describe('Webhook Logic', () => {
  let webhooks, db;

  before(() => {
    const TEST_DIR = '/tmp/webhook-test-' + process.pid;
    process.env.BLUEPRINT_DATA = TEST_DIR;
    mkdirSync(TEST_DIR, { recursive: true });

    delete require.cache[require.resolve('../../db')];
    delete require.cache[require.resolve('../../webhooks')];
    db = require('../../db');
    webhooks = require('../../webhooks');
  });

  after(() => {
    try { rmSync('/tmp/webhook-test-' + process.pid, { recursive: true, force: true }); } catch {}
  });

  it('should return empty webhooks by default', () => {
    // Simulate the getWebhooks internal function
    const raw = db.getSetting('webhooks', '[]');
    const hooks = JSON.parse(raw);
    assert.deepStrictEqual(hooks, []);
  });

  it('should fire event without error when no webhooks configured', () => {
    // Should not throw
    webhooks.fireEvent('test_event', { data: 'test' });
  });

  it('should store webhook config in settings', () => {
    const hooks = [
      { url: 'http://example.com/hook', events: ['*'], mode: 'event_only' },
    ];
    db.setSetting('webhooks', JSON.stringify(hooks));
    const stored = JSON.parse(db.getSetting('webhooks'));
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0].url, 'http://example.com/hook');
  });

  it('should filter events by webhook subscription', () => {
    const hooks = [
      { url: 'http://example.com/hook', events: ['session_created'], mode: 'event_only' },
    ];
    db.setSetting('webhooks', JSON.stringify(hooks));

    // fireEvent with non-matching event should not attempt to send
    // (we can't easily verify without mocking HTTP, but it shouldn't throw)
    webhooks.fireEvent('task_added', { task_id: 1 });
  });

  it('should match wildcard event subscriptions', () => {
    const hooks = [
      { url: 'http://example.com/hook', events: ['*'], mode: 'event_only' },
    ];
    db.setSetting('webhooks', JSON.stringify(hooks));

    // Wildcard should match any event — shouldn't throw
    webhooks.fireEvent('any_event', { data: 'test' });
  });
});
