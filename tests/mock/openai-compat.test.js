'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const childProcess = require('node:child_process');
const { registerOpenAIRoutes } = require('../../openai-compat.js');

test('OAI-07: prompt > 100KB rejected', async () => {
  const app = express(); app.use(express.json({ limit: '2mb' })); registerOpenAIRoutes(app);
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'x'.repeat(100001) }] }),
    });
    assert.equal(r.status, 400);
  } finally { await new Promise(r => server.close(r)); }
});

test('OAI-08: invalid model name rejected', async () => {
  const app = express(); app.use(express.json()); registerOpenAIRoutes(app);
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'bad model!', messages: [{ role: 'user', content: 'hi' }] }),
    });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error.type, 'invalid_request_error');
  } finally { await new Promise(r => server.close(r)); }
});

test('OAI-11: Claude exec failure returns server_error', async (t) => {
  t.mock.method(childProcess, 'execFile', (_c, _a, _o, cb) => cb(new Error('claude fail')));
  const app = express(); app.use(express.json()); registerOpenAIRoutes(app);
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'hi' }] }),
    });
    assert.equal(r.status, 500);
    const body = await r.json();
    assert.equal(body.error.type, 'server_error');
  } finally { await new Promise(r => server.close(r)); }
});

test('OAI: missing messages rejected', async () => {
  const app = express(); app.use(express.json()); registerOpenAIRoutes(app);
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6' }),
    });
    assert.equal(r.status, 400);
  } finally { await new Promise(r => server.close(r)); }
});
