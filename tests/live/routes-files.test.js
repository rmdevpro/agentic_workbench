'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { get, post, put, del } = require('../helpers/http-client');

const BASE = '/tmp/bp-file-test-' + Date.now();

test('FILE-01: PUT /api/file saves content, GET reads it back', async () => {
  const path = BASE + '/test-save.txt';
  await post('/api/mkdir', { path: BASE });
  const saveRes = await fetch(
    `${process.env.TEST_URL || 'http://localhost:7867'}/api/file?path=${encodeURIComponent(path)}`,
    { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: 'hello world' }
  );
  assert.equal(saveRes.status, 200);
  const readRes = await get(`/api/file?path=${encodeURIComponent(path)}`);
  assert.equal(readRes.data, 'hello world');
});

test('FILE-02: GET /api/file-raw serves file', async () => {
  const path = BASE + '/test-raw.txt';
  await fetch(
    `${process.env.TEST_URL || 'http://localhost:7867'}/api/file?path=${encodeURIComponent(path)}`,
    { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: 'raw content' }
  );
  const res = await get(`/api/file-raw?path=${encodeURIComponent(path)}`);
  assert.equal(res.status, 200);
  assert.equal(res.data, 'raw content');
});

test('FILE-03: GET /api/file-raw rejects missing path', async () => {
  const res = await get('/api/file-raw');
  assert.equal(res.status, 400);
});

test('FILE-04: POST /api/file-new creates empty file', async () => {
  const path = BASE + '/new-file.md';
  const res = await post('/api/file-new', { path });
  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
  const content = await get(`/api/file?path=${encodeURIComponent(path)}`);
  assert.equal(content.data, '');
});

test('FILE-05: POST /api/file-new rejects existing file', async () => {
  const path = BASE + '/new-file.md'; // created in FILE-04
  const res = await post('/api/file-new', { path });
  assert.equal(res.status, 409);
});

test('FILE-06: PUT /api/rename renames file', async () => {
  const oldPath = BASE + '/rename-me.txt';
  const newPath = BASE + '/renamed.txt';
  await fetch(
    `${process.env.TEST_URL || 'http://localhost:7867'}/api/file?path=${encodeURIComponent(oldPath)}`,
    { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: 'rename test' }
  );
  const res = await put('/api/rename', { oldPath, newPath });
  assert.equal(res.status, 200);
  const content = await get(`/api/file?path=${encodeURIComponent(newPath)}`);
  assert.equal(content.data, 'rename test');
  const oldRes = await get(`/api/file?path=${encodeURIComponent(oldPath)}`);
  assert.equal(oldRes.status, 400); // old path gone
});

test('FILE-07: PUT /api/rename renames directory', async () => {
  const oldDir = BASE + '/dir-to-rename';
  const newDir = BASE + '/dir-renamed';
  await post('/api/mkdir', { path: oldDir });
  await fetch(
    `${process.env.TEST_URL || 'http://localhost:7867'}/api/file?path=${encodeURIComponent(oldDir + '/child.txt')}`,
    { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: 'child' }
  );
  const res = await put('/api/rename', { oldPath: oldDir, newPath: newDir });
  assert.equal(res.status, 200);
  const content = await get(`/api/file?path=${encodeURIComponent(newDir + '/child.txt')}`);
  assert.equal(content.data, 'child');
});

test('FILE-08: DELETE /api/file deletes file', async () => {
  const path = BASE + '/delete-me.txt';
  await fetch(
    `${process.env.TEST_URL || 'http://localhost:7867'}/api/file?path=${encodeURIComponent(path)}`,
    { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: 'bye' }
  );
  const res = await del(`/api/file?path=${encodeURIComponent(path)}`);
  assert.equal(res.status, 200);
  const gone = await get(`/api/file?path=${encodeURIComponent(path)}`);
  assert.equal(gone.status, 400);
});

test('FILE-09: DELETE /api/file deletes directory recursively', async () => {
  const dir = BASE + '/delete-dir';
  await post('/api/mkdir', { path: dir });
  await post('/api/mkdir', { path: dir + '/sub' });
  await fetch(
    `${process.env.TEST_URL || 'http://localhost:7867'}/api/file?path=${encodeURIComponent(dir + '/sub/file.txt')}`,
    { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: 'nested' }
  );
  const res = await del(`/api/file?path=${encodeURIComponent(dir)}`);
  assert.equal(res.status, 200);
  const gone = await get(`/api/file?path=${encodeURIComponent(dir + '/sub/file.txt')}`);
  assert.equal(gone.status, 400);
});

test('FILE-10: PUT /api/move moves file into directory', async () => {
  const file = BASE + '/movable.txt';
  const destDir = BASE + '/move-dest';
  await post('/api/mkdir', { path: destDir });
  await fetch(
    `${process.env.TEST_URL || 'http://localhost:7867'}/api/file?path=${encodeURIComponent(file)}`,
    { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: 'moved content' }
  );
  const res = await put('/api/move', { source: file, destination: destDir });
  assert.equal(res.status, 200);
  const content = await get(`/api/file?path=${encodeURIComponent(destDir + '/movable.txt')}`);
  assert.equal(content.data, 'moved content');
  const oldGone = await get(`/api/file?path=${encodeURIComponent(file)}`);
  assert.equal(oldGone.status, 400);
});
