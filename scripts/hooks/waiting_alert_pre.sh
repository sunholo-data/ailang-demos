#!/usr/bin/env bash
# Claude Code PreToolUse hook — schedule vocal alert if waiting >60s
#
# When Claude needs user approval (permission prompt, question, etc.),
# this spawns a background watcher that fires a vocal alert after 60 seconds.
# The PostToolUse hook clears the pending state, so auto-approved tools
# never trigger the alert.
#
# Exclude directories: ~/.ailang/config/hook_excludes.conf (one pattern per line)
# or CLAUDE_ALERT_EXCLUDE env var (colon-separated).

set -euo pipefail

# Read hook input from stdin
HOOK_INPUT=$(cat)

# --- Extract session ID (scope state per session to avoid cross-talk) ---
SESSION_ID=$(echo "$HOOK_INPUT" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('session_id', 'default'))" 2>/dev/null || echo "default")

# --- Folder exclusion ---
CWD=$(echo "$HOOK_INPUT" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('cwd', ''))" 2>/dev/null || echo "")

# Default excludes: /tmp, /private/var (sandbox evals)
EXCLUDES="/tmp:/private/tmp:/private/var"

# Merge with env var if set
if [ -n "${CLAUDE_ALERT_EXCLUDE:-}" ]; then
  EXCLUDES="$EXCLUDES:$CLAUDE_ALERT_EXCLUDE"
fi

# Merge with global AILANG config file
CONF="$HOME/.ailang/config/hook_excludes.conf"
if [ -f "$CONF" ]; then
  while IFS= read -r pattern; do
    pattern=$(echo "$pattern" | sed 's/#.*//' | xargs)  # strip comments + trim
    [ -n "$pattern" ] && EXCLUDES="$EXCLUDES:$pattern"
  done < "$CONF"
fi

# Check if CWD matches any exclude pattern
if [ -n "$CWD" ]; then
  IFS=':' read -ra PATTERNS <<< "$EXCLUDES"
  for pat in "${PATTERNS[@]}"; do
    [ -z "$pat" ] && continue
    if [[ "$CWD" == *"$pat"* ]]; then
      exit 0
    fi
  done
fi

# --- Prevent triggering from stop hook speak sessions ---
STOP_HOOK_ACTIVE=$(echo "$HOOK_INPUT" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('stop_hook_active', False))" 2>/dev/null || echo "False")
if [ "$STOP_HOOK_ACTIVE" = "True" ]; then
  exit 0
fi

# --- Resolve project name ---
if [ -n "$CWD" ] && git -C "$CWD" rev-parse --show-toplevel &>/dev/null 2>&1; then
  PROJECT="$(basename "$(git -C "$CWD" rev-parse --show-toplevel)")"
elif [ -n "$CWD" ]; then
  PROJECT="$(basename "$CWD")"
else
  PROJECT="$(basename "$(pwd)")"
fi

# --- Set pending state (scoped per session) ---
STATE_DIR="$HOME/.ailang/speak"
PENDING="$STATE_DIR/pending_${SESSION_ID}"
ALERT_PID_FILE="$STATE_DIR/alert_pid_${SESSION_ID}"

mkdir -p "$STATE_DIR"

# Write project info to pending file (watcher reads this, not captured vars)
printf '%s\n%s\n' "$PROJECT" "$CWD" > "$PENDING"

# Don't spawn a new watcher if one is already running for this session
if [ -f "$ALERT_PID_FILE" ]; then
  existing_pid=$(cat "$ALERT_PID_FILE" 2>/dev/null || echo "")
  if [ -n "$existing_pid" ] && kill -0 "$existing_pid" 2>/dev/null; then
    exit 0
  fi
fi

# Spawn background watcher — fires after 60s if still pending
(
  sleep 60
  if [ -f "$PENDING" ]; then
    # Read current project info from pending file
    ALERT_PROJECT=$(head -1 "$PENDING" 2>/dev/null || echo "unknown")
    ALERT_CWD=$(tail -1 "$PENDING" 2>/dev/null || echo "")
    ICON="$HOME/.claude/hooks/assets/sunholo-logo.png"

    if command -v terminal-notifier &>/dev/null; then
      # terminal-notifier: rich notification with sound
      #   -group: replaces previous alert for same session (no stacking)
      #   -ignoreDnD: important — user might have DnD on while coding
      terminal-notifier \
        -title "Waiting: ${ALERT_PROJECT}" \
        -subtitle "${ALERT_CWD}" \
        -message "Claude Code needs your input — approval or answer required" \
        -sound Funk \
        -appIcon "$ICON" \
        -group "ailang-alert-${ALERT_PROJECT}" \
        -ignoreDnD \
        2>/dev/null || true
    else
      # osascript fallback
      osascript -e "display notification \"Claude Code needs your input\" with title \"Waiting: ${ALERT_PROJECT}\" subtitle \"${ALERT_CWD}\" sound name \"Funk\"" 2>/dev/null || true
    fi
  fi
  rm -f "$ALERT_PID_FILE"
) &
echo $! > "$ALERT_PID_FILE"

exit 0
