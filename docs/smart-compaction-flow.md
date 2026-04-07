# Smart Compaction — Complete Execution Trace

`_runSmartCompaction(sessionId, project)` in `server.js` (~line 843)

---

## INITIALIZATION & VALIDATION

**Step 1** *(line 844)*
Get project from DB: `db.getProject(project)` → `dbProj`
Get project path from DB or resolve via `safe.resolveProjectPath(project)`

**Step 2** *(line 846)*
Validate sessionId format: `/^[a-zA-Z0-9_-]+$/`
Throw `Error('Invalid session ID')` if invalid

**Step 3** *(line 851)*
Preserve original ID: `const tmuxSessionId = sessionId`
(tmux session is named after the original ID throughout)

**Step 4** *(lines 852–872)* — new_* resolution block
If `sessionId.startsWith('new_')`:
- If no `dbProj` → return `{ compacted: false, reason: 'temp session: project not found in DB' }`
- Read sessions dir via `readdir(sDir)`
- Get known IDs from DB: `db.getSessionsForProject(dbProj.id)`
- Find JSONL files not in known IDs
- If exactly 1 unmatched → set `sessionId = basename(file, '.jsonl')`
- If 0 or 2+ unmatched → return `{ compacted: false, reason: 'temp session not yet resolved -- retry later' }`
- On any error → return `{ compacted: false, reason: 'cannot resolve temp session ID' }`

**Step 5** *(line 874)*
Build tmux name: `tmux = tmuxName(tmuxSessionId)`
= `safe.sanitizeTmuxName('bp_' + sessionId.substring(0, 12))`

**Step 6** *(lines 875–877)*
Check tmux session exists: `safe.tmuxExists(tmux)`
If not → return `{ compacted: false, reason: 'session not running' }`

---

## SETUP — CONFIG & HELPERS

**Step 7** *(lines 879–887)*
Log: `[compact] Starting smart compaction for session {sessionId[0:8]} in {project}`
Load config values:
- `pollInterval` (default 3000ms)
- `captureLines` (default 50 lines)
- `maxPrepTurns` (default 10)
- `maxRecoveryTurns` (default 6)
- `checkerModel` (default `claude-haiku-4-5-20251001`)

**Step 8** *(lines 889–893)* — `capturePaneAsync()` definition
Executes: `tmux capture-pane -t {safeTmux} -p -S -{captureLines}`
Returns Promise → stdout (terminal pane content, last N lines)

**Step 9** *(line 896)* — `stripAnsi()` definition
Removes ANSI escape codes from tmux output
Patterns: `\x1b\[[0-9;]*[a-zA-Z]` and `\x1b\][^\x07]*\x07`

**Step 10** *(lines 899–919)* — `waitForPrompt(timeoutMs)` definition
Polls terminal for `❯` prompt appearing in last 4 non-empty lines.
Per iteration:
- Sleep `pollInterval`
- `capturePaneAsync()` → strip ANSI → split into lines
- Check: `/^\s*❯\s*$/` in `lines.slice(-4)` AND `output !== lastOutput`
- If both true → return output immediately
- Update `lastOutput`
- If tmux died → return null
On timeout → final capture attempt or return `''`

**Step 11** *(lines 921–956)* — `sendToChecker(message)` definition
Builds `claude` CLI args:
- Always: `--print --dangerously-skip-permissions --model {checkerModel}`
- If `checkerSessionId` set: adds `--resume {checkerSessionId}`
- Appends message as final arg

Executes via `safe.claudeExecAsync(args, { cwd: projectPath, timeout: 120000 })`

On first call (no `checkerSessionId` yet):
- Finds sessions dir
- Lists all JSONL files
- Finds newest by mtime
- Extracts UUID: `checkerSessionId = newestFile.replace('.jsonl', '')`
- Logs: `[compact] Checker session ID: {id[0:12]}`

Returns trimmed response string (or null on error)

**Step 12** *(lines 959–972)* — `parseBlueprint(response)` definition
Scans response lines for line starting with `{"blueprint"`
JSON.parses it, returns `parsed.blueprint` value
(e.g. `'ready_to_connect'`, `'ready_to_compact'`, `'resume_complete'`)
Returns null if not found

**Step 13** *(lines 975–981)* — `extractAgentMessage(response)` definition
Filters out all lines starting with `{"blueprint"`
Joins remaining lines, trims
Returns the text portion to relay to Session A

---

## PHASE 1: PREP

**Step 14** *(line 986)*
Log: `[compact] Initializing process checker (Session B)...`

