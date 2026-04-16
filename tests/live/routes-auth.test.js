'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { get, put } = require('../helpers/http-client');

test('AUTH-01/03: auth status returns valid field, keepalive returns mode/running', async () => {
  const auth = await get('/api/auth/status');
  assert.ok('valid' in auth.data);
  assert.ok(typeof auth.data.valid === 'boolean');
  const ka = await get('/api/keepalive/status');
  assert.ok('mode' in ka.data);
  assert.ok('running' in ka.data);
  assert.ok(typeof ka.data.running === 'boolean');
});

test('AUTH-04/05: keepalive mode validation rejects invalid inputs', async () => {
  assert.equal((await put('/api/keepalive/mode', { mode: 'invalid' })).status, 400);
  assert.equal((await put('/api/keepalive/mode', { mode: 'idle', idleMinutes: 0 })).status, 400);
  assert.equal((await put('/api/keepalive/mode', { mode: 'idle', idleMinutes: 1441 })).status, 400);
  const ok = await put('/api/keepalive/mode', { mode: 'always' });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.mode, 'always');
});
