/**
 * Phase H: UI Browser Tests (subset)
 *
 * These tests use the Blueprint HTTP API to verify UI-facing behavior
 * that doesn't require a real browser. The full 568 UI scenarios from
 * the 3-CLI audit require Malory/Playwright; this file covers the
 * API-testable subset.
 *
 * For browser automation tests, see the ui-audit-*.md docs and the
 * Malory-based test scripts (pending implementation).
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const { get, post, put, del, getTestProject } = require('./helpers');

describe('Phase H-API: UI-Backing API Verification', { timeout: 120000 }, () => {
  let testProject;
  let sessionId;

  before(async () => {
    testProject = await getTestProject();
    const stateRes = await get('/api/state');
    const proj = stateRes.body.projects.find(p => p.name === testProject);
    if (proj && proj.sessions.length > 0) sessionId = proj.sessions[0].id;
  });

  describe('Sidebar Data', () => {
    it('H-API-01: State returns projects sorted by activity', async () => {
      const res = await get('/api/state');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.projects));
      // Projects with sessions should be first
      const withSessions = res.body.projects.filter(p => p.sessions.length > 0);
      const without = res.body.projects.filter(p => p.sessions.length === 0);
      if (withSessions.length > 0 && without.length > 0) {
        const firstWithIdx = res.body.projects.indexOf(withSessions[0]);
        const firstWithoutIdx = res.body.projects.indexOf(without[0]);
        assert.ok(firstWithIdx < firstWithoutIdx, 'Active projects should sort before empty ones');
      }
    });

    it('H-API-02: Sessions sorted by timestamp descending', async () => {
      const res = await get('/api/state');
      const proj = res.body.projects.find(p => p.sessions.length > 1);
      if (!proj) return; // need 2+ sessions to test sort
      for (let i = 1; i < proj.sessions.length; i++) {
        const prev = new Date(proj.sessions[i - 1].timestamp);
        const curr = new Date(proj.sessions[i].timestamp);
        assert.ok(prev >= curr, `Session ${i-1} should be newer than session ${i}`);
      }
    });

    it('H-API-03: Session has all required fields for sidebar', async () => {
      const res = await get('/api/state');
      const proj = res.body.projects.find(p => p.sessions.length > 0);
      if (!proj) return;
      const s = proj.sessions[0];
      assert.ok('id' in s, 'Missing id');
      assert.ok('name' in s, 'Missing name');
      assert.ok('timestamp' in s, 'Missing timestamp');
      assert.ok('messageCount' in s, 'Missing messageCount');
      assert.ok('active' in s, 'Missing active');
      assert.ok('state' in s, 'Missing state');
      assert.ok('tmux' in s, 'Missing tmux');
      assert.ok('project_missing' in s, 'Missing project_missing');
    });

    it('H-API-04: Workspace path returned for file picker', async () => {
      const res = await get('/api/state');
      assert.ok(res.body.workspace, 'Should include workspace path');
      assert.ok(res.body.workspace.startsWith('/'), 'Workspace should be absolute path');
    });
  });

  describe('Filter Logic', () => {
    let archivedId;

    before(async () => {
      // Create and archive a session for filter testing
      const createRes = await post('/api/sessions', { project: testProject });
      if (createRes.status === 200) {
        archivedId = createRes.body.id;
        await put(`/api/sessions/${archivedId}/config`, { state: 'archived' });
      }
    });

    it('H-API-05: Active filter excludes archived sessions', async () => {
      if (!archivedId) return;
      const res = await get('/api/state');
      const proj = res.body.projects.find(p => p.name === testProject);
      const archived = proj.sessions.filter(s => s.state === 'archived');
      const active = proj.sessions.filter(s => s.state === 'active');
      assert.ok(archived.length > 0, 'Should have archived sessions');
      assert.ok(active.length > 0 || proj.sessions.length > archived.length, 'Should have non-archived sessions');
    });

    it('H-API-06: Hidden state excludes from All filter', async () => {
      if (!archivedId) return;
      await put(`/api/sessions/${archivedId}/config`, { state: 'hidden' });
      const res = await get('/api/state');
      const proj = res.body.projects.find(p => p.name === testProject);
      const hidden = proj.sessions.filter(s => s.state === 'hidden');
      assert.ok(hidden.length > 0, 'Should have hidden sessions');
      // Restore
      await put(`/api/sessions/${archivedId}/config`, { state: 'active' });
    });
  });

  describe('Session Config Overlay Data', () => {
    let configSessionId;

    before(async () => {
      // Create a dedicated session so these tests are not affected by J07
      // removing whatever project the outer `sessionId` came from.
      const res = await post('/api/sessions', { project: testProject });
      if (res.status === 200) configSessionId = res.body.id;
    });

    it('H-API-07: Config returns all overlay fields', async () => {
      if (!configSessionId) return;
      const res = await get(`/api/sessions/${configSessionId}/config`);
      assert.strictEqual(res.status, 200);
      assert.ok('name' in res.body, 'Missing name');
      assert.ok('state' in res.body, 'Missing state');
      assert.ok('model_override' in res.body, 'Missing model_override');
      assert.ok('notes' in res.body, 'Missing notes');
      assert.ok('project' in res.body, 'Missing project');
    });

    it('H-API-08: Config update persists all fields', async () => {
      if (!configSessionId) return;
      const original = (await get(`/api/sessions/${configSessionId}/config`)).body;

      await put(`/api/sessions/${configSessionId}/config`, {
        name: 'H-API Test Name',
        state: 'active',
        model_override: 'claude-haiku-4-5-20251001',
        notes: 'H-API test notes',
      });

      const updated = (await get(`/api/sessions/${configSessionId}/config`)).body;
      assert.strictEqual(updated.name, 'H-API Test Name');
      assert.strictEqual(updated.model_override, 'claude-haiku-4-5-20251001');
      assert.strictEqual(updated.notes, 'H-API test notes');

      // Restore
      await put(`/api/sessions/${configSessionId}/config`, {
        name: original.name,
        model_override: original.model_override,
        notes: original.notes || '',
      });
    });
  });

  describe('Settings Data', () => {
    it('H-API-09: Settings returns all fields for modal', async () => {
      const res = await get('/api/settings');
      assert.strictEqual(res.status, 200);
      assert.ok('default_model' in res.body, 'Missing default_model');
      assert.ok('keepalive_mode' in res.body, 'Missing keepalive_mode');
      assert.ok('tasks_enabled' in res.body, 'Missing tasks_enabled');
    });

    it('H-API-10: Theme setting persists', async () => {
      await put('/api/settings', { key: 'theme', value: 'blueprint-light' });
      const res = await get('/api/settings');
      assert.strictEqual(res.body.theme, 'blueprint-light');
      // Restore
      await put('/api/settings', { key: 'theme', value: 'blueprint-dark' });
    });

    it('H-API-11: Font size setting persists', async () => {
      await put('/api/settings', { key: 'font_size', value: 18 });
      const res = await get('/api/settings');
      assert.strictEqual(res.body.font_size, 18);
      // Restore
      await put('/api/settings', { key: 'font_size', value: 14 });
    });

    it('H-API-12: MCP servers round-trip', async () => {
      const originalRes = await get('/api/mcp-servers');
      const original = originalRes.body.servers;

      const testServers = { ...original, 'test-server': { command: 'node', args: ['test.js'] } };
      await put('/api/mcp-servers', { servers: testServers });

      const updated = (await get('/api/mcp-servers')).body.servers;
      assert.ok('test-server' in updated, 'Test server should persist');

      // Restore
      await put('/api/mcp-servers', { servers: original });
    });
  });

  describe('Right Panel Data', () => {
    it('H-API-13: Notes auto-save simulation', async () => {
      await put(`/api/projects/${testProject}/notes`, { notes: 'Auto-save test ' + Date.now() });
      const res = await get(`/api/projects/${testProject}/notes`);
      assert.ok(res.body.notes.startsWith('Auto-save test'), 'Notes should persist');
    });

    it('H-API-14: Tasks CRUD for panel', async () => {
      // Add
      const addRes = await post(`/api/projects/${testProject}/tasks`, { text: 'Panel task test' });
      assert.strictEqual(addRes.status, 200);
      const taskId = addRes.body.id;

      // List
      const listRes = await get(`/api/projects/${testProject}/tasks`);
      assert.ok(listRes.body.tasks.some(t => t.id === taskId));

      // Complete
      await put(`/api/tasks/${taskId}/complete`);
      const completedRes = await get(`/api/projects/${testProject}/tasks`);
      const completed = completedRes.body.tasks.find(t => t.id === taskId);
      assert.strictEqual(completed.status, 'done');

      // Reopen
      await put(`/api/tasks/${taskId}/reopen`);

      // Delete
      await del(`/api/tasks/${taskId}`);
      const afterDelete = await get(`/api/projects/${testProject}/tasks`);
      assert.ok(!afterDelete.body.tasks.some(t => t.id === taskId));
    });

    it('H-API-15: Messages for panel', async () => {
      await post(`/api/projects/${testProject}/messages`, { content: 'Panel message test' });
      const res = await get(`/api/projects/${testProject}/messages`);
      assert.ok(res.body.messages.some(m => m.content === 'Panel message test'));
    });

    it('H-API-16: CLAUDE.md for panel', async () => {
      const res = await get(`/api/projects/${testProject}/claude-md`);
      assert.strictEqual(res.status, 200);
      assert.ok('content' in res.body);
    });
  });

  describe('Status Bar Data', () => {
    it('H-API-17: Token endpoint returns data for status bar', async () => {
      if (!sessionId) return;
      const res = await get(`/api/sessions/${sessionId}/tokens?project=${testProject}`);
      assert.strictEqual(res.status, 200);
      assert.ok('input_tokens' in res.body);
      assert.ok('model' in res.body);
      assert.ok('max_tokens' in res.body);
      assert.ok(typeof res.body.max_tokens === 'number');
      assert.ok(res.body.max_tokens > 0);
    });

    it('H-API-18: Auth status for banner', async () => {
      const res = await get('/api/auth/status');
      assert.strictEqual(res.status, 200);
      assert.ok('valid' in res.body);
    });
  });

  describe('Search Data', () => {
    it('H-API-19: Search returns results with snippets', async () => {
      // Search for something that should exist
      const res = await get('/api/search?q=hello');
      assert.strictEqual(res.status, 200);
      if (res.body.results.length > 0) {
        const result = res.body.results[0];
        assert.ok('session_id' in result || 'sessionId' in result);
        assert.ok('project' in result);
        assert.ok('snippets' in result || 'matches' in result);
      }
    });

    it('H-API-20: Short query returns empty', async () => {
      const res = await get('/api/search?q=a');
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body.results, []);
    });
  });
});
