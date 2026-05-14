---
name: rubric-audit
description: Audit the LinkedIn sketch rubric — measure per-signal fire rates across rendered sketches, identify dead/collapsed/healthy signals, propose changes following the "every signal maps to an AILANG primitive" rule, apply edits to sketch_rubric_signals.ail + sketch_rubric.ail + tests + design doc, then re-seed memory-safely. Use when user asks to improve rubric scores, audit signal fire rates, analyse why sketches score low/high, add new signals, broaden detection patterns, or tune the rubric for the LinkedIn sketches demo.
---

# Rubric Audit

A repeatable playbook for tuning the LinkedIn sketch rubric. The rubric scores fetched commercial pages against AILANG-mappable signals; this skill measures whether each signal is doing its job, proposes targeted fixes, and ships them safely.

## When to use

User asks any of:
- "audit the rubric"
- "improve our scores"
- "why does X score so low / high"
- "what signals fire / never fire"
- "add a new signal for Y"
- "broaden the detection for Z"
- "how can we tune the rubric"

Also use proactively when you've just shipped a batch of new sketches and the user wants to know if the rubric is discriminating well.

## The hard rule (design-doc compliant)

**Every signal we measure must map to an AILANG primitive a reader could adopt.**

This is non-negotiable — it's the credibility rule documented in `linkedin/design/scoring-rubric.md`. If you can't name the AILANG feature a low-scoring reader would adopt to score higher, don't add the signal. Generic AI-readiness markers (`llms.txt`, `robots.txt`, JSON-LD, OpenGraph, cookie-consent, HTTPS strength) are explicitly out of scope.

