# Co-Presenter: AI Background Research Assistant for Live Presentations

## Vision

A silent AI co-presenter that listens during your talk, does background research based on what it hears, and surfaces findings when addressed or tapped. The "wow moment": mid-presentation, you say "AILANG, what did you find?" and it responds with contextual data it gathered while you were speaking — then you flip to a live trace view showing every tool call, latency, and decision the AI made behind the scenes.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  PRESENTER VIEW (iframe in presenter.html)                      │
│                                                                 │
│  ┌──────────────────────────────┐  ┌──────────────────────────┐ │
│  │                              │  │   TRACE PANEL (right)    │ │
│  │   PRESENTATION SLIDES        │  │                          │ │
│  │   (existing deck iframes)    │  │  Live waterfall of:      │ │
│  │                              │  │  - Tool calls            │ │
│  │                              │  │  - Gemini turns          │ │
│  │                              │  │  - Background fetches    │ │
│  │                              │  │  - Latencies             │ │
│  │                              │  │  - Transcription         │ │
│  ├──────────────────────────────┤  │                          │ │
│  │  ░░ AMBIENT STATUS BAR ░░░░ │  │  (toggles on/off with    │ │
│  │  [🔴 listening] [3 fetches] │  │   hotkey or button)      │ │
│  │  [tap to ask]               │  │                          │ │
│  └──────────────────────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## How It Works

### During the Presentation (Silent Mode)
1. Mic streams audio to Gemini Live via WebSocket (API key from localStorage)
2. Gemini transcribes speech in real-time (inputTranscription)
3. Proactive audio is ON but system instruction says: **stay completely silent unless addressed**
4. Model uses tools silently in the background:
   - Hears "our BigQuery costs went up 40%" → calls `webFetch` to pull GCP pricing docs
   - Hears "the new EU regulation" → calls `webFetch` for recent AI Act updates
   - Hears a number → calls `calculate` and `cacheResult`
   - Hears mention of a codebase → calls `delegate` to AILANG Cloud for deep analysis
5. All tool calls are logged to the trace timeline (visible in trace panel)

### When Addressed (Active Mode)
- Say "AILANG, what did you find?" or tap the status bar button
- Model responds with voice, referencing all the background data it gathered
- Trace panel highlights which cached results are being referenced

### Trace Panel (The Demo-Within-a-Demo)
The trace panel is where the "AI tracing" demo lives. It shows:
- **Waterfall timeline**: Each event (connect, tool call, response) as a horizontal bar with timing
- **Live transcription**: What the mic is picking up
- **Tool call cards**: Name, args, result, latency — color-coded by type
- **Token usage**: Running count of input/output tokens
- **Session stats**: Duration, turns, interruptions

## AILANG Integration Strategy

### What AILANG Does (WASM)
The AILANG module handles the Gemini Live protocol — same pattern as `ambient_browser.ail`:

```
co_presenter.ail
├── Connects to Gemini Live WebSocket (via Stream effect)
├── Sends setup with tools, proactive audio, system instruction
├── Handles events (setupComplete, serverContent, toolCall, etc.)
├── Emits structured JSON via println (IO effect) → JS picks up
└── Tool response dispatch (JS handles tool execution, sends response back)
```

The `.ail` module is a thin fork of `ambient_browser.ail` with:
- Presentation-specific system instruction
- Presentation-specific tool declarations (slide context, audience Q&A log)
- A `traceEvent` wrapper that emits trace metadata alongside every event

### What JS Does (Browser Host)
- Audio capture (Web Audio API + AudioWorklet)
- Audio playback (PCM → Web Audio)
- Tool execution (currentTime, calculate, webFetch via fetch API, etc.)
- Trace panel rendering (D3.js waterfall or custom CSS)
- Slide deck iframe management
- localStorage API key retrieval

### Trace Events — The Key Design Decision

**Option A: AILANG emits trace events via println (TODAY — no AILANG changes needed)**

Every `println` from AILANG already outputs structured JSON. We add a `trace` type:

```json
{"type":"trace","event":"toolCall","name":"webFetch","args":{"url":"..."},"ts":1234567890}
{"type":"trace","event":"toolResult","name":"webFetch","latencyMs":340,"ts":1234567891}
{"type":"trace","event":"geminiTurn","direction":"input","tokens":42,"ts":1234567892}
```

JS parses these and renders the waterfall. This works TODAY with zero AILANG changes.

**Option B: AILANG native `--emit-trace` in WASM (FUTURE — needs AILANG update)**

AILANG already has `--emit-trace jsonl,otel` on CLI. If this were exposed in WASM:
- Trace events would include function enter/exit, effect calls, contract checks, budget deltas
- Could export to Cloud Trace via OTEL in real-time
- Much richer than hand-rolled println traces

**Recommendation: Start with Option A, request Option B from AILANG core.**

Option A gives us a working demo immediately. The trace panel still looks impressive — it shows tool calls, latencies, and Gemini turns in real-time. Option B would make it a true AILANG tracing demo, showing internal execution details. File a feature request via `ailang messages send`.

### Trace Panel for Cloud Trace (Stretch Goal)

If a backend proxy is available (e.g., the sidecar pattern from website_builder):
1. JS sends trace spans to a `/api/trace` endpoint
2. Sidecar forwards to Cloud Trace via OTEL SDK
3. Presenter can open Cloud Trace console to show the full distributed trace
4. This is the "enterprise observability" angle for the demo

