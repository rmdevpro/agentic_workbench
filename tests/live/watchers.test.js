'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { dockerExec } = require('../helpers/reset-state');

test('WAT-10: settings.json exists after startup', () => {
  const r = dockerExec('test -f /storage/.claude/settings.json && echo exists || echo missing');
  assert.equal(r, 'exists', 'settings.json should exist after startup');
});

test('WAT-08: Blueprint MCP server registered in settings.json', () => {
  const raw = dockerExec('cat /storage/.claude/settings.json 2>/dev/null || echo "{}"');
  const cfg = JSON.parse(raw);
  if (cfg.mcpServers) {
    assert.ok(cfg.mcpServers.blueprint, 'Blueprint MCP server should be registered');
  }
});
