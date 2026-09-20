#!/usr/bin/env bash
# Run `cd decisions && ailang lock` first with the pinned decisions CLI.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
DEST=${1:?Usage: scripts/build-decisions.sh OUTPUT_DIRECTORY}
VERSION=$(tr -d '[:space:]' < "$ROOT/decisions/.ailang-version")
PKG=$(python3 - "$ROOT/decisions/ailang.lock" <<'PY'
import json,os,sys
lock=json.load(open(sys.argv[1]))
p=next(p for p in lock['packages'] if p['name']=='sunholo/decisions')
assert p['source']=='registry', 'Public build requires a registry lock'
print(os.path.join(os.environ.get('AILANG_CACHE',os.path.expanduser('~/.ailang/cache/registry')),p['name'],p['version'],'decide.ail'))
PY
)
test -f "$PKG"
mkdir -p "$DEST/ailang/pkg/sunholo/decisions" "$DEST/wasm"
cp -R "$ROOT/decisions/site/." "$DEST/"
for module in world souls render oracle bank host; do cp "$ROOT/decisions/$module.ail" "$DEST/"; done
cp "$PKG" "$DEST/ailang/pkg/sunholo/decisions/decide.ail"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
curl -fsSL --retry 3 "https://github.com/sunholo-data/ailang/releases/download/$VERSION/ailang-wasm.tar.gz" -o "$TMP/runtime.tar.gz"
echo 'bd9ff53d752c961b4904bdafc6e7b71bab6bf392c65f5b115bfdeae570a162a0  runtime.tar.gz' > "$TMP/SHA256SUMS"
(cd "$TMP" && shasum -a 256 -c SHA256SUMS)
tar -xzf "$TMP/runtime.tar.gz" -C "$TMP"
cp "$TMP/ailang.wasm" "$TMP/wasm_exec.js" "$DEST/wasm/"
printf 'Built public decisions demo with %s\n' "$VERSION"
