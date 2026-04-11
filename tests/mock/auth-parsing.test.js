'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fixtures = require('../fixtures/test-data');

// AUTH-ANSI tests verify the auth URL extraction logic from public/index.html.
// The extraction logic lives in the browser (checkForAuthIssue/showAuthModal functions).
// Since we cannot import browser-side JS directly, we extract and test the same algorithm
// that the application uses. The canonical source is public/index.html's checkForAuthIssue.

// This is the exact algorithm from public/index.html checkForAuthIssue:
const OAUTH_URL_START = 'https://claude.com/cai/oauth/authorize?';

function extractAuthUrl(buffer) {
  // Strip ANSI escapes — same regex as the application
  const cleanBuf = buffer.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/[\x07]/g, '');
  const urlStart = cleanBuf.indexOf(OAUTH_URL_START);
  if (urlStart === -1) return null;
  const pasteIdx = cleanBuf.indexOf('Paste', urlStart + 50);
  if (pasteIdx === -1) return null;
  const rawUrl = cleanBuf.substring(urlStart, pasteIdx);
  return rawUrl
    .replace(/[\x00-\x1f]/g, '')
    .replace(/\s+/g, '')
    .replace(/[&?]+$/, '');
}

// NOTE: This function mirrors the browser code. To verify it matches the application,
// run the browser test BRW-28 which exercises the real in-page implementation.

test('AUTH-ANSI-01: strips ANSI and extracts OAuth URL', () => {
  const input = `${fixtures.authAnsi.ansiUrl} Paste code here`;
  const url = extractAuthUrl(input);
  assert.equal(url, 'https://claude.com/cai/oauth/authorize?code=abc123');
});

test('AUTH-ANSI-02: accumulates fragmented frames', () => {
  let buf = '';
  for (const f of fixtures.authAnsi.fragmentedFrames) buf += f;
  const url = extractAuthUrl(buf);
  assert.equal(url, 'https://claude.com/cai/oauth/authorize?client=bp&code=xyz');
});

test('AUTH-ANSI-03: large prefix with buffer eviction still detects URL', () => {
  // Simulate the application's 4KB buffer retention
  const retained = fixtures.authAnsi.largePrefix.slice(-4000);
  const url = extractAuthUrl(retained);
  // The URL must be found in the retained buffer alone — no fallback to full string
  assert.equal(url, 'https://claude.com/cai/oauth/authorize?state=large');
});
