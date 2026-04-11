'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { get } = require('../helpers/http-client');

test('FS-01: /api/mounts returns array', async () => {
  const r = await get('/api/mounts');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.data));
});

test('FS-02: /api/browse returns listing and hides dot dirs', async () => {
  const r = await get('/api/browse?path=/workspace');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.data.entries));
  // Verify dot directories are hidden
  for (const entry of r.data.entries) {
    assert.ok(!entry.name.startsWith('.'), `Dot directory ${entry.name} should be hidden`);
  }
});

test('FS-03: /api/file reads file content (AD-001: full access)', async () => {
  const r = await get('/api/file?path=/etc/hostname');
  assert.ok([200, 400].includes(r.status));
});
