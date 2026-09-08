# Demo audit — 5 September 2026

Public showcase: https://www.sunholo.com/ailang-demos/

Audited checkout: `af18c03ddb818f55d87870484d789d72d2cdaff0`, plus the local repairs from this audit. Deployment follow-up: fixes reconciled with remote main; the LinkedIn `FS` annotation is restored for the pinned compiler. Deployment is tracked in GitHub Actions. Remote main at audit time was `d2ff2e029d3c0d986b6f1eb34304e0aed430bb8d` (75 commits ahead at the original audit).

## Toolchain move to v0.35.2 — 8 September 2026

`.ailang-version` now pins **v0.35.2** (was v0.20.1). The whole repo type-checks
and boots on the current release; there is no longer a demo that only compiles
under an old compiler.

Verified against the downloaded **v0.35.2 release binary and WASM**, not a local
dev build:

| Suite | Result |
|---|---|
| `scripts/check_demos.sh` | **32/32** (was 23/32 on v0.35.2 before this work) |
| Browser routes (`scripts/smoke`) | **21/21** on v0.35.2 WASM |
| Discord offline integration | 4/4 suites |
| LinkedIn | 18/18 pure tests, 58/58 rubric assertions |
| Website Builder portal | 118/118 (43 server + 75 preview) |
| WASM wrapper regression | 8/8 |

What had to change, and why:

- **A spurious `! {FS}` on `linkedinIsHashtagLine` was removed.** It was added on
  5 Sep to satisfy v0.20.1, which inferred an effect for a pure `find` call. The
  function is pure string matching; v0.35 types it correctly, and the annotation
  propagated a phantom `FS` up the call chain.
- **Genuine missing effects were declared** on `test_sse`, `bigquery_demo`,
  `trusted_analytics_demo` and `handleSearchNotes` (which reaches `getEnvOr`),
  and `Env` propagated through ambient's `handleToolCall`/`handleJsonMessage`/
  `handleEvent`.
- **`jnum` takes a float.** Four `jnum(code)` sites on WebSocket close codes
  became `jnum(intToFloat(code))`, matching the idiom already used elsewhere in
  the same files.
- **`connect` returns `Result[StreamConn, StreamErrorKind]`.**
  `streaming/test_stream_basic.ail` was a suite asserting that `Ok(StreamConn)`
  auto-unwrapped; it was rewritten to match on the Result at every call site.
- **`exec`'s `Result` may no longer be dropped** as a function's tail
  expression; ambient's cleanup `exec("rm", ...)` now matches explicitly.
- **`co-presenter/` was renamed `co_presenter/`** so the directory matches its
  `module co_presenter/co_presenter` declaration (MOD010). The published URL
  stays `/co-presenter/` — `serve.sh` and the deploy workflow map source to site
  path explicitly.
- **The WASM type-check budget is raised to 15s by the host.** v0.35 enforces a
  2s *wall-clock* budget per module, which the larger modules (docparse's
  `tex_parser`, `ambient_browser`, `co_presenter`) exceed on slower machines.
  Both shared loaders now call `ailangSetTypeCheckBudget` when it exists. It is
  set in the demo loaders rather than in `wasm/ailang-repl.js`, because CI
  overwrites that vendored file from the release tarball on every deploy.

### Known gap: two compilers, one repo

`leak_lab/wasm/` is gitignored and built by `leak_lab/build.sh` from its own Go
module pinned to **v0.35.0**, so the leak lab route fails a local smoke run
until that script has been run once. Everything else runs the shared
`wasm/ailang.wasm` at **v0.35.2**.

That split is deliberate, not neglect. In v0.35.2 `types.CheckModuleIFC` has one
production call site — `internal/pipeline/pipeline_module_compile.go:235`, the
CLI path. The browser path (`ailangLoadModule` → `WasmREPL.LoadModule` →
`internal/repl/module_registry_load.go`) never calls it, so the shared WASM
accepts modules the CLI rejects and publishes their exports. Loading
`leak_lab/examples/direct.ail` through the v0.35.2 release WASM returns
`success: true`; `ailang check` on the same file reports an information-flow
violation. A lab about catching leaks cannot be built on a runtime that misses
them, so it ships its own checker.

