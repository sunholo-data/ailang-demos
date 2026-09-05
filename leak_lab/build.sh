#!/usr/bin/env bash
set -euo pipefail
LAB="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$LAB/wasm"
cd "$LAB/compiler"
go test ./...
GOOS=js GOARCH=wasm go build -trimpath -o "$LAB/wasm/checker.wasm" .
rm -f "$LAB/wasm/wasm_exec.js"
install -m 644 "$(go env GOROOT)/lib/wasm/wasm_exec.js" "$LAB/wasm/wasm_exec.js"
