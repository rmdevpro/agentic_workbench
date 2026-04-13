#!/bin/bash
set -e

# Initialize storage directories on first run (volumes are empty at start)
mkdir -p /storage/.claude
if [ ! -f /storage/.claude/.claude.json ]; then
  echo '{"hasCompletedOnboarding":true}' > /storage/.claude/.claude.json
fi

exec "$@"
