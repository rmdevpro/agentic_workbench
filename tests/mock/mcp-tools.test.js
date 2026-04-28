'use strict';

// Mock-server tests for the new flat 45-tool MCP API. Hits the in-process
// Express app via supertest-style helpers (no docker, no live workbench).
// Live integration coverage lives in tests/live/mcp-tools.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { registerMcpRoutes, TOOL_NAMES } = require('../../mcp-tools.js');
const { withServer, req } = require('../helpers/with-server');

function startMcpApp() {
  const app = express();
  app.use(express.json());
  registerMcpRoutes(app);
  return app;
}

async function call(port, body) {
  const r = await req(port, 'POST', '/api/mcp/call', body);
  const json = await r.json().catch(() => ({}));
  return { status: r.status, body: json };
}

test('MCP catalogue: 45 flat tools exposed via /api/mcp/tools', async () => {
  await withServer(startMcpApp(), async ({ port }) => {
    const r = await req(port, 'GET', '/api/mcp/tools');
    assert.equal(r.status, 200);
    const json = await r.json();
    assert.equal(json.tools.length, 45);
    for (const n of json.tools) {
      assert.ok(/^(file|session|project|task)_/.test(n), `name not flat: ${n}`);
    }
  });
});

test('MCP catalogue: handler set + advertised tools agree', () => {
  assert.equal(TOOL_NAMES.length, 45);
  const grouped = TOOL_NAMES.reduce((acc, n) => {
    const d = n.split('_')[0];
    acc[d] = (acc[d] || 0) + 1;
    return acc;
  }, {});
  assert.deepEqual(grouped, { file: 8, session: 19, project: 12, task: 6 });
});

test('MCP unknown tool returns 404', async () => {
  await withServer(startMcpApp(), async ({ port }) => {
    const r = await call(port, { tool: 'nonexistent_tool', args: {} });
    assert.equal(r.status, 404);
  });
});

test('MCP missing required arg returns 400 (file_read needs path)', async () => {
  await withServer(startMcpApp(), async ({ port }) => {
    const r = await call(port, { tool: 'file_read', args: {} });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /path required/i);
  });
});

test('MCP path traversal blocked (file_read ../etc/passwd)', async () => {
  await withServer(startMcpApp(), async ({ port }) => {
    const r = await call(port, { tool: 'file_read', args: { path: '../../../etc/passwd' } });
    assert.equal(r.status, 403);
  });
});

test('MCP invalid task_id returns 400', async () => {
  await withServer(startMcpApp(), async ({ port }) => {
    const r = await call(port, { tool: 'task_get', args: { task_id: 'abc' } });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /task_id/i);
  });
});

test('MCP invalid session_id format returns 400', async () => {
  await withServer(startMcpApp(), async ({ port }) => {
    const r = await call(port, { tool: 'session_info', args: { session_id: 'has spaces and !@#' } });
    assert.equal(r.status, 400);
  });
});

test('MCP session_send_key rejects non-whitelisted key', async () => {
  await withServer(startMcpApp(), async ({ port }) => {
    const r = await call(port, {
      tool: 'session_send_key',
      args: { session_id: 'a'.repeat(20), key: 'NotARealKey' },
    });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /invalid key/i);
  });
});

test('MCP session_wait rejects seconds <= 0', async () => {
  await withServer(startMcpApp(), async ({ port }) => {
    const r = await call(port, { tool: 'session_wait', args: { seconds: 0 } });
    assert.equal(r.status, 400);
  });
});
