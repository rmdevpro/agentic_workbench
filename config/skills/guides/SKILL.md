---
name: guides
description: List available guides and insert one into the conversation. Run with no argument to see all guides, or specify a guide name to load it.
---

Look at the argument the user provided after `/guides`:

**If no argument (just `/guides`):**
List all available guides by reading the directory `/app/config/guides/`. For each `.md` file, show:
- The filename (without extension) as the guide name
- The first line of the file (the title)

Format as a numbered list so the user can pick one.

**If the user specified a guide name:**
Read the file at `/app/config/guides/{name}.md` (add `.md` if not provided).
Insert the full contents into the conversation so you can follow the guide.
If the file doesn't exist, list available guides instead.
