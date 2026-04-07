const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { mkdirSync, rmSync } = require('fs');

describe('Session Directory Resolution', () => {
  let safe;

  before(() => {
    process.env.CLAUDE_HOME = '/tmp/session-dirs-test-' + process.pid;
    mkdirSync(process.env.CLAUDE_HOME + '/projects', { recursive: true });

    delete require.cache[require.resolve('../../safe-exec')];
    safe = require('../../safe-exec');
  });

  after(() => {
    try { rmSync('/tmp/session-dirs-test-' + process.pid, { recursive: true, force: true }); } catch {}
  });

  it('should encode workspace path by replacing / with -', () => {
    const dir = safe.findSessionsDir('/workspace/projects/Joshua26');
    assert.ok(dir.endsWith('-workspace-projects-Joshua26'));
  });

  it('should handle root workspace path', () => {
    const dir = safe.findSessionsDir('/workspace');
    assert.ok(dir.endsWith('-workspace'));
  });

  it('should handle nested project paths', () => {
    const dir = safe.findSessionsDir('/workspace/projects/portfolio/hopper-eval');
    assert.ok(dir.endsWith('-workspace-projects-portfolio-hopper-eval'));
  });

  it('should use CLAUDE_HOME as base', () => {
    const dir = safe.findSessionsDir('/workspace/projects/test');
    assert.ok(dir.startsWith(process.env.CLAUDE_HOME));
    assert.ok(dir.includes('/projects/'));
  });
});

describe('Resolve Project Path', () => {
  let safe;

  before(() => {
    process.env.WORKSPACE = '/workspace/projects';
    delete require.cache[require.resolve('../../safe-exec')];
    safe = require('../../safe-exec');
  });

  it('should resolve relative to WORKSPACE', () => {
    const path = safe.resolveProjectPath('Joshua26');
    assert.strictEqual(path, '/workspace/projects/Joshua26');
  });

  it('should handle absolute paths', () => {
    const path = safe.resolveProjectPath('/other/path');
    assert.strictEqual(path, '/other/path');
  });
});

describe('Sanitize Tmux Name', () => {
  let safe;

  before(() => {
    delete require.cache[require.resolve('../../safe-exec')];
    safe = require('../../safe-exec');
  });

  it('should allow alphanumeric and hyphens', () => {
    assert.strictEqual(safe.sanitizeTmuxName('bp_abc-123'), 'bp_abc-123');
  });

  it('should strip special characters', () => {
    const result = safe.sanitizeTmuxName('bp_test;rm -rf /');
    assert.ok(!result.includes(';'));
    assert.ok(!result.includes(' '));
  });

  it('should handle empty string', () => {
    const result = safe.sanitizeTmuxName('');
    assert.strictEqual(typeof result, 'string');
  });
});
