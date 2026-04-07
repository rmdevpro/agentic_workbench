/**
 * Live test helpers — shared utilities for integration tests.
 */

const http = require('http');

const BASE_URL = process.env.BLUEPRINT_TEST_URL || 'http://192.168.1.110:7866';

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
      timeout: 30000,
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function get(path) { return api('GET', path); }
function post(path, body) { return api('POST', path, body); }
function put(path, body) { return api('PUT', path, body); }
function del(path, body) { return api('DELETE', path, body); }

// Get a project name that exists on the server
async function getTestProject() {
  const res = await get('/api/state');
  const project = res.body.projects?.[0];
  if (!project) throw new Error('No projects available on test server');
  return project.name;
}

// Get a session ID from a project
async function getTestSession(projectName) {
  const res = await get('/api/state');
  const project = res.body.projects?.find(p => p.name === projectName);
  if (!project || project.sessions.length === 0) {
    throw new Error(`No sessions in project ${projectName}`);
  }
  return project.sessions[0];
}

module.exports = { BASE_URL, api, get, post, put, del, getTestProject, getTestSession };
