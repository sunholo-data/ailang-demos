# Postmortem: cognitive_commons WASM citizen.ail stack overflow

**Date**: 2026-05-20
**Time to diagnose**: ~half a day
**Severity**: page hard-freezes with no console error, no banner, no signal beyond the browser's "page slowing down" dialog after ~10 seconds.

## What happened

After porting the cognitive_commons demo from the JS prototype to AILANG modules, the browser demo at `http://localhost:8765/cognitive_commons/` would freeze hard on load. No visible error. DevTools couldn't be opened (page locked). The boot diagnostic banner I added later showed `PHASE loadModule: cognitive_commons/services/citizen` and then silence — `repl.loadModule()` never returned.

## Why it was hard to diagnose

Every signal pointed at a different layer:

1. **Server logs** showed the fetch sequence stopped at `citizen.ail` — `commons_browser.ail` (the next module) never even requested. Looked like a network problem.
2. **CLI `ailang check citizen.ail`** passes cleanly in <1 second. The static analysis is fine.
3. **CLI `ailang run --entry main`** on the demo's `main.ail` passes too — exercises the same imports.
4. **`scripts/check_demos.sh --only cognitive_commons`** reported 5 pass / 0 fail.

So the AILANG source itself looks correct. The bug appears **only in the WASM runtime** at `loadModule` time. Browser was the only place to see it, and the browser was locked.

## The dead ends

Long detour through several false culprits, in order:

- **IndexedDB perf** (queryRecent vs queryAll cursor reads) — fixed but not the cause
- **`mix-blend-mode: multiply` on a fixed-position SVG noise overlay** — fixed (real scroll-jank issue, but not the freeze)
- **`python3 -m http.server` wedging on a 40MB WASM fetch + concurrent module fetches** — fixed by switching to `ThreadingHTTPServer` (real bug, not the freeze)
- **Older `wasm/ailang.wasm` lagging the AILANG source repo** — fixed by adding `scripts/check-wasm-freshness.sh` + rebuilding. STILL didn't fix the freeze.

Three days of work and the page was still frozen.

## What actually broke it

Go on native grows goroutine stacks dynamically. Go compiled to WASM uses the host JS engine's call stack — fixed, around 10-15K frames in Node, similar in browsers. The AILANG type-checker has recursive descent through AST nodes plus constraint solving that's been growing more sophisticated with each release. `cognitive_commons/services/citizen.ail` happens to combine:

- 11 imports including 5 from intra-package modules (`types/personas`, `services/consensus` with 8 destructured symbols, `services/persuasion`)
- Two effect-annotated functions: `compose ! {AI}` and `speak ! {AI, DOM, Msg}`
- Triple-nested `match` patterns inside `compose`
- Three back-to-back matches on the same `Result[JudgeScore, string]` in `speak` with record-field access (`s.x`, `s.y`)
- The `M-TYPECHECK-NO-AUTO-UNWRAP-RESULT` (May 2026) gating on tagged-union receivers

Together they push the WASM type-checker past the JS stack limit. The CLI doesn't hit this because native Go stacks grow. Symptom in WASM: 80-120 seconds of synchronous recursion, then `Maximum call stack size exceeded`. Browser host shows none of that — just locks up the main thread.

## What finally pinned it

The breakthrough was running the actual WASM binary headlessly in Node — same code path, no browser locking up:

```bash
node /Users/mark/dev/sunholo/demos/scripts/wasm-loadmodule-harness.js
```

Output (with the broken full `citizen.ail`):
```
[harness] → loadModule cognitive_commons/services/citizen (7170 bytes)
[harness] ✗ THREW after 82364ms on cognitive_commons/services/citizen: Maximum call stack size exceeded
```

That single error message was worth four hours of browser-staring. Bumping `node --stack-size=32000` and trying again still timed out at 60s → confirmed this isn't just a stack-size issue, the recursion is pathologically slow (probably quadratic or worse on certain receiver shapes).

## Diagnostic toolchain that landed

In rough order of usefulness for catching the next one:

1. **`scripts/wasm-loadmodule-harness.js`** — the smoke test. Runs WASM headlessly, loads each module in order, times each, fails loudly with the actual error. The single most valuable tool. Should be CI-gated on any `.ail` change in `cognitive_commons/`.
2. **`scripts/check-wasm-freshness.sh`** — pre-flight check called by `serve.sh`. Compares `wasm/ailang.wasm` mtime + embedded version vs the AILANG source repo. Catches the "wasm is older than .ail source" failure mode (which was a real problem before this freeze surfaced).
3. **`cognitive_commons/index.html` boot banner + per-phase diagnostic** — `localStorage.commons_boot_diag` persists across reloads, `Copy all` button in the red banner, `diag.html` page renders the trace. Without these, the browser-side investigation was nearly impossible.
4. **`cognitive_commons/reset.html`** — tiny endpoint that nukes IDB + state without needing to scroll to the in-page button on a slow-loading demo.

## Workaround currently in place

`cognitive_commons/services/citizen.ail` is a **STUB** exporting the same `compose` and `speak` signatures with trivial bodies, so `commons_browser.ail` still type-checks and the page boots end-to-end. AI-driven citizen logic is disabled.

The original implementation is at `/tmp/citizen.ail.orig` (and in git history — see commits before 2026-05-20).

## Real fix (upstream, not in this repo)

The AILANG type-checker needs to either:
1. Convert the recursive descent in `internal/types/` for nested matches + tagged-union analysis into an iterative pass (work-list / explicit stack)
2. Memoize on receiver type so repeat analysis of the same record doesn't redo the constraint chain
3. Add a depth-limit + diagnostic when the WASM environment is detected

The CLI works because Go natively grows goroutine stacks; WASM does not. This is a class of bug that will recur as the type-checker gets more sophisticated and `.ail` modules get larger. Worth a sprint to either lift the constraint or systematically catch via CI.

## Prevention going forward

1. **Run the WASM harness on every PR that touches `.ail` files in browser demos:**
   ```bash
   node scripts/wasm-loadmodule-harness.js
   ```
   Exit 0 = safe to merge. Anything else = flag.
2. **Don't trust `ailang check` alone for WASM-targeted modules.** The CLI doesn't share the WASM stack limit. Always also load through the WASM REPL.
3. **Keep `wasm/ailang.wasm` versioned with `wasm/ailang.wasm.version`** (next step). Auto-rebuild on serve when stale.
4. **Document the WASM stack limit** in the demos repo's CLAUDE.md / coding standards. Pattern: nested match depth > 3, repeated matches on the same tagged union, intra-package imports with >5 destructured symbols.
5. **Watch for upstream AILANG changes to `internal/types/`** — those should rerun the harness on this demo before being released.
