const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const { get, post, put, del, getTestProject } = require('./helpers');

describe('Phase E: Integration APIs', () => {
  let testProject;

  before(async () => {
    testProject = await getTestProject();
  });

  describe('OpenAI-Compatible Endpoint', () => {
    it('E01: GET /v1/models returns model list', async () => {
      const res = await get('/v1/models');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.object, 'list');
      assert.ok(res.body.data.some(m => m.id.includes('claude')));
    });

    it('E02: Missing messages returns 400', async () => {
      const res = await post('/v1/chat/completions', { model: 'claude-sonnet-4-6' });
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error.message.includes('messages'));
    });

    it('E03: No user message returns 400', async () => {
      const res = await post('/v1/chat/completions', {
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'system', content: 'test' }],
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error.message.includes('user message'));
    });

    // Note: E04 (actual completion) requires valid auth and costs money — skipped in basic suite
    // It's tested manually and in the comprehensive live suite
  });

  describe('Token Usage', () => {
    it('E05: Get token usage for session', async () => {
      const state = await get('/api/state');
      const project = state.body.projects.find(p => p.sessions.length > 0);
      if (!project) assert.fail('No project available');

      const sessionId = project.sessions[0].id;
      const res = await get(`/api/sessions/${sessionId}/tokens?project=${project.name}`);
      assert.strictEqual(res.status, 200);
      assert.ok('input_tokens' in res.body);
      assert.ok('model' in res.body);
      assert.ok('max_tokens' in res.body);
    });

    it('E06: Token usage — missing project', async () => {
      const res = await get('/api/sessions/fake-id/tokens');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.tokens, null);
    });
  });

  describe('Session Summary', () => {
    it('E07: Summary — missing project returns 400', async () => {
      const res = await post('/api/sessions/fake-id/summary', {});
      assert.strictEqual(res.status, 400);
    });

    // Note: E08 (actual summary) requires valid auth — tested in comprehensive suite
  });

  describe('Smart Compaction', () => {
    it('E09: Smart compact — missing project returns 400', async () => {
      const res = await post('/api/sessions/fake-id/smart-compact', {});
      assert.strictEqual(res.status, 400);
    });

    it('E10: Smart compact — nonexistent session', async () => {
      const res = await post('/api/sessions/nonexistent/smart-compact', { project: testProject });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.compacted, false);
    });
  });

  describe('Quorum', () => {
    it('E11: Quorum — missing question returns 400', async () => {
      const res = await post('/api/quorum/ask', { project: testProject });
      assert.strictEqual(res.status, 400);
    });

    it('E12: Quorum — missing project returns 400', async () => {
      const res = await post('/api/quorum/ask', { question: 'test' });
      assert.strictEqual(res.status, 400);
    });

    // Note: E13 (actual quorum) requires API keys and costs money — tested separately
  });
});