## File Structure

```
co-presenter/
├── DESIGN.md                  ← this file
├── co_presenter.ail           ← AILANG module (fork of ambient_browser.ail)
├── index.html                 ← standalone co-presenter UI
├── presenter-plugin.html      ← embeddable version for existing presenter.html
├── js/
│   ├── trace-panel.js         ← waterfall renderer
│   ├── tool-handler.js        ← browser-side tool execution
│   ├── audio-engine.js        ← mic capture + playback (from ambient)
│   └── slide-context.js       ← slide-aware context (reads iframe content)
├── css/
│   └── trace-panel.css        ← trace waterfall styles
└── shared/                    ← symlink → ../streaming/shared/
```

## System Instruction (Presentation Mode)

```
You are AILANG, a silent co-presenter AI assistant embedded in a live presentation.

BEHAVIOR:
- You are ALWAYS listening to the presenter's speech.
- You must NEVER speak or make any sound unless directly addressed by name ("AILANG").
- While listening silently, you SHOULD use tools to gather context:
  - If the presenter mentions a statistic, verify it (webFetch).
  - If the presenter mentions a calculation, compute it (calculate, cacheResult).
  - If the presenter mentions a URL or product, fetch info (webFetch).
  - If the presenter mentions code or architecture, delegate analysis (delegate).
  - Cache everything you find (cacheResult) so you can recall it instantly.

WHEN ADDRESSED:
- Respond concisely and helpfully with what you've gathered.
- Reference specific things the presenter said ("When you mentioned X, I looked up...").
- Keep responses under 30 seconds — this is a live presentation.

VOICE: British English accent, professional but warm.
```

## Tools

Inherit from ambient_browser.ail, plus presentation-specific additions:

| Tool | Type | Description |
|------|------|-------------|
| `currentTime` | sync | Current date/time |
| `calculate` | sync | Arithmetic |
| `cacheResult` | sync | Store key-value for instant recall |
| `getCachedResult` | sync | Retrieve cached data |
| `webFetch` | async | Fetch URL content |
| `delegate` | async | Deep analysis via AILANG Cloud |
| `saveNote` | sync | Persist a finding |
| `getSlideContext` | sync | **NEW** — returns current slide title + speaker notes |
| `audienceQuestion` | sync | **NEW** — log an audience question for later |

## Implementation Phases

### Phase 1: Working Demo (Option A traces, no AILANG changes)
1. Fork `ambient_browser.ail` → `co_presenter.ail` with presentation system instruction
2. Build `index.html` — standalone page with mic, trace panel, presentation embed area
3. Trace panel renders `println` events as waterfall
4. Tool handler executes browser-safe tools
5. Test with a real presentation deck

### Phase 2: Presenter Integration
1. Build `presenter-plugin.html` — embeddable panel for existing `presenter.html`
2. Add postMessage bridge for slide context (which slide is active)
3. `getSlideContext` tool reads slide content from iframe

### Phase 3: Native AILANG Tracing (Needs AILANG Update)
1. Request `--emit-trace` support in WASM mode from AILANG core
2. Replace println-based traces with native trace events
3. Add function-level spans, effect traces, contract checks to waterfall
4. Optional: OTEL export to Cloud Trace via sidecar

### Phase 4: Cloud Trace Integration
1. Add sidecar endpoint (`/api/trace`) that forwards spans to Cloud Trace
2. Show live Cloud Trace console during presentation
3. Demonstrate distributed tracing: browser → AILANG WASM → Gemini API → Cloud Trace

## What AILANG Core Needs (Feature Requests)

1. **`--emit-trace` in WASM mode**: Expose trace events via an effect handler or callback so JS can receive `function_enter`, `effect`, `contract_check` events. This is the single most impactful change — it turns the co-presenter into a genuine AILANG tracing demo.

2. **Trace effect handler**: A `Trace` effect type that AILANG modules can explicitly emit to:
   ```
   import std/trace (span, event)
   span("fetchPricing", \(). { webFetch(...) })
   event("slideChanged", slideTitle)
   ```
   This lets AILANG code participate in tracing, not just be traced.

3. **WASM closure callbacks** (existing issue #137): Would allow `onEvent` to work natively in WASM instead of JS polling. Not blocking but would simplify the architecture.

## Demo Script (Presentation Flow)

1. **Open presenter view** — slides on left, trace panel collapsed on right
2. **Start co-presenter** — enter API key, mic activates, subtle "listening" indicator
3. **Present normally for 5-10 minutes** — co-presenter silently gathers data
4. **Glance at trace panel** — audience sees tool calls appearing in real-time (wow moment #1)
5. **Say "AILANG, what did you find?"** — it responds with a summary of everything it researched (wow moment #2)
6. **Expand trace panel full-screen** — walk through the waterfall, explain each tool call, show latencies (wow moment #3, the tracing demo)
7. **If Cloud Trace is set up** — switch to Cloud Trace console, show the same spans in Google Cloud (enterprise angle)

## Dependencies

- Gemini API key (localStorage) — Google AI Studio v1alpha for proactive audio
- AILANG WASM binary (`ailang.wasm`) — from invoice_processor_wasm or fresh build
- Shared audio worklet — symlink from `streaming/shared/`
- No server required for Phase 1 (all client-side)
