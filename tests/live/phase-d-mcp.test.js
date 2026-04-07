const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const { get, post, put, getTestProject } = require('./helpers');

function mcpCall(tool, args) {
  return post('/api/mcp/call', { tool, args });
}

function mcpExternalCall(tool, args) {
  return post('/api/mcp/external/call', { tool, args });
}

describe('Phase D: MCP Tools', () => {
  let testProject;

  before(async () => {
    testProject = await getTestProject();
  });

  describe('Internal Tools', () => {
    it('D01: blueprint_list_sessions', async () => {
      const res = await mcpCall('blueprint_list_sessions', { project: testProject });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.result));
    });

    it('D02: blueprint_search_sessions', async () => {
      const res = await mcpCall('blueprint_search_sessions', { query: 'test', project: testProject });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.result));
    });

    it('D03: blueprint_get_project_notes', async () => {
      const res = await mcpCall('blueprint_get_project_notes', { project: testProject });
      assert.strictEqual(res.status, 200);
      assert.ok('notes' in res.body.result);
    });

    it('D04: blueprint_get_tasks', async () => {
      const res = await mcpCall('blueprint_get_tasks', { project: testProject });
      assert.strictEqual(res.status, 200);
      assert.ok('tasks' in res.body.result);
    });

    it('D05: blueprint_add_task', async () => {
      const res = await mcpCall('blueprint_add_task', { project: testProject, text: 'MCP test task' });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.result.id);
      assert.strictEqual(res.body.result.status, 'todo');

      // Clean up
      const tasks = await mcpCall('blueprint_get_tasks', { project: testProject });
      const task = tasks.body.result.tasks.find(t => t.text === 'MCP test task');
      if (task) await post('/api/mcp/call', { tool: 'blueprint_complete_task', args: { task_id: task.id } });
    });

    it('D06: blueprint_complete_task', async () => {
      // Add then complete
      const add = await mcpCall('blueprint_add_task', { project: testProject, text: 'To complete' });
      const res = await mcpCall('blueprint_complete_task', { task_id: add.body.result.id });
      assert.strictEqual(res.status, 200);
    });

    it('D07: blueprint_get_project_claude_md', async () => {
      const res = await mcpCall('blueprint_get_project_claude_md', { project: testProject });
      assert.strictEqual(res.status, 200);
      assert.ok('content' in res.body.result);
    });

    it('D08: blueprint_update_plan and blueprint_read_plan', async () => {
      const sessionId = 'test-plan-session';
      const writeRes = await mcpCall('blueprint_update_plan', {
        session_id: sessionId,
        project: testProject,
        content: '# Test Plan\n\nThis is a test plan.',
      });
      assert.strictEqual(writeRes.status, 200);
      assert.ok(writeRes.body.result.saved);

      const readRes = await mcpCall('blueprint_read_plan', {
        session_id: sessionId,
        project: testProject,
      });
      assert.strictEqual(readRes.status, 200);
      assert.ok(readRes.body.result.content.includes('Test Plan'));
    });

    it('D09: Unknown tool returns 404', async () => {
      const res = await mcpCall('nonexistent_tool', {});
      assert.strictEqual(res.status, 404);
    });
  });

  describe('External Admin Tools', () => {
    it('D10: blueprint_list_projects', async () => {
      const res = await mcpExternalCall('blueprint_list_projects', {});
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.result.projects));
    });

    it('D11: blueprint_update_settings', async () => {
      const res = await mcpExternalCall('blueprint_update_settings', {
        key: 'mcp_test_setting',
        value: '"mcp_test_value"',
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.result.saved);
    });

    it('D12: blueprint_set_session_state', async () => {
      // Get a real session ID first
      const state = await get('/api/state');
      const project = state.body.projects.find(p => p.name === testProject);
      if (!project || project.sessions.length === 0) assert.fail('No project or sessions available');

      const sessionId = project.sessions[0].id;
      const res = await mcpExternalCall('blueprint_set_session_state', {
        session_id: sessionId,
        state: 'active',
      });
      assert.strictEqual(res.status, 200);
    });

    it('D13: blueprint_get_token_usage', async () => {
      const state = await get('/api/state');
      const project = state.body.projects.find(p => p.name === testProject);
      if (!project || project.sessions.length === 0) assert.fail('No project or sessions available');

      const sessionId = project.sessions[0].id;
      const res = await mcpExternalCall('blueprint_get_token_usage', {
        session_id: sessionId,
        project: testProject,
      });
      assert.strictEqual(res.status, 200);
      assert.ok('input_tokens' in res.body.result);
    });

    it('D14: External unknown tool returns 404', async () => {
      const res = await mcpExternalCall('nonexistent_admin_tool', {});
      assert.strictEqual(res.status, 404);
    });
  });
});
