const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const { get, post, put, del, getTestProject } = require('./helpers');

describe('Phase B: Sessions', () => {
  let testProject;
  let createdSessionId = null;

  before(async () => {
    testProject = await getTestProject();
  });

  it('B01: Create session', async () => {
    const res = await post('/api/sessions', { project: testProject });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.id);
    assert.ok(res.body.tmux);
    createdSessionId = res.body.id;
  });

  it('B02: State endpoint lists projects', async () => {
    const res = await get('/api/state');
    assert.strictEqual(res.status, 200);
    const project = res.body.projects.find(p => p.name === testProject);
    assert.ok(project, `Project ${testProject} should exist`);
    assert.ok(Array.isArray(project.sessions), 'Sessions should be an array');
  });

  it('B03: Resume session', async () => {
    if (!createdSessionId) assert.fail('No session created in B01');
    const res = await post(`/api/sessions/${createdSessionId}/resume`, { project: testProject });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.tmux, `bp_${createdSessionId.substring(0, 12)}`);
  });

  it('B04: Session config get/set', async () => {
    if (!createdSessionId) assert.fail('No session created in B01');
    // First create a real session in DB
    const state = await get('/api/state'); // This syncs JSONL to DB
    const project = state.body.projects.find(p => p.name === testProject);
    if (!project || project.sessions.length === 0) assert.fail('No project or sessions available');

    const sessionId = project.sessions[0].id;
    const configRes = await put(`/api/sessions/${sessionId}/config`, {
      name: 'Test Config',
      state: 'active',
      model_override: 'claude-opus-4-6',
      notes: 'Test notes',
    });
    assert.strictEqual(configRes.status, 200);

    const getRes = await get(`/api/sessions/${sessionId}/config`);
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.body.name, 'Test Config');
    assert.strictEqual(getRes.body.model_override, 'claude-opus-4-6');
    assert.strictEqual(getRes.body.notes, 'Test notes');

    // Clean up
    await put(`/api/sessions/${sessionId}/config`, { name: null, model_override: null, notes: '' });
  });

  it('B05: Archive session', async () => {
    const state = await get('/api/state');
    const project = state.body.projects.find(p => p.name === testProject);
    if (!project || project.sessions.length === 0) assert.fail('No project or sessions available');

    const sessionId = project.sessions[0].id;
    const res = await put(`/api/sessions/${sessionId}/archive`, { archived: true });
    assert.strictEqual(res.status, 200);

    const config = await get(`/api/sessions/${sessionId}/config`);
    assert.ok(config.body.state === 'archived');

    // Unarchive
    await put(`/api/sessions/${sessionId}/archive`, { archived: false });
  });

  it('B06: Rename session', async () => {
    const state = await get('/api/state');
    const project = state.body.projects.find(p => p.name === testProject);
    if (!project || project.sessions.length === 0) assert.fail('No project or sessions available');

    const sessionId = project.sessions[0].id;
    const originalName = project.sessions[0].name;

    const res = await put(`/api/sessions/${sessionId}/name`, { name: 'Renamed Test' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.name, 'Renamed Test');

    // Restore
    await put(`/api/sessions/${sessionId}/name`, { name: originalName });
  });

  it('B07: Create session — missing project returns 400', async () => {
    const res = await post('/api/sessions', {});
    assert.strictEqual(res.status, 400);
  });

  it('B08: Rename — missing name returns 400', async () => {
    const res = await put('/api/sessions/fake-id/name', {});
    assert.strictEqual(res.status, 400);
  });

  it('B09: Delete — missing project returns 400', async () => {
    const res = await del('/api/sessions/fake-id', {});
    assert.strictEqual(res.status, 400);
  });

  it('B10: Config — nonexistent session returns 404', async () => {
    const res = await get('/api/sessions/nonexistent-uuid/config');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'session not found');
  });
});