**The intent is one AILANG install.** The fix is already written as
`leak_lab/upstream/repl-ifc.patch` (the gate plus a 129-line test) and filed
upstream as [ailang#1114](https://github.com/sunholo-data/ailang/issues/1114).
When it lands, `leak_lab/compiler/` can be deleted, the lab moves to the shared
runtime, and `.ailang-version` becomes the repo's single pin. Until then, do not
bump `leak_lab/compiler/go.mod` in isolation — its verdicts are the demo's
content, so any bump needs `go test ./...` and a leak lab smoke run.

## Leak lab addition

The showcase now includes **Can you make it leak?**, linked from the homepage
header, main navigation, featured section and README. The expanded local browser
suite passes **21/21** routes, including seven IFC scenarios and invalid-source
handling. Desktop/mobile layouts and failed-download recovery also pass. The lab
uses its own pinned v0.35.0 compiler; the existing demos retain v0.20.1.
See [the build and upstream fix notes](leak_lab/README.md).

## Original audit results

- **30/30** CLI checks pass using pinned AILANG **v0.20.1**, after installing the locked dependencies and repairing symlinks. No skips.
- **20/20** local browser routes pass using the **v0.20.1 release WASM**. Includes functional checks below.
- Website Builder: **118/118** server/preview tests pass; production Vite build succeeds (bundle-size warning remains).
- LinkedIn: **18/18** pure tests and **58/58** rubric assertions pass.
- WASM wrapper: **8/8** regression tests pass.
- Cognitive Commons CLI consensus exercise and ecommerce runtime contracts pass.

| Demo or page | Public findings | Locally verified after repairs | Not verified end-to-end |
|---|---|---|---|
| Hub, Document Intelligence, Streaming hub | Pages load | All three load without errors | Every outbound link |
| Document Extractor | Boots; obsolete nav script returns 404 | Invoice, contract, résumé demo data validated in AILANG; Clear All works | Live AI/schema detection, PDF extraction |
| DocParse | Boots; Slides PPTX preset contains three blank slides; obsolete nav 404 | All eight Office presets produce content, including merged tables, track changes and comments | AI PDF/image parsing |
| Z3 Verify | Boots, but Try It crashes on numeric results (`cleaned.match is not a function`); obsolete nav 404 | Runtime calls return clampPrice=250, taxRate=2100, roleWeight=100, roomCapacity=20 | Published static proof totals are not reproducible; see below |
| AI + Contracts | Static research page, not an interactive extraction app; obsolete nav 404 | Loads without errors | Independent reproduction of the cited research |
| Claude Chat | Boots | WASM readiness and page resources | Anthropic SSE response |
| Gemini Live | Boots | WASM readiness and page resources | Live audio and provider connection |
| Safe Agent | Boots | WASM readiness; CLI type-checks | Live tool calls and adversarial safety cases |
| Voice DocParse | Boots | WASM readiness; CLI type-checks | Voice conversation with documents |
| Ambient Assistant | Boots | WASM readiness; CLI type-checks | Microphone, screen sharing, live tools |
| Co-Presenter | Boots | WASM readiness; CLI module type-checks | Live audio/session controls |
| Cognitive Commons | Reports ready but logs errors importing unused std/dom and std/cognition | Clean boot; deterministic CLI consensus exercise | Live AI debate across multiple tabs |
| Website Builder | Portal loads | Portal loads, production build and 118 tests pass | Google sign-in, AI generation, Cloud build, publishing |
| Ecommerce / GA4 | Landing page has missing openapi-redoc.png | Both screenshots load; runtime contracts pass; entry points type-check | BigQuery, AI recommendations, separate React dashboard runtime |
| LinkedIn overview + three leaderboards | All four pages load; refresh workflow succeeds | Pages load; 76 assertions pass | Posting/OAuth flow; every generated sketch page |

Archived transcription, voice analytics and voice pipeline examples under `streaming/_archive/` are not current public demos and were not run. Marketing materials, benchmarks, and deliberate bug reproductions are not runnable showcase entries.

## Repairs in this checkout

1. Preserve typed numeric/boolean/object results in the shared WASM wrapper instead of calling string methods on them. Regression tests run in CI.
2. Remove unused std/dom and std/cognition imports from Cognitive Commons boot.
3. Include both ecommerce screenshots in the Pages artifact.
4. Replace the blank Slides PPTX preset with the existing content-bearing `pandoc_basic.pptx`.
5. Remove obsolete nav.js references from the four document pages. Their navigation is already inline.
6. Replace 13 machine-specific absolute symlinks with relative links, and point eight stale Website Builder DocParse links at the vendored parser package. Local site assembly now keeps generated module links inside `_site` rather than rewriting the source links.
7. Propagate failed WASM parsing calls rather than silently returning a successful partial/empty document.
8. Expand browser coverage from 7 to 20 routes and add functional parsing, extraction, and verification checks. Stop ignoring nav.js failures. Missing CLI entries now fail instead of skipping; CI prints failure details and triggers on smoke-test changes.

## Deployment and automation

The [latest Pages deployment](https://github.com/sunholo-data/ailang-demos/actions/runs/33938043178), at 02:04 UTC on September 5, failed its LinkedIn type-check. Its browser/deploy stages did not run. The [17:01 UTC LinkedIn refresh](https://github.com/sunholo-data/ailang-demos/actions/runs/33979657301) succeeded; all three workflows are active. A successful refresh does not establish that refreshed content reached Pages.

Reproduced the remote failure in an isolated copy with v0.20.1:

```text
linkedin/services/linkedin_content_loader.ail
Function 'linkedinIsHashtagLine' uses effects not declared in signature
Missing effects: FS
```

Remote main removed the `FS` annotation. Restore this line when reconciling upstream (this checkout already has it):

```ailang
func linkedinIsHashtagLine(line: string) -> bool ! {FS} {
```

The comments workflow installs the latest compiler while Pages uses `.ailang-version`, creating a compatibility gap. Avoid changing the global pin without retesting the entire showcase.

## Static verification limit

With v0.20.1, Z3 installed, and recursive depth 10 for arithmetic:

| Module | Verified | Counterexamples | Solver errors |
|---|---:|---:|---:|
| Arithmetic | 8 | 3 | 0 |
| Billing | 12 | 2 | 0 |
| Access policy | 4 | 2 | 6 |
| Scheduling | 10 | 2 | 3 |
| Total | 34 | 9 | 9 |

The solver errors concern undeclared enum sorts/constructors in generated SMT (`Role`, `Action`, `Priority`). The installed v0.35.1 development compiler skips those same nine properties instead of proving them (34 verified, 9 counterexamples, 9 skipped). Intentional counterexamples are part of the demonstration. The browser displays prerecorded results claiming more proofs; its Try It contract text is informational, not a new Z3 proof. No compiler changes or upstream messages were made.

## Reproduction

Commands and scope: [scripts/README.md](scripts/README.md#showcase-regression-checks).

The initial system CLI was v0.35.1-dirty and several locked package versions were absent. Its initial failures are not evidence that the pinned public runtime is broken. Dependencies were restored using a temporary manifest copy so the repository lockfile remained unchanged. Browser tests used an isolated context with no API keys or existing login state; no messages, posts, builds, or sites were published.
