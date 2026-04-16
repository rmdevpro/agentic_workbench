'use strict';

const path = require('path');

function freshRequire(modulePath) {
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  return require(resolved);
}

function rootRequire(relativePath) {
  return freshRequire(path.join(__dirname, '..', '..', relativePath));
}

module.exports = { freshRequire, rootRequire };
