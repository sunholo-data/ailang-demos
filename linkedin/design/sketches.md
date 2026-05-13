# Design — LinkedIn Sketches

**Status:** draft v1, 2026-05-13
**Owner:** Mark / Claude
**Scope:** add a public-asset-generation loop on top of the existing AILANG LinkedIn comment demo
**Out of scope:** the reWritable / self-modifying HTML branch (parked for a separate demo session)

---

## 1. Goal

Turn the LinkedIn campaign from broadcast-with-comments into a participatory loop that:

1. Rewards readers for engaging by producing a public AILANG-generated asset about *their* business or website, attributed pseudonymously.
2. Demonstrates AILANG's security guarantees by making them visible inside the asset itself — the function signature that produced the page is rendered on the page.
3. Drives traffic back to the demos hub each time a reader shares their sketch.
4. Builds an evergreen topic-keyed gallery of "what AILANG does for businesses like yours" that doubles as SEO surface.
5. Provides Mark with prioritisation signal for which posts to write next.

The campaign post is the bait. The sketch is the hook. The gallery is the flywheel.

---

## 2. Hard constraints

These come from prior memory entries and existing project rules — do not regress them.

- **No AI-generated replies or comments on LinkedIn.** AILANG never posts replies under posts, never @-mentions, never tags users. Conversational responses stay off LinkedIn entirely; assets land on the demos hub instead. *Distinct from* auto-publishing of top-level posts from the curated `marketing/` pipeline, which is allowed once the manual review process has built trust. The line: human-curated post content can ship automatically; AI-generated conversational responses cannot. *(memory: feedback_no_auto_linkedin_replies)*
- **GDPR / pseudonymity.** No commenter names, actor URNs, or commentUrns in public output. Initials + avatar seed are SHA-256 derivations from the actor URN. The `linkedinSanitiseComment` `! {Declassify}` boundary is the only declassification path. *(see [pkg/sunholo/linkedin/comments.ail](../../../ailang-packages/packages/linkedin/comments.ail))*
- **Manual post publishing.** Posts go up via `ailang-linkedin post <slug>` after human review. No autonomous campaign automation.
- **AILANG-first.** Every demo must exercise AILANG code paths. Browser UIs use AILANG WASM, not standalone JS that bypasses AILANG. *(see [CLAUDE.md](../../CLAUDE.md))*
- **Budget caps from day one.** Plan for success — daily AI-spend cap on the executor, queueing behaviour when exceeded.

---

## 3. User flow

```
1. Reader scrolls LinkedIn, sees an AILANG post.
2. Clicks through to https://sunholo.com/ailang-demos/linkedin/
3. Sees the conversation feed + a "Topics" panel above it.
4. Picks a topic card matching what they care about (security, observability,
   AI engineering, platform/DevX, language design, use cases).
5. Card shows the trigger phrase, e.g.:
     "Comment your URL with #ailangSecurity on the latest AILANG post."
6. Reader goes back to LinkedIn, posts a comment:
     "https://acme.com #ailangSecurity"
7. Within an hour, the existing comments cron fetches the comment.
8. New detector step parses URL + hashtag from the comment text.
9. AILANG Cloud executor runs:
     - Fetches the URL once (Net @limit=1)
     - Classifies domain + extracts what an AI would see
     - Picks topic-flavoured AILANG feature cards
     - Fills the sketch template
     - Returns rendered HTML
10. Cron commits the HTML to site/linkedin/topics/security/<seed>-<slug>/.
11. Topic index page at /linkedin/topics/security/ now lists the new sketch.
12. Reader shares the sketch URL back to their own LinkedIn / Twitter / etc.
13. New traffic lands on the demos hub, sees a richer topic gallery, repeats.
```

---

## 4. Topic taxonomy

