#!/usr/bin/env bash
# capture_frames.sh — Captures screen/webcam frames as base64 JPEG lines
#
# Outputs one base64-encoded JPEG per stdout line (newline-delimited).
# AILANG reads these via asyncExecProcess as SourceBytes, accumulates,
# splits on newlines, and sends each complete line as a video frame.
#
# Usage:
#   capture_frames.sh screen [fps]    # screen capture (macOS avfoundation input 1)
#   capture_frames.sh webcam [fps]    # webcam capture (macOS avfoundation input 0)
#
# Requirements: ffmpeg, python3
#
# macOS avfoundation device mapping:
#   0 = FaceTime camera (or first webcam)
#   1 = screen capture
# List devices: ffmpeg -f avfoundation -list_devices true -i "" 2>&1

set -euo pipefail

MODE="${1:-screen}"
FPS="${2:-1}"

if [ "$MODE" = "screen" ]; then
  INPUT="1:none"
  # 512px wide — balances readability vs token cost (~15-30KB per frame)
  SCALE="scale=512:-1"
else
  INPUT="0:none"
  # 320px wide for webcam — faces/gestures don't need high res
  SCALE="scale=320:-1"
fi

# ffmpeg captures frames as MJPEG pipe → python3 splits on JPEG markers → base64 per line
# -q:v 8 = moderate quality (lower = better quality, higher = smaller files)
exec ffmpeg -f avfoundation -framerate "$FPS" -i "$INPUT" \
  -vf "$SCALE" -f image2pipe -vcodec mjpeg -q:v 8 - 2>/dev/null | \
  python3 -c "
import sys, base64

buf = bytearray()
while True:
    chunk = sys.stdin.buffer.read(4096)
    if not chunk:
        break
    buf.extend(chunk)
    while True:
        soi = buf.find(b'\xff\xd8')
        if soi < 0:
            break
        eoi = buf.find(b'\xff\xd9', soi + 2)
        if eoi < 0:
            break
        frame = buf[soi:eoi + 2]
        print(base64.b64encode(frame).decode(), flush=True)
        buf = buf[eoi + 2:]
"
