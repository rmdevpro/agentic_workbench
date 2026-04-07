const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { get, post, put, del, api, getTestProject } = require('./helpers');

describe('Phase J: Extended API Coverage', () => {
  let testProject;
  let workspace;

  before(async () => {
    testProject = await getTestProject();
    const stateRes = await get('/api/state');
    workspace = stateRes.body.workspace || '/workspace/projects';
  });

  describe('Browse Filesystem', () => {
    it('J01: Browse workspace returns directories', async () => {
      const res = await get(`/api/browse?path=${workspace}`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.entries);
      assert.ok(res.body.entries.length > 0);
    });

    it('J02: Browse root returns directories', async () => {
      const res = await get('/api/browse?path=/');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.entries.length > 0);
    });

    it('J03: Browse nonexistent path returns 400', async () => {
      const res = await get('/api/browse?path=/nonexistent/path/xyz');
      assert.strictEqual(res.status, 400);
    });

    it('J04: Browse hides dot files', async () => {
      const res = await get(`/api/browse?path=${workspace}/${testProject}`);
      if (res.status !== 200) return; // project may not exist at this path
      const dotEntries = res.body.entries.filter(e => e.name.startsWith('.'));
      assert.strictEqual(dotEntries.length, 0);
    });
  });

  describe('jQuery File Tree', () => {
    it('J05: File tree endpoint returns HTML', async () => {
      const res = await api('POST', '/api/jqueryfiletree', null);
      // Send form-encoded body manually
      const http = require('http');
      const url = new URL('/api/jqueryfiletree', process.env.BLUEPRINT_TEST_URL || 'http://localhost:3000');
      const result = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: url.hostname, port: url.port, path: url.pathname,
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write(`dir=${workspace}/`);
        req.end();
      });
      assert.strictEqual(result.status, 200);
      assert.ok(result.body.includes('jqueryFileTree'));
      assert.ok(!result.body.includes('Could not load'));
    });
  });

  describe('Remove Project', () => {
    let removeTestProject = 'remove-test-' + process.pid;

    before(async () => {
      // Use workspace as a guaranteed existing path for the test project
      const res = await post('/api/projects', { path: workspace, name: removeTestProject });
      if (res.status !== 200) {
        // Already exists or path issue — try to continue anyway
      }
    });

    it('J07: Remove project removes from DB', async () => {
      const res = await post('/api/projects/' + removeTestProject + '/remove');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.removed);
    });

    it('J08: Removed project not in state', async () => {
      const res = await get('/api/state');
      assert.ok(!res.body.projects.some(p => p.name === removeTestProject));
    });

    it('J09: Remove nonexistent project returns 404', async () => {
      const res = await post('/api/projects/nonexistent-project-xyz/remove');
      assert.strictEqual(res.status, 404);
    });

    after(async () => {
      // Defensive cleanup in case J07 failed and the project was not removed
      await post('/api/projects/' + removeTestProject + '/remove').catch(() => {});
    });
  });

  describe('Session Notes', () => {
    let sessionId;

    before(async () => {
      const res = await get('/api/state');
      const proj = res.body.projects.find(p => p.name === testProject);
      if (proj && proj.sessions.length > 0) sessionId = proj.sessions[0].id;
    });

    it('J10: Write and read session notes', async () => {
      if (!sessionId) return;
      await put('/api/sessions/' + sessionId + '/notes', { notes: 'Phase J test note' });
      const res = await get('/api/sessions/' + sessionId + '/notes');
      assert.strictEqual(res.body.notes, 'Phase J test note');
    });
  });

  describe('Session Config', () => {
    let sessionId;

    before(async () => {
      const res = await get('/api/state');
      const proj = res.body.projects.find(p => p.name === testProject);
      if (proj && proj.sessions.length > 0) sessionId = proj.sessions[0].id;
    });

    it('J12: Set and clear model override', async () => {
      if (!sessionId) return;
      await put('/api/sessions/' + sessionId + '/config', { model_override: 'claude-opus-4-6' });
      let res = await get('/api/sessions/' + sessionId + '/config');
      assert.strictEqual(res.body.model_override, 'claude-opus-4-6');

      await put('/api/sessions/' + sessionId + '/config', { model_override: null });
      res = await get('/api/sessions/' + sessionId + '/config');
      assert.strictEqual(res.body.model_override, null);
    });

    it('J14: Set session state to hidden and back', async () => {
      if (!sessionId) return;
      await put('/api/sessions/' + sessionId + '/config', { state: 'hidden' });
      let res = await get('/api/sessions/' + sessionId + '/config');
      assert.strictEqual(res.body.state, 'hidden');

      await put('/api/sessions/' + sessionId + '/config', { state: 'active' });
      res = await get('/api/sessions/' + sessionId + '/config');
      assert.strictEqual(res.body.state, 'active');
    });
  });

  describe('Token Usage', () => {
    it('J16: Token usage returns structure', async () => {
      const stateRes = await get('/api/state');
      const proj = stateRes.body.projects.find(p => p.sessions.length > 0);
      if (!proj) return;

      const res = await get('/api/sessions/' + proj.sessions[0].id + '/tokens?project=' + proj.name);
      assert.strictEqual(res.status, 200);
      assert.ok('input_tokens' in res.body);
      assert.ok('model' in res.body);
      assert.ok('max_tokens' in res.body);
    });

    it('J17: Token usage without project returns null', async () => {
      const res = await get('/api/sessions/fake-id/tokens');
      assert.strictEqual(res.body.tokens, null);
    });
  });

  describe('State Details', () => {
    it('J18: State includes workspace path', async () => {
      const res = await get('/api/state');
      assert.strictEqual(res.body.workspace, workspace);
    });

    it('J19: Sessions have required fields', async () => {
      const res = await get('/api/state');
      const proj = res.body.projects.find(p => p.sessions.length > 0);
      if (!proj) return;

      const s = proj.sessions[0];
      assert.ok('id' in s);
      assert.ok('name' in s);
      assert.ok('timestamp' in s);
      assert.ok('messageCount' in s);
      assert.ok('tmux' in s);
      assert.ok('active' in s);
      assert.ok('state' in s);
    });
  });

  describe('External MCP Admin', () => {
    it('J21: set_project_notes via external MCP', async () => {
      const res = await post('/api/mcp/external/call', {
        tool: 'blueprint_set_project_notes',
        args: { project: testProject, notes: 'External MCP note' },
      });
      assert.strictEqual(res.status, 200);
    });

    it('J22: list_projects via external MCP', async () => {
      const res = await post('/api/mcp/external/call', {
        tool: 'blueprint_list_projects',
        args: {},
      });
      assert.strictEqual(res.status, 200);
    });
  });

  describe('Keepalive', () => {
    it('J25: Status has all fields', async () => {
      const res = await get('/api/keepalive/status');
      assert.ok('running' in res.body);
      assert.ok('mode' in res.body);
      assert.ok('token_expires_in_minutes' in res.body);
    });

    it('J26: Change mode to browser', async () => {
      const res = await put('/api/keepalive/mode', { mode: 'browser' });
      assert.strictEqual(res.body.mode, 'browser');
      // Restore
      await put('/api/keepalive/mode', { mode: 'always' });
    });
  });

  describe('Auth', () => {
    it('J29: Auth status structure', async () => {
      const res = await get('/api/auth/status');
      assert.ok('valid' in res.body);
    });
  });

  describe('Error Paths', () => {
    it('J31: Messages for nonexistent project', async () => {
      const res = await get('/api/projects/nonexistent-xyz/messages');
      assert.strictEqual(res.status, 404);
    });

    it('J33: Summary without project', async () => {
      const res = await post('/api/sessions/fake-id/summary', {});
      assert.strictEqual(res.status, 400);
    });

    it('J34: Smart compact without project', async () => {
      const res = await post('/api/sessions/fake-id/smart-compact', {});
      assert.strictEqual(res.status, 400);
    });
  });
});
