/**
 * Configuration loader.
 *
 * Reads defaults from config/defaults.json and prompt templates from config/prompts/.
 * Config files are read per-operation (hot-reload) per ERQ-001 §7.3.
 */

const { readFileSync } = require('fs');
const { join } = require('path');

const CONFIG_DIR = join(__dirname, 'config');
const PROMPTS_DIR = join(CONFIG_DIR, 'prompts');

/**
 * Read and parse the defaults config. Re-reads on every call (hot-reload).
 */
function getDefaults() {
  try {
    return JSON.parse(readFileSync(join(CONFIG_DIR, 'defaults.json'), 'utf-8'));
  } catch (err) {
    console.error('[config] Failed to read defaults.json:', err.message);
    return {};
  }
}

/**
 * Get a specific config value by dot-path (e.g., 'compaction.thresholds.advisory').
 * Falls back to provided default if not found.
 */
function get(path, fallback) {
  const defaults = getDefaults();
  const parts = path.split('.');
  let value = defaults;
  for (const part of parts) {
    if (value == null || typeof value !== 'object') return fallback;
    value = value[part];
  }
  return value !== undefined ? value : fallback;
}

/**
 * Read a prompt template file. Replaces {{KEY}} placeholders with values from the vars object.
 * Re-reads on every call (hot-reload).
 */
function getPrompt(name, vars = {}) {
  try {
    let content = readFileSync(join(PROMPTS_DIR, `${name}.md`), 'utf-8');
    for (const [key, value] of Object.entries(vars)) {
      content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
    }
    return content;
  } catch (err) {
    console.error(`[config] Failed to read prompt template ${name}:`, err.message);
    return '';
  }
}

module.exports = { getDefaults, get, getPrompt };
