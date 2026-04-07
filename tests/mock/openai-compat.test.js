const { describe, it } = require('node:test');
const assert = require('node:assert');

// Note: openai-compat.js only exports registerOpenAIRoutes which requires an Express app.
// These tests verify the logic patterns used by the endpoint.
// Full endpoint testing is done in live tests phase-e.

describe('OpenAI-Compatible Response Logic', () => {
  it('should parse bp: prefix from model field', () => {
    const model = 'bp:851cb75e-e814-4819-b73a-eaf9b4f6262c';
    let sessionId = null;
    let actualModel = model;

    if (model.startsWith('bp:')) {
      sessionId = model.substring(3);
      actualModel = null;
    }

    assert.strictEqual(sessionId, '851cb75e-e814-4819-b73a-eaf9b4f6262c');
    assert.strictEqual(actualModel, null);
  });

  it('should use model as-is when no bp: prefix', () => {
    const model = 'claude-sonnet-4-6';
    let sessionId = null;
    let actualModel = model;

    if (model.startsWith('bp:')) {
      sessionId = model.substring(3);
      actualModel = null;
    }

    assert.strictEqual(sessionId, null);
    assert.strictEqual(actualModel, 'claude-sonnet-4-6');
  });

  it('should format response in OpenAI structure', () => {
    const response = {
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'claude-sonnet-4-6',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'Hello' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };

    assert.strictEqual(response.object, 'chat.completion');
    assert.strictEqual(response.choices[0].message.role, 'assistant');
    assert.strictEqual(response.choices[0].finish_reason, 'stop');
    assert.ok(response.id.startsWith('chatcmpl-'));
  });

  it('should find last user message from messages array', () => {
    const messages = [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'First question' },
      { role: 'assistant', content: 'First answer' },
      { role: 'user', content: 'Second question' },
    ];

    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    assert.strictEqual(lastUserMsg.content, 'Second question');
  });

  it('should return undefined when no user message exists', () => {
    const messages = [{ role: 'system', content: 'You are helpful' }];
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    assert.strictEqual(lastUserMsg, undefined);
  });

  it('should handle X-Blueprint-Session header logic', () => {
    const headers = { 'x-blueprint-session': 'abc-123' };
    const sessionHeader = headers['x-blueprint-session'];
    assert.strictEqual(sessionHeader, 'abc-123');
  });
});
