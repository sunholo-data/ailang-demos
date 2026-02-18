#!/usr/bin/env bash
# Claude Code PostToolUse hook — clear pending interaction state
#
# When a tool completes (auto-approved or after user approval),
# this clears the pending state so the 60-second alert won't fire.

set -euo pipefail

# Clear pending state
rm -f "$HOME/.ailang/speak/pending_interaction"

# Kill any scheduled alert watcher
ALERT_PID_FILE="$HOME/.ailang/speak/alert_pid"
if [ -f "$ALERT_PID_FILE" ]; then
  pid=$(cat "$ALERT_PID_FILE" 2>/dev/null || echo "")
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
  fi
  rm -f "$ALERT_PID_FILE"
fi

exit 0
