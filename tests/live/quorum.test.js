'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { post } = require('../helpers/http-client');

test('QRM-10: rejects missing question', async () => {
  const r = await post('/api/quorum/ask', { project: 'test' });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /question/);
});

test('QRM-10: rejects missing project', async () => {
  const r = await post('/api/quorum/ask', { question: 'test' });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /project/);
});
