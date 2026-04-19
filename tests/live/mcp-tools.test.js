'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { get, post } = require('../helpers/http-client');
const { resetBaseline, dockerExec } = require('../helpers/reset-state');
const { queryCount } = require('../helpers/db-query');

test('MCP-01: GET /api/mcp/tools lists at least 3 tools', async () => {
  const r = await get('/api/mcp/tools');
  assert.equal(r.status, 200);
  assert.ok(r.data.tools.length >= 3);
});

test('MCP-06g/06f: add task and get tasks via MCP with DB count verification', async () => {
  await resetBaseline();

  // Gray-box: count tasks before MCP add
  const countBefore = queryCount('tasks', "folder_path = '/'");

  const addResult = await post('/api/mcp/call', {
    tool: 'blueprint_tasks',
    args: { action: 'add', folder_path: '/', title: 'mcp-task-test' },
  });
  assert.ok(addResult.data.result);

  // Gray-box: DB count must increment by 1 (MCP-06g requirement)
  const countAfter = queryCount('tasks', "folder_path = '/'");
  assert.equal(
    countAfter,
    countBefore + 1,
    `DB task count must increment by 1 after blueprint_tasks add (before: ${countBefore}, after: ${countAfter})`,
  );

  const r = await post('/api/mcp/call', {
    tool: 'blueprint_tasks',
    args: { action: 'get', folder_path: '/' },
  });
  assert.ok(r.data.result.tasks.some((t) => t.title === 'mcp-task-test'));
});

test('MCP unknown tool returns 400', async () => {
  const r = await post('/api/mcp/call', { tool: 'nonexistent_tool', args: {} });
  assert.ok([400, 404].includes(r.status), `Expected 400 or 404, got ${r.status}`);
});
