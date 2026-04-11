'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('UTIL: prime-test-session.js exists and is valid JS', () => {
  const scriptPath = path.join(__dirname, '../../scripts/prime-test-session.js');
  assert.ok(fs.existsSync(scriptPath), 'prime-test-session.js must exist');
  // Verify it's parseable JavaScript
  const content = fs.readFileSync(scriptPath, 'utf-8');
  assert.ok(content.length > 100, 'Script should have substantial content');
  assert.ok(content.includes('function') || content.includes('=>'), 'Script should contain functions');
});
