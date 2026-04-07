/**
 * Blueprint MCP tools — exposed via the Blueprint HTTP API.
 * Claude CLI connects to these via the project's .mcp.json or global MCP config.
 *
 * Tools:
 *   blueprint_search_sessions — search across session content
 *   blueprint_summarize_session — get an AI summary of a session
 *   blueprint_list_sessions — list all sessions for a project
 */

const { readFile, readdir } = require('fs/promises');
const { join, basename } = require('path');
const safe = require('./safe-exec');
const sessionUtils = require('./session-utils');

const CLAUDE_HOME = safe.CLAUDE_HOME;
const WORKSPACE = safe.WORKSPACE;

const db = require('./db');

function registerMcpRoutes(app) {

  // MCP tool discovery endpoint
  app.get('/api/mcp/tools', (req, res) => {
    res.json({
      tools: [
        {
          name: 'blueprint_search_sessions',
          description: 'Search across all session conversations for a keyword or phrase. Returns matching sessions with context snippets.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              project: { type: 'string', description: 'Optional: limit search to a specific project name' },
            },
            required: ['query'],
          },
        },
        {
          name: 'blueprint_summarize_session',
          description: 'Get an AI-generated summary of a session including what was discussed, accomplished, and current state. Also returns the last few messages.',
          inputSchema: {
            type: 'object',
            properties: {
              session_id: { type: 'string', description: 'The session UUID to summarize' },
              project: { type: 'string', description: 'The project name the session belongs to' },
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
      ],
    });
  });

  // MCP tool execution endpoint
  app.post('/api/mcp/call', async (req, res) => {
    const { tool, args } = req.body;

    try {
      let result;
      switch (tool) {
        case 'blueprint_search_sessions':
          result = await sessionUtils.searchSessions(args.query, args.project);
          break;
        case 'blueprint_summarize_session':
          result = await sessionUtils.summarizeSession(args.session_id, args.project);
          break;
        case 'blueprint_list_sessions':
          result = await listSessions(args.project);
          break;
        case 'blueprint_get_project_notes': {
          const project = db.getProject(args.project);
          result = project ? { notes: db.getProjectNotes(project.id) } : { notes: '' };
          break;
        }
        case 'blueprint_get_session_notes':
          result = { notes: db.getSessionNotes(args.session_id) };
          break;
        case 'blueprint_get_tasks': {
          const project = db.getProject(args.project);
          result = project ? { tasks: db.getTasks(project.id) } : { tasks: [] };
          break;
        }
        case 'blueprint_add_task': {
          const project = db.getProject(args.project);
          if (!project) throw new Error('Project not found');
          result = db.addTask(project.id, args.text, 'agent');
          break;
        }
        case 'blueprint_complete_task':
          db.completeTask(args.task_id);
          result = { completed: true };
          break;
        case 'blueprint_get_project_claude_md': {
          const claudeMdPath = join(safe.resolveProjectPath(args.project), 'CLAUDE.md');
          try {
            result = { content: await readFile(claudeMdPath, 'utf-8') };
          } catch {
            result = { content: '' };
          }
          break;
        }
        case 'blueprint_read_plan': {
          const { resolve, sep } = require('path');
          const planBase = join(db.DATA_DIR, 'plans');
          const planFile = resolve(planBase, args.project, `${args.session_id}.md`);
          if (!planFile.startsWith(planBase + sep)) throw new Error('Path traversal blocked');
          try {
            result = { content: await readFile(planFile, 'utf-8') };
          } catch {
            result = { content: '', exists: false };
          }
          break;
        }
        case 'blueprint_update_plan': {
          const { resolve, sep } = require('path');
          const planBase = join(db.DATA_DIR, 'plans');
          const planDir = resolve(planBase, args.project);
          const planFile = resolve(planDir, `${args.session_id}.md`);
          if (!planFile.startsWith(planBase + sep)) throw new Error('Path traversal blocked');
          const { mkdirSync, writeFileSync } = require('fs');
          mkdirSync(planDir, { recursive: true });
          writeFileSync(planFile, args.content);
          result = { saved: true, path: planFile };
          break;
        }
        case 'blueprint_smart_compaction': {
          // Forward to the server's smart compaction endpoint
          const r = await fetch(`http://localhost:${process.env.BLUEPRINT_PORT || 3000}/api/sessions/${args.session_id || 'current'}/smart-compact`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project: args.project }),
          });
          result = await r.json();
          break;
        }
        case 'blueprint_ask_quorum': {
          const r = await fetch(`http://localhost:${process.env.BLUEPRINT_PORT || 3000}/api/quorum/ask`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question: args.question,
              project: args.project,
              mode: args.mode || 'new',
            }),
          });
          result = await r.json();
          break;
        }
        case 'blueprint_send_message': {
          const project = db.getProject(args.project);
          if (!project) throw new Error('Project not found');

          const { mkdirSync, writeFileSync, unlinkSync } = require('fs');
          const { randomUUID } = require('crypto');

          // Write content to a uniquely-named bridge file
          const bridgeDir = join(WORKSPACE, '.blueprint', 'bridges');
          mkdirSync(bridgeDir, { recursive: true });
          const bridgeFile = join(bridgeDir, `msg_${randomUUID()}.md`);
          writeFileSync(bridgeFile, args.content);

          // Record in DB
          db.sendMessage(project.id, null, args.to_session, `[file: ${bridgeFile}]`);

          // Send file path to target session via claude --resume --print
          const tmuxSessName = safe.sanitizeTmuxName(`bp_${args.to_session.substring(0, 12)}`);
          let sent = false;
          try {
            if (!safe.tmuxExists(tmuxSessName)) throw new Error('not running');
            await safe.claudeExecAsync(
              ['--resume', args.to_session, '--dangerously-skip-permissions', '--no-session-persistence', '--print', bridgeFile],
              { cwd: safe.resolveProjectPath(args.project), timeout: 30000 }
            );
            sent = true;
          } catch {
            // Session not running — file stays for manual pickup
          }

          // Clean up bridge file after delivery (target CLI already read it)
          if (sent) {
            setTimeout(() => {
              try { unlinkSync(bridgeFile); } catch {}
            }, 5000); // 5s grace period for CLI to finish reading
          } else {
            // Clean up undelivered files after 1 hour
            setTimeout(() => {
              try { unlinkSync(bridgeFile); } catch {}
            }, 3600000);
          }

          result = sent
            ? { sent: true, delivered: true }
            : { sent: false, note: 'Target session not running. Message saved in DB.' };
          break;
        }
        default:
          return res.status(404).json({ error: `Unknown tool: ${tool}` });
      }
      res.json({ result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

async function listSessions(project) {
  const projectPath = join(WORKSPACE, project);
  const sDir = sessionUtils.sessionsDir(projectPath);

  const sessions = [];
  try {
    const files = await readdir(sDir);
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const sessionId = basename(file, '.jsonl');
      const meta = await sessionUtils.parseSessionFile(join(sDir, file));
      if (meta) {
        sessions.push({
          session_id: sessionId,
          name: meta.name || 'Untitled',
          timestamp: meta.timestamp,
          message_count: meta.messageCount,
        });
      }
    }
  } catch {
    // No sessions dir for this project
  }

  return sessions.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
}

module.exports = { registerMcpRoutes };
