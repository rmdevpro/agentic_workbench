const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const { get, post, put, getTestProject } = require('./helpers');

describe('Phase G: Project Management & Startup', () => {
  let testProject;

  before(async () => {
    testProject = await getTestProject();
  });

  describe('Add Project', () => {
    it('G01: Add project — missing path returns 400', async () => {
      const res = await post('/api/projects', {});
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error, 'path required');
    });

    it('G02: Add project — nonexistent local path returns 404', async () => {
      const res = await post('/api/projects', { path: '/tmp/nonexistent-path-12345' });
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.body.error, 'Path does not exist');
    });

    it('G03: Add project — existing directory returns exists', async () => {
      // ContextBroker already exists in workspace
      // Try to add a project that already exists in the DB
      const state = await get('/api/state');
      const existingProj = state.body.projects[0];
      const res = await post('/api/projects', { path: existingProj.path, name: existingProj.name });
      // Should return 200 with exists: true or 409
      assert.ok(res.status === 200 || res.status === 409);
    });
  });

  describe('Session Notes Endpoints', () => {
    it('G04: GET /api/sessions/:id/notes', async () => {
      const state = await get('/api/state');
      const project = state.body.projects.find(p => p.sessions.length > 0);
      assert.ok(project, 'Need a project with sessions');
      const sessionId = project.sessions[0].id;

      const res = await get(`/api/sessions/${sessionId}/notes`);
      assert.strictEqual(res.status, 200);
      assert.ok('notes' in res.body);
    });

    it('G05: PUT /api/sessions/:id/notes', async () => {
      const state = await get('/api/state');
      const project = state.body.projects.find(p => p.sessions.length > 0);
      assert.ok(project, 'Need a project with sessions');
      const sessionId = project.sessions[0].id;

      const writeRes = await put(`/api/sessions/${sessionId}/notes`, { notes: 'Test session note' });
      assert.strictEqual(writeRes.status, 200);

      const readRes = await get(`/api/sessions/${sessionId}/notes`);
      assert.strictEqual(readRes.body.notes, 'Test session note');

      // Clean up
      await put(`/api/sessions/${sessionId}/notes`, { notes: '' });
    });
  });

  describe('Auth Login Probe', () => {
    it('G06: POST /api/auth/login responds', async () => {
      const res = await post('/api/auth/login', {});
      assert.strictEqual(res.status, 200);
      assert.ok('valid' in res.body);
    });
  });

  describe('Project CLAUDE.md', () => {
    it('G07: Write and read project CLAUDE.md', async () => {
      const state = await get('/api/state');
      // Find a writable project (Joshua26 is writable, ContextBroker may not be)
      const project = state.body.projects.find(p => p.name === 'Joshua26') || state.body.projects[0];
      assert.ok(project, 'Need a project');

      const writeRes = await put(`/api/projects/${project.name}/claude-md`, {
        content: '# Test CLAUDE.md\n\nTest instructions.',
      });
      assert.strictEqual(writeRes.status, 200);

      const readRes = await get(`/api/projects/${project.name}/claude-md`);
      assert.strictEqual(readRes.status, 200);
      assert.ok(readRes.body.content.includes('Test CLAUDE.md'));
    });
  });

  describe('Global CLAUDE.md', () => {
    let originalContent;

    it('G08: Save and restore global CLAUDE.md', async () => {
      // Save original
      const orig = await get('/api/claude-md/global');
      originalContent = orig.body.content;

      // Write test content
      const writeRes = await put('/api/claude-md/global', { content: '# Test Global Instructions' });
      assert.strictEqual(writeRes.status, 200);

      // Verify
      const readRes = await get('/api/claude-md/global');
      assert.ok(readRes.body.content.includes('Test Global'));

      // Restore original
      await put('/api/claude-md/global', { content: originalContent || '' });
    });
  });

  describe('Workspace Trust', () => {
    it('G09: Workspace directories are trusted on startup', async () => {
      // The trust function runs on startup — verify by checking
      // that creating a new session doesn't prompt for trust
      const res = await post('/api/sessions', { project: testProject });
      assert.strictEqual(res.status, 200);
      // If trust wasn't set, the CLI would hang on the trust dialog
      // and the session would fail to start
    });
  });

  describe('MCP Server Registration', () => {
    it('G10: Blueprint MCP server auto-registered', async () => {
      const res = await get('/api/mcp-servers');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.servers.blueprint, 'Blueprint MCP server should be registered');
      assert.strictEqual(res.body.servers.blueprint.command, 'node');
    });
  });

  describe('Token Usage Edge Cases', () => {
    it('G11: Token usage for nonexistent session file', async () => {
      const res = await get('/api/sessions/completely-fake-id/tokens?project=ContextBroker');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.input_tokens, 0);
      assert.strictEqual(res.body.model, null);
    });
  });
});