**Step 15** *(line 987)*
Load checker prompt: `config.getPrompt('compaction-prep', {})`
(full contents of `config/prompts/compaction-prep.md`)

**Step 16** *(line 988)*
**CALL `sendToChecker(checkerPrompt)`**
→ Spawns new Haiku CLI process with the compaction-prep.md prompt
→ Captures new checkerSessionId from JSONL
→ Returns B's response

**Step 17** *(line 989)*
Parse B's response: `command = parseBlueprint(checkerResponse)`
Expect: `'ready_to_connect'`

**Step 18** *(lines 991–994)*
If command ≠ `'ready_to_connect'`:
Log error → return `{ compacted: false, reason: 'checker failed to initialize' }`

**Step 19** *(line 995)*
Log: `[compact] Checker ready. Connecting to agent...`

**Step 20** *(lines 999–1002)*
Extract agent message from B's first response: `extractAgentMessage(checkerResponse)`
If empty → load fallback: `config.getPrompt('compaction-prep-to-agent', {})`

**Step 21** *(lines 1005–1009)*
**CALL `sendToChecker('This is the Blueprint parser. You are now connected to the agent. Please send your first message to begin the compaction prep.')`**
→ Resumes B's session with `--resume {checkerSessionId}`
→ Gets B's first actual message to send to A
Extract agent message from response
If empty → fallback to `compaction-prep-to-agent.md`

**Step 22** *(line 1011)*
**CALL `safe.tmuxSendKeys(tmux, agentMessage)`**
→ Sends prep message to Session A's running CLI
→ If message contains `\n`: write to temp file → `tmux load-buffer` → `tmux paste-buffer`
→ If single-line: `tmux send-keys -t {safeTmux} -l -- {text}` then `tmux send-keys Enter`

**Step 23** *(line 1012)*
Log: `[compact] Sent first prep message to agent`

---

### PREP MEDIATION LOOP (up to `maxPrepTurns` = 10 turns)

**Step 24** *(line 1018)*
**CALL `waitForPrompt(120000)`**
→ Poll terminal every 3s for `❯` prompt in last 4 lines
→ Returns full terminal pane output when A finishes responding
→ Returns null if tmux session died

**Step 25** *(lines 1019–1022)*
If `agentOutput === null`:
→ Log error → return `{ compacted: false, reason: 'tmux session died during prep' }`

**Step 26** *(line 1025)*
**CALL `sendToChecker(agentOutput)`**
→ Send A's full terminal output (raw pane capture) to B
→ B reads this to decide if prep is complete

**Step 27** *(line 1026)*
Parse B's response: `command = parseBlueprint(checkerResponse)`

**Step 28** *(lines 1028–1032)*
If command === `'ready_to_compact'`:
→ `prepDone = true`
→ Log: `[compact] Prep complete after {turn} turns`
→ **Break loop**

**Step 29** *(lines 1035–1046)* — Turn limit warning
If `turn >= maxPrepTurns - 2` (turn 8+ when max=10):
→ **CALL `sendToChecker('This is the Blueprint parser. The prep conversation has been going for {turn} turns. Please wrap up...')`**
→ Parse response
→ If `'ready_to_compact'` → `prepDone = true`, break

