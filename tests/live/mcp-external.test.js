'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { get, post } = require('../helpers/http-client');

test('MCX-01/09: list external tools and list projects', async () => {
  const r = await get('/api/mcp/external/tools');
  assert.equal(r.status, 200);
  assert.ok(r.data.tools.length >= 7);
  const r2 = await post('/api/mcp/external/call', { tool: 'blueprint_list_projects', args: {} });
  assert.ok(r2.data.result.projects);
});

test('MCX-11: unknown external tool returns 404', async () => {
  const r = await post('/api/mcp/external/call', { tool: 'nonexistent_external', args: {} });
  assert.equal(r.status, 404);
});
