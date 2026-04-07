const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { mkdirSync, rmSync } = require('fs');

describe('Database Extended Operations', () => {
  let db;
  const TEST_DIR = '/tmp/db-ext-test-' + process.pid;

  before(() => {
    process.env.BLUEPRINT_DATA = TEST_DIR;
    mkdirSync(TEST_DIR, { recursive: true });
    delete require.cache[require.resolve('../../db')];
    db = require('../../db');
  });

  after(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
  });

  describe('getSessionFull', () => {
    it('should return session with project name', () => {
      const proj = db.ensureProject('fulltest', '/workspace/projects/fulltest');
      db.upsertSession('full-1', proj.id, 'Full Test Session');
      const session = db.getSessionFull('full-1');
      assert.ok(session);
      assert.strictEqual(session.name, 'Full Test Session');
      assert.strictEqual(session.project_name, 'fulltest');
    });

    it('should return undefined for nonexistent session', () => {
      const session = db.getSessionFull('nonexistent-full');
      assert.strictEqual(session, undefined);
    });
  });

  describe('archiveSession (legacy)', () => {
    it('should archive a session', () => {
      const proj = db.ensureProject('archtest', '/workspace/projects/archtest');
      db.upsertSession('arch-1', proj.id, 'Archive Test');
      db.archiveSession('arch-1', true);
      const session = db.getSession('arch-1');
      assert.strictEqual(session.archived, 1);
    });

    it('should unarchive a session', () => {
      db.archiveSession('arch-1', false);
      const session = db.getSession('arch-1');
      assert.strictEqual(session.archived, 0);
    });
  });

  describe('setSessionState', () => {
    it('should set state to hidden', () => {
      const proj = db.ensureProject('statetest', '/workspace/projects/statetest');
      db.upsertSession('state-1', proj.id, 'State Test');
      db.setSessionState('state-1', 'hidden');
      const session = db.getSession('state-1');
      assert.strictEqual(session.state, 'hidden');
    });

    it('should set state to archived and update archived flag', () => {
      db.setSessionState('state-1', 'archived');
      const session = db.getSession('state-1');
      assert.strictEqual(session.state, 'archived');
      assert.strictEqual(session.archived, 1);
    });

    it('should set state to active and clear archived flag', () => {
      db.setSessionState('state-1', 'active');
      const session = db.getSession('state-1');
      assert.strictEqual(session.state, 'active');
      assert.strictEqual(session.archived, 0);
    });
  });

  describe('deleteProject', () => {
    it('should delete project and cascade sessions', () => {
      const proj = db.ensureProject('delproj', '/workspace/projects/delproj');
      db.upsertSession('del-s1', proj.id, 'Session 1');
      db.upsertSession('del-s2', proj.id, 'Session 2');
      db.addTask(proj.id, 'Task 1', 'human');

      db.deleteProject(proj.id);

      assert.strictEqual(db.getProject('delproj'), undefined);
      assert.strictEqual(db.getSession('del-s1'), undefined);
      assert.strictEqual(db.getSession('del-s2'), undefined);
      const tasks = db.getTasks(proj.id);
      assert.strictEqual(tasks.length, 0);
    });
  });

  describe('getAllSettings', () => {
    it('should return all settings with JSON parsing', () => {
      db.setSetting('test_str', JSON.stringify('hello'));
      db.setSetting('test_num', JSON.stringify(42));
      db.setSetting('test_bool', JSON.stringify(true));

      const all = db.getAllSettings();
      assert.strictEqual(all.test_str, 'hello');
      assert.strictEqual(all.test_num, 42);
      assert.strictEqual(all.test_bool, true);
    });
  });

  describe('Messages', () => {
    it('should get unread messages for specific session', () => {
      const proj = db.ensureProject('msgtest', '/workspace/projects/msgtest');
      db.sendMessage(proj.id, 'session-a', 'session-b', 'Hello B');
      db.sendMessage(proj.id, 'session-a', 'session-c', 'Hello C');

      const unread = db.getUnreadMessages(proj.id, 'session-b');
      assert.ok(unread.length >= 1);
      assert.ok(unread.some(m => m.content === 'Hello B'));
    });

    it('should mark message as read', () => {
      const proj = db.getProject('msgtest');
      const msgs = db.getRecentMessages(proj.id);
      const msg = msgs[0];
      db.markMessageRead(msg.id);
      // After marking read, unread should not include it
      const unread = db.getUnreadMessages(proj.id, msg.to_session);
      assert.ok(!unread.some(m => m.id === msg.id));
    });
  });

  describe('WAL and Foreign Keys', () => {
    it('should have WAL journal mode', () => {
      // The db module sets WAL on initialization
      // We verify by checking the pragma
      const result = db.db.pragma('journal_mode');
      assert.strictEqual(result[0].journal_mode, 'wal');
    });

    it('should have foreign keys enabled', () => {
      const result = db.db.pragma('foreign_keys');
      assert.strictEqual(result[0].foreign_keys, 1);
    });
  });
});
