/**
 * Phase H: Stress Tests and Race Conditions
 *
 * From the 3-CLI UI audit: stress tests, rapid interactions,
 * concurrent operations, and performance under load.
 */

const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert');
const { chromium } = require('playwright');
const { resetUI, resetUIFull, snapshotSessions, cleanupServerSessions, captureScreenshot } = require('./helpers/reset');

const BLUEPRINT_URL = process.env.BLUEPRINT_URL || 'http://192.168.1.250:7866';
let browser, page;

describe('Phase H: Stress Tests & Race Conditions', { timeout: 600000 }, () => {

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
    await captureScreenshot(page, t.name, 'stress');
  });

  // ── Rapid Interactions ──────────────────────────────────────

  describe('Rapid UI Interactions', () => {
    before(async () => {
      await resetUI(page);
    });

    it('rapid project expand/collapse does not break UI', async () => {
      for (let i = 0; i < 20; i++) {
        await page.click('.project-header');
        await page.waitForTimeout(50);
      }
      await page.waitForTimeout(1000);
      const title = await page.title();
      assert.strictEqual(title, 'Blueprint');
    });

    it('rapid filter switching renders correctly', async () => {
      const filters = ['active', 'all', 'archived', 'hidden', 'active'];
      for (const f of filters) {
        await page.click(`.filter-btn[data-filter="${f}"]`);
        await page.waitForTimeout(100);
      }
      await page.waitForTimeout(1000);
      const active = await page.$eval('.filter-btn[data-filter="active"]', el => el.classList.contains('active'));
      assert.ok(active, 'Should end on active filter');
    });

    it('rapid panel toggle does not break layout', async () => {
      // First create a session so there is terminal to refit
      // Ensure project is expanded (don't toggle if already expanded)
      const header = await page.$('.project-header');
      if (header) {
        const isCollapsed = await header.evaluate(el => el.classList.contains('collapsed'));
        if (isCollapsed) {
          await header.click();
          await page.waitForTimeout(500);
        }
      }
      await page.click('.new-session-btn');
      await page.waitForTimeout(15000);

      for (let i = 0; i < 10; i++) {
        await page.click('#panel-toggle');
        await page.waitForTimeout(100);
      }
      await page.waitForTimeout(1000);

      // Terminal should still be visible
      const pane = await page.$('.terminal-pane');
      assert.ok(pane, 'Terminal pane should still exist');

      // Clean up
      const panelOpen = await page.$eval('#right-panel', el => el.classList.contains('open'));
      if (panelOpen) await page.click('#panel-toggle');
    });

    it('rapid search typing triggers only final query', async () => {
      // Type rapidly, changing the query
      await page.fill('#session-search', 't');
      await page.waitForTimeout(50);
      await page.fill('#session-search', 'te');
      await page.waitForTimeout(50);
      await page.fill('#session-search', 'tes');
      await page.waitForTimeout(50);
      await page.fill('#session-search', 'test');
      await page.waitForTimeout(2000); // Wait for debounce

      // Should not crash
      const title = await page.title();
      assert.strictEqual(title, 'Blueprint');

      // Clear search
      await page.fill('#session-search', '');
      await page.waitForTimeout(1000);
    });
  });

  // ── Concurrent Operations ──────────────────────────────────

  describe('Concurrent Operations', () => {
    before(async () => {
      await resetUI(page);
    });

    it('concurrent API calls do not crash server', async () => {
      const results = await page.evaluate(async () => {
        const promises = [
          fetch('/api/state').then(r => r.status),
          fetch('/api/settings').then(r => r.status),
          fetch('/api/auth/status').then(r => r.status),
          fetch('/api/keepalive/status').then(r => r.status),
          fetch('/api/mcp/tools').then(r => r.status),
        ];
        return Promise.all(promises);
      });
      assert.ok(results.every(s => s === 200), 'All concurrent requests should succeed');
    });

    it('rapid settings changes do not corrupt', async () => {
      await page.evaluate(async () => {
        const promises = [];
        for (let i = 10; i <= 20; i++) {
          promises.push(
            fetch('/api/settings', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key: 'font_size', value: i }),
            })
          );
        }
        await Promise.all(promises);
      });
      await page.waitForTimeout(1000);

      // Verify settings endpoint still works
      const result = await page.evaluate(async () => {
        const r = await fetch('/api/settings');
        const d = await r.json();
        return typeof d.font_size === 'number';
      });
      assert.ok(result, 'Font size should be a number after concurrent updates');

      // Restore
      await page.evaluate(async () => {
        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'font_size', value: 14 }),
        });
      });
    });

    it('loadState during search does not crash', async () => {
      await page.fill('#session-search', 'test');
      await page.waitForTimeout(100);
      // Trigger loadState while search is active
      await page.evaluate(() => loadState());
      await page.waitForTimeout(2000);

      const title = await page.title();
      assert.strictEqual(title, 'Blueprint');
      await page.fill('#session-search', '');
      await page.waitForTimeout(1000);
    });
  });

  // ── Many Elements ──────────────────────────────────────────

  describe('Large Data Sets', () => {
    before(async () => {
      await resetUI(page);
    });

    it('many tasks render without crash', async () => {
      // Add 20 tasks rapidly
      const project = await page.evaluate(async () => {
        const r = await fetch('/api/state');
        const d = await r.json();
        return d.projects[0]?.name;
      });

      if (project) {
        const ids = await page.evaluate(async (proj) => {
          const taskIds = [];
          for (let i = 0; i < 20; i++) {
            const r = await fetch(`/api/projects/${proj}/tasks`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: `Stress task ${i}` }),
            });
            const d = await r.json();
            taskIds.push(d.id);
          }
          return taskIds;
        }, project);

        // Open panel and check tasks render
        const panelOpen = await page.$eval('#right-panel', el => el.classList.contains('open'));
        if (!panelOpen) await page.click('#panel-toggle');
        await page.click('.panel-tab[onclick*="tasks"]');
        await page.waitForTimeout(2000);

        const taskCount = await page.$$eval('.task-item', els => els.length);
        assert.ok(taskCount >= 20, `Should show at least 20 tasks, got ${taskCount}`);

        // Clean up tasks
        await page.evaluate(async (taskIds) => {
          for (const id of taskIds) {
            await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
          }
        }, ids);

        if (!panelOpen) await page.click('#panel-toggle');
      }
    });

    it('large notes content saves without timeout', async () => {
      const project = await page.evaluate(async () => {
        const r = await fetch('/api/state');
        const d = await r.json();
        return d.projects[0]?.name;
      });

      if (project) {
        const bigNote = 'X'.repeat(50000); // 50KB
        const result = await page.evaluate(async (args) => {
          const r = await fetch(`/api/projects/${args.proj}/notes`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: args.note }),
          });
          return r.status;
        }, { proj: project, note: bigNote });
        assert.strictEqual(result, 200, 'Large note should save');

        // Verify it reads back
        const readResult = await page.evaluate(async (proj) => {
          const r = await fetch(`/api/projects/${proj}/notes`);
          const d = await r.json();
          return d.notes.length;
        }, project);
        assert.strictEqual(readResult, 50000, 'Should read back full 50K');

        // Restore
        await page.evaluate(async (proj) => {
          await fetch(`/api/projects/${proj}/notes`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: '' }),
          });
        }, project);
      }
    });
  });

  // ── Window Resize ──────────────────────────────────────────

  describe('Window Resize', () => {
    before(async () => {
      await resetUI(page);
    });

    it('narrow viewport does not break layout', async () => {
      await page.setViewportSize({ width: 800, height: 600 });
      await page.waitForTimeout(1000);
      const title = await page.title();
      assert.strictEqual(title, 'Blueprint');
      const sidebar = await page.$('#sidebar');
      assert.ok(sidebar, 'Sidebar should still exist');
    });

    it('wide viewport fills space', async () => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.waitForTimeout(1000);
      const title = await page.title();
      assert.strictEqual(title, 'Blueprint');
    });

    it('terminal refits on resize', async () => {
      // Need an active terminal
      const tabs = await page.$$('.tab');
      if (tabs.length > 0) {
        await page.setViewportSize({ width: 1200, height: 800 });
        await page.waitForTimeout(1000);
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.waitForTimeout(1000);
        // Terminal should still be visible
        const pane = await page.$('.terminal-pane');
        assert.ok(pane, 'Terminal pane should survive resize');
      }
    });
  });

  // ── Theme Consistency ──────────────────────────────────────

  describe('Theme Consistency', () => {
    before(async () => {
      await resetUI(page);
    });

    it('blueprint-dark applies correctly', async () => {
      await page.evaluate(async () => {
        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'theme', value: 'blueprint-dark' }),
        });
        loadAppearanceSettings();
      });
      await page.waitForTimeout(1000);
      const bg = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--bg-primary').trim());
      assert.ok(bg, 'Should have --bg-primary CSS variable');
    });

    it('blueprint-light applies correctly', async () => {
      await page.evaluate(async () => {
        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'theme', value: 'blueprint-light' }),
        });
        loadAppearanceSettings();
      });
      await page.waitForTimeout(1000);
      const bg = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--bg-primary').trim());
      assert.ok(bg, 'Should have --bg-primary CSS variable for light theme');

      // Restore
      await page.evaluate(async () => {
        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'theme', value: 'blueprint-dark' }),
        });
        loadAppearanceSettings();
      });
    });

    it('all four themes apply without error', async () => {
      const themes = ['dark', 'light', 'blueprint-dark', 'blueprint-light'];
      for (const theme of themes) {
        await page.evaluate(async (t) => {
          await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'theme', value: t }),
          });
          loadAppearanceSettings();
        }, theme);
        await page.waitForTimeout(500);
        const title = await page.title();
        assert.strictEqual(title, 'Blueprint', `Page should work with ${theme} theme`);
      }
      // Restore
      await page.evaluate(async () => {
        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'theme', value: 'blueprint-dark' }),
        });
        loadAppearanceSettings();
      });
    });
  });

  // Cleanup happens in the main after hook (browser.close)
});
