# Prepared feedback for AILANG core

These reports have NOT been sent. Reproduced on AILANG v0.35.2-dirty,
commit a67b794313a1bf29567c285ebaa197be52675235, macOS arm64.
Run the repro commands from `ailang-demos/discord`.

## Bug: teaching prompt promises unary !, checker rejects it

Command: `ailang check repros/unary_bang.ail`

```ailang
module repros/unary_bang
export pure func negate(x: bool) -> bool = !x
```

Actual: `unknown unary operator: !` (exit 1).
Expected: either accept the documented syntax, or correct the teaching prompt.
`ailang prompt` says both `!x` and `not x` work. Replacing `!x` with `not x`
works in the Discord package. Impact: first-pass code generation from the supplied
teaching reference produced an avoidable compiler failure.

## Diagnostics: reserved word as parameter produces unrelated parse cascade

Command: `ailang check repros/reserved_parameter.ail`

```ailang
module repros/reserved_parameter
export pure func echo(channel: string) -> string = channel
```

Actual: errors about missing `)`, missing `{`, unexpected `:`, bare assignment and
unexpected `channel`. No initial diagnostic identifies the parameter as reserved.
Expected: reserved-keyword diagnostic at `channel`, similar to the existing useful
`PAR_RESERVED_KEYWORD` diagnostic when `send` is used as a function name.
Workaround: use channelId. Impact: Discord vocabulary naturally triggers this.

## DX: relative import inside a manifest-bearing application resolves to package

Command: `ailang check repros/relative_import.ail`

Files are committed beside each other in `repros/`; the importer uses
`import ./sibling (value)`.
Actual: tries `pkg/repros/sibling`, then reports package `repros/sibling` absent from
ailang.lock. With flat application modules, `import ./service` similarly tried
`pkg/service` and failed path validation. Plain `import service` works.
Expected: document the restriction that relative imports target package namespaces,
or resolve relative application modules locally when applicable. This is an import
semantics/documentation question, not yet proven to violate intended behavior.

## Feature request: filesystem locking / serialized native MCP export execution

Discord draft sends require durable state transitions across concurrent calls.
`std/fs` has atomic rename and Result-returning writes, but no file-lock/exclusive
creation primitive found in the current stdlib. Native MCP tool handlers call
`Engine.CallPreserveFloats` without serializing the whole application transaction.
Check-then-write state alone could allow two concurrent submissions to send twice.

Current workaround: a ~100-line Python process launcher uses flock across processes
and queues MCP requests before forwarding them to native `serve-api --mcp`. Domain
logic, policy, state and protocol JSON all remain in AILANG. A native serial-execution
option or a scoped lock effect would remove this host-side workaround.

Evidence: source inspection of std/fs, internal/apiserver/mcp.go and
internal/embed/embed.go; integration tests confirm concurrent client requests are
serialized by the launcher. We have NOT demonstrated a duplicate live Discord send.

## DX: informational commands maintain global Observatory storage

`ailang version`, `prompt`, `check` and `run` attempt retention cleanup in
~/.ailang/state/observatory.db when it exceeds the configured threshold. Under a
workspace sandbox, each invocation prints multiple readonly SQLite errors. The
command itself may still succeed. DefaultDatabasePath currently uses UserHomeDir,
so the messaging AILANG_STATE_DIR setting does not isolate this database.

Suggestion: avoid global maintenance on informational commands, or support an
Observatory state directory override/read-only mode. No HOME rewriting workaround
was used. This is an environmental integration problem, not a program type failure.

## Positive results

- Package path dependencies and cross-package exported types worked once imported
  with the documented pkg namespace.
- No transitive-stdlib-import workaround was needed for this demo's successful runs.
- Net exposes HTTP status, headers and body; typed rate-limit classification works.
- std/fs Result functions and atomic rename support durable progress/receipts.
- Explicit @allow_empty_ok rationales correctly document valid empty page bases.
- Native MCP correctly preserves JSON objects and exposes exactly the annotated tools.
- Pure protocol builders produce output accepted by independent AG-UI and A2UI validators.

When delivery is authorized, use the canonical shared feedback store/tool described
in the ailang-feedback skill; do not write reports only to local messaging SQLite.
