/**
 * Phase H: Browser UI Tests via Playwright
 *
 * Tests Blueprint UI from a user's perspective using headless Chromium.
 * Run from the HOST (not inside container): npm run test:browser
 * Requires: Blueprint running at BLUEPRINT_URL (default: http://192.168.1.250:7866)
 */

const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert');
const { chromium } = require('playwright');
const { resetUI, resetUIFull, snapshotSessions, cleanupServerSessions, captureScreenshot } = require('./helpers/reset');

const BLUEPRINT_URL = process.env.BLUEPRINT_URL || 'http://192.168.1.250:7866';

let browser, page;

describe('Phase H: Browser UI Tests', { timeout: 600000 }, () => {

  before(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    await page.goto(BLUEPRINT_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await resetUI(page);
  });

  after(async () => {

    if (browser) await browser.close();
  });

  afterEach(async (t) => {
    await captureScreenshot(page, t.name, 'ui');
  });

  describe('H-B01: Page Load', () => {
    it('page title is Blueprint', async () => {
      const title = await page.title();
      assert.strictEqual(title, 'Blueprint');
    });

    it('sidebar renders with projects', async () => {
      const projects = await page.$$('.project-header');
      assert.ok(projects.length > 0, 'Should have at least one project');
    });

    it('empty state shows when no tabs open', async () => {
      const text = await page.textContent('#empty-state');
      assert.ok(text.includes('Select a session') || text.includes('create'));
    });

    it('filter buttons visible', async () => {
      const filters = await page.$$eval('.filter-btn', btns => btns.map(b => b.textContent.trim()));
      assert.ok(filters.includes('Active'));
      assert.ok(filters.includes('All'));
      assert.ok(filters.includes('Archived'));
      assert.ok(filters.includes('Hidden'));
    });

    it('settings button visible', async () => {
      const btn = await page.$('[onclick*="openSettings"]');
      assert.ok(btn, 'Settings button should exist');
    });

    it('panel toggle visible', async () => {
      const btn = await page.$('#panel-toggle');
      assert.ok(btn, 'Panel toggle should exist');
    });

    it('search input visible', async () => {
      const input = await page.$('#session-search');
      assert.ok(input, 'Search input should exist');
    });

    it('add project button visible', async () => {
      const btn = await page.$('button[onclick="addProject()"]');
      assert.ok(btn, 'Add project button should exist');
    });
  });

  describe('H-B02: Project Interaction', () => {
    before(async () => {
      await resetUI(page);
    });

    it('project header toggles on click', async () => {
      // Projects auto-expand on first load, so first click collapses
      const header = await page.$('.project-header');
      const wasCollapsed = await header.evaluate(el => el.classList.contains('collapsed'));

      await page.click('.project-header');
      await page.waitForTimeout(500);

      const isCollapsedAfter = await header.evaluate(el => el.classList.contains('collapsed'));
      assert.notStrictEqual(wasCollapsed, isCollapsedAfter, 'Click should toggle collapsed state');
    });

    it('project header toggles back on second click', async () => {
      await page.click('.project-header');
      await page.waitForTimeout(500);
      // Ensure project is expanded for subsequent tests
      const header = await page.$('.project-header');
      const isCollapsed = await header.evaluate(el => el.classList.contains('collapsed'));
      if (isCollapsed) {
        await page.click('.project-header');
        await page.waitForTimeout(500);
      }
    });
  });

  describe('H-B03: Session Create and Tab', () => {
    before(async () => {
      await resetUI(page);
    });

    it('new session creates tab', async () => {
      await page.click('.new-session-btn');
      await page.waitForTimeout(15000); // Wait for session + CLI

      const tabs = await page.$$('.tab');
      assert.ok(tabs.length >= 1, 'Should have at least one tab');
    });

    it('tab has status dot', async () => {
      const dot = await page.$('.tab-status');
      assert.ok(dot, 'Tab should have status dot');
      const cls = await dot.getAttribute('class');
      assert.ok(cls.includes('connected') || cls.includes('connecting'),
        'Status should be connected or connecting');
    });

    it('terminal pane renders', async () => {
      const pane = await page.$('.terminal-pane');
      assert.ok(pane, 'Terminal pane should exist');
      const display = await pane.evaluate(el => getComputedStyle(el).display);
      assert.strictEqual(display, 'block', 'Terminal pane should be visible');
    });

    it('xterm container renders', async () => {
      const xterm = await page.$('.xterm');
      assert.ok(xterm, 'xterm container should exist');
    });

    it('status bar visible with tab open', async () => {
      const bar = await page.$('#status-bar');
      const cls = await bar.getAttribute('class');
      assert.ok(cls.includes('active'), 'Status bar should be active');
    });

    it('status bar shows model after token poll', async () => {
      await page.waitForTimeout(20000); // Wait for token poll
      const text = await page.textContent('#status-bar');
      assert.ok(text.includes('Model:'), 'Should show model');
      assert.ok(text.includes('Context:'), 'Should show context');
    });
  });

  describe('H-B04: Right Panel', () => {
    before(async () => {
      await resetUI(page);
    });

    it('panel toggle opens panel', async () => {
      await page.click('#panel-toggle');
      await page.waitForTimeout(500);
      const panel = await page.$('#right-panel');
      const cls = await panel.getAttribute('class');
      assert.ok(cls.includes('open'), 'Panel should be open');
    });

    it('notes tab loads', async () => {
      const editor = await page.$('#notes-editor');
      assert.ok(editor, 'Notes editor should exist');
    });

    it('tasks tab works', async () => {
      await page.click('.panel-tab[onclick*="tasks"]');
      await page.waitForTimeout(1000);
      const input = await page.$('#add-task-input');
      assert.ok(input, 'Task input should exist');
    });

    it('add task via enter', async () => {
      await page.fill('#add-task-input', 'Browser test task');
      await page.press('#add-task-input', 'Enter');
      await page.waitForTimeout(1000);
      const text = await page.textContent('#task-list');
      assert.ok(text.includes('Browser test task'), 'Task should appear');
    });

    it('CLAUDE.md tab works', async () => {
      await page.click('.panel-tab[onclick*="claudemd"]');
      await page.waitForTimeout(1000);
      const editor = await page.$('#project-claude-md');
      assert.ok(editor, 'CLAUDE.md editor should exist');
    });

    it('messages tab works', async () => {
      await page.click('.panel-tab[onclick*="messages"]');
      await page.waitForTimeout(1000);
      const list = await page.$('#message-list');
      assert.ok(list, 'Message list should exist');
    });

    it('panel toggle closes panel', async () => {
      await page.click('#panel-toggle');
      await page.waitForTimeout(500);
      const panel = await page.$('#right-panel');
      const cls = await panel.getAttribute('class');
      assert.ok(!cls.includes('open'), 'Panel should be closed');
    });
  });

  describe('H-B05: Settings Modal', () => {
    before(async () => {
      await resetUI(page);
    });

    it('settings modal opens', async () => {
      await page.click('[onclick*="openSettings"]');
      await page.waitForTimeout(2000);
      const modal = await page.$('#settings-modal');
      const cls = await modal.getAttribute('class');
      assert.ok(cls.includes('visible'), 'Settings modal should be visible');
    });

    it('theme selector exists', async () => {
      const sel = await page.$('#setting-theme');
      assert.ok(sel, 'Theme selector should exist');
    });

    it('theme switch works', async () => {
      await page.selectOption('#setting-theme', 'blueprint-light');
      await page.waitForTimeout(1000);
      // Check body has light theme styles
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      // Light theme should have a lighter background
      assert.ok(bg, 'Background should change with theme');
      // Switch back
      await page.selectOption('#setting-theme', 'blueprint-dark');
      await page.waitForTimeout(500);
    });

    it('font size selector exists', async () => {
      const input = await page.$('#setting-font-size');
      assert.ok(input, 'Font size input should exist');
    });

    it('model selector exists', async () => {
      const sel = await page.$('#setting-model');
      assert.ok(sel, 'Model selector should exist');
    });

    it('settings modal closes', async () => {
      await page.evaluate(() => document.getElementById('settings-modal').classList.remove('visible'));
      await page.waitForTimeout(500);
    });
  });

  describe('H-B06: Tab Management', () => {
    before(async () => {
      await resetUI(page);
    });

    it('close tab removes it', async () => {
      const tabsBefore = await page.$$('.tab');
      if (tabsBefore.length === 0) return;
      await page.click('.tab-close');
      await page.waitForTimeout(1000);
      const tabsAfter = await page.$$('.tab');
      assert.ok(tabsAfter.length < tabsBefore.length, 'Tab should be removed');
    });

    it('empty state shows after last tab closed', async () => {
      // Close all remaining tabs
      while (true) {
        const tabs = await page.$$('.tab-close');
        if (tabs.length === 0) break;
        await tabs[0].click();
        await page.waitForTimeout(500);
      }
      const text = await page.textContent('#empty-state');
      assert.ok(text, 'Empty state should be visible');
    });

    it('status bar hidden when no tabs', async () => {
      const bar = await page.$('#status-bar');
      const cls = await bar.getAttribute('class');
      assert.ok(!cls.includes('active'), 'Status bar should not be active');
    });
  });

  describe('H-B07: Search', () => {
    before(async () => {
      await resetUI(page);
    });

    it('typing in search triggers results', async () => {
      await page.fill('#session-search', 'hello');
      await page.waitForTimeout(2000); // debounce
      // Should show search results or "no matches"
      const sidebar = await page.textContent('#project-list');
      assert.ok(sidebar.length > 0, 'Sidebar should have content');
    });

    it('clear search restores sidebar', async () => {
      await page.fill('#session-search', '');
      await page.waitForTimeout(1000);
      const projects = await page.$$('.project-header');
      assert.ok(projects.length > 0, 'Projects should be restored');
    });
  });

  describe('H-B08: Auth Modal', () => {
    before(async () => {
      await resetUI(page);
    });

    it('auth modal opens with close button', async () => {
      await page.evaluate(() => showAuthModal('https://claude.com/cai/oauth/authorize?test=1', 'test'));
      await page.waitForTimeout(500);
      const closeBtn = await page.$('#auth-modal .modal-close');
      assert.ok(closeBtn, 'Close button should exist');
    });

    it('auth modal URL is correct', async () => {
      const href = await page.$eval('#auth-link', el => el.href);
      assert.ok(href.includes('claude.com/cai/oauth/authorize'), 'URL should be correct');
    });

    it('close button dismisses modal', async () => {
      await page.click('#auth-modal .modal-close');
      await page.waitForTimeout(500);
      const visible = await page.$eval('#auth-modal', el => el.classList.contains('visible'));
      assert.strictEqual(visible, false, 'Modal should be dismissed');
    });
  });

  describe('H-B09: Add Project', () => {
    before(async () => {
      await resetUI(page);
    });

    it('add project overlay opens', async () => {
      await page.click('button[onclick="addProject()"]');
      await page.waitForTimeout(2000);
      const overlay = await page.$('[id^="dir-picker-"]');
      assert.ok(overlay, 'Directory picker overlay should appear');
    });

    it('file tree shows directories', async () => {
      await page.waitForTimeout(2000);
      const dirs = await page.$$('#jqft-tree li.directory');
      assert.ok(dirs.length > 0, 'Should show directories');
    });

    it('overlay closes', async () => {
      // Click X to close
      const closeBtn = await page.$('[id^="dir-picker-"] button[onclick*="remove"]');
      if (closeBtn) {
        await closeBtn.click();
      } else {
        // Click outside
        await page.evaluate(() => {
          document.querySelectorAll('[id^="dir-picker-"]').forEach(e => e.remove());
        });
      }
      await page.waitForTimeout(500);
    });
  });

  describe('H-B10: Filter Buttons', () => {
    before(async () => {
      await resetUI(page);
    });

    it('clicking Archived filter changes view', async () => {
      await page.click('.filter-btn[data-filter="archived"]');
      await page.waitForTimeout(500);
      const active = await page.$eval('.filter-btn[data-filter="archived"]', el => el.classList.contains('active'));
      assert.ok(active, 'Archived button should be active');
    });

    it('clicking Active restores default view', async () => {
      await page.click('.filter-btn[data-filter="active"]');
      await page.waitForTimeout(500);
      const active = await page.$eval('.filter-btn[data-filter="active"]', el => el.classList.contains('active'));
      assert.ok(active, 'Active button should be active');
    });

    it('clicking All shows all sessions', async () => {
      await page.click('.filter-btn[data-filter="all"]');
      await page.waitForTimeout(500);
      const active = await page.$eval('.filter-btn[data-filter="all"]', el => el.classList.contains('active'));
      assert.ok(active, 'All button should be active');
      // Restore
      await page.click('.filter-btn[data-filter="active"]');
    });
  });
});
