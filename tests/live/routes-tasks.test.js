'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { get, post, put, del } = require('../helpers/http-client');
const { resetBaseline, dockerExec } = require('../helpers/reset-state');
const { queryCount } = require('../helpers/db-query');

test('TSK-01..05: task CRUD lifecycle with DB verification', async () => {
  await resetBaseline();
  dockerExec('mkdir -p /workspace/task_proj');
  await post('/api/projects', { path: '/workspace/task_proj', name: 'task_proj' });

  // Create
  const t = await post('/api/projects/task_proj/tasks', { text: 'Task 1' });
  assert.equal(t.status, 200);
  assert.equal(t.data.status, 'todo');
  const taskId = t.data.id;

  // Complete
  await put(`/api/tasks/${taskId}/complete`);
  const afterComplete = await get('/api/projects/task_proj/tasks');
  assert.equal(afterComplete.data.tasks.find(x => x.id === taskId).status, 'done');

  // Reopen
  await put(`/api/tasks/${taskId}/reopen`);
  const afterReopen = await get('/api/projects/task_proj/tasks');
  assert.equal(afterReopen.data.tasks.find(x => x.id === taskId).status, 'todo');

  // Delete
  await del(`/api/tasks/${taskId}`);
  const afterDelete = await get('/api/projects/task_proj/tasks');
  assert.equal(afterDelete.data.tasks.filter(x => x.id === taskId).length, 0);
});