**Step 30** *(lines 1049–1053)*
If not done yet:
→ Extract agent message from B's response
→ **CALL `safe.tmuxSendKeys(tmux, agentMessage)`** (relay B's message to A)
→ Log: `[compact] Prep turn {turn}: relayed checker message to agent`
→ Loop back to Step 24

---

**Step 31** *(lines 1056–1058)*
After loop exits:
If `prepDone === false`:
→ Log: `[compact] Prep turn limit reached — proceeding with compaction anyway`

**Step 32** *(lines 1061–1067)*
Verify plan file: `stat(join(db.DATA_DIR, 'plans', project, '{sessionId}.md'))`
If found → log: `[compact] Plan file verified: {size} bytes, modified {mtime}`
If not found → log: `[compact] Warning: plan file not found or not updated`
*(Note: this check always warns — Blueprint's data dir ≠ where A writes plans)*

---

## PHASE 2: COMPACT

**Step 33** *(line 1072)*
**CALL `safe.tmuxSendKeys(tmux, '/compact')`**
→ `tmux send-keys -t {safeTmux} -l -- /compact`
→ `tmux send-keys -t {safeTmux} Enter`

**Step 34** *(lines 1074–1077)*
If send throws:
→ Log error → return `{ compacted: false, reason: 'failed to send /compact' }`

**Step 35** *(lines 1080–1098)* — Compaction completion poll
Load `compactTimeout` (default 300000ms = 5 min)
Initialize `lastCompactionOutput = ''`

Per iteration:
- Sleep `pollInterval`
- `capturePaneAsync()` → strip ANSI → split lines
- Check: `❯` in `lines.slice(-4)` AND `output !== lastCompactionOutput`
- If both true → `compactionDone = true`, log `[compact] Compaction completed (prompt detected)`, **break**
- Update `lastCompactionOutput`
- If tmux died → **break**

**Step 36** *(lines 1106–1108)*
If `compactionDone === false`:
→ Log: `[compact] Compaction poll timed out — proceeding with recovery`

---

## PHASE 3: RECOVERY

**Step 37** *(lines 1113–1114)*
Find sessions dir: `safe.findSessionsDir(projectPath)`
Build JSONL path: `join(sessionsDir, '{sessionId}.jsonl')`

**Step 38** *(lines 1115–1119)*
Load `tailPercent` (default 20%)
Create compaction context dir: `join(db.DATA_DIR, 'compaction')`
Build tail file path: `tail_{sessionId[0:8]}_{timestamp}.md`

**Step 39** *(lines 1122–1146)*
**READ entire JSONL file**
Split by newlines, parse each line:
- `type === 'user'` → extract content → push `Human: {text}`
- `type === 'assistant'` → extract text blocks → push `Assistant: {text}`
Calculate tail count: `max(1, floor(exchanges.length * tailPercent / 100))`
Slice: `exchanges.slice(-tailCount)` (last 20%)
**WRITE tail file**: exchanges joined by `\n\n---\n\n`
Log: `[compact] Extracted conversation tail: {tail}/{total} exchanges (20%)`
On read error: write placeholder `(No conversation history available)` to tail file

**Step 40** *(lines 1149–1151)*
**CALL `sendToChecker('This is the Blueprint parser. Compaction is complete. The conversation tail has been saved to {tailFile}. It's now time to manage the recovery phase...')`**
Parse response for command

**Step 41** *(lines 1154–1162)*
If command ≠ `'resume_complete'`:
Extract agent message from B's response
If empty → load fallback: `config.getPrompt('compaction-resume', { CONVERSATION_TAIL_FILE: tailFile })`
**CALL `safe.tmuxSendKeys(tmux, agentMessage)`** → send recovery message to A
Log: `[compact] Sent first recovery message to agent`

---

### RECOVERY MEDIATION LOOP (up to `maxRecoveryTurns` = 6 turns)

**Step 42** *(line 1165)*
**CALL `waitForPrompt(120000)`**
→ Wait for A to finish responding

**Step 43** *(line 1166)*
If output is null (session died) → **break loop**

**Step 44** *(line 1168)*
**CALL `sendToChecker(agentOutput)`**
→ Send A's terminal output to B for evaluation

**Step 45** *(line 1169)*
Parse B's response: `command = parseBlueprint(checkerResponse)`

**Step 46** *(lines 1171–1173)*
If command === `'resume_complete'`:
→ Log: `[compact] Recovery complete after {turn} turns`
→ **Break loop**

**Step 47** *(lines 1176–1180)*
Extract agent message from B's response
If message exists:
→ **CALL `safe.tmuxSendKeys(tmux, agentMessage)`** (relay to A)
→ Log: `[compact] Recovery turn {turn}: relayed checker message to agent`
→ Loop back to Step 42

---

## CLEANUP & RETURN

**Step 48** *(lines 1185–1188)*
Schedule tail file deletion (fire-and-forget):
`setTimeout(() => unlink(tailFile), cleanupDelayMs)` (default 60000ms = 1 min)

**Step 49** *(line 1190)*
Log: `[compact] Smart compaction complete for session {sessionId[0:8]}`

**Step 50** *(line 1191)*
Return:
```json
{
  "compacted": true,
  "prep_completed": true/false,
  "compaction_completed": true/false,
  "tail_file": "/path/to/tail_xxx_timestamp.md"
}
```

---

## KNOWN GAPS (for #126/#127 investigation)

1. **No `/plan` entry before Step 22** — prep message sent to A while A is mid-conversation, not in plan mode
2. **Plan file path mismatch (Step 32)** — server checks `~/.blueprint/plans/{project}/{sessionId}.md` but A never writes there; Claude Code plan files go to `~/.claude/plans/<name>.md`
3. **B receives raw terminal pane** (Steps 26, 44) — not just A's text response, but 50 lines of terminal including ANSI artifacts
