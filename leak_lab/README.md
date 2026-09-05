# Can you make it leak?

A browser-only AILANG compiler challenge: try five forbidden secret flows,
then compare two explicitly authorised declassifications. Edit and download
any example. No API keys, model calls, or real secrets are involved.

**[Open the live demo](https://www.sunholo.com/ailang-demos/leak_lab/)** · [All demos](https://www.sunholo.com/ailang-demos/)

## Build and run

From the repository root:

```sh
leak_lab/build.sh
scripts/serve.sh --port 8080
# Open http://localhost:8080/leak_lab/
```

Go downloads the toolchain declared in `compiler/go.mod`. Dependencies are
pinned to AILANG **v0.35.0** with checksums in `go.sum`. CI builds the dedicated
WASM artifact; it is not committed. The other demos keep their shared runtime.

```sh
(cd leak_lab/compiler && go test ./...)
BASE=http://localhost:8080 ONLY=leak_lab npm run smoke --prefix scripts/smoke
```

With AILANG v0.35.0, reproduce individual verdicts using
`ailang check leak_lab/examples/direct.ail` (expected rejection) or
`ailang check leak_lab/examples/redact.ail` (expected success).
Do not use the older root `.ailang-version` CLI for these newer labels.

## What is checked

`compiler/check.go` parses the submitted source, rejects imports and non-function
top-level declarations, type-checks through the official module registry, then
calls the official `types.CheckModuleIFC` pass. Function bodies are not invoked.
The worker has a 10-second check deadline and the source is limited to 16,000
bytes. A known forbidden flow must fail before the UI reports readiness.
The uncompressed compiler download is approximately 42 MB.

Syntax/type errors, IFC rejections, allowed flows, and compiler failures are
separate results. A pass is limited to the shown single-module explicit flows;
it is not proof against implicit flows, cross-module leaks, or prompt injection.
`Declassify` grants authority to lower labels. It does not prove that a function
redacts its input: the final example intentionally demonstrates this distinction.
The illustrated key is never supplied to a running experiment.

## Upstream fix

Stock v0.35.0 `ModuleRegistry.LoadModule` skips the IFC pass used by the CLI.
This lab calls that pass explicitly, so its verdicts do not depend on an
unreleased upstream fix. `upstream/repl-ifc.patch` adds the missing gate before
module evaluation/export, plus seven regression cases. Against upstream commit
`59571d77e1e5652e0452a86c0ceb14c8f0402719`, five forbidden-flow cases failed
before the patch and all REPL/type tests passed afterwards:

```sh
git apply --check /path/to/ailang-demos/leak_lab/upstream/repl-ifc.patch
git apply /path/to/ailang-demos/leak_lab/upstream/repl-ifc.patch
go test ./internal/repl ./internal/types
```

When upgrading the bridge to an upstream version containing this fix, preserve
structured distinction between IFC and ordinary type errors: the loader will
then return IFC errors itself. The self-test and scenario tests guard this.

## Interface

The layout follows the showcase's light slate palette and AILANG branding.
Red marks secret input and rejected flows; blue marks public output. The main
view places experiment choice, editable source and compiler evidence together;
on mobile those panels stack. Verdicts use text and symbols as well as colour,
and controls support keyboard interaction and reduced motion.
