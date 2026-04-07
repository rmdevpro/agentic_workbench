const { describe, it } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const { join } = require('path');

const MCP_SERVER = join(__dirname, '..', '..', 'mcp-server.js');

function sendRpc(proc, msg) {
  proc.stdin.write(JSON.stringify(msg) + '\n');
}

function waitForResponse(proc, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for response')), timeout);
    const handler = (data) => {
      const line = data.toString().trim();
      if (!line || !line.startsWith('{')) return;
      try {
        const parsed = JSON.parse(line);
        clearTimeout(timer);
        proc.stdout.removeListener('data', handler);
        resolve(parsed);
      } catch {}
    };
    proc.stdout.on('data', handler);
  });
}

describe('MCP stdio Protocol', () => {
  it('D20: initialize returns protocol version', async () => {
    const proc = spawn('node', [MCP_SERVER], {
      env: { ...process.env, BLUEPRINT_PORT: '99999' }, // Won't actually connect
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    try {
      sendRpc(proc, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
      const response = await waitForResponse(proc);
      assert.strictEqual(response.id, 1);
      assert.strictEqual(response.result.protocolVersion, '2024-11-05');
      assert.ok(response.result.serverInfo.name === 'blueprint');
    } finally {
      proc.kill();
    }
  });

  it('D21: tools/list returns all tools', async () => {
    const proc = spawn('node', [MCP_SERVER], {
      env: { ...process.env, BLUEPRINT_PORT: '99999' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    try {
      sendRpc(proc, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
      const response = await waitForResponse(proc);
      assert.strictEqual(response.id, 1);
      assert.ok(Array.isArray(response.result.tools));
      assert.ok(response.result.tools.length >= 14, `Expected >= 14 tools, got ${response.result.tools.length}`);

      // Verify key tools present
      const names = response.result.tools.map(t => t.name);
      assert.ok(names.includes('blueprint_search_sessions'));
      assert.ok(names.includes('blueprint_send_message'));
      assert.ok(names.includes('blueprint_ask_quorum'));
      assert.ok(names.includes('blueprint_smart_compaction'));
    } finally {
      proc.kill();
    }
  });

  it('D22: unknown method returns -32601', async () => {
    const proc = spawn('node', [MCP_SERVER], {
      env: { ...process.env, BLUEPRINT_PORT: '99999' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    try {
      sendRpc(proc, { jsonrpc: '2.0', id: 99, method: 'nonexistent/method', params: {} });
      const response = await waitForResponse(proc);
      assert.strictEqual(response.id, 99);
      assert.strictEqual(response.error.code, -32601);
      assert.ok(response.error.message.includes('nonexistent/method'));
    } finally {
      proc.kill();
    }
  });

  it('should ignore malformed JSON lines', async () => {
    const proc = spawn('node', [MCP_SERVER], {
      env: { ...process.env, BLUEPRINT_PORT: '99999' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    try {
      proc.stdin.write('not json at all\n');
      // Send a valid message after — should still work
      sendRpc(proc, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
      const response = await waitForResponse(proc);
      assert.strictEqual(response.id, 1);
      assert.ok(response.result.tools);
    } finally {
      proc.kill();
    }
  });

  it('should not respond to notifications (no id)', async () => {
    const proc = spawn('node', [MCP_SERVER], {
      env: { ...process.env, BLUEPRINT_PORT: '99999' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    try {
      sendRpc(proc, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
      // Send a request after to verify server is still working
      sendRpc(proc, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
      const response = await waitForResponse(proc);
      assert.strictEqual(response.id, 1); // Should be the tools/list response, not the notification
    } finally {
      proc.kill();
    }
  });
});
