'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { post } = require('../helpers/http-client');

test('CMP: smart-compact API rejects invalid session gracefully', async () => {
  const r = await post('/api/sessions/nonexistent_session/smart-compact', { project: 'test' });
  // Should get a structured response, not a 500 crash
  assert.ok(r.status === 200 || r.status === 400, `Expected 200 or 400, got ${r.status}`);
  if (r.status === 200) {
    assert.equal(r.data.compacted, false);
  }
});

test('CMP: smart-compact requires project parameter', async () => {
  const r = await post('/api/sessions/test_session/smart-compact', {});
  assert.equal(r.status, 400);
});
