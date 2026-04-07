/**
 * OpenAI-compatible chat completions endpoint.
 *
 * Routes to Blueprint sessions via `claude --resume <id> --print`.
 * Session ID passed as model field: "bp:<session_id>" or via X-Blueprint-Session header.
 */

const { randomUUID } = require('crypto');
const { join } = require('path');
const safe = require('./safe-exec');

function registerOpenAIRoutes(app) {

  // Model listing (for compatibility)
  app.get('/v1/models', (req, res) => {
    res.json({
      object: 'list',
      data: [
        { id: 'claude-opus-4-6', object: 'model', owned_by: 'anthropic' },
        { id: 'claude-sonnet-4-6', object: 'model', owned_by: 'anthropic' },
        { id: 'claude-haiku-4-5-20251001', object: 'model', owned_by: 'anthropic' },
      ],
    });
  });

  // Chat completions
  app.post('/v1/chat/completions', async (req, res) => {
    try {
      const { model, messages, stream } = req.body;
      const sessionHeader = req.headers['x-blueprint-session'];

      // Parse session ID from model field or header
      let sessionId = null;
      let actualModel = model || 'claude-sonnet-4-6';
      let project = req.body.project || req.headers['x-blueprint-project'];

      if (model && model.startsWith('bp:')) {
        sessionId = model.substring(3);
        actualModel = null; // Use whatever model the session is running
      } else if (sessionHeader) {
        sessionId = sessionHeader;
      }

      if (!messages || !messages.length) {
        return res.status(400).json({ error: { message: 'messages required', type: 'invalid_request_error' } });
      }

      // Get the last user message
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      if (!lastUserMsg) {
        return res.status(400).json({ error: { message: 'no user message found', type: 'invalid_request_error' } });
      }

      // Find a project CWD
      if (!project) {
        const { readdirSync } = require('fs');
        const dirs = readdirSync(safe.WORKSPACE, { withFileTypes: true })
          .filter(d => d.isDirectory() && !d.name.startsWith('.'));
        project = dirs[0]?.name || 'workspace';
      }
      const cwd = safe.resolveProjectPath(project);

      // Build claude command args
      const claudeArgs = ['--print'];
      if (sessionId) {
        claudeArgs.push('--resume', sessionId);
      } else {
        claudeArgs.push('--no-session-persistence');
      }
      if (actualModel) claudeArgs.push('--model', actualModel);
      claudeArgs.push('--dangerously-skip-permissions');
      // Handle OpenAI format where content can be string or array of content blocks
      const userContent = Array.isArray(lastUserMsg.content)
        ? lastUserMsg.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
        : lastUserMsg.content;
      claudeArgs.push(userContent);

      const startTime = Date.now();
      let responseText;

      try {
        responseText = (await safe.claudeExecAsync(claudeArgs, { cwd, timeout: 120000 })).trim();
      } catch (err) {
        return res.status(500).json({
          error: { message: `Claude CLI error: ${err.message?.substring(0, 200)}`, type: 'server_error' },
        });
      }

      const completionId = `chatcmpl-${randomUUID().substring(0, 12)}`;

      if (stream) {
        // SSE streaming (simplified — send full response as one chunk)
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const chunk = {
          id: completionId,
          object: 'chat.completion.chunk',
          created: Math.floor(startTime / 1000),
          model: actualModel || 'claude-sonnet-4-6',
          choices: [{
            index: 0,
            delta: { role: 'assistant', content: responseText },
            finish_reason: 'stop',
          }],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        res.json({
          id: completionId,
          object: 'chat.completion',
          created: Math.floor(startTime / 1000),
          model: actualModel || 'claude-sonnet-4-6',
          choices: [{
            index: 0,
            message: { role: 'assistant', content: responseText },
            finish_reason: 'stop',
          }],
          usage: {
            prompt_tokens: 0, // Not tracked in --print mode
            completion_tokens: 0,
            total_tokens: 0,
          },
        });
      }
    } catch (err) {
      console.error('[openai-compat] Error:', err.message);
      res.status(500).json({
        error: { message: err.message, type: 'server_error' },
      });
    }
  });
}

module.exports = { registerOpenAIRoutes };
