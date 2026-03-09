#!/usr/bin/env bash
# take_screenshot.sh — Captures a single screenshot as base64 JPEG
#
# Outputs one base64-encoded JPEG to stdout (single line).
# Used by the takeScreenshot tool for on-demand screen capture.
#
# Usage:
#   take_screenshot.sh [screen|webcam]
#
# Requirements: ffmpeg (for webcam), screencapture (macOS, for screen)

set -euo pipefail

MODE="${1:-screen}"
TMPFILE="$(mktemp /tmp/ailang_screenshot_XXXXXX.jpg)"
trap 'rm -f "$TMPFILE"' EXIT

if [ "$MODE" = "screen" ]; then
  # macOS screencapture — fast, no ffmpeg needed for screen
  if command -v screencapture &>/dev/null; then
    screencapture -x -t jpg "$TMPFILE" 2>/dev/null
  else
    # Fallback: ffmpeg single frame
    ffmpeg -f avfoundation -framerate 1 -i "1:none" \
      -vf "scale=512:-1" -vframes 1 -q:v 8 "$TMPFILE" -y 2>/dev/null
  fi
  # Resize if needed (screencapture gives full res)
  if command -v sips &>/dev/null; then
    sips --resampleWidth 512 "$TMPFILE" &>/dev/null 2>&1 || true
  fi
else
  # Webcam: single frame via ffmpeg
  ffmpeg -f avfoundation -framerate 1 -i "0:none" \
    -vf "scale=320:-1" -vframes 1 -q:v 8 "$TMPFILE" -y 2>/dev/null
fi

# Output as base64 (single line)
base64 < "$TMPFILE" | tr -d '\n'
echo ""
