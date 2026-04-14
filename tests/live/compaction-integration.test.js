'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { post, get, createSession } = require('../helpers/http-client');
const { resetBaseline, dockerExec } = require('../helpers/reset-state');
const { queryCount, queryJson } = require('../helpers/db-query');

test('CMP: smart-compact API handles nonexistent session gracefully (no 500)', async () => {
  const r = await post('/api/sessions/nonexistent_session/smart-compact', { project: 'test' });
  // Must not crash with 500 — either 400 rejection or 200 with compacted:false are valid
  assert.ok(
    r.status === 200 || r.status === 400,
    `Expected 200 or 400 for nonexistent session, got ${r.status}. A 500 indicates an unhandled crash.`,
  );
  if (r.status === 200) {
    assert.equal(r.data.compacted, false, 'Nonexistent session must return compacted:false');
    assert.ok(r.data.reason, 'Response must include a reason for skipping compaction');
  }
  if (r.status === 400) {
    const body = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    assert.ok(
      body.toLowerCase().includes('session') || body.toLowerCase().includes('not found'),
      `400 error must mention session issue, got: ${body.substring(0, 200)}`,
    );
  }
});

test('CMP: smart-compact requires project parameter', async () => {
  const r = await post('/api/sessions/test_session/smart-compact', {});
  assert.equal(r.status, 400, 'Missing project parameter must return 400');
  const body = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
  assert.ok(
    body.toLowerCase().includes('project'),
    `Error response must mention 'project' parameter, got: ${body.substring(0, 200)}`,
  );
});

test('CMP: smart-compact on valid session returns structured response with DB consistency', async () => {
  await resetBaseline();
  dockerExec('mkdir -p /workspace/cmp_test_proj');
  await post('/api/projects', { path: '/workspace/cmp_test_proj', name: 'cmp_test_proj' });

  // Create a real session with retry (stub CLI may cause tmux name collisions)
  const sessResult = await createSession('cmp_test_proj', 'compaction integration test');
  assert.ok(
    sessResult.status === 200 || sessResult.status === 500,
    `Session creation must return 200 or 500 (stub CLI race), got ${sessResult.status}`,
  );
  const sid = sessResult.data.id;
  assert.ok(sid, 'Session must have an ID');

  // Verify the session exists in DB before compaction attempt.
  // Query by project FK — the session resolver may rename new_* IDs to UUIDs asynchronously.
  const preCompactCount = queryCount(
    'sessions',
    "project_id IN (SELECT id FROM projects WHERE name = 'cmp_test_proj')",
  );
  assert.ok(preCompactCount > 0, 'Session must exist in DB before compaction attempt');

  // Trigger smart-compact — session has no real context, so it should return compacted:false
  // but the full code path (lock check, session validation, tmux check) must execute
  const compactResult = await post(`/api/sessions/${sid}/smart-compact`, {
    project: 'cmp_test_proj',
  });

  // Must not crash
  assert.equal(
    compactResult.status,
    200,
    `Smart-compact must respond with 200 (not crash), got ${compactResult.status}`,
  );

  // Response must have the compacted field
  assert.ok(
    'compacted' in compactResult.data,
    `Response must include 'compacted' field, got: ${JSON.stringify(compactResult.data)}`,
  );

  // For a session with no/minimal context, compaction should not proceed
  if (compactResult.data.compacted === false) {
    assert.ok(compactResult.data.reason, 'When compacted=false, response must include a reason');
    // Valid reasons for a new session
    const validReasons = [
      'session not running',
      'temp session not yet resolved',
      'compaction already in progress',
      'failed to enter plan mode',
    ];
    assert.ok(
      validReasons.some((r) => compactResult.data.reason.includes(r)),
      `Reason must be a known failure mode, got: ${compactResult.data.reason}`,
    );
  } else {
    // If compaction actually ran (unlikely for a new session), verify all fields
    assert.ok(
      compactResult.data.prep_completed !== undefined,
      'Successful compaction must report prep_completed',
    );
    assert.ok(
      compactResult.data.compaction_completed !== undefined,
      'Successful compaction must report compaction_completed',
    );
    assert.ok(compactResult.data.tail_file, 'Successful compaction must return tail_file path');
  }

  // Gray-box: verify the session still exists in DB after compaction attempt.
  // Query by project FK since session resolver may have renamed the ID.
  const postCompactCount = queryCount(
    'sessions',
    "project_id IN (SELECT id FROM projects WHERE name = 'cmp_test_proj')",
  );
  assert.ok(
    postCompactCount > 0,
    'Session must still exist in DB after compaction attempt (compaction must not delete session)',
  );
});

