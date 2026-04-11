'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const { registerMcpRoutes } = require('../../mcp-tools.js');

function startApp() {
  const app = express();
  app.use(express.json());
  registerMcpRoutes(app);
  const server = http.createServer(app);
  return new Promise(r => server.listen(0, () => r({ server, port: server.address().port })));
}

test('MCP-03 / FS-06: plan path traversal blocked', async () => {
  const { server, port } = await startApp();
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/mcp/call`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'blueprint_update_plan', args: { session_id: 's1', project: '../evil', content: 'x' } }),
    });
    assert.equal(r.status, 403);
  } finally { await new Promise(r => server.close(r)); }
});

test('MCP-04: invalid session_id rejected', async () => {
  const { server, port } = await startApp();
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/mcp/call`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'blueprint_get_session_notes', args: { session_id: '../../etc/passwd' } }),
    });
    assert.equal(r.status, 400);
  } finally { await new Promise(r => server.close(r)); }
});

test('MCP-05: invalid task_id rejected', async () => {
  const { server, port } = await startApp();
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/mcp/call`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'blueprint_complete_task', args: { task_id: 'abc' } }),
    });
    assert.equal(r.status, 400);
  } finally { await new Promise(r => server.close(r)); }
});

test('MCP unknown tool returns 404', async () => {
  const { server, port } = await startApp();
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/mcp/call`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'nonexistent_tool', args: {} }),
    });
    assert.equal(r.status, 404);
  } finally { await new Promise(r => server.close(r)); }
});

test('MCP tool list returns expected tools', async () => {
  const { server, port } = await startApp();
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/mcp/tools`);
    const body = await r.json();
    assert.ok(body.tools.length >= 14);
    assert.ok(body.tools.some(t => t.name === 'blueprint_search_sessions'));
    assert.ok(body.tools.some(t => t.name === 'blueprint_smart_compaction'));
    assert.ok(body.tools.some(t => t.name === 'blueprint_get_token_usage'));
  } finally { await new Promise(r => server.close(r)); }
});
