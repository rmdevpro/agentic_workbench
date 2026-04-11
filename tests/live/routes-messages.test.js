'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { get, post } = require('../helpers/http-client');
const { resetBaseline, dockerExec } = require('../helpers/reset-state');

test('MSG-01/03: send and get messages', async () => {
  await resetBaseline();
  dockerExec('mkdir -p /workspace/msg_proj');
  await post('/api/projects', { path: '/workspace/msg_proj', name: 'msg_proj' });
  const sendResult = await post('/api/projects/msg_proj/messages', { content: 'Hello from test' });
  assert.equal(sendResult.status, 200);
  assert.ok(sendResult.data.id);
  const r = await get('/api/projects/msg_proj/messages');
  assert.ok(r.data.messages.length >= 1);
  assert.equal(r.data.messages[0].content, 'Hello from test');
});
