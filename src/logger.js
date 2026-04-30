'use strict';

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

const rawLevel = (process.env.LOG_LEVEL || 'INFO').toUpperCase();
const _currentLevel = LOG_LEVELS[rawLevel] ?? LOG_LEVELS.INFO;

if (LOG_LEVELS[rawLevel] === undefined) {
  process.stdout.write(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'WARN',
      message: `Unrecognized LOG_LEVEL '${rawLevel}', defaulting to INFO`,
    }) + '\n',
  );
}

// #181: lazy db reference so we don't create a require cycle if db.js ever needs the
// logger and so logging works during db init / migration.
let _db = null;
let _dbWarned = false;
function _getDb() {
  if (_db) return _db;
  try {
    _db = require('./db');
  } catch (err) {
    if (!_dbWarned) {
      _dbWarned = true;
      process.stderr.write(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'WARN',
          message: 'logger SQLite sink unavailable',
          err: err.message,
        }) + '\n',
      );
    }
    return null;
  }
  return _db;
}

function _persist(entry) {
  const db = _getDb();
  if (!db || typeof db.insertLog !== 'function') return;
  try {
    const { timestamp, level, message, ...rest } = entry;
    const mod = rest.module || null;
    delete rest.module;
    const contextJson = Object.keys(rest).length ? JSON.stringify(rest) : null;
    db.insertLog(timestamp, level, mod, message, contextJson);
  } catch (err) {
    // Never throw back into the caller. One stderr line per process to avoid spam.
    if (!_persist._warned) {
      _persist._warned = true;
      process.stderr.write(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          message: 'logger persistence failed',
          err: err.message,
        }) + '\n',
      );
    }
  }
}

function emit(level, stream, message, context) {
  if (LOG_LEVELS[level] < _currentLevel) return;
  const entry = { timestamp: new Date().toISOString(), level, message };
  if (context && typeof context === 'object') {
    for (const [k, v] of Object.entries(context)) {
      if (k !== 'timestamp' && k !== 'level' && k !== 'message') {
        entry[k] = v;
      }
    }
  }
  stream.write(JSON.stringify(entry) + '\n');
  _persist(entry);
}

// #181: hourly retention sweep — bound disk to ~7 days of logs.
// Run on first call (after db is available) and every hour thereafter.
const RETENTION_MODIFIER = process.env.LOG_RETENTION || '-7 days';
const RETENTION_INTERVAL_MS = 60 * 60 * 1000;
let _cleanupTimer = null;
function _scheduleCleanup() {
  if (_cleanupTimer) return;
  _cleanupTimer = setInterval(() => {
    const db = _getDb();
    if (!db || typeof db.cleanupOldLogs !== 'function') return;
    try { db.cleanupOldLogs(RETENTION_MODIFIER); } catch { /* ignore */ }
  }, RETENTION_INTERVAL_MS);
  if (_cleanupTimer.unref) _cleanupTimer.unref();
}
_scheduleCleanup();

module.exports = {
  debug(message, context = {}) {
    emit('DEBUG', process.stdout, message, context);
  },
  info(message, context = {}) {
    emit('INFO', process.stdout, message, context);
  },
  warn(message, context = {}) {
    emit('WARN', process.stdout, message, context);
  },
  error(message, context = {}) {
    emit('ERROR', process.stderr, message, context);
  },
};
