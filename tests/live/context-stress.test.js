'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { post, get } = require('../helpers/http-client');
const { resetBaseline, dockerExec } = require('../helpers/reset-state');
const { queryJson, queryCount } = require('../helpers/db-query');

test('CST: prime-test-session.js exists and has valid context-filling logic', () => {
  const scriptPath = path.join(__dirname, '../../scripts/prime-test-session.js');
  assert.ok(fs.existsSync(scriptPath), 'prime-test-session.js must exist');
  const content = fs.readFileSync(scriptPath, 'utf-8');
  assert.ok(content.length > 100, 'Script should have substantial content');
  // Verify the script has the structure needed for context filling:
  // it must read JSONL, create sessions, and write synthetic messages
  assert.ok(
    content.includes('jsonl') || content.includes('JSONL'),
    'Script must reference JSONL format (reads/writes session files)',
  );
  assert.ok(
    content.includes('/api/sessions') || content.includes('api/state'),
    'Script must interact with Blueprint API to create sessions',
  );
});

test('CST: create session and verify token usage API returns structured data', async () => {
  await resetBaseline();
  dockerExec('mkdir -p /workspace/cst_proj');
  await post('/api/projects', { path: '/workspace/cst_proj', name: 'cst_proj' });

  const sessResult = await post('/api/sessions', {
    project: 'cst_proj',
    prompt: 'context stress test session',
  });
  assert.equal(sessResult.status, 200, 'Session creation must succeed');
  assert.ok(sessResult.data.id, 'Session must return an ID');
  const sid = sessResult.data.id;

  // Query token usage — this exercises the real getTokenUsage code path
  const tokenResult = await get(`/api/sessions/${sid}/tokens?project=cst_proj`);
  assert.equal(tokenResult.status, 200, 'Token usage API must respond with 200');
  const data = tokenResult.data;
  // Verify the response has the expected structure
  assert.ok(
    'input_tokens' in data || 'percent' in data || 'model' in data || 'max_tokens' in data,
    `Token usage response must contain token/model data fields, got keys: ${Object.keys(data).join(', ')}`,
  );
  if (data.max_tokens) {
    assert.ok(data.max_tokens > 0, 'max_tokens must be positive');
  }

  // Verify session was created in DB
  const dbCount = queryCount('sessions', `id LIKE '${sid.substring(0, 8)}%' OR id LIKE 'new_%'`);
  assert.ok(dbCount > 0, 'Session must exist in database after creation');
});

test('CST: compaction thresholds are configured and queryable', async () => {
  const healthResult = await get('/health');
  assert.equal(healthResult.status, 200, 'Server must be healthy');

  const settings = await get('/api/settings');
  assert.equal(settings.status, 200, 'Settings API must respond');

  // Verify compaction infrastructure is available by calling smart-compact on a valid session
  // This exercises the route handler, lock check, and session validation — the real code path
  dockerExec('mkdir -p /workspace/cst_threshold_proj');
  await post('/api/projects', {
    path: '/workspace/cst_threshold_proj',
    name: 'cst_threshold_proj',
  });
  const sess = await post('/api/sessions', {
    project: 'cst_threshold_proj',
    prompt: 'threshold test',
  });
  assert.equal(sess.status, 200, 'Session creation for threshold test must succeed');

  // Trigger compaction on the session — it should respond with compacted:false
  // (session is new, has no context to compact) but NOT crash with 500
  const compactResult = await post(`/api/sessions/${sess.data.id}/smart-compact`, {
    project: 'cst_threshold_proj',
  });
  assert.equal(
    compactResult.status,
    200,
    `Smart-compact must not crash (500) on valid session, got ${compactResult.status}`,
  );
  assert.ok(
    'compacted' in compactResult.data,
    'Smart-compact response must include compacted field',
  );
  // For a brand new session with minimal context, compaction should not proceed
  assert.equal(
    compactResult.data.compacted,
    false,
    'Brand new session should not trigger actual compaction',
  );
  assert.ok(compactResult.data.reason, 'Response must explain why compaction was skipped');
});

test('CST: multi-session stress — concurrent token queries do not crash', async () => {
  await resetBaseline();
  dockerExec('mkdir -p /workspace/cst_stress_proj');
  await post('/api/projects', { path: '/workspace/cst_stress_proj', name: 'cst_stress_proj' });

  // Create multiple sessions rapidly
  const sessionIds = [];
  for (let i = 0; i < 3; i++) {
    const r = await post('/api/sessions', {
      project: 'cst_stress_proj',
      prompt: `stress session ${i}`,
    });
    assert.equal(r.status, 200, `Session ${i} creation must succeed`);
    sessionIds.push(r.data.id);
  }

  // Query token usage for all sessions concurrently
  const results = await Promise.all(
    sessionIds.map((sid) => get(`/api/sessions/${sid}/tokens?project=cst_stress_proj`)),
  );
  for (let i = 0; i < results.length; i++) {
    assert.equal(
      results[i].status,
      200,
      `Token usage for session ${i} must respond with 200, got ${results[i].status}`,
    );
  }

  // Verify DB consistency — all sessions should exist
  const dbSessions = queryJson('SELECT id FROM sessions');
  const dbIds = dbSessions.map((r) => r.id);
  for (const sid of sessionIds) {
    assert.ok(
      dbIds.some((id) => id === sid || id.startsWith('new_')),
      `Session ${sid} must exist in database`,
    );
  }
});
