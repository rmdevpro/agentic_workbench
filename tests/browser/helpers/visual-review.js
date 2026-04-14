#!/usr/bin/env node
/**
 * Visual review of browser test screenshots.
 *
 * Reads test code to understand what each test verifies,
 * then examines screenshots for visual correctness.
 *
 * Usage: node visual-review.js [screenshot-dir] [test-dir]
 *
 * Designed to be run with a lightweight model (Haiku) via:
 *   claude --model haiku --dangerously-skip-permissions -p "$(cat visual-review-prompt.txt)"
 *
 * Per WPR-105 §4.5: Visual verification for browser tests.
 */

const { readdirSync, readFileSync } = require('fs');
const { join, basename } = require('path');

// Pass a specific run dir, or find the latest run
const config = (() => { try { return JSON.parse(require('fs').readFileSync(join(__dirname, '..', '..', '..', 'config', 'defaults.json'), 'utf-8')); } catch { return {}; } })();
const STORAGE_BASE = config.testResultsDir || (process.platform === 'win32' ? 'Z:\\test-results' : '/mnt/workspace/.test-results');
const RUNS_DIR = join(STORAGE_BASE, 'test-results', 'blueprint');
function latestRun() {
  try {
    const runs = readdirSync(RUNS_DIR).sort().reverse();
    return runs[0] ? join(RUNS_DIR, runs[0], 'screenshots') : null;
  } catch { return null; }
}
const SCREENSHOT_DIR = process.argv[2] || latestRun() || join(RUNS_DIR, 'latest', 'screenshots');
const TEST_DIR = process.argv[3] || join(__dirname, '..');

// Generic visual checklist (from WPR-105 §4.5)
const VISUAL_CHECKLIST = `
Check each screenshot for these problems regardless of test intent:
- Broken layout (overlapping, clipped, or missing elements)
- Wrong font sizes (too big, too small, inconsistent with settings)
- Error messages visible in terminal, status bar, or console
- Modals or overlays blocking content when they shouldn't be
- Test data pollution (junk project names, orphaned sessions, debug text)
- Empty areas where content should exist
- Unreadable text (contrast, color, truncation hiding meaning)
- Scrollbars where there shouldn't be, or missing where needed
- Inconsistent theme (dark elements in light theme or vice versa)
`;

function getScreenshots() {
  try {
    return readdirSync(SCREENSHOT_DIR).filter(f => f.endsWith('.png')).sort();
  } catch {
    console.error(`Cannot read screenshot dir: ${SCREENSHOT_DIR}`);
    return [];
  }
}

function getTestFiles() {
  try {
    return readdirSync(TEST_DIR).filter(f => f.startsWith('phase-h-') && f.endsWith('.test.js'));
  } catch {
    return [];
  }
}

function buildPrompt() {
  const screenshots = getScreenshots();
  const testFiles = getTestFiles();

  if (screenshots.length === 0) {
    console.error('No screenshots found.');
    process.exit(1);
  }

  let prompt = `# Visual Review of ${screenshots.length} Browser Test Screenshots\n\n`;
  prompt += `## Instructions\n\n`;
  prompt += `For each screenshot, read the corresponding test code to understand what the test verifies. `;
  prompt += `Then examine the screenshot and check:\n`;
  prompt += `1. Does the visual match what the test claims to verify?\n`;
  prompt += `2. Are there any generic visual problems?\n\n`;
  prompt += `## Generic Visual Checklist\n${VISUAL_CHECKLIST}\n`;
  prompt += `## Rating\nRate each: OK, WARNING, or PROBLEM.\n\n`;
  prompt += `## Test Files\nRead these to understand test intent:\n`;
  testFiles.forEach(f => { prompt += `- ${join(TEST_DIR, f)}\n`; });
  prompt += `\n## Screenshots to Review\n`;
  prompt += `Directory: ${SCREENSHOT_DIR}\n\n`;
  screenshots.forEach(f => { prompt += `- ${f}\n`; });
  prompt += `\n## Output Format\nFor each screenshot:\n`;
  prompt += `| Screenshot | Rating | Notes |\n|---|---|---|\n`;

  return prompt;
}

console.log(buildPrompt());
