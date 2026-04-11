/**
 * Preload script for SRV-05 test.
 * Schedules an uncaught exception after the server starts.
 * Used via NODE_OPTIONS='--require ./tests/fixtures/trigger-uncaught.js'
 */
'use strict';

setTimeout(() => {
  throw new Error('test-uncaught-exception');
}, 500);
