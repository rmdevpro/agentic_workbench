const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { mkdirSync, writeFileSync, rmSync } = require('fs');
const { join } = require('path');

// Import the real executeTool from quorum.js
const { executeTool } = require('../../quorum');

describe('Quorum Junior Agent Tools', () => {
  const CWD = '/tmp/quorum-test-cwd-' + process.pid;
  const TEMP = '/tmp/quorum-test-temp-' + process.pid;

  before(() => {
    mkdirSync(CWD, { recursive: true });
    mkdirSync(join(CWD, 'src'), { recursive: true });
    mkdirSync(TEMP, { recursive: true });

    writeFileSync(join(CWD, 'README.md'), '# Test Project\n\nThis is a test.');
    writeFileSync(join(CWD, 'src', 'index.js'), 'console.log("hello");');
    writeFileSync(join(CWD, 'config.json'), '{"key": "value"}');
  });

  after(() => {
    try { rmSync(CWD, { recursive: true, force: true }); } catch {}
    try { rmSync(TEMP, { recursive: true, force: true }); } catch {}
  });

  describe('read_file', () => {
    it('should read a file from CWD', () => {
      const result = executeTool('read_file', { path: 'README.md' }, CWD, TEMP);
      assert.ok(result.includes('Test Project'));
    });

    it('should read nested files', () => {
      const result = executeTool('read_file', { path: 'src/index.js' }, CWD, TEMP);
      assert.ok(result.includes('console.log'));
    });

    it('should return error for nonexistent file', () => {
      const result = executeTool('read_file', { path: 'nonexistent.txt' }, CWD, TEMP);
      assert.ok(result.startsWith('Error: file not found'));
    });

    it('should block path traversal with specific error', () => {
      const result = executeTool('read_file', { path: '../../../etc/passwd' }, CWD, TEMP);
      assert.strictEqual(result, 'Error: path outside project directory');
    });

    it('should truncate files over 10000 chars', () => {
      const bigFile = join(CWD, 'big.txt');
      writeFileSync(bigFile, 'A'.repeat(15000));
      const result = executeTool('read_file', { path: 'big.txt' }, CWD, TEMP);
      assert.ok(result.includes('[truncated]'));
      assert.ok(result.length < 15000);
    });
  });

  describe('list_files', () => {
    it('should list root directory', () => {
      const result = executeTool('list_files', { path: '' }, CWD, TEMP);
      assert.ok(result.includes('README.md'));
      assert.ok(result.includes('[dir]'));
      assert.ok(result.includes('src'));
    });

    it('should list subdirectory', () => {
      const result = executeTool('list_files', { path: 'src' }, CWD, TEMP);
      assert.ok(result.includes('index.js'));
    });

    it('should return error for nonexistent directory', () => {
      const result = executeTool('list_files', { path: 'nonexistent' }, CWD, TEMP);
      assert.ok(result.includes('Error: cannot list'));
    });
  });

  describe('search_files', () => {
    it('should find matching content', () => {
      const result = executeTool('search_files', { pattern: 'console' }, CWD, TEMP);
      assert.ok(result.includes('index.js'));
    });

    it('should return no matches for nonexistent pattern', () => {
      const result = executeTool('search_files', { pattern: 'zzzznotfound' }, CWD, TEMP);
      assert.strictEqual(result, 'No matches found');
    });

    it('should filter by glob', () => {
      const result = executeTool('search_files', { pattern: 'console', glob: '*.js' }, CWD, TEMP);
      assert.ok(result.includes('index.js'));
    });
  });

  describe('unknown tool', () => {
    it('should return error for unknown tool name', () => {
      const result = executeTool('nonexistent_tool', {}, CWD, TEMP);
      assert.strictEqual(result, 'Unknown tool: nonexistent_tool');
    });
  });
});
