'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { handleVoiceConnection } = require('../../voice');
const db = require('../../db');

// Mock WebSocket
function mockWs() {
  const messages = [];
  const closed = { called: false };
  return {
    send: (msg) => messages.push(typeof msg === 'string' ? JSON.parse(msg) : msg),
    close: () => { closed.called = true; },
    on: () => {},
    readyState: 1,
    _messages: messages,
    _closed: closed,
  };
}

test('VOICE-01: rejects connection when no API key configured', () => {
  // Ensure no key
  db.setSetting('deepgram_api_key', '');
  const ws = mockWs();
  handleVoiceConnection(ws);
  assert.equal(ws._messages.length, 1);
  assert.equal(ws._messages[0].type, 'error');
  assert.ok(ws._messages[0].message.includes('not configured'));
  assert.equal(ws._closed.called, true);
});

test('VOICE-02: accepts connection when API key is configured', () => {
  db.setSetting('deepgram_api_key', 'test-key-for-voice');
  const ws = mockWs();
  // handleVoiceConnection will try to connect to Deepgram which will fail,
  // but it shouldn't reject the connection or send an error immediately
  handleVoiceConnection(ws);
  // Should not have sent an error message synchronously
  const errors = ws._messages.filter(m => m.type === 'error');
  assert.equal(errors.length, 0, 'Should not immediately error when key is present');
  // Clean up
  db.setSetting('deepgram_api_key', '');
});
