#!/bin/bash
set -e
umask 000

# Initialize directories on first run (volumes are empty at start)
mkdir -p /storage/.claude
mkdir -p "${WORKSPACE:-/workspace/blueprint/projects}" "${BLUEPRINT_DATA:-/workspace/blueprint/data}" "${CLAUDE_HOME:-/workspace/blueprint/.claude}"
if [ ! -f /storage/.claude/.claude.json ]; then
  echo '{"hasCompletedOnboarding":true}' > /storage/.claude/.claude.json
fi

exec "$@"
