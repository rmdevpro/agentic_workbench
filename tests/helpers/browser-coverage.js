'use strict';

/**
 * Client-side JS coverage collection via Chromium's page.coverage API.
 *
 * Usage in browser tests:
 *   const { startCoverage, stopCoverage, writeCoverageReport } = require('../helpers/browser-coverage');
 *
 *   before(async () => { ... });
 *   beforeEach(async () => { await startCoverage(page); });
 *   afterEach(async () => { await stopCoverage(page); });
 *   after(async () => { await writeCoverageReport(); });
 *
 * §18.0 requires page.coverage.startJSCoverage() / stopJSCoverage() to measure
 * which client-side functions/handlers were exercised during Gate C.
 */

const fs = require('fs');
const path = require('path');

const COVERAGE_DIR = path.join(__dirname, '..', '..', 'coverage', 'browser');
const allEntries = [];

async function startCoverage(page) {
  try {
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
  } catch {
    /* coverage API may not be available in all contexts */
  }
}

async function stopCoverage(page) {
  try {
    const entries = await page.coverage.stopJSCoverage();
    allEntries.push(...entries);
  } catch {
    /* coverage API may not be available in all contexts */
  }
}

/**
 * Aggregate collected coverage entries and write a report.
 * Filters to only include entries from the application (index.html inline scripts).
 */
async function writeCoverageReport(suiteName = 'browser') {
  fs.mkdirSync(COVERAGE_DIR, { recursive: true });

  // Filter to application JS (inline scripts from index.html)
  const appEntries = allEntries.filter(
    (e) => e.url && (e.url.includes('/') || e.url.includes('index.html')),
  );

  // Calculate coverage stats
  let totalBytes = 0;
  let usedBytes = 0;
  const functionsCovered = new Set();
  const functionsTotal = new Set();

  for (const entry of appEntries) {
    if (!entry.ranges || !entry.text) continue;
    totalBytes += entry.text.length;
    for (const range of entry.ranges) {
      usedBytes += range.end - range.start;
    }

    // Extract function names from the source to identify covered functions
    const funcRegex = /function\s+(\w+)\s*\(/g;
    let match;
    while ((match = funcRegex.exec(entry.text)) !== null) {
      const funcName = match[1];
      functionsTotal.add(funcName);
      // Check if function body start is within a covered range
      const funcOffset = match.index;
      for (const range of entry.ranges) {
        if (funcOffset >= range.start && funcOffset < range.end) {
          functionsCovered.add(funcName);
          break;
        }
      }
    }
  }

  const coveragePercent = totalBytes > 0 ? ((usedBytes / totalBytes) * 100).toFixed(1) : '0.0';

  // Critical frontend functions per reviewer requirements
  const criticalFunctions = [
    'loadState',
    'renderSidebar',
    'connectTab',
    'checkForAuthIssue',
    'showAuthModal',
    'submitAuthCode',
    'applyTheme',
    'saveSetting',
    'pollTokenUsage',
    'updateStatusBar',
    'switchPanel',
    'togglePanel',
    'checkAuth',
    'openSession',
    'createSession',
  ];

  const criticalReport = criticalFunctions.map((fn) => ({
    function: fn,
    covered: functionsCovered.has(fn),
    exists: functionsTotal.has(fn),
  }));

  const report = {
    suite: suiteName,
    timestamp: new Date().toISOString(),
    totalEntries: appEntries.length,
    totalBytes,
    usedBytes,
    coveragePercent: parseFloat(coveragePercent),
    functionsTotal: functionsTotal.size,
    functionsCovered: functionsCovered.size,
    functionCoveragePercent:
      functionsTotal.size > 0
        ? parseFloat(((functionsCovered.size / functionsTotal.size) * 100).toFixed(1))
        : 0,
    criticalFunctions: criticalReport,
    coveredFunctions: [...functionsCovered].sort(),
    uncoveredFunctions: [...functionsTotal].filter((f) => !functionsCovered.has(f)).sort(),
  };

  const reportPath = path.join(COVERAGE_DIR, `${suiteName}-coverage.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Human-readable summary
  const summaryLines = [
    `# Client-Side JS Coverage Report — ${suiteName}`,
    `Generated: ${report.timestamp}`,
    '',
    `## Summary`,
    `- Byte coverage: ${report.coveragePercent}% (${usedBytes} / ${totalBytes} bytes)`,
    `- Function coverage: ${report.functionCoveragePercent}% (${functionsCovered.size} / ${functionsTotal.size} functions)`,
    '',
    `## Critical Functions`,
    ...criticalReport.map(
      (f) =>
        `- ${f.covered ? '[x]' : '[ ]'} ${f.function}${f.exists ? '' : ' (not found in source)'}`,
    ),
    '',
    `## All Covered Functions`,
    ...report.coveredFunctions.map((f) => `- ${f}`),
    '',
    `## Uncovered Functions`,
    ...report.uncoveredFunctions.map((f) => `- ${f}`),
  ];

  const summaryPath = path.join(COVERAGE_DIR, `${suiteName}-coverage.md`);
  fs.writeFileSync(summaryPath, summaryLines.join('\n'));

  return report;
}

function getCoverageEntries() {
  return allEntries;
}

module.exports = { startCoverage, stopCoverage, writeCoverageReport, getCoverageEntries };
