#!/usr/bin/env node
/**
 * Blueprint MCP Server (stdio transport)
 *
 * Exposes Blueprint tools to Claude CLI via the MCP protocol.
 * Communicates with the Blueprint HTTP API on localhost.
 */

const http = require('http');
const readline = require('readline');

const BLUEPRINT_PORT = process.env.BLUEPRINT_PORT || 3000;
const BASE_URL = `http://localhost:${BLUEPRINT_PORT}`;

// ── JSON-RPC helpers ───────────────────────────────────────────────────────

function sendResponse(id, result) {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, result });
  process.stdout.write(msg + '\n');
}

function sendError(id, code, message) {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
  process.stdout.write(msg + '\n');
}

function sendNotification(method, params) {
  const msg = JSON.stringify({ jsonrpc: '2.0', method, params });
  process.stdout.write(msg + '\n');
}

// ── HTTP client to Blueprint API ───────────────────────────────────────────

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Tool definitions ───────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'blueprint_search_sessions',
    description: 'Search across all Blueprint session conversations for a keyword or phrase. Returns matching sessions with context snippets.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        project: { type: 'string', description: 'Optional: limit to a specific project' },
      },
      required: ['query'],
    },
  },
  {
    name: 'blueprint_summarize_session',
    description: 'Get an AI-generated summary of a session: what was discussed, accomplished, and current state.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Session UUID' },
        project: { type: 'string', description: 'Project name' },
      },
      required: ['session_id', 'project'],
    },
  },
  {
    name: 'blueprint_list_sessions',
    description: 'List all sessions for a project with names, timestamps, and message counts.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name' },
      },
      required: ['project'],
    },
  },
  {
    name: 'blueprint_get_project_notes',
    description: 'Read the shared project notes.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name' },
      },
      required: ['project'],
    },
  },
  {
    name: 'blueprint_get_session_notes',
    description: 'Read a session\'s private notes.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Session UUID' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'blueprint_get_tasks',
    description: 'List all tasks for a project. Returns task text, status (todo/done), and who created it.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name' },
      },
      required: ['project'],
    },
  },
  {
    name: 'blueprint_add_task',
    description: 'Add a task to the shared project task list.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name' },
        text: { type: 'string', description: 'Task description' },
      },
      required: ['project', 'text'],
    },
  },
  {
    name: 'blueprint_complete_task',
    description: 'Mark a task as done.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'Task ID' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'blueprint_get_project_claude_md',
    description: 'Read a project\'s CLAUDE.md file (project-specific instructions).',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name' },
      },
      required: ['project'],
    },
  },
  {
    name: 'blueprint_read_plan',
    description: 'Read a session\'s plan file. Plan files contain resume instructions, TODO lists, and required readings for context recovery.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Session UUID' },
        project: { type: 'string', description: 'Project name' },
      },
      required: ['session_id', 'project'],
    },
  },
  {
    name: 'blueprint_update_plan',
    description: 'Write or update a session\'s plan file. Include resume notes, TODO list, required readings, and any context needed for recovery after compaction.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Session UUID' },
        project: { type: 'string', description: 'Project name' },
        content: { type: 'string', description: 'Full plan file content (markdown)' },
      },
      required: ['session_id', 'project', 'content'],
    },
  },
  {
    name: 'blueprint_smart_compaction',
    description: 'Run smart compaction on a session. This: (1) updates the plan file with resume notes and current state, (2) triggers /compact, (3) after compaction feeds key documents back and tells the session to resume. Call this proactively before hitting context limits.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Session UUID (defaults to current session if omitted)' },
        project: { type: 'string', description: 'Project name' },
      },
      required: ['project'],
    },
  },
  {
    name: 'blueprint_ask_quorum',
    description: 'Ask a question to a multi-model quorum. Multiple junior models answer independently, then a lead model synthesizes. Returns file paths to all responses and the lead synthesis. Use mode "new" for a fresh quorum or "resume" to follow up on a previous round.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question or prompt for the quorum' },
        project: { type: 'string', description: 'Project name (CWD context)' },
        mode: { type: 'string', enum: ['new', 'resume'], description: 'new = fresh quorum, resume = follow up on previous round (default: new)' },
      },
      required: ['question', 'project'],
    },
  },
  {
    name: 'blueprint_send_message',
    description: 'Send a message to another session. The content is written to a file and the file path is sent to the target session, which reads it automatically. Use this for cross-session communication — especially for large content that should not be sent inline.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name' },
        to_session: { type: 'string', description: 'Target session UUID' },
        content: { type: 'string', description: 'Message content (can be large — written to file)' },
      },
      required: ['project', 'to_session', 'content'],
    },
  },
];

// ── Tool execution ─────────────────────────────────────────────────────────

async function executeTool(name, args) {
  const result = await apiCall('POST', '/api/mcp/call', { tool: name, args });
  if (result.error) throw new Error(result.error);
  return result.result;
}

// ── MCP message handler ────────────────────────────────────────────────────

async function handleMessage(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case 'initialize':
      sendResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'blueprint', version: '0.1.0' },
      });
      break;

    case 'notifications/initialized':
      // No response needed for notifications
      break;

    case 'tools/list':
      sendResponse(id, { tools: TOOLS });
      break;

    case 'tools/call': {
      const { name, arguments: args } = params;
      try {
        const result = await executeTool(name, args || {});
        sendResponse(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        });
      } catch (err) {
        sendResponse(id, {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        });
      }
      break;
    }

    default:
      if (id) sendError(id, -32601, `Method not found: ${method}`);
  }
}

// ── stdio transport ────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin });

rl.on('line', (line) => {
  try {
    const msg = JSON.parse(line);
    handleMessage(msg).catch((err) => {
      if (msg.id) sendError(msg.id, -32603, err.message);
    });
  } catch {
    // Ignore unparseable lines
  }
});

process.stderr.write('[blueprint-mcp] MCP server started (stdio)\n');