Six topics, framed as **commercial concerns** rather than developer slices. Each one is a public landing page at `/linkedin/topics/<topic>/`. The taxonomy is **public** (it's the menu readers pick from) but the **upcoming-post slate is not** — preserves campaign reveal flexibility.

The AILANG features sit behind each topic as the *answer*, not the front. The reader self-identifies with the concern; we map their concern to the relevant primitives.

| Topic | Hashtag | Audience | One-line frame |
|---|---|---|---|
| Compliance & audit | `#ailangCompliance` | Security, legal, regulated industries | *"Make your AI defensible — audit-ready, EU-AI-Act-shaped from day one."* |
| AI spend you can predict | `#ailangBudget` | CTOs, finance, anyone with a runaway-cost story | *"Stop guessing at your AI bill. Budgets in the type signature."* |
| Privacy & data sovereignty | `#ailangPrivacy` | Enterprise data leaders, healthcare, finance, EU customers | *"Customer data labelled at the type level. Crossing the boundary is a compiler error."* |
| Production-grade agents | `#ailangReliable` | Engineering leaders shipping agents to real users | *"AI agents you can actually put in front of real users."* |
| Vendor independence | `#ailangPortable` | Architecture leads, AI strategy | *"Switch from Anthropic to Gemini to OpenAI without a rewrite."* |
| Agent-ready website | `#ailangAgentReady` | Product, marketing, content | *"When agents start transacting on your behalf — and they will — make your site speak their protocols."* |

`#ailangGeneral` (or no hashtag): sketch with a general-purpose feature mix drawn from across all six banks.

**Note on hashtag format**: LinkedIn breaks hashtags at hyphens — `#ailang-agent-ready` renders as `#ailang` plus literal `-agent-ready` text. The canonical form is now camelCase (`#ailangAgentReady`); the legacy kebab form is still parsed by the detector for backward compatibility with any existing comments.

Multi-label permitted: a comment with two hashtags produces two sketches at two URLs.

---

## 5. Sketch artefact

A single HTML page rendered from a template at `linkedin/templates/sketch.html`. Same design system as `/linkedin/` (coral accent, Montserrat + JetBrains Mono, dark/light theme). Lives at `site/linkedin/topics/<topic>/<seed>-<slug>/index.html`.

### Four sections

**1. Readiness radar (hero)**

- Six-axis radar chart: one axis per topic, scored 0–10 on **AI-readiness** (high = strong; *not* opportunity-polarity — see §6.5)
- Score for the topic the commenter asked for is highlighted; the other five render as context
- Below the radar: leaderboard rank callout for the topics that have leaderboards (currently `agent-ready`, `privacy`, `portable` — see §6.6): *"You rank #N on the [topic] leaderboard."* Topics without leaderboards omit the callout.
- The radar is the visual hero and the shareable headline — *"AILANG scored my site 7/10 for agent-readiness"* is the LinkedIn post a commenter writes themselves.

**2. What an AI sees from your site**

- One-paragraph descriptive distillation (target audience, primary jobs-to-be-done, content category)
- Chips for: detected domain category, audience, key entities
- Source: `callJson` against extracted content (from docparse or AI-fallback per §6) with a fixed schema
- Tone: dry, descriptive, not promotional

**3. AILANG × your business**

- Three feature cards, picked from the topic-keyed bank (see §7)
- Each card: feature name + one-sentence rationale tailored to their domain + ~10 lines of AILANG showing the shape
- Leads with explicit reference to the radar position: *"Your privacy readiness scored 4/10. AILANG opportunity is therefore 6/10. Here's where it would land first."*
- Example for an ecommerce site under `#ailangPrivacy`:
  - IFC labels: `string<pii>` on customer email + `! {Declassify}` on the receipt formatter
  - Capability scoping: `Net @limit=1` on the payment gateway call
  - Three-runtime deploy: same module runs in the browser (WASM), on Cloud Run, and natively

**4. The guarantee panel**

- The actual function signature of the executor:
  ```
  func sketchSite(url: string<pii>, topic: Topic) -> Sketch
    ! {Net @limit=1, AI @limit=5, FS @limit=4, Process, Declassify}
  ```
- Plain-English translations under each effect:
  - *"Read your site once. No second fetch, no crawl."*
  - *"Up to five AI calls, capped. No runaway analysis."*
  - *"Four file writes — the report, the topic index, the rubric breakdown, the queue ack. Nothing else touched."*
  - *"`Process` invokes `docparse` for structured extraction. The capability is visible in the type."*
  - *"Your URL crossed `Declassify`. No PII survives into this page."*
- Score breakdown — expandable section listing every signal that fed each topic's score, with ✓ / ✗ / N/A and points contributed. Falsifiable, verifiable against the rubric in this repo.
- Methodology link: *"The rubric that scored this page is open-source AILANG code — every signal extractor is contract-verified. [View rubric →](https://github.com/sunholo-data/ailang-demos/blob/main/linkedin/design/scoring-rubric.md)"*
- Footer handshake: *"Public sketch. The private version reads your full site against your data — mark@aitanalabs.com"*

### Layout shape

```
┌─────────────────────────────────────────────────┐
│ AILANG × acme.com                topic: privacy │
│ — pseudonymous initials, generated 2026-05-13   │
├─────────────────────────────────────────────────┤
│ §1 AI-readiness radar                           │
│                                                 │
│        compliance                               │
│            ╱─10─╲                               │
│    portable      agent-ready    ← highlighted   │
│        ╲ . . . ╱                                │
│     reliable    privacy                         │
│            ╲ . ╱                                │
│            budget                               │
│                                                 │
│ Your rank on the agent-ready leaderboard: #14   │
├─────────────────────────────────────────────────┤
│ §2 What an AI sees from your site               │
│   [chips]  [chips]  [chips]                     │
│   [narrative paragraph]                         │
├─────────────────────────────────────────────────┤
│ §3 AILANG × your business                       │
│   You scored 4/10 — AILANG opportunity 6/10     │
│   ┌─[card 1]─┐ ┌─[card 2]─┐ ┌─[card 3]─┐        │
│   │ feature  │ │ feature  │ │ feature  │        │
│   │ rationale│ │ rationale│ │ rationale│        │
│   │ code     │ │ code     │ │ code     │        │
│   └──────────┘ └──────────┘ └──────────┘        │
├─────────────────────────────────────────────────┤
│ §4 The guarantee                                │
│   func sketchSite(...) ! {Net @limit=1, ...}    │
│   ▸ Read your site once...                      │
│   ▸ Up to five AI calls...                      │
│   ▸ Score breakdown ▾ (expandable)              │
│   [View rubric →]                               │
├─────────────────────────────────────────────────┤
│ Public sketch — mark@aitanalabs.com             │
└─────────────────────────────────────────────────┘
```

---

## 6. Architecture

```
┌─────────────────────┐
│ LinkedIn post       │
│ (manual publish)    │
└──────────┬──────────┘
           ↓ reader comments "URL #hashtag"
┌─────────────────────┐
│ Hourly cron         │
│ (GitHub Actions)    │
│                     │
│ ① fetch comments    │
│   (existing)        │
│ ② detect URL+tag    │  ← NEW
│ ③ enqueue sketch    │  ← NEW
│ ④ dispatch executor │  ← NEW
│ ⑤ commit HTML       │  ← NEW
└──────────┬──────────┘
           ↓
┌─────────────────────┐    ┌──────────────────────┐
│ AILANG Cloud        │ or │ Local CLI            │
│ executor            │    │ ailang-linkedin      │
│ sketchSite()        │    │   sketch <url> <tag> │
│                     │    │                      │
│ same .ail module    │    │ same .ail module     │
└──────────┬──────────┘    └─────────┬────────────┘
           │                         │
           ↓                         ↓
┌─────────────────────────────────────────────────┐
│ site/linkedin/topics/<topic>/<seed>-<slug>/     │
│   index.html (rendered from template)           │
└──────────┬──────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────┐
│ /linkedin/topics/<topic>/  (index page)         │
│   — auto-aggregates sketches by topic           │
└─────────────────────────────────────────────────┘
```

### Content extraction — docparse-first, AI-fallback

The executor's first job after fetching the URL is extracting structured content. We use [`sunholo/ailang-parse`](https://www.sunholo.com/ailang-parse/) (`docparse` CLI) as the primary extractor — it produces a typed Block ADT (paragraphs, headings, tables, images) with zero AI cost when it succeeds.

| Content-Type / extension | Path | Notes |
|---|---|---|
| `application/pdf` | `docparse <file>` | Deterministic + AI-image-description. Best fidelity. |
| `.docx` / `.pptx` / `.xlsx` | `docparse <file>` | Deterministic XML parsing. Rare for live URLs but cheap to support. |
| `text/html` (XHTML-valid) | `docparse <file>` | Works for content-CMS pages, academic, government, some marketing. |
| `text/html` (lenient HTML5) | Fall back to `callJson(html, ContentSchema)` | The common case for modern web — docparse's `std/xml` parser is strict, real pages have unquoted attributes etc. Known gap to file back to ailang-parse. |
| Empty body / JS-only | Polite refuse | Link back to "describe your use case in one line on LinkedIn instead". |

The two-stage path is also our credibility hook in the guarantee panel: *"We tried structured parsing first (zero AI calls). It worked / it fell back to LLM extraction. Here's which path ran."*

### Modules to add

| File | Purpose |
|---|---|
| `linkedin/services/sketch.ail` | The executor. Inputs: `url`, `topic`, `initials`, `avatarSeed`. Outputs: `Sketch` record. Effects: `! {Net @limit=1, FS @limit=4, AI @limit=5, Process, Declassify}` (`Process` is for invoking the `docparse` CLI). |
| `linkedin/services/sketch_extract.ail` | The docparse-first / AI-fallback extraction pipeline. Calls `docparse` via `std/process`, parses the JSON output, falls back to `callJson` if blocks are thin/empty. |
| `linkedin/services/sketch_rubric.ail` | The scoring rubric. One named function per signal, each with a `requires`/`ensures` contract. Pure-deterministic signals carry no effects; AI-classified signals declare `! {AI}` in their signature. Z3-verifiable bounds. |
| `linkedin/services/sketch_rubric_signals.ail` | Static signal registry: master list of signals, weights, per-topic groupings, max-points, descriptions. Reviewable as a single table. |
| `linkedin/services/sketch_leaderboard.ail` | Reads all sketches under a topic, ranks by score, writes per-topic leaderboard JSON consumed by topic-index pages. Daily snapshot. |
| `linkedin/services/sketch_template.ail` | Pure function: `Sketch` → HTML string. No effects beyond `FS` for writing the file. |
| `linkedin/services/sketch_features.ail` | Topic-keyed feature bank. Static data, hand-curated. |
| `linkedin/services/sketch_queue.ail` | Queue read/write. Pending requests in `linkedin/data/sketch_queue.json`. Idempotent on `(avatarSeed, url, topic)`. |
| `linkedin/types/sketch_types.ail` | `Topic`, `Sketch`, `FeatureCard`, `SketchRequest`, `ExtractedContent`, `Signal`, `TopicScore`, `LeaderboardEntry` ADTs. |
| `linkedin/templates/sketch.html` | The Mustache-style HTML template. |
| `linkedin/design/scoring-rubric.md` | Human-readable rubric: every signal, why we measure it, how we detect it, points it contributes, which topic(s) it feeds. The reader-facing methodology page. |
| `linkedin/tests/test_rubric.ail` | Inline + property tests on the rubric. *"For any input without `/openapi.json`, the agent-ready score contains zero contribution from that signal."* Z3-verifiable. |
| `linkedin/scripts/sketch_local` | Bash wrapper for local CLI form. |

### External dependencies

- `sunholo/ailang-parse` — docparse CLI must be on `PATH` (CI: install via `npm install -g @sunholo/ailang-parse` or download from releases; local dev: existing `~/.local/bin/docparse` symlink).
- Cloud executor packaging includes the docparse binary in the container image.

### Cron additions

In `.github/workflows/linkedin-comments.yml`, after the existing comments-fetch step:

1. Run `ailang-linkedin sketch-detect` — scans new comments for URL + `#ailang-*` patterns, appends to `sketch_queue.json`.
2. Run `ailang-linkedin sketch-dispatch` — pops N entries off the queue (N = daily-budget remaining), runs the executor for each, writes HTML files.
3. Regenerate topic-index pages by reading the file tree.
4. Commit + push if anything changed.

### Daily budget

- Soft cap: `AI @limit=5` per sketch × N sketches/day = ~5N AI calls
- Default `N=10` sketches/day. Queue overflow → re-attempted next run.
- Tracked in `linkedin/data/sketch_budget.json` with daily reset at UTC midnight.

---

## 6.5 Scoring & rubric

Every sketch carries an AI-readiness score per topic, rendered as a six-axis radar at the top of the page (see §5). The score drives the leaderboards (§6.6) and the "AILANG opportunity" framing inside each sketch's deep-dive (opportunity = 10 − readiness on the same axis).

### Hard rule: every signal maps to an AILANG primitive

The rubric only measures things AILANG actually addresses. If a reader's site scores low on a signal, there must be a specific AILANG feature they could adopt to score higher. Signals that are generic "AI-readiness" markers (`llms.txt`, JSON-LD, robots.txt agent allowlisting, OpenGraph, cookie consent quality, HTTPS strength, status pages, security.txt, etc.) are **not** in the rubric because AILANG doesn't have a position on them.

This is both a credibility move (we're not pretending to score things outside our remit) and a roadmap signal — the rubric is a public statement of what AILANG cares about. Pull requests that propose new signals are also pull requests against the AILANG roadmap; signals that get strong community support are evidence that the underlying feature deserves prioritisation.

### Polarity: AI-readiness (high = good)

- The radar plot and the leaderboards use **readiness** polarity: high = strong AI-readiness, low = weak
- The "AILANG opportunity" framing used inside the §3 deep-dive is the inverse on the same axis: `opportunity = 10 − readiness`
- Reasoning: leaderboards need "top = good" semantics or the competitive incentive inverts; per-sketch sales pitch needs "high = AILANG can help a lot" or it embarrasses already-mature sites
- Same data, two readings, both surfaced explicitly

### Signal inventory (v1 — strict map to AILANG primitives)

| Signal | Topic(s) | Detection | AILANG primitive it maps to | Effects |
|---|---|---|---|---|
| `/.well-known/agent.json` present | `agent-ready` | HTTP HEAD/GET | `serve-api` generates A2A agent cards | pure |
| `/openapi.json`, `/openapi.yaml`, `/api/_meta/redoc` present | `agent-ready` | HTTP HEAD/GET on each | `serve-api` generates OpenAPI 3.1 from HM type signatures | pure |
| MCP endpoint discoverable (`/mcp/`, `/mcp/sse`) | `agent-ready` | HTTP HEAD | `serve-api --mcp-http` | pure |
| Linked public API docs | `agent-ready` | parse fetched HTML for `<a>` to common doc paths | `serve-api` provides Swagger + ReDoc at `/api/_meta/` | `! {AI}` (light classifier on link text) |
| Site visibly uses named LLM provider (Claude/GPT/Gemini mention) | `privacy`, `portable` | AI-classified scan of page content | `std/ai` multi-provider + IFC labels | `! {AI}` |
| Visible third-party tracking domains | `privacy` | parse `<script src>`, `<img src>` external domains | Capability scoping — these would be declared `! {Net}` calls in AILANG | pure |
| Data residency / on-prem language | `privacy` | AI-classified scan of policy/footer | Three-runtime deploy (WASM/Cloud Run/native) | `! {AI}` |
| Single-vendor LLM language ("powered by Claude") | `portable` | AI-classified | `std/ai` multi-provider — one-character switch in AILANG | `! {AI}` |

The full signal list (with weights, max-points, and the rubric for AI-classified scans) lives in `linkedin/design/scoring-rubric.md` — that file is the public methodology.

### Topics without observable signals (V1)

These topics get **sketches and feature cards** but **no leaderboard ranking** — we can't honestly score them from a single page fetch:

- `compliance` — auditability isn't visible from a marketing page
- `budget` — AI spend isn't visible from a marketing page
- `reliable` — agent reliability isn't observable from a static fetch

For these topics the §1 radar still shows an axis, but the score is computed as a **domain-relevance opportunity score** rather than a readiness score — AI-classified from the detected domain ("for a fintech, compliance opportunity is high; for a personal blog, low"). The radar surfaces it; the leaderboard pages do not include it.

This is signposted explicitly on the rubric page: *"Three of the six topics don't have a leaderboard because we can't honestly score them from a single page fetch. The sketch still shows you the AILANG features that would help."*

### Per-sketch transparency

Every sketch's §4 (guarantee panel) has an expandable **"Score breakdown"** showing every signal that contributed to every topic's score, with ✓ / ✗ / N/A and the points awarded. The reader can verify the maths against `linkedin/design/scoring-rubric.md` on GitHub — falsifiable, not vibes.

Each row of the breakdown also names the AILANG primitive that signal maps to, so the reader can connect a missing signal directly to a feature they could adopt.

### Z3-verifiable score bounds

Every signal extractor function in `sketch_rubric.ail` carries contracts:

```ailang
func hasOpenApi(url, headers, body) -> int
  requires { length(url) > 0 }
  ensures  { result >= 0, result <= 2 }
  ! {}
{
  -- detection logic
}
```

The aggregator function on top has the wider invariant:

```ailang
func computeTopicScore(signals: List[Signal], topic: Topic) -> int
  ensures { result >= 0, result <= 10 }
{
  -- weighted sum, clamped
}
```

Z3 verifies these bounds hold at compile time. A scoring function cannot return 11/10.

### Contribution mechanic

The rubric is an open-source AILANG file. PRs against `sketch_rubric_signals.ail` are welcomed when:
- The new signal maps to an existing AILANG primitive (rule above), and
- The detection logic is deterministic or carries a documented `! {AI}` effect, and
- The contract bounds hold under Z3.

This makes the rubric itself a public conversation about what matters in AILANG-shaped AI engineering. It also gives the campaign a concrete reason to point readers at the AILANG GitHub.

---

## 6.6 Leaderboards

### Where they live

- **Per-topic leaderboards** at each topic landing page `/linkedin/topics/<topic>/` — currently `agent-ready`, `privacy`, `portable` (the three topics with observable signals per §6.5)
- **Overall leaderboard** at the topics index `/linkedin/topics/` — composite score (equal-weighted average across the three scored topics, called out as such)
- Topics without a leaderboard (`compliance`, `budget`, `reliable`) show their gallery on the landing page but no ranking column — explicitly flagged as *"this topic doesn't have a leaderboard; we can't score it honestly from a single page fetch"*

### Visual shape

Each row:

```
#3   ┌──┐  acme.com         8.4/10   sketch ↗   updated 2026-05-13
     │OP│  ▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢
     └──┘  pseudonymous initials + conic-gradient avatar
```

- **Rank prominent** (left column, large), score secondary (small)
- Domain (not full URL — `acme.com/about` and `acme.com/pricing` collapse to `acme.com`)
- Pseudonymous initials + avatar from the existing `linkedinDerivePersona` SHA-256 scheme
- Sketch link opens the full sketch page in a new tab
- "Updated" timestamp shows when the sketch was last (re)generated

### Anti-shame design

- **Top 10 shown publicly with ranks**. Entries below 10 exist in the gallery (so commenters still get their sketch published) but display without a rank number — only an "in the gallery" tag.
- Same domain ranked once (latest sketch wins) — prevents grinding by submitting many URLs from the same site.

### Rate limiting

- **One successful re-score per domain per month.** A site doesn't change AI-readiness in a day, so there's no reason for daily re-runs. The monthly cadence also keeps the leaderboard stable and shareable.
- **Failed-score retries don't count.** A sketch that errored out on a docparse crash, an AI provider 5xx, a network timeout, or a fetch hitting an empty body can be re-attempted as often as needed — those are technical failures, not real scoring runs.
- A monthly window per `(domain, topic)` tuple, tracked in `linkedin/data/sketch_budget.json` alongside the daily AI budget.
- Manual override: `?refresh=1` on the sketch URL forces a re-run — useful when a site owner adds a new signal (publishes their `agent.json`, exposes an OpenAPI endpoint) and wants to demonstrate the improvement before the next month rolls over.

### Update cadence

- **Daily snapshot at UTC 00:00**. New sketches inside the day appear in the gallery immediately but are re-ranked into the leaderboard at the next snapshot.
- Timestamped header: *"AI-readiness leaderboard · refreshed daily · last update 2026-05-13"*
- Reasoning: less volatile, easier to share a screenshot of, gives a daily cadence to the "you climbed/dropped" satisfaction loop.

### Composite weighting

- Overall leaderboard uses **equal weight** across the three scored topics (`agent-ready`, `privacy`, `portable`)
- Methodology link visible: *"All scored topics weighted equally. See methodology →"*

### Open-data export

The leaderboard JSON is published alongside the HTML at `site/linkedin/topics/<topic>/leaderboard.json` so anyone can consume the ranking programmatically — including, eventually, an AILANG MCP tool that returns *"who ranks where on AI-readiness for [topic]"*.

---

## 7. Topic × AILANG feature mapping (v1)

Hand-curated. Each topic picks 3 cards from its bank for the sketch. The detected domain (ecommerce / content / SaaS / marketing / dev-tool) refines which concrete code examples appear inside each card.

| Topic | Feature bank (3 cards drawn from this) |
|---|---|
| `compliance` | (a) Contracts as documented limitations (`requires`/`ensures` → EU AI Act Art. 13 mapping), (b) OpenTelemetry traces as audit trail, (c) Capability declarations + `--caps` as scope-of-authority record, (d) IFC labels as data-category documentation |
| `budget` | (a) Capability budgets in the type (`Net @limit=N`), (b) Cross-provider prompt caching (`cacheHint`), (c) Eval-harness-driven cheap-model routing, (d) Multi-provider arbitrage via `std/ai` |
| `privacy` | (a) IFC labels (`string<pii>`) + `Declassify` boundary, (b) Capability scoping (`! {FS}` only granted where needed), (c) WASM-in-browser (data never leaves the user's tab), (d) On-prem deployability (same binary across CLI / Cloud Run / WASM) |
| `reliable` | (a) Capability boundaries preventing Replit-class incidents, (b) Contracts + Z3 cross-module verification, (c) "Fewer ways to go wrong" — pattern matching only, no globals, one shape per traversal, (d) Eval harness as regression catcher |
| `portable` | (a) `std/ai` multi-provider abstraction, (b) OpenRouter routing + replayable model resolution, (c) Structured output (`callJson`) mapping to each provider's native primitive, (d) Prompt caching that maps to `cache_control` / `CachedContent` / implicit-threshold per provider |
| `agent-ready` | (a) `serve-api` → REST + MCP + A2A + OpenAPI in one command, (b) Contract-verified tool calls (the Safe Agent pattern), (c) `submit_feedback` MCP tool — feedback loop with agent consumers, (d) Agent-readable docs MCP server |
| `general` | Picks the three highest-relevance cards across all banks based on detected domain |

---

## 8. Local CLI vs Cloud executor

Same `.ail` module, two invocation paths. Matches the website-builder pattern.

**Local CLI** — `ailang-linkedin sketch <url> [--topic security]`
- Used for testing, demos, and as the open-source reference implementation
- Runs against ADC for Gemini, or a local API key
- Writes the page locally in `site/linkedin/topics/...`
- Lives in this repo, MIT/Apache licensed alongside the rest

**Cloud executor** — deployed on AILANG Cloud
- Same module, hosted at a Cloud Run URL
- Triggered by the cron via HTTP POST with `{url, topic, initials, avatarSeed}`
- Service account scoped to the GCS bucket + AI provider keys
- Returns the rendered HTML; cron commits it to the repo
- Reuses the executor pattern from website-builder

The open-source-vs-hosted split is itself part of the campaign: *"the local version runs on your laptop; the hosted version runs on AILANG Cloud."*

---

## 9. The reWritable / WASM branch (parked)

Separate session will explore: a single-file HTML demo that ships AILANG WASM inline and rewrites itself with the visitor's sketch when they paste a URL into the page — harness-engineering-in-an-HTML-file applied to AILANG. The artefact is the runtime; the privacy story becomes literal because nothing leaves the visitor's browser except the AILANG Cloud fetch-proxy call.

For *this* design doc: not in scope, but the executor module (`sketch.ail`) should be designed so the same code compiles for both targets — native CLI, Cloud Run executor, and (later) WASM browser. No host-specific assumptions.

---

## 10. Open questions

Marked **▸** are blockers for starting code. Marked **○** are iterable while we build. ✓ = resolved this session.

**○ Q1. Domain taxonomy depth for the feature mapper.**
Five domains feels right (ecommerce, content/media, SaaS-internal-tool, marketing/brochure, dev-tool/API). Each domain has a curated example per feature card. *(Detail — iterable as we curate example banks; doesn't block initial build.)*

**○ Q2. Opaque-URL fallback.** ✓ defaulted
Partially answered by the docparse-first / AI-fallback pipeline (§6). docparse handles PDFs, Office formats and XHTML-valid HTML deterministically; lenient HTML5 falls back to `callJson` extraction. The remaining gap is **JS-only sites that return empty HTML** to a server-side fetch.
- **V1 default: (a) refuse politely** on empty/insufficient text and link to "describe your use case in one line on LinkedIn instead"
- (b) Headless-fetch service (Playwright on Cloud Run, ~$0.005/render) as a third tier — revisit if a meaningful share of commenters hit the empty-fetch path.

**○ Q3. URL canonicalisation in the guarantee panel.** ✓ defaulted
The panel shows "we fetched `<url>`". **V1 default: strip `?utm=*` and fragments before display.** Sites' analytics tracking shouldn't leak publicly. The "byte-honest" claim softened to "we fetched this URL, after stripping marketing query params."

**▸ Q4. AILANG primitive coverage of the rubric signals.**
Every signal in §6.5 must map to an AILANG feature a reader can adopt. Initial signal list strictly follows this rule (`agent.json`, `openapi.json`, MCP endpoint, etc.). Sign-off needed: are there signals you'd drop from the list, or AILANG primitives missing that should be added?

**○ Q5. Handshake destination in the footer.**
`mailto:`, Multivac signup, or a "book a call" form? Affects conversion mechanic.

**○ Q6. Topic-index pages — non-ranked sort order.**
For topics without leaderboards (`compliance`, `budget`, `reliable`): most-recent first, or curated? Most-recent is honest and zero-effort; curated needs human-in-the-loop.

**○ Q7. Re-sketch on demand.**
If the same `(avatarSeed, url, topic)` shows up twice, do we re-run (newer data, more AI spend) or serve cached? Cache, with `?refresh=1` query string to force re-run.

**○ Q8. Sketch deletion / opt-out.**
A commenter wants their sketch removed. Mechanism? Suggest: a deletion-key shown only to the URL owner (verified via a meta tag they add to their site), plus a `mailto:` fallback.

**○ Q9. Anti-gaming policy enforcement.** ✓ defaulted
One **successful** re-score per `(domain, topic)` per month (§6.6) — sites don't change AI-readiness daily. Failed-score retries (docparse crashes, AI 5xx, network timeouts, empty fetches) do not count against the limit. Manual `?refresh=1` override available for genuine site changes between monthly windows. Repeat submissions inside the window are dropped silently — log only, no surfacing back to the commenter.

**○ Q10. Leaderboard composition for the topics without observable signals.**
Currently `compliance`, `budget`, `reliable` have no leaderboard. The §1 radar still shows an axis for them, computed as a domain-relevance opportunity score. Is showing them on the radar at all the right call (it implies a ranking), or should the radar omit them too? Lean: keep them on the radar with a clearly different visual treatment (dashed line, lighter shade, hover-explainer).

---

## 11. Build order

After Q4 (rubric signal coverage) is signed off — the other open questions are iterable while we build:

1. **Types + template + feature bank** — pure data work, no AI calls. Lands the contract for everything downstream. Includes the new `Signal`, `TopicScore`, `LeaderboardEntry` ADTs.
2. **Rubric (`sketch_rubric.ail` + `sketch_rubric_signals.ail`)** — every signal extractor with `requires`/`ensures` contracts; signal registry as static data; `linkedin/design/scoring-rubric.md` published alongside. Z3-verifiable bounds. Tests in `linkedin/tests/test_rubric.ail`.
3. **Extraction pipeline (`sketch_extract.ail`)** — docparse-first / AI-fallback. Test against a fixed corpus of ~10 URLs (mix of PDF, Office, XHTML, lenient HTML5, JS-only) so we know which paths trigger where.
4. **`sketch.ail` executor** — wires extraction + rubric scoring + feature selection + template. Local-CLI-runnable from day one. Test against the same corpus.
5. **Local CLI wrapper** — `ailang-linkedin sketch <url> --topic <t>`. Smoke-test that we can hand-generate a sketch.
6. **Topic index pages + leaderboards** — `sketch_leaderboard.ail` reads the gallery, writes per-topic JSON, topic pages render the ranking table. Anti-shame design (top 10 ranked, rest in gallery).
7. **Cron sketch-detect step** — URL + hashtag regex. Idempotent. Test against the existing comments.json.
8. **Cron sketch-dispatch step** — calls the executor for each queue entry. Honest daily budget.
9. **Cron leaderboard-snapshot step** — daily, at UTC 00:00. Generates ranked JSON for each scored topic.
10. **Topics panel on `/linkedin/`** — links to each topic index page with live counts.
11. **AILANG Cloud deployment** — same `sketch.ail` packaged as a Cloud Run executor (with docparse binary in the image), called via HTTP by the cron.

Each step is independently shippable and reversible.

---

## 12. Success criteria

V1 ships when:

- A new comment with `<url> #ailangAgentReady` on any AILANG LinkedIn post produces a public sketch within one hour
- The sketch page renders the AILANG function signature it ran under, with plain-English translations
- The sketch page shows a six-axis AI-readiness radar with a score per topic
- The sketch page shows the commenter's rank on the relevant topic leaderboard (where applicable)
- The score breakdown is expandable and falsifiable against the published rubric
- The `/linkedin/topics/agent-ready/` index lists the sketch with a working link and updated leaderboard position
- `linkedin/design/scoring-rubric.md` is published and linked from every sketch footer
- Total AI spend per sketch is bounded by `AI @limit=5`
- A reader can re-generate any sketch locally with `ailang-linkedin sketch <url> --topic agent-ready`
- The whole flow type-checks under `ailang check linkedin/`
- Every rubric signal extractor passes its Z3 contract bounds (`ailang check --verify-contracts linkedin/services/sketch_rubric.ail`)

Stretch:

- Topic-index pages rank well for "AILANG agent-readiness for [domain]" searches within 30 days
- ≥ 1 commenter shares their sketch URL back to LinkedIn within the first week
- ≥ 1 sketch turns into a real Multivac inbound enquiry within the first month
- ≥ 1 community PR against the rubric — signal added or weighting adjusted — within the first quarter
- The leaderboard JSON export is consumed by at least one external tool/agent