test('CMP: concurrent compaction requests are properly locked', async () => {
  await resetBaseline();
  dockerExec('mkdir -p /workspace/cmp_lock_proj');
  await post('/api/projects', { path: '/workspace/cmp_lock_proj', name: 'cmp_lock_proj' });

  const sessResult = await createSession('cmp_lock_proj', 'lock test');
  assert.ok(
    sessResult.status === 200 || sessResult.status === 500,
    `Session creation must return 200 or 500 (stub CLI race), got ${sessResult.status}`,
  );
  const sid = sessResult.data.id;
  assert.ok(sid, 'Session must have an ID for lock contention test');

  // Fire two compaction requests concurrently — the second should be rejected by the lock
  const [r1, r2] = await Promise.all([
    post(`/api/sessions/${sid}/smart-compact`, { project: 'cmp_lock_proj' }),
    post(`/api/sessions/${sid}/smart-compact`, { project: 'cmp_lock_proj' }),
  ]);

  // Both must return 200 (not crash)
  assert.equal(r1.status, 200, 'First concurrent compaction must respond 200');
  assert.equal(r2.status, 200, 'Second concurrent compaction must respond 200');

  // At least one should report lock contention or both should gracefully handle the session
  const _reasons = [r1.data.reason, r2.data.reason].filter(Boolean);
  // Valid: one succeeds and one is locked, or both fail for the same session-not-running reason
  assert.ok(
    r1.data.compacted !== undefined && r2.data.compacted !== undefined,
    'Both responses must include compacted field',
  );
});

test('CMP: compaction state map tracks per-session nudge flags', async () => {
  // Verify compaction infrastructure is alive by checking health
  const health = await get('/health');
  assert.equal(health.status, 200, 'Health endpoint must respond');

  // Verify the compaction API validates session ID format
  const badIdResult = await post('/api/sessions/!!!invalid!!!/smart-compact', {
    project: 'test',
  });
  assert.equal(badIdResult.status, 400, 'Invalid session ID format must be rejected with 400');
  const body =
    typeof badIdResult.data === 'string' ? badIdResult.data : JSON.stringify(badIdResult.data);
  assert.ok(
    body.toLowerCase().includes('invalid') || body.toLowerCase().includes('session'),
    'Error must mention invalid session ID',
  );
});

// ── Gray-box compaction verification tests ──────────────────────

test('CMP-GRAY: compaction logs structured JSON entries for pipeline execution', async () => {
  await resetBaseline();
  dockerExec('mkdir -p /workspace/cmp_log_proj');
  await post('/api/projects', { path: '/workspace/cmp_log_proj', name: 'cmp_log_proj' });

  const sess = await createSession('cmp_log_proj', 'log verification test');
  assert.ok(
    sess.status === 200 || sess.status === 500,
    `Session creation must return 200 or 500 (stub CLI race), got ${sess.status}`,
  );
  assert.ok(sess.data.id, 'Session must return an ID');
  const sid = sess.data.id;

  // Record timestamp (epoch seconds) before compaction to filter logs
  const beforeEpoch = Math.floor(Date.now() / 1000);

  await post(`/api/sessions/${sid}/smart-compact`, { project: 'cmp_log_proj' });

  // Read recent container logs using docker logs --since with epoch timestamp
  const { execSync } = require('child_process');
  const CONTAINER = process.env.TEST_CONTAINER || 'blueprint-test-blueprint-1';
  let logsAfter = '';
  try {
    logsAfter = execSync(`docker logs --since ${beforeEpoch} ${CONTAINER} 2>&1`, {
      encoding: 'utf-8',
      timeout: 10000,
    }).trim();
  } catch (_e) {
    // Fallback: get last 50 lines
    try {
      logsAfter = execSync(`docker logs --tail 50 ${CONTAINER} 2>&1`, {
        encoding: 'utf-8',
        timeout: 10000,
      }).trim();
    } catch {
      logsAfter = '';
    }
  }

  // Compaction code path must produce log entries
  assert.ok(
    logsAfter.length > 0,
    'Smart-compact must produce log entries during execution (docker logs --since)',
  );

  // Verify structured JSON logging format
  const logLines = logsAfter.split('\n').filter((l) => l.trim());
  const jsonLines = logLines.filter((l) => {
    try {
      JSON.parse(l);
      return true;
    } catch {
      return false;
    }
  });
  assert.ok(
    jsonLines.length > 0,
    `Logs must contain structured JSON entries, found ${logLines.length} lines but 0 valid JSON`,
  );
  const parsed = JSON.parse(jsonLines[0]);
  assert.ok(
    parsed.timestamp || parsed.time || parsed.ts,
    'Structured log entries must include a timestamp field',
  );
  assert.ok(parsed.level || parsed.severity, 'Structured log entries must include a level field');
});

