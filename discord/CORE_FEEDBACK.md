# Prepared feedback for AILANG core

These reports have NOT been sent. Reproduced on AILANG v0.35.2-dirty,
commit a67b794313a1bf29567c285ebaa197be52675235, macOS arm64.
Run the repro commands from `ailang-demos/discord`.

## Test harness: stripper is not string-aware; unbalanced braces in strings corrupt the whole module's tests

Found while retrofitting native tests (2026-09-15), on `build/package-authoring-followups`
(AILANG dev + 427f1a00e). `internal/testing/source_strip.go: testAndPropertySkipRanges`
computes each `test` block's skip range by scanning raw runes for `{`/`}`. Braces inside
string literals count. A test body containing an unbalanced brace inside a string — e.g.
an intentionally-malformed JSON payload like `"{\"partial"` (invalid JSON on purpose) —
makes the range scan never return to depth 0, so the range collapses to the `test` line
and the rest of the block leaks into the stripped base for every test in the module.
Every test then dies with the same `PAR_NO_PREFIX_PARSE ... unexpected token in expression: }`
against the synthesized `_namedtest_body_*.ail`, far from the offending line.

Repro (any module):

```ailang
test "stripper confusion" {
  decode("{\"partial") == Err("...")   -- one {, no } — invalid JSON on purpose
}
```

in a module with a second, unrelated test. Suggested fix: compute skip ranges from the
lexer's token stream (which knows string boundaries), or at minimum treat braces inside
string literals as inert. Impact: cost a full debugging session; the failure points at
unrelated tests and is invisible in the user's source. Workaround: keep JSON literals
brace-balanced (`"{\"partial\":}"` is still invalid JSON).

## Test harness: forall-style `properties [...]` never execute (confirms #624)

Confirmed on the same build: even the smallest forall property fails to lower.

```ailang
export pure func wrap(l: int) -> bool ! {}
properties [ forall(l: int) => l >= 0 || wrap(l) ]
{ l >= 0 }
```

Actual: `test 0: evaluation failed: PAR_UNEXPECTED_TOKEN at _test.ail:5:36` — the
synthesized file does not parse; the same holds for top-level `property "..." { forall(...) => ... }`.
The runner comment already routes forall properties to the known-broken
`EvaluateExpression` path (M-M3-RESIDUAL T6 / #624) while `requires`/`ensures` clauses
run properly as 100-case properties. Suggestion for the interim: reject `properties [...]`
at compile time with a pointer to #624 instead of failing every module test at runtime;
and once #624 lands, property syntax becomes the natural home for the codecs'
round-trip laws (decode(encode(e)) == e).

Impact on this work: both retrofitted packages rely on `ensures`-clause PBT for runtime
property evidence and cannot express ADT round-trip laws as quantified properties.

## Test harness: float binops in named test bodies fail dictionary lookup

Inside a `test "..." { ... }` body, any float comparison errors at runtime:

```ailang
test "float compare" {
  problem("v", "m").retryAfter == 0.0
}
```

Actual: `evaluation error: missing dictionary method: prelude::Fractional::Int::add`
(and `expected float arguments` for `==` directly). The same expression passes in a
regular function body and under `ailang run`; it fails only in the lowered named-test
path. Workaround used: compare floats via contract clauses/properties instead, or
through `show`-free integer projections. Suggestion: the named-test-body evaluation
should reuse the standard evaluator's typeclass dictionary resolution.

## Test harness: no property generator for imported types (Json/ADTs)

Contract-derived property cases need generators for every parameter type. Same-file
records and ADTs derive fine, but imported types do not (`deriveNamedType` only sees
the same file). Every `ensures` on a function taking `std/json` `Json` — or an ADT
whose constructor fields carry `Json` — skips as `no_generator` (a vacuous-class skip
that makes `ailang test <module>` exit 1 without `--allow-skips`). This hit 4 of 12
Discord contracts and 7 of 8 AG-UI contracts; AGENT.md in each package documents the
structural skips. Suggestion: derive generators for imported stdlib types (or expose
same-file `type X = Y` alias resolution to imported ADTs), and/or classify imported-type
skips separately from vacuous ones in exit-code semantics.

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
