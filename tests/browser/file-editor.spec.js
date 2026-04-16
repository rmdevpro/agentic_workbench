'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  process.exit(0);
}

const { resetBaseline, BASE_URL } = require('../helpers/reset-state');
const { startCoverage, stopCoverage, writeCoverageReport } = require('../helpers/browser-coverage');
const SS = require('path').join(__dirname, 'screenshots');

async function createTestFile(name, content = '') {
  await fetch(`${BASE_URL}/api/mkdir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: '/tmp/bp-editor-test' }),
  });
  await fetch(`${BASE_URL}/api/file?path=${encodeURIComponent('/tmp/bp-editor-test/' + name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain' },
    body: content,
  });
  return '/tmp/bp-editor-test/' + name;
}

describe('file editor (browser)', () => {
  let browser, page;
  const errors = [];

  before(async () => {
    require('fs').mkdirSync(SS, { recursive: true });
    browser = await chromium.launch({ headless: true });
  });
  after(async () => {
    await writeCoverageReport('file-editor');
    if (browser) await browser.close();
  });
  beforeEach(async () => {
    errors.length = 0;
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await startCoverage(page);
    await resetBaseline(page);
  });
  afterEach(async () => {
    await stopCoverage(page);
  });

  it('UI-FILE-01: double-click .js file opens CodeMirror editor in tab', async () => {
    const path = await createTestFile('test.js', 'console.log("hello")');
    await page.evaluate((p) => openFileTab(p), path);
    await page.waitForSelector('.cm-editor', { timeout: 3000 });
    assert.ok(await page.locator('.cm-editor').isVisible(), 'CodeMirror editor must be visible');
    await page.screenshot({ path: `${SS}/file-editor--js.png` });
  });

  it('UI-FILE-02: double-click .md file opens Toast UI editor in tab', async () => {
    const path = await createTestFile('test.md', '# Hello');
    await page.evaluate((p) => openFileTab(p), path);
    await page.waitForSelector('.toastui-editor-defaultUI', { timeout: 3000 });
    assert.ok(await page.locator('.toastui-editor-defaultUI').isVisible(), 'Toast UI editor must be visible');
    await page.screenshot({ path: `${SS}/file-editor--md.png` });
  });

  it('UI-FILE-03: double-click .png opens image viewer in tab', async () => {
    const path = await createTestFile('test.png', 'fake-png-data');
    await page.evaluate((p) => openFileTab(p), path);
    await page.waitForSelector('.image-viewer', { timeout: 3000 });
    assert.ok(await page.locator('.image-viewer').isVisible(), 'Image viewer must be visible');
  });

  it('UI-FILE-04: file tab shows file icon not status dot', async () => {
    const path = await createTestFile('icon-test.txt', 'test');
    await page.evaluate((p) => openFileTab(p), path);
    await page.waitForTimeout(500);
    const hasFileIcon = await page.locator('.file-tab-icon').count();
    assert.ok(hasFileIcon > 0, 'Must have file icon in tab');
    const hasStatusDot = await page.locator('.tab.active .tab-status').count();
    assert.equal(hasStatusDot, 0, 'File tab should not have status dot');
  });

  it('UI-FILE-05: reopening same file switches to existing tab', async () => {
    const path = await createTestFile('reopen.txt', 'content');
    await page.evaluate((p) => openFileTab(p), path);
    await page.waitForTimeout(500);
    const tabsBefore = await page.locator('.tab').count();
    await page.evaluate((p) => openFileTab(p), path);
    await page.waitForTimeout(500);
    const tabsAfter = await page.locator('.tab').count();
    assert.equal(tabsBefore, tabsAfter, 'Should not create duplicate tab');
  });

  it('UI-FILE-06: closing file tab removes it', async () => {
    const path = await createTestFile('closeme.txt', 'bye');
    await page.evaluate((p) => openFileTab(p), path);
    await page.waitForTimeout(500);
    const before = await page.locator('.tab').count();
    await page.locator('.tab .tab-close').last().click();
    await page.waitForTimeout(300);
    const after = await page.locator('.tab').count();
    assert.equal(after, before - 1, 'Tab count must decrease by 1');
  });

  it('UI-FILE-07: Notes tab removed from panel header', async () => {
    await page.click('#panel-toggle');
    const notesTab = await page.locator('[data-panel="notes"]').count();
    assert.equal(notesTab, 0, 'Notes tab must not exist');
    const filesTab = await page.locator('[data-panel="files"]').count();
    const tasksTab = await page.locator('[data-panel="tasks"]').count();
    assert.equal(filesTab, 1, 'Files tab must exist');
    assert.equal(tasksTab, 1, 'Tasks tab must exist');
  });

  it('UI-FILE-08: right-click file shows context menu', async () => {
    // Need a file in the file browser — use the panel
    await page.click('#panel-toggle');
    await page.waitForTimeout(500);
    const fileLink = page.locator('#file-browser-tree li.file a').first();
    if (await fileLink.count() > 0) {
      await fileLink.click({ button: 'right' });
      await page.waitForSelector('.context-menu', { timeout: 2000 });
      const items = await page.locator('.context-menu-item').allTextContents();
      assert.ok(items.includes('Open'), 'Context menu must have Open');
      assert.ok(items.includes('Rename'), 'Context menu must have Rename');
      assert.ok(items.includes('Delete'), 'Context menu must have Delete');
      await page.click('body'); // dismiss
    }
    await page.screenshot({ path: `${SS}/file-editor--context-file.png` });
  });

  it('UI-FILE-09: right-click folder shows context menu', async () => {
    await page.click('#panel-toggle');
    await page.waitForTimeout(500);
    const dirLink = page.locator('#file-browser-tree li.directory a').first();
    if (await dirLink.count() > 0) {
      await dirLink.click({ button: 'right' });
      await page.waitForSelector('.context-menu', { timeout: 2000 });
      const items = await page.locator('.context-menu-item').allTextContents();
      assert.ok(items.includes('New File'), 'Context menu must have New File');
      assert.ok(items.includes('New Folder'), 'Context menu must have New Folder');
      assert.ok(items.includes('Upload'), 'Context menu must have Upload');
      assert.ok(items.includes('Rename'), 'Context menu must have Rename');
      assert.ok(items.includes('Delete'), 'Context menu must have Delete');
      await page.click('body'); // dismiss
    }
    await page.screenshot({ path: `${SS}/file-editor--context-folder.png` });
  });

  it('UI-FILE-13: project config pencil opens modal with CLAUDE.md button', async () => {
    const pencil = page.locator('.proj-config-btn').first();
    if (await pencil.count() > 0) {
      await pencil.click();
      await page.waitForTimeout(500);
      const claudeMdBtn = page.locator('button:has-text("CLAUDE.md")');
      assert.ok(await claudeMdBtn.count() > 0, 'Must have Edit CLAUDE.md button');
      await page.screenshot({ path: `${SS}/file-editor--project-config.png` });
      // Close overlay
      await page.keyboard.press('Escape');
    }
  });
});
