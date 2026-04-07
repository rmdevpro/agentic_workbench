const { describe, it } = require('node:test');
const assert = require('node:assert');
const { get, post } = require('./helpers');

describe('Phase A: Infrastructure', () => {
  it('A01: Server responds to GET /', async () => {
    const res = await get('/');
    assert.strictEqual(res.status, 200);
  });

  it('A02: Static xterm.js files served', async () => {
    const res = await get('/lib/xterm/lib/xterm.js');
    assert.strictEqual(res.status, 200);
  });

  it('A03: Auth status endpoint responds', async () => {
    const res = await get('/api/auth/status');
    assert.strictEqual(res.status, 200);
    assert.ok('valid' in res.body);
  });

  it('A04: Settings defaults returned', async () => {
    const res = await get('/api/settings');
    assert.strictEqual(res.status, 200);
    assert.ok('default_model' in res.body);
    assert.ok('keepalive_mode' in res.body);
    assert.ok('tasks_enabled' in res.body);
  });

  it('A05: Keepalive status responds', async () => {
    const res = await get('/api/keepalive/status');
    assert.strictEqual(res.status, 200);
    assert.ok('running' in res.body);
    assert.ok('mode' in res.body);
  });

  it('A06: State endpoint returns projects', async () => {
    const res = await get('/api/state');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.projects));
    assert.ok(res.body.projects.length > 0, 'Should have at least one project');
  });

  it('A07: OpenAI models endpoint', async () => {
    const res = await get('/v1/models');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.length > 0);
  });

  it('A08: MCP tools discovery', async () => {
    const res = await get('/api/mcp/tools');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.tools));
  });

  it('A09: External MCP tools discovery', async () => {
    const res = await get('/api/mcp/external/tools');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.tools));
    assert.ok(res.body.tools.length >= 8, `Expected >= 8 external tools, got ${res.body.tools.length}`);
    // Verify specific admin tools are present
    const names = res.body.tools.map(t => t.name);
    assert.ok(names.includes('blueprint_create_session'), 'Should have create_session');
    assert.ok(names.includes('blueprint_list_projects'), 'Should have list_projects');
  });

  it('A10: Webhooks endpoint responds', async () => {
    const res = await get('/api/webhooks');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.webhooks));
  });
});