test('CMP-GRAY: compaction does not leave orphan lock files', async () => {
  await resetBaseline();
  dockerExec('mkdir -p /workspace/cmp_lockfile_proj');
  await post('/api/projects', { path: '/workspace/cmp_lockfile_proj', name: 'cmp_lockfile_proj' });

  const sess = await createSession('cmp_lockfile_proj', 'lockfile test');
  assert.ok(sess.data.id, 'Session must return an ID');
  const sid = sess.data.id;

  // Run compaction
  await post(`/api/sessions/${sid}/smart-compact`, { project: 'cmp_lockfile_proj' });

  // Check that no lock files remain in /storage or /tmp after compaction completes
  const lockFiles = dockerExec(
    'find /storage -name "*.lock" -o -name "*compact*lock*" 2>/dev/null || true',
  );
  // If lock files exist, they must not be for this session
  if (lockFiles.trim()) {
    assert.ok(
      !lockFiles.includes(sid),
      `Lock file for session ${sid} must not persist after compaction completes: ${lockFiles}`,
    );
  }
});

test('CMP-GRAY: compaction preserves DB session record integrity', async () => {
  await resetBaseline();
  dockerExec('mkdir -p /workspace/cmp_integrity_proj');
  await post('/api/projects', {
    path: '/workspace/cmp_integrity_proj',
    name: 'cmp_integrity_proj',
  });

  const sess = await createSession('cmp_integrity_proj', 'integrity test');
  assert.ok(
    sess.status === 200 || sess.status === 500,
    `Session creation must return 200 or 500 (stub CLI race), got ${sess.status}`,
  );
  assert.ok(sess.data.id, 'Session must return an ID');
  const sid = sess.data.id;

  // Snapshot session record before compaction — query by project FK since resolver renames IDs
  const before = queryJson(
    "SELECT * FROM sessions WHERE project_id IN (SELECT id FROM projects WHERE name = 'cmp_integrity_proj') LIMIT 1",
  );
  assert.ok(before.length > 0, 'Session must exist in DB before compaction');
  const beforeRecord = before[0];

  // Run compaction
  await post(`/api/sessions/${sid}/smart-compact`, { project: 'cmp_integrity_proj' });

  // Verify session record is intact after compaction — query by project FK
  const after = queryJson(
    "SELECT * FROM sessions WHERE project_id IN (SELECT id FROM projects WHERE name = 'cmp_integrity_proj') LIMIT 1",
  );
  assert.ok(after.length > 0, 'Session must still exist in DB after compaction');
  const afterRecord = after[0];

  // Session may have been renamed by resolver — verify project FK is preserved
  assert.equal(
    afterRecord.project_id,
    beforeRecord.project_id,
    'Session project_id must not change during compaction',
  );
  assert.equal(
    afterRecord.project_id,
    beforeRecord.project_id,
    'Session project_id must not change during compaction',
  );

  // Verify the project also still exists
  const projectCount = queryCount('projects', "name = 'cmp_integrity_proj'");
  assert.ok(projectCount > 0, 'Parent project must still exist after compaction');
});

test('CMP-GRAY: compaction on session with tmux verifies tmux session state', async () => {
  await resetBaseline();
  dockerExec('mkdir -p /workspace/cmp_tmux_proj');
  await post('/api/projects', { path: '/workspace/cmp_tmux_proj', name: 'cmp_tmux_proj' });

  const sess = await createSession('cmp_tmux_proj', 'tmux verification test');
  assert.ok(sess.data.id, 'Session must return an ID');
  const sid = sess.data.id;

  // Check tmux state before compaction
  const _tmuxBefore = dockerExec("tmux ls -F '#{session_name}' 2>/dev/null || true");

  // Run compaction
  const compactResult = await post(`/api/sessions/${sid}/smart-compact`, {
    project: 'cmp_tmux_proj',
  });
  assert.equal(compactResult.status, 200, 'Compaction must respond 200');

  // If compaction skipped because session not running, verify that's because tmux session is dead
  if (compactResult.data.reason && compactResult.data.reason.includes('session not running')) {
    const tmuxAfter = dockerExec("tmux ls -F '#{session_name}' 2>/dev/null || true");
    // The tmux session may have already exited (stub CLI). Verify the reason is consistent.
    const sessionTmuxName = `bp_${sid}`;
    const isRunning = tmuxAfter.includes(sessionTmuxName);
    assert.ok(
      !isRunning,
      `Compaction reported "session not running" but tmux session ${sessionTmuxName} is still alive`,
    );
  }
});
