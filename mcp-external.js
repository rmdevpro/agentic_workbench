/**
 * Blueprint External MCP Server (HTTP/SSE transport).
 *
 * Exposes all internal tools plus admin tools for external consumers
 * like Hopper and the Joshua26 ecosystem.
 */

const db = require('./db');
const { readFile, writeFile, unlink, mkdir } = require('fs/promises');
const { join, basename } = require('path');
const { randomUUID } = require('crypto');
const safe = require('./safe-exec');

const CLAUDE_HOME = safe.CLAUDE_HOME;
const WORKSPACE = safe.WORKSPACE;

const ADMIN_TOOLS = [
  {
    name: 'blueprint_create_session',
    description: 'Create a new CLI session for a project. Returns session ID and tmux name.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name' },
        model: { type: 'string', description: 'Optional model override' },
      },
      required: ['project'],
    },
  },
  /* DISABLED: Hard deletion causes zombie sessions — see GitHub Issue #457
   * {
   *   name: 'blueprint_delete_session',
   *   description: 'Delete a session and its JSONL file.',
   *   inputSchema: { ... },
   * },
   */
  {
    name: 'blueprint_set_session_state',
    description: 'Change session state: active, archived, or hidden.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        state: { type: 'string', enum: ['active', 'archived', 'hidden'] },
      },
      required: ['session_id', 'state'],
    },
  },
  {
    name: 'blueprint_get_token_usage',
    description: 'Get context token usage for a session.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        project: { type: 'string' },
      },
      required: ['session_id', 'project'],
    },
  },
  {
    name: 'blueprint_set_project_notes',
    description: 'Write shared project notes.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['project', 'notes'],
    },
  },
  {
    name: 'blueprint_set_project_claude_md',
    description: 'Write a project\'s CLAUDE.md file.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['project', 'content'],
    },
  },
  {
    name: 'blueprint_list_projects',
    description: 'List all projects with session counts.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'blueprint_update_settings',
    description: 'Update a Blueprint setting.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        value: { type: 'string', description: 'JSON-encoded value' },
      },
      required: ['key', 'value'],
    },
  },
];

function registerExternalMcpRoutes(app) {

  // External MCP tool listing (internal + admin)
  app.get('/api/mcp/external/tools', async (req, res) => {
    // Get internal tools
    const internalRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/mcp/tools`);
    const internal = await internalRes.json();

    res.json({
      tools: [...(internal.tools || []), ...ADMIN_TOOLS],
    });
  });

  // External MCP tool execution
  app.post('/api/mcp/external/call', async (req, res) => {
    const { tool, args } = req.body;

    // Check if it's an internal tool — route to internal handler
    const internalTools = [
      'blueprint_search_sessions', 'blueprint_summarize_session', 'blueprint_list_sessions',
      'blueprint_get_project_notes', 'blueprint_get_session_notes', 'blueprint_get_tasks',
      'blueprint_add_task', 'blueprint_complete_task', 'blueprint_get_project_claude_md',
      'blueprint_send_message',
    ];

    if (internalTools.includes(tool)) {
      // Forward to internal handler
      try {
        const r = await fetch(`http://localhost:${process.env.PORT || 3000}/api/mcp/call`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool, args }),
        });
        const data = await r.json();
        return res.json(data);
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // Handle admin tools
    try {
      let result;
      switch (tool) {
        case 'blueprint_create_session': {
          const projectPath = safe.resolveProjectPath(args.project);
          const id = `new_${Date.now()}`;
          const tmux = `bp_${id}`;
          const claudeArgs = args.model ? ['--model', args.model] : [];
          safe.tmuxCreateClaude(tmux, projectPath, claudeArgs);
          result = { session_id: id, tmux, project: args.project };
          break;
        }
        /* DISABLED: Hard deletion causes zombie sessions — see GitHub Issue #457
         * case 'blueprint_delete_session': { ... }
         */
        case 'blueprint_set_session_state':
          db.setSessionState(args.session_id, args.state);
          result = { session_id: args.session_id, state: args.state };
          break;
        case 'blueprint_get_token_usage': {
          const r = await fetch(`http://localhost:${process.env.PORT || 3000}/api/sessions/${args.session_id}/tokens?project=${args.project}`);
          result = await r.json();
          break;
        }
        case 'blueprint_set_project_notes': {
          const project = db.getProject(args.project);
          if (!project) throw new Error('Project not found');
          db.setProjectNotes(project.id, args.notes);
          result = { saved: true };
          break;
        }
        case 'blueprint_set_project_claude_md': {
          const filePath = join(safe.resolveProjectPath(args.project), 'CLAUDE.md');
          await writeFile(filePath, args.content);
          result = { saved: true };
          break;
        }
        case 'blueprint_list_projects': {
          result = { projects: db.getProjects() };
          break;
        }
        case 'blueprint_update_settings':
          db.setSetting(args.key, args.value);
          result = { saved: true };
          break;
        default:
          return res.status(404).json({ error: `Unknown tool: ${tool}` });
      }
      res.json({ result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerExternalMcpRoutes, ADMIN_TOOLS };
