# AILANG friction log

Baseline: `AILANG v0.35.2-dirty`, commit `a67b794313a1bf29567c285ebaa197be52675235`.
Reports are evidence, not assumptions based on old repo comments.

## F001 — Read-only CLI commands try Observatory retention maintenance
Category: CLI/environment ergonomics. Reproduced during planning with `ailang version`
and `ailang prompt` in a workspace sandbox where ~/.ailang is read-only.
Actual: retention cleanup tries to write several tables and prints SQLite readonly
warnings before executing the requested command. Expected: informational commands
should not need writable global telemetry storage. No program failure observed.
Workaround: find supported isolated state configuration; do not change HOME.
Report status: local evidence only.

## F002 — Teaching prompt version labeling
Category: documentation investigation. `ailang prompt` from v0.35.2 starts with
`AILANG v0.16.6` while containing v0.27+ instructions. This may be an intentional
frozen prompt version; investigate before reporting as a bug. Prefer current stdlib
source/docs for signatures. Report status: not yet a confirmed defect.

## Protocol package observation (not a language defect)
Existing sunholo/a2ui 0.2.0 exposes custom node-array JSON rather than the versioned
wire envelope. Add protocol-specific exports without breaking existing consumers.

## F003 — Unary ! documented but rejected (confirmed)
`ailang check repros/unary_bang.ail` fails with `unknown unary operator: !`.
Teaching prompt explicitly says both !x and not x work. Workaround: not x.
Minimal repro and report: CORE_FEEDBACK.md. No external report sent.

## F004 — Reserved parameter diagnostic cascade (confirmed)
`ailang check repros/reserved_parameter.ail` produces multiple delimiter/assignment
errors rather than naming `channel` as a reserved parameter. Workaround: channelId.
The function-name case (`send`) does produce a reserved-word diagnostic.

## F005 — Relative application imports resolve as packages (confirmed behavior)
`ailang check repros/relative_import.ail` attempts pkg/repros/sibling. Flat ./service
also attempted pkg/service. Plain application module imports work. Intended semantics
need clarification; do not label as a confirmed language bug yet.

## F006 — Stateful MCP concurrency needs a host lock (feature gap)
Native MCP/embedded exports can execute concurrently. No filesystem lock primitive
found in std/fs. The launcher uses flock plus a serial request relay; no Discord,
JSON codec, policy or state-content logic was moved out of AILANG. This is the one
material host-language workaround. Integration tests exercise concurrent requests
and rejection of a second writer process. No live duplicate-send experiment performed.

## F007 — Local package lock portability (observation)
`ailang lock` stores absolute paths for local dependencies. The manifest uses portable
sibling-relative paths; rerun lock after cloning. No manual mutation of generated
lockfile paths. Registry version pinning is deferred until packages are released.

## Working capabilities / resolved concerns
- Result-returning FS writes and rename work for durable cursors and draft receipts.
- Empty-list recursion bases need explicit @allow_empty_ok rationale under strict checking.
- `--quiet --no-print` gives clean CLI JSON stdout; normal run banners otherwise appear there.
- Native MCP exposes exactly nine annotated tools and returns structured Json correctly.
- Old repo warnings about required transitive imports did not reproduce in this demo.
- Independent validators accept actual AILANG output, including A2UI component references.
