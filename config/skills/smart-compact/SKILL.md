---
name: smart-compact
description: Trigger Blueprint smart compaction on your current session. Preps the plan file, runs /compact, then feeds recovery docs back.
---

Call the `blueprint_smart_compaction` MCP tool with these parameters:

- `session_id`: `${CLAUDE_SESSION_ID}`
- `project`: !`basename $(pwd)`

This will run the full smart compaction pipeline: prep plan, compact, recover.
Wait for the tool to complete before continuing work.
