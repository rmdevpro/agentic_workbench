'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { askCli, askQuorum, registerQuorumRoutes, getConfiguredCLIs } = require('../../quorum');
const safe = require('../../safe-exec');
const db = require('../../db');
const { withServer, req } = require('../helpers/with-server');

// -- getConfiguredCLIs tests --

test('QRM-01: getConfiguredCLIs always includes claude', () => {
  const clis = getConfiguredCLIs();
  assert.ok(clis.includes('claude'), 'claude should always be in the list');
});

test('QRM-01: getConfiguredCLIs includes gemini when key configured', () => {
  db.setSetting('gemini_api_key', 'test-key');
  try {
    const clis = getConfiguredCLIs();
    assert.ok(clis.includes('gemini'));
  } finally {
    db.setSetting('gemini_api_key', '');
  }
});

test('QRM-01: getConfiguredCLIs includes codex when key configured', () => {
  db.setSetting('codex_api_key', 'test-key');
  try {
    const clis = getConfiguredCLIs();
    assert.ok(clis.includes('codex'));
  } finally {
    db.setSetting('codex_api_key', '');
  }
});

// -- Route validation tests --

test('QRM: quorum/ask rejects missing question', async () => {
  const app = express();
  app.use(express.json());
  registerQuorumRoutes(app);
  await withServer(app, async ({ port }) => {
    const r = await req(port, 'POST', '/api/quorum/ask', { project: 'p' });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.ok(body.error.includes('question'));
  });
});

test('QRM: quorum/ask rejects missing project', async () => {
  const app = express();
  app.use(express.json());
  registerQuorumRoutes(app);
  await withServer(app, async ({ port }) => {
    const r = await req(port, 'POST', '/api/quorum/ask', { question: 'test' });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.ok(body.error.includes('project'));
  });
});

test('QRM: cli/ask rejects missing cli', async () => {
  const app = express();
  app.use(express.json());
  registerQuorumRoutes(app);
  await withServer(app, async ({ port }) => {
    const r = await req(port, 'POST', '/api/cli/ask', { prompt: 'test' });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.ok(body.error.includes('cli'));
  });
});

test('QRM: cli/ask rejects missing prompt', async () => {
  const app = express();
  app.use(express.json());
  registerQuorumRoutes(app);
  await withServer(app, async ({ port }) => {
    const r = await req(port, 'POST', '/api/cli/ask', { cli: 'claude' });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.ok(body.error.includes('prompt'));
  });
});

test('QRM: cli/ask rejects invalid cli name', async () => {
  const app = express();
  app.use(express.json());
  registerQuorumRoutes(app);
  await withServer(app, async ({ port }) => {
    const r = await req(port, 'POST', '/api/cli/ask', { cli: 'invalid', prompt: 'test' });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.ok(body.error.includes('must be one of'));
  });
});

// -- askQuorum with mocked CLI --

test('QRM: askQuorum runs with mocked claude and returns result', async (t) => {
  db.ensureProject('qproj', '/virtual/qproj');
  t.mock.method(safe, 'claudeExecAsync', async () => ' mocked response ');
  const result = await askQuorum('test question', 'qproj', null, 'new');
  assert.ok(result.round_id, 'Should return a round ID');
  assert.ok(result.files.length > 0, 'Should produce output files');
  assert.ok(result.lead_synthesis, 'Should have lead synthesis file');
  assert.ok(result.junior_count >= 1, 'Should have at least one junior');
});

test('QRM: askQuorum handles CLI error gracefully', async (t) => {
  db.ensureProject('errproj', '/virtual/errproj');
  t.mock.method(safe, 'claudeExecAsync', async () => {
    throw new Error('claude crashed');
  });
  const result = await askQuorum('test', 'errproj', null, 'new');
  assert.ok(result.round_id);
  assert.ok(result.files.length > 0);
});
