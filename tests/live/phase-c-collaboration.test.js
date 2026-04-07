const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const { get, post, put, del, getTestProject } = require('./helpers');

describe('Phase C: Collaboration', () => {
  let testProject;

  before(async () => {
    testProject = await getTestProject();
  });

  describe('Notes', () => {
    it('C01: Write and read project notes', async () => {
      const writeRes = await put(`/api/projects/${testProject}/notes`, { notes: 'Test project notes' });
      assert.strictEqual(writeRes.status, 200);

      const readRes = await get(`/api/projects/${testProject}/notes`);
      assert.strictEqual(readRes.status, 200);
      assert.strictEqual(readRes.body.notes, 'Test project notes');
    });

    it('C02: Project notes — nonexistent project returns 404', async () => {
      const res = await get('/api/projects/nonexistent/notes');
      assert.strictEqual(res.status, 404);
    });
  });

  describe('Tasks', () => {
    let taskId;

    it('C03: Add task', async () => {
      const res = await post(`/api/projects/${testProject}/tasks`, { text: 'Integration test task' });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.id);
      assert.strictEqual(res.body.text, 'Integration test task');
      assert.strictEqual(res.body.status, 'todo');
      taskId = res.body.id;
    });

    it('C04: List tasks', async () => {
      const res = await get(`/api/projects/${testProject}/tasks`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.tasks.some(t => t.text === 'Integration test task'));
    });

    it('C05: Complete task', async () => {
      if (!taskId) return;
      const res = await put(`/api/tasks/${taskId}/complete`);
      assert.strictEqual(res.status, 200);

      const tasks = await get(`/api/projects/${testProject}/tasks`);
      const task = tasks.body.tasks.find(t => t.id === taskId);
      assert.strictEqual(task.status, 'done');
    });

    it('C06: Reopen task', async () => {
      if (!taskId) return;
      const res = await put(`/api/tasks/${taskId}/reopen`);
      assert.strictEqual(res.status, 200);

      const tasks = await get(`/api/projects/${testProject}/tasks`);
      const task = tasks.body.tasks.find(t => t.id === taskId);
      assert.strictEqual(task.status, 'todo');
    });

    it('C07: Delete task', async () => {
      if (!taskId) return;
      const res = await del(`/api/tasks/${taskId}`);
      assert.strictEqual(res.status, 200);

      const tasks = await get(`/api/projects/${testProject}/tasks`);
      assert.ok(!tasks.body.tasks.some(t => t.id === taskId));
    });

    it('C08: Add task — missing text returns 400', async () => {
      const res = await post(`/api/projects/${testProject}/tasks`, {});
      assert.strictEqual(res.status, 400);
    });

    it('C09: Tasks — nonexistent project returns 404', async () => {
      const res = await get('/api/projects/nonexistent/tasks');
      assert.strictEqual(res.status, 404);
    });
  });

  describe('Messages', () => {
    it('C10: Send and list messages', async () => {
      const sendRes = await post(`/api/projects/${testProject}/messages`, {
        from_session: 'test-from',
        to_session: 'test-to',
        content: 'Integration test message',
      });
      assert.strictEqual(sendRes.status, 200);

      const listRes = await get(`/api/projects/${testProject}/messages`);
      assert.strictEqual(listRes.status, 200);
      assert.ok(listRes.body.messages.some(m => m.content === 'Integration test message'));
    });

    it('C11: Message — missing content returns 400', async () => {
      const res = await post(`/api/projects/${testProject}/messages`, {});
      assert.strictEqual(res.status, 400);
    });
  });

  describe('CLAUDE.md', () => {
    it('C12: Read and write global CLAUDE.md', async () => {
      const writeRes = await put('/api/claude-md/global', { content: '# Test Global\n\nTest content' });
      assert.strictEqual(writeRes.status, 200);

      const readRes = await get('/api/claude-md/global');
      assert.strictEqual(readRes.status, 200);
      assert.ok(readRes.body.content.includes('Test Global'));
    });

    it('C13: Read project CLAUDE.md', async () => {
      const res = await get(`/api/projects/${testProject}/claude-md`);
      assert.strictEqual(res.status, 200);
      assert.ok('content' in res.body);
    });
  });

  describe('Settings', () => {
    it('C14: Write and read setting', async () => {
      const writeRes = await put('/api/settings', { key: 'test_setting', value: 'test_value' });
      assert.strictEqual(writeRes.status, 200);

      const readRes = await get('/api/settings');
      assert.strictEqual(readRes.status, 200);
      assert.strictEqual(readRes.body.test_setting, 'test_value');
    });

    it('C15: Setting — missing key returns 400', async () => {
      const res = await put('/api/settings', { value: 'x' });
      assert.strictEqual(res.status, 400);
    });
  });

  describe('MCP Servers', () => {
    it('C16: Read and write MCP servers (preserving existing)', async () => {
      // Read existing servers first
      const existing = await get('/api/mcp-servers');
      const servers = { ...existing.body.servers, 'test-server': { command: 'echo', args: ['test'] } };

      const writeRes = await put('/api/mcp-servers', { servers });
      assert.strictEqual(writeRes.status, 200);

      const readRes = await get('/api/mcp-servers');
      assert.strictEqual(readRes.status, 200);
      assert.ok(readRes.body.servers['test-server']);

      // Clean up: remove test-server, keep originals
      delete readRes.body.servers['test-server'];
      await put('/api/mcp-servers', { servers: readRes.body.servers });
    });
  });

  describe('Webhooks', () => {
    it('C17: Add webhook', async () => {
      const res = await post('/api/webhooks', {
        url: 'http://httpbin.org/post',
        events: ['session_created'],
        mode: 'event_only',
      });
      assert.strictEqual(res.status, 200);
    });

    it('C18: List webhooks', async () => {
      const res = await get('/api/webhooks');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.webhooks.length > 0);
    });

    it('C19: Delete webhook', async () => {
      const res = await del('/api/webhooks/0');
      assert.strictEqual(res.status, 200);

      const after = await get('/api/webhooks');
      assert.strictEqual(after.body.webhooks.length, 0);
    });

    it('C20: Add webhook — missing url returns 400', async () => {
      const res = await post('/api/webhooks', { events: ['*'] });
      assert.strictEqual(res.status, 400);
    });

    it('C21: Delete webhook — out of bounds returns 404', async () => {
      const res = await del('/api/webhooks/999');
      assert.strictEqual(res.status, 404);
    });
  });

  describe('Search', () => {
    it('C22: Search sessions', async () => {
      const res = await get('/api/search?q=hello');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.results));
    });

    it('C23: Search — short query returns empty', async () => {
      const res = await get('/api/search?q=a');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.results.length, 0);
    });
  });

  describe('Keepalive', () => {
    it('C24: Change keepalive mode', async () => {
      const res = await put('/api/keepalive/mode', { mode: 'always' });
      assert.strictEqual(res.status, 200);
    });

    it('C25: Invalid keepalive mode returns 400', async () => {
      const res = await put('/api/keepalive/mode', { mode: 'invalid' });
      assert.strictEqual(res.status, 400);
    });
  });
});
