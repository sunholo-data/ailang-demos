# Scoring rubric

**This is the public methodology behind every AILANG × your-business sketch.**
Every score on every sketch is computed by the rules on this page, executed by the contract-verified AILANG code in [`linkedin/services/sketch_rubric.ail`](../services/sketch_rubric.ail). Nothing is hidden.

---

## The single rule

> **Every signal we measure maps to an AILANG primitive a reader could adopt.**

This is the credibility rule. We don't score `llms.txt`, generic robots.txt agent allowlisting, JSON-LD completeness, OpenGraph tags, cookie consent quality, HTTPS strength, status-page presence, or `security.txt` — not because they don't matter, but because AILANG doesn't have a position on them. Scoring you on things we don't address would be either generic AI-readiness virtue-signalling, or worse — selling you a problem we can't solve.

What we **do** measure: signals that map directly to a primitive in AILANG (effect rows, capabilities, contracts, IFC labels, `serve-api`'s REST+MCP+A2A+OpenAPI generator, `std/ai` multi-provider, the three-runtime deploy story).

If you'd like AILANG to score something we don't currently measure, the way to make that happen is open a PR against [`sketch_rubric_signals.ail`](../services/sketch_rubric_signals.ail) adding the signal — and, in doing so, you're also proposing the underlying AILANG feature for the roadmap.

---

## Polarity

Scores are **AI-readiness** — high is good, low means there's headroom AILANG could fill. The radar chart on every sketch uses the same polarity, so the top of the leaderboard is genuinely a flex.

Inside the §3 deep-dive on each sketch you'll also see the *inverse* framed as **AILANG opportunity** (`opportunity = 10 − readiness`). Same axis, two readings: leaderboards work better with "high = good" semantics; sales-pitch deep-dives work better with "high = AILANG can help a lot."

---

## What we score

**Three topics, all with observable signals and leaderboards:**

- `agent-ready` — concrete protocol presence (A2A, OpenAPI, MCP, public API docs, webhooks, rate-limit docs, streaming endpoints, sandbox/test mode, authentication, idempotency)
- `privacy` — third-party data flow + data residency language
- `portable` — vendor-lock indicators, multi-provider citations, cross-runtime claims, BYO-key / model-agnostic language

**Topics we considered and dropped (V0 → V1):**

Compliance & audit, AI spend, and production-grade agents were initially in the taxonomy but moved out for V1 because they can't be **honestly scored** from a single page fetch — audit trails, AI spend, and runtime agent reliability aren't visible on a marketing page. Rather than show a misleading 0/10 score or a qualitative-only sketch, V1 stays narrow. Those concerns are still real AILANG selling points — they're covered in the campaign **post content** itself, not in per-comment sketches.

Legacy hashtags (`#ailangCompliance`, `#ailangBudget`, `#ailangReliable`) and unspecified hashtags both fall through to `#ailangAgentReady` so commenters always get a sketch.

---

## V1 signal inventory

V1 detection is **body-text-based only**. The sketch executor's effect signature is `! {Net @limit=1, AI @limit=5, ...}` — one network call, the fetch of the page. We don't probe additional endpoints (no HEAD on `/.well-known/agent.json` etc.), so signals look for *references* to those paths in the page body, not direct presence. V2 will probably bump `Net @limit` and probe; for now, body-detection is the constraint.

| Signal | Topic | Max points | What we detect | AILANG primitive it maps to |
|---|---|---:|---|---|
| `agent.json` referenced | `agent-ready` | 2 | Body mentions `/.well-known/agent.json` or `agent.json` (quoted) | `ailang serve-api` generates A2A agent cards automatically |
| `openapi.json` referenced | `agent-ready` | 2 | Body mentions `openapi.json`, `openapi.yaml`, `swagger`, or `redoc` | `ailang serve-api` generates OpenAPI 3.1 from Hindley-Milner type signatures |
| MCP endpoint referenced | `agent-ready` | 2 | Body mentions `/mcp/`, `/mcp/sse`, `mcp-server`, or "model context protocol" | `ailang serve-api --mcp-http` exposes typed functions as MCP tools |
| Public API docs linked | `agent-ready` | 2 | Body mentions "API documentation", "API reference", `/api/docs`, `developers.`, or `/docs/api` | `ailang serve-api` hosts Swagger + ReDoc at `/api/_meta/` by default |
| Webhooks documented | `agent-ready` | 2 | Body mentions `webhook`, `/webhooks`, "callback url", or `callback_url` | `ailang serve-api` handles webhooks as typed handler functions with effect-tracked side effects |
| Rate limits documented | `agent-ready` | 2 | Body mentions "rate limit", "rate-limit", "x-ratelimit", `429`, or "throttl…" | Capability budgets — `Net @limit=N` is the symmetric server-side primitive for what agents see as rate limits |
| Streaming / SSE endpoint | `agent-ready` | 2 | Body mentions "server-sent events", `text/event-stream`, `/sse`, `EventSource`, or "streaming endpoint" | `std/stream` — `ssePost` and the `Stream` effect handle event-source endpoints with typed event types |
| Sandbox / test environment offered | `agent-ready` | 2 | Body mentions "sandbox", "test mode", "test environment", or "testing environment" | `ailang --ai-stub` plus mock effect handlers — deterministic, capability-scoped fakes for any effect |
| Authentication documented | `agent-ready` | 2 | Body mentions "OAuth2"/"oauth 2", " JWT ", "bearer token", "access token", "api key", or "client credentials" | `std/jwt` for verification, IFC labels (`string<api-key>` / `string<token>`) to keep credentials out of public sinks at the type level |
| Idempotency keys documented | `agent-ready` | 2 | Body mentions "idempotency", "idempotent", "idempotency-key", or "idempotency key" | Pure functions are idempotent by construction; `requires`/`ensures` contracts express idempotence as a static guarantee |
| Named LLM provider mentioned | `privacy` | 2 (informational) | Body mentions "claude", "gpt-", "openai", "anthropic", "gemini", or "powered by ai" | `std/ai` + IFC labels — track and declassify customer data crossing the provider boundary |
| Third-party domains restrained | `privacy` | 2 | Heuristic on `https://` occurrence count: ≤10 = 2pts, 11-20 = 1pt, >20 = 0 | Capability scoping — each `Net` call declares its endpoint in the effect row |
| Data residency / on-prem language | `privacy` | 2 | Body mentions "data residency", "on-premises", "on-prem", "sovereign cloud", "EU-hosted", "data sovereignty", or "self-hosted" | Three-runtime deploy — same module runs in WASM (browser), Cloud Run, and native CLI |
| Single-vendor LLM language | `portable` | 2 (penalty) | Body mentions "powered by Claude/GPT/Gemini" or "built on Claude/GPT/Gemini" | `std/ai` multi-provider — switch vendor without rewriting |
| Multiple AI providers cited | `portable` | 2 | Body names two or more of: `claude`, `anthropic`, `gpt`, `openai`, `gemini`, `mistral`, `llama`, `ollama`, `openrouter` | `std/ai` — one Step API across Anthropic, OpenAI, Gemini, OpenRouter, Ollama, and custom-package providers |
| Cross-runtime / deployment portability | `portable` | 2 | Body mentions "self-hosted", "on-prem", "wasm", "webassembly", "deploy anywhere", "kubernetes", or "docker" | Effect handlers as runtime adapters — same `.ail` module runs as WASM in the browser, a Cloud Run container, and a native CLI; only the handlers change |
| BYO key / model-agnostic | `portable` | 2 | Body mentions "bring your own key", "BYOK", "BYO key", "model-agnostic", "any LLM", or "any model" | AILANG WASM — the full interpreter ships as a browser bundle, so caller-held keys (BYOK), offline apps, and embedded demos all work client-side |

### Polarity notes

- **Most signals**: detected = max points, not detected = 0 points.
- **Named LLM provider mentioned**: this is *informational*, not punitive. Detected = 1 point (a known data flow to declare and label); not detected = 2 points (no visible cross-boundary flow). The sketch's narrative section calls it out either way.
- **Third-party domains restrained**: scaled (0/1/2) based on count.
- **Single-vendor LLM language**: this is a *penalty*. Detected = 0 points (you're locked to one vendor); not detected = 2 points.

---

## Aggregation

For each topic, we sum the points earned across the topic's signals, divide by the sum of the topic's max points, and scale to 0–10 with clamping:

```ailang
func sketchComputeTopicScore(signals: [Signal], t: Topic) -> TopicScore
  ensures { result.readiness >= 0, result.readiness <= 10 }
{
  let topicSignals = filter(\s. topicEq(s.topic, t), signals);
  let totalPoints  = foldl(\acc s. acc + s.points,    0, topicSignals);
  let totalMax     = foldl(\acc s. acc + s.maxPoints, 0, topicSignals);
  let raw          = if totalMax == 0 then 0 else (totalPoints * 10) / totalMax;
  let readiness    = if raw < 0 then 0 else if raw > 10 then 10 else raw;
  { ... }
}
```

The `ensures` clause is Z3-verifiable: a scoring function cannot return 11/10.

---

## V1 known limitations

Documented honestly so the rubric on this page matches the code:

1. **No endpoint probing.** Body-detection only. A site that *has* `/.well-known/agent.json` but doesn't link to it from the homepage will score 0 on that signal. V2 will probably bump `Net @limit` and add HEAD probes.
2. **`Third-party domains` is a crude heuristic.** We count `https://` occurrences as a proxy for external resource count. Real cross-origin counting requires URL parsing per resource type. V2.
3. **AI-classified signals are approximated.** Data residency language and single-vendor LLM language detection use keyword lists rather than a `callJson` classifier. Faster, cheaper, less nuanced. V2 will use AI for the qualitative signals.
4. **Domain detection isn't yet domain-tailored.** The feature cards in §3 of each sketch are currently topic-keyed but not domain-keyed (ecommerce vs SaaS vs content). V2.

These are tracked in [`linkedin/design/sketches.md`](sketches.md) §10 (open questions).

---

## Where this lives in the codebase

- [`linkedin/types/sketch_types.ail`](../types/sketch_types.ail) — `Signal`, `TopicScore`, `Topic` ADTs
- [`linkedin/services/sketch_rubric_signals.ail`](../services/sketch_rubric_signals.ail) — signal manifest (one function per signal, defines metadata + AILANG primitive mapping)
- [`linkedin/services/sketch_rubric.ail`](../services/sketch_rubric.ail) — detection logic + aggregator, contract-bounded
- [`linkedin/tests/test_rubric.ail`](../tests/test_rubric.ail) — 46 assertions covering every scorer + the aggregator + the polarity rules

Every signal has `ensures { result.points >= 0, result.points <= result.maxPoints }`. The aggregator has `ensures { result.readiness >= 0, result.readiness <= 10 }`. Both are Z3-verifiable.

---

## Contributing a signal

Pull requests against the rubric are welcome when:

1. **The signal maps to an existing AILANG primitive.** A reader who scores low on the signal must be able to adopt an AILANG feature to score higher. If the underlying feature doesn't exist yet, that's a roadmap proposal — file it as a feature request first, ship the AILANG feature, then add the signal.
2. **The detection logic is deterministic** (string match) **or carries a documented `! {AI}` effect** (LLM classification).
3. **The contract bounds hold under Z3.** Every new signal scorer needs `ensures { result.points >= 0, result.points <= result.maxPoints }` and a passing test in `test_rubric.ail`.

This is by design. The rubric is a public statement of what AILANG cares about. PRs that propose new signals are also pull requests against the AILANG roadmap — signals that get strong community support are evidence that the underlying feature deserves prioritisation.
