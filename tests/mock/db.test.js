const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { mkdirSync, rmSync } = require('fs');
const { join } = require('path');

// Set up isolated test DB in /tmp (writable by any user)
const TEST_DIR = join('/tmp', 'blueprint-test-' + process.pid);
process.env.BLUEPRINT_DATA = TEST_DIR;

describe('Database Operations', () => {
  let db;

  before(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    // Re-require db module with test path
    delete require.cache[require.resolve('../../db')];
    db = require('../../db');
  });

  after(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
  });

  describe('Projects', () => {
    it('should create a project with ensureProject', () => {
      const project = db.ensureProject('test-project', '/workspace/test-project');
      assert.ok(project);
      assert.strictEqual(project.name, 'test-project');
      assert.strictEqual(project.path, '/workspace/test-project');
      assert.ok(project.id);
    });

    it('should return existing project on duplicate ensureProject', () => {
      const p1 = db.ensureProject('test-project', '/workspace/test-project');
      const p2 = db.ensureProject('test-project', '/workspace/test-project');
      assert.strictEqual(p1.id, p2.id);
    });

    it('should get project by name', () => {
      const project = db.getProject('test-project');
      assert.ok(project);
      assert.strictEqual(project.name, 'test-project');
    });

    it('should return undefined for nonexistent project', () => {
      const project = db.getProject('nonexistent');
      assert.strictEqual(project, undefined);
    });

    it('should list all projects', () => {
      db.ensureProject('another-project', '/workspace/another');
      const projects = db.getProjects();
      assert.ok(projects.length >= 2);
    });
  });

  describe('Sessions', () => {
    it('should upsert a session', () => {
      const project = db.getProject('test-project');
      const session = db.upsertSession('sess-001', project.id, 'Test Session');
      assert.ok(session);
      assert.strictEqual(session.id, 'sess-001');
      assert.strictEqual(session.name, 'Test Session');
    });

    it('should preserve existing name on upsert', () => {
      const project = db.getProject('test-project');
      db.upsertSession('sess-001', project.id, 'Different Name');
      const session = db.getSession('sess-001');
      assert.strictEqual(session.name, 'Test Session'); // Original preserved
    });

    it('should rename a session', () => {
      db.renameSession('sess-001', 'Renamed Session');
      const session = db.getSession('sess-001');
      assert.strictEqual(session.name, 'Renamed Session');
    });

    it('should set session state', () => {
      db.setSessionState('sess-001', 'archived');
      const session = db.getSession('sess-001');
      assert.strictEqual(session.archived, 1);
    });

    it('should set model override', () => {
      db.setSessionModelOverride('sess-001', 'claude-opus-4-6');
      const full = db.getSessionFull('sess-001');
      assert.strictEqual(full.model_override, 'claude-opus-4-6');
    });

    it('should clear model override with null', () => {
      db.setSessionModelOverride('sess-001', null);
      const full = db.getSessionFull('sess-001');
      assert.strictEqual(full.model_override, null);
    });

    it('should get sessions for project', () => {
      const project = db.getProject('test-project');
      const sessions = db.getSessionsForProject(project.id);
      assert.ok(sessions.length >= 1);
    });

    it('should delete a session', () => {
      const project = db.getProject('test-project');
      db.upsertSession('sess-to-delete', project.id, 'Delete Me');
      db.deleteSession('sess-to-delete');
      const session = db.getSession('sess-to-delete');
      assert.strictEqual(session, undefined);
    });
  });

  describe('Notes', () => {
    it('should get/set project notes', () => {
      const project = db.getProject('test-project');
      db.setProjectNotes(project.id, 'Project note content');
      assert.strictEqual(db.getProjectNotes(project.id), 'Project note content');
    });

    it('should get/set session notes', () => {
      db.setSessionNotes('sess-001', 'Session note content');
      assert.strictEqual(db.getSessionNotes('sess-001'), 'Session note content');
    });

    it('should return empty string for nonexistent notes', () => {
      assert.strictEqual(db.getSessionNotes('nonexistent'), '');
    });
  });

  describe('Tasks', () => {
    it('should add a task', () => {
      const project = db.getProject('test-project');
      const task = db.addTask(project.id, 'Test task', 'human');
      assert.ok(task.id);
      assert.strictEqual(task.text, 'Test task');
      assert.strictEqual(task.status, 'todo');
    });

    it('should list tasks for project', () => {
      const project = db.getProject('test-project');
      const tasks = db.getTasks(project.id);
      assert.ok(tasks.length >= 1);
    });

    it('should complete a task', () => {
      const project = db.getProject('test-project');
      const tasks = db.getTasks(project.id);
      db.completeTask(tasks[0].id);
      const updated = db.getTasks(project.id);
      assert.strictEqual(updated[0].status, 'done');
      assert.ok(updated[0].completed_at);
    });

    it('should reopen a task', () => {
      const project = db.getProject('test-project');
      const tasks = db.getTasks(project.id);
      db.reopenTask(tasks[0].id);
      const updated = db.getTasks(project.id);
      assert.strictEqual(updated[0].status, 'todo');
      assert.strictEqual(updated[0].completed_at, null);
    });

    it('should delete a task', () => {
      const project = db.getProject('test-project');
      const before = db.getTasks(project.id);
      db.deleteTask(before[0].id);
      const after = db.getTasks(project.id);
      assert.strictEqual(after.length, before.length - 1);
    });
  });

  describe('Messages', () => {
    it('should send a message', () => {
      const project = db.getProject('test-project');
      const msg = db.sendMessage(project.id, 'from-sess', 'to-sess', 'Hello');
      assert.ok(msg.id);
    });

    it('should get recent messages', () => {
      const project = db.getProject('test-project');
      const msgs = db.getRecentMessages(project.id);
      assert.ok(msgs.length >= 1);
      assert.strictEqual(msgs[0].content, 'Hello');
    });

    it('should get unread messages for session', () => {
      const project = db.getProject('test-project');
      const msgs = db.getUnreadMessages(project.id, 'to-sess');
      assert.ok(msgs.length >= 1);
    });

    it('should mark message read', () => {
      const project = db.getProject('test-project');
      const msgs = db.getUnreadMessages(project.id, 'to-sess');
      db.markMessageRead(msgs[0].id);
      const after = db.getUnreadMessages(project.id, 'to-sess');
      assert.strictEqual(after.length, msgs.length - 1);
    });
  });

  describe('Settings', () => {
    it('should get default for missing setting', () => {
      assert.strictEqual(db.getSetting('nonexistent', 'default'), 'default');
    });

    it('should set and get a setting', () => {
      db.setSetting('test_key', '"test_value"');
      assert.strictEqual(db.getSetting('test_key'), '"test_value"');
    });

    it('should get all settings', () => {
      db.setSetting('another_key', '42');
      const all = db.getAllSettings();
      assert.strictEqual(all.another_key, 42); // JSON parsed
    });

    it('should overwrite existing setting', () => {
      db.setSetting('test_key', '"updated"');
      assert.strictEqual(db.getSetting('test_key'), '"updated"');
    });
  });
});
