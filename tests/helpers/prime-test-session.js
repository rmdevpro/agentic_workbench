#!/usr/bin/env node
/**
 * Prime a Blueprint test session with synthetic JSONL data.
 *
 * Usage: node prime-test-session.js <blueprint-url> <project> [target-percent] [--append <session-id>]
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');
const { randomUUID } = require('crypto');

const args = process.argv.slice(2);
const blueprintUrl = args[0];
const project = args[1];
const targetPercent = parseInt(args[2]) || 65;
const appendMode = args.includes('--append');
const appendSessionId = appendMode ? args[args.indexOf('--append') + 1] : null;

if (!blueprintUrl || !project) {
  console.error('Usage: node prime-test-session.js <blueprint-url> <project> [target-percent] [--append <session-id>]');
  process.exit(1);
}

function fetchJSON(url, opts) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function main() {
  const maxTokens = 200000;
  const targetTokens = Math.floor(maxTokens * (targetPercent / 100));
  // ~4 chars per token
  const targetChars = targetTokens * 4;

  console.log(`Target: ${targetPercent}% of ${maxTokens} tokens = ~${targetTokens} tokens (~${targetChars} chars)`);

  // Build synthetic JSONL
  let prevUuid = null;
  const lines = [];
  let totalInputTokens = 0;

  // Create a single large assistant entry to hit the target
  const userUuid = randomUUID();
  const assistUuid = randomUUID();

  lines.push(JSON.stringify({
    type: 'user',
    message: { role: 'user', content: 'Fill session to target capacity' },
    uuid: userUuid,
    parentUuid: null,
    timestamp: new Date().toISOString(),
  }));

  lines.push(JSON.stringify({
    type: 'assistant',
    message: {
      model: 'claude-sonnet-4-6',
      role: 'assistant',
      content: [{ type: 'text', text: 'x'.repeat(Math.min(targetChars, 100000)) }],
      usage: {
        input_tokens: targetTokens,
        output_tokens: 200,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    },
    uuid: assistUuid,
    parentUuid: userUuid,
    timestamp: new Date().toISOString(),
  }));

  const content = lines.join('\n') + '\n';
  const outFile = path.join(__dirname, `prime_${targetPercent}pct.jsonl`);
  fs.writeFileSync(outFile, content);
  console.log(`Wrote ${lines.length} entries to ${outFile} (${(content.length / 1024).toFixed(1)} KB)`);

  if (appendMode && appendSessionId) {
    console.log(`Append mode: inject into session ${appendSessionId}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
