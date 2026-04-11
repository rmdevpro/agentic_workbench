'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { get, put } = require('../helpers/http-client');

test('SET-01/02: settings get and set round-trip', async () => {
  const r = await get('/api/settings');
  assert.equal(r.status, 200);
  assert.ok('default_model' in r.data);
  await put('/api/settings', { key: 'test_key', value: 'test_val' });
  const r2 = await get('/api/settings');
  assert.equal(r2.data.test_key, 'test_val');
});

test('MCS-API-01: GET /api/mcp-servers returns servers object', async () => {
  const r = await get('/api/mcp-servers');
  assert.equal(r.status, 200);
  assert.ok('servers' in r.data);
});
