'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { get, post, put } = require('../helpers/http-client');
const { resetBaseline, dockerExec } = require('../helpers/reset-state');

test('SES-03: creates bash terminal with correct ID format', async () => {
  await resetBaseline();
  dockerExec('mkdir -p /workspace/sess_proj');
  await post('/api/projects', { path: '/workspace/sess_proj', name: 'sess_proj' });
  const r = await post('/api/terminals', { project: 'sess_proj' });
  assert.equal(r.status, 200);
  assert.ok(r.data.id.startsWith('t_'));
  assert.ok(r.data.tmux);
});

test('SES-17: /api/state returns session list structure', async () => {
  const r = await get('/api/state');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.data.projects));
  assert.ok('workspace' in r.data);
});

test('session creation requires project', async () => {
  const r = await post('/api/sessions', {});
  assert.equal(r.status, 400);
});

test('terminal creation requires project', async () => {
  const r = await post('/api/terminals', {});
  assert.equal(r.status, 400);
});