When proposing a new signal, you must answer:
1. What body-text pattern detects it?
2. What AILANG primitive does it map to? (effect rows, capabilities, contracts, IFC labels, `serve-api`'s protocols, `std/ai`, three-runtime deploy, `std/jwt`, …)
3. Why is the polarity what it is? (positive: detected = pts; penalty: detected = 0 pts; informational: split pts.)

## Four-phase workflow

### Phase 1 — Inventory the current rubric

```bash
.claude/skills/rubric-audit/scripts/audit_fire_rates.sh
```

Walks every rendered sketch HTML under `site/linkedin/topics/<topic>/*/index.html`, extracts the per-signal `(name, detected, points, max)` rows from the rubric breakdown table, and prints a fire-rate table.

Three buckets that matter:
- **Always firing (~100%)** — signal collapsed; the keyword is so common it doesn't discriminate. Either tighten the pattern, flip polarity, or drop.
- **Never firing (0%)** — vocabulary too narrow, OR signal is bleeding-edge (no commercial site has adopted it). Broaden keywords, lower max points to make it a moonshot bonus, or drop.
- **Healthy discriminators (15–60%)** — these are pulling their weight. Leave alone unless you have specific reasons.

### Phase 2 — Diagnose individual low-scoring sketches

```bash
.claude/skills/rubric-audit/scripts/grep_missed_signals.sh <url> [<url> ...]
```

Re-fetches each URL and greps it against an extended pattern set (broader synonyms than the live rubric). Output shows which signals would fire with the broader vocabulary — guides the broadening proposals.

Note: uses a Firefox UA to bypass simple bot blocks. Some pages 404 on generic developer-portal URLs (e.g. `pleo.io/en/developers` is gone); in that case the URL itself is wrong, not the rubric.

### Phase 3 — Propose & apply changes

Edits land in **four** files together:

1. **`linkedin/services/sketch_rubric_signals.ail`** — signal definitions (name, description, topic, maxPoints, ailangFeature mapping). Drop or update `sigX()` functions; update the `sketchAllSignalDefs()` registry.

2. **`linkedin/services/sketch_rubric.ail`** — detection logic. Each scorer is `scoreX(body: string) -> Signal` with `ensures { result.points >= 0, result.points <= result.maxPoints }`. Update keyword lists; update the `sketchScoreAllSignals` aggregator.

3. **`linkedin/tests/test_rubric.ail`** — assertions. Add `score X / max-pts` checks for new scorers. Update the `expected` total and the `scoreAllSignals returns N signals` count.

4. **`linkedin/design/scoring-rubric.md`** — the public methodology table. Every signal in the registry must have a row.

Type-check + run tests as you go:
```bash
ailang check linkedin/services/sketch_rubric_signals.ail
ailang check linkedin/services/sketch_rubric.ail
ailang check linkedin/tests/test_rubric.ail
ailang run --entry main --caps IO linkedin/tests/test_rubric.ail   # expect "OK: N/N assertions passed"
```

### Phase 4 — Re-seed memory-safely

```bash
.claude/skills/rubric-audit/scripts/reseed_all.sh
```

Runs 6 batches of 5 sketches each with `AILANG_TRACE=off`.

**Memory pitfall**: the default `AILANG_TRACE=standard` buffers spans for GCP export and OOMs the laptop on long batches. Always set `AILANG_TRACE=off` for the seeder. Upstream feedback message lodged: `msg_20260514_102403_ff4a0a00` in `~/.ailang/state/messages.db`.

After re-seeding, the leaderboard JSONs are rebuilt automatically. Inspect the new spread:
```bash
.claude/skills/rubric-audit/scripts/show_leaderboards.sh
```

A healthy spread is 0–10 range with at least 3 distinct scores per topic. If everyone clusters at one score, the signals are still too coarse — go back to Phase 1.

## Lessons from previous audits

These are real findings from the last audits — pattern-match against them before reinventing:

- **`Single-vendor LLM` penalty** only catches "powered by Claude" / "powered by GPT" — but real lock-in copy says "Claude-powered", "running on Anthropic", "uses GPT", "based on Gemini". The original keyword set was too narrow.
- **`agent.json`** is the canonical 0% signal until A2A adoption picks up. Lowered to 1pt — moonshot bonus, not baseline expectation.
- **`"powered by ai"`** matches *every* commercial page. Never use it as a discriminator.
- **Privacy clustered at 3/10** when there were only 3 binary privacy signals. Adding 3 more (E2EE, compliance certs, data-min) broke the cluster open.
- **`Streaming / SSE`** fires 0% if keywords are only `SSE`, `text/event-stream`, `EventSource`. Real pages say "real-time API", "websocket API", "stream API".
- **`BYO key`** vocabulary: "bring-your-own", "your own key", "use any provider", "your own model", "caller-provided" — all real, all needed beyond just `BYOK`.

## URL-verification rule

**Never trust a seed URL until you've curl'd it for a 2xx response.** A 404 body that's >200 chars passes the polite-refuse threshold and produces a "sketch" of nothing — the pleo.io case (`/en/developers` and `/en/security` both 404, but Pleo's 404 page is 5KB of marketing copy that compiled into a 1/10 score). Closed by `sketchFetch` rejecting non-2xx in `linkedin/services/sketch_extract.ail` — but before adding a URL to `linkedin/sketch_seed_main.ail`, probe it:

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:115.0) Gecko/20100101 Firefox/115.0"
/usr/bin/curl -sIL -A "$UA" -m 8 "$url" -o /dev/null -w "%{http_code} %{url_effective}\n"
```

Anything that isn't 200 → don't add. If the obvious developer-portal URL is 404 (Pleo's was), follow the sitemap or the link graph from the homepage to find what *does* exist publicly. Often it's `/integrations`, `/legal`, or `/security-and-compliance` — pages a partner-API platform actually does publish.

## Files this skill maintains

| File | Purpose |
|---|---|
| `linkedin/services/sketch_rubric_signals.ail` | Signal manifest (one fn per signal) |
| `linkedin/services/sketch_rubric.ail` | Detection logic + aggregator |
| `linkedin/tests/test_rubric.ail` | Assertions (currently 50/50) |
| `linkedin/design/scoring-rubric.md` | Public methodology table |
| `linkedin/sketch_seed_main.ail` | Seeder with `argv[1..2]=start/end` slicing |
| `site/linkedin/topics/<t>/<slug>/index.html` | Rendered sketches the audit reads from |

## Do not

- Add a signal whose AILANG-feature mapping is a stretch — design-doc credibility rule.
- Run the seeder without `AILANG_TRACE=off` — OOMs the laptop.
- Run the seeder in one big slice — batch at most 5 at a time.
- Touch `/Users/mark/dev/sunholo/ailang-parse/**` (separate repo; deny rule in `.claude/settings.local.json`).

## Future improvements (post-skill)

When the user wants a faster iteration loop:
- Persist `extracted.json` next to `sketch.json` (the full `ExtractedContent` incl. `rawBody`) so re-scoring is `! {FS, IO}` only — no Net, no AI.
- Add a `sketch_rescore_main.ail` entry point that walks the cache and re-renders without re-fetching.
- "Tune rubric → measure" cycle becomes seconds instead of minutes; cost-free experimentation.
