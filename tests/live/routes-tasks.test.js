'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { get, post, put, del } = require('../helpers/http-client');
const { resetBaseline, dockerExec } = require('../helpers/reset-state');
const { queryCount, queryJson } = require('../helpers/db-query');

test('TSK-01..05: task CRUD lifecycle with DB verification', async () => {
  await resetBaseline();
  dockerExec('mkdir -p /workspace/task_proj');
  await post('/api/projects', { path: '/workspace/task_proj', name: 'task_proj' });

  // Gray-box: count tasks before creation
  const countBefore = queryCount(
    'tasks',
    "project_id IN (SELECT id FROM projects WHERE name = 'task_proj')",
  );

  const t = await post('/api/projects/task_proj/tasks', { text: 'Task 1' });
  assert.equal(t.status, 200);
  assert.equal(t.data.status, 'todo');
  const taskId = t.data.id;

  // Gray-box: verify DB row was created
  const countAfterCreate = queryCount(
    'tasks',
    "project_id IN (SELECT id FROM projects WHERE name = 'task_proj')",
  );
  assert.equal(
    countAfterCreate,
    countBefore + 1,
    `DB task count must increment by 1 after creation (before: ${countBefore}, after: ${countAfterCreate})`,
  );

  // Gray-box: verify task status in DB after complete
  await put(`/api/tasks/${taskId}/complete`);
  const dbAfterComplete = queryJson(`SELECT status FROM tasks WHERE id = '${taskId}'`);
  assert.ok(dbAfterComplete.length > 0, 'Task must exist in DB after complete');
  assert.equal(dbAfterComplete[0].status, 'done', 'DB task status must be "done" after complete');

  // API verification
  const afterComplete = await get('/api/projects/task_proj/tasks');
  assert.equal(afterComplete.data.tasks.find((x) => x.id === taskId).status, 'done');

  // Gray-box: verify task status in DB after reopen
  await put(`/api/tasks/${taskId}/reopen`);
  const dbAfterReopen = queryJson(`SELECT status FROM tasks WHERE id = '${taskId}'`);
  assert.equal(dbAfterReopen[0].status, 'todo', 'DB task status must be "todo" after reopen');

  const afterReopen = await get('/api/projects/task_proj/tasks');
  assert.equal(afterReopen.data.tasks.find((x) => x.id === taskId).status, 'todo');

  // Gray-box: verify task is deleted from DB
  await del(`/api/tasks/${taskId}`);
  const countAfterDelete = queryCount('tasks', `id = '${taskId}'`);
  assert.equal(countAfterDelete, 0, 'Task must be deleted from DB after DELETE');

  const afterDelete = await get('/api/projects/task_proj/tasks');
  assert.equal(afterDelete.data.tasks.filter((x) => x.id === taskId).length, 0);
});
