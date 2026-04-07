const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const { BASE_URL, post, getTestProject } = require('./helpers');

describe('Phase F: WebSocket Terminal', () => {
  const wsUrl = BASE_URL.replace('http', 'ws');
  let tmuxSession = null;
  let testProject;

  before(async () => {
    testProject = await getTestProject();
    const res = await post('/api/sessions', { project: testProject });
    tmuxSession = res.body.tmux;
  });

  it('F01: Connect to valid tmux session', async () => {
    if (!tmuxSession) assert.fail('No tmux session created');
    const ws = new WebSocket(`${wsUrl}/ws/${tmuxSession}`);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { ws.close(); reject(new Error('Timeout')); }, 10000);
      ws.on('open', () => { clearTimeout(timer); ws.close(); resolve(); });
      ws.on('error', (err) => { clearTimeout(timer); ws.close(); reject(err); });
    });
  });

  it('F02: Receive terminal output', async () => {
    if (!tmuxSession) assert.fail('No tmux session');
    const ws = new WebSocket(`${wsUrl}/ws/${tmuxSession}`);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { ws.close(); reject(new Error('No data received')); }, 10000);
      ws.on('message', (data) => {
        assert.ok(data.toString().length > 0, 'Received data');
        clearTimeout(timer);
        ws.close();
        resolve();
      });
      ws.on('error', (err) => { clearTimeout(timer); ws.close(); reject(err); });
    });
  });

  it('F03: Ping/pong heartbeat', async () => {
    if (!tmuxSession) assert.fail('No tmux session');
    const ws = new WebSocket(`${wsUrl}/ws/${tmuxSession}`);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { ws.close(); reject(new Error('No pong')); }, 10000);
      ws.on('open', () => { ws.send(JSON.stringify({ type: 'ping' })); });
      ws.on('message', (data) => {
        const msg = data.toString();
        if (msg.includes('"pong"')) {
          clearTimeout(timer);
          ws.close();
          resolve();
        }
      });
      ws.on('error', (err) => { clearTimeout(timer); ws.close(); reject(err); });
    });
  });

  it('F04: Resize message accepted without error', async () => {
    if (!tmuxSession) assert.fail('No tmux session');
    const ws = new WebSocket(`${wsUrl}/ws/${tmuxSession}`);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { ws.close(); reject(new Error('Timeout')); }, 5000);
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));
        // Wait briefly for any error — if none, resize succeeded
        setTimeout(() => { clearTimeout(timer); ws.close(); resolve(); }, 1000);
      });
      ws.on('error', (err) => { clearTimeout(timer); ws.close(); reject(err); });
    });
  });

  it('F05: Invalid tmux session returns error and closes', async () => {
    const ws = new WebSocket(`${wsUrl}/ws/nonexistent_tmux_session`);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { ws.close(); reject(new Error('Timeout')); }, 10000);
      let gotError = false;
      ws.on('message', (data) => {
        const msg = data.toString();
        if (msg.includes('"error"') && msg.includes('No tmux session')) {
          gotError = true;
        }
      });
      ws.on('close', () => {
        clearTimeout(timer);
        assert.ok(gotError, 'Should have received error message before close');
        resolve();
      });
      ws.on('error', () => {
        clearTimeout(timer);
        resolve(); // Connection refused is also acceptable
      });
    });
  });
});
