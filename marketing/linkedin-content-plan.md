# AILANG Demos — LinkedIn Content Plan

**Schedule:** 1 post every 3 days
**Duration:** 20 posts = 60 days of content
**Audience:** AI engineers, CTOs, developer advocates, data teams, startup founders
**Tone:** Technical credibility + genuine excitement. Not hype — show the proof.
**CTA pattern:** Each post links to the live demo or repo.

---

## Content Calendar

### Post 1 — The Hook (Day 1)
**Theme:** "10,000% AI-Coded"
**Angle:** AILANG is a programming language written 100% by AI. These demos are written 100% by AI using AILANG. 100% x 100% = the first fully AI-authored stack.
**Key points:**
- Language designed for AI to write correct code
- Type system + contracts catch errors AI can't see
- 10 production demos, all live, all AI-written
- Not a toy — WebSocket streaming, BigQuery pipelines, document parsing
**Visual:** `vision-hero.svg` or `ai-engineer.svg`
**Link:** Live hub at sunholo.com/ailang-demos/
**Hashtags:** #AIEngineering #ProgrammingLanguages #FutureOfCoding

---

### Post 2 — Safe Agent (Day 4)
**Theme:** "How Safe Is Your AI Agent?"
**Angle:** Every AI agent calls tools. Most tools have zero safety guarantees. AILANG's Safe Agent demo has Z3-verified contracts on every tool call — mathematically proven safe at compile time.
**Key points:**
- Calculator inputs clamped to [-1000, 1000], output bounded [-1000000, 1000000]
- File reads restricted — no directory traversal, allowlisted paths
- SQL queries enforced SELECT-only (no INSERT/UPDATE/DELETE/DROP)
- Z3 theorem prover proves these bounds at compile time, not runtime
- Ask it "Calculate 500 times 300" — contract verification fires before execution
**Visual:** `ailang-speak-contract.png` (contract verification screenshot)
**Code snippet:**
```
func calculate(op, a, b) -> float
  requires { a >= -1000.0, a <= 1000.0 }
  ensures  { result >= -1000000.0 }
```
**Link:** Live demo at sunholo.com/ailang-demos/streaming/safe_agent/
**Hashtags:** #AISafety #FormalVerification #AIAgents

---

### Post 3 — DocParse (Day 7)
**Theme:** "Universal Document Parsing — No Python, No Dependencies"
**Angle:** DocParse extracts structured data from DOCX, PPTX, XLSX, PDF, and images using pure functional programming. No python-docx, no unstructured.io, no heavy dependencies. Just XML + ZIP + algebraic types.
**Key points:**
- 10 modules, 51 inline tests, 28 contracts verified
- Track changes with author/date attribution
- Merged cell handling in tables (the thing everyone gets wrong)
- AI image descriptions (optional — works with or without)
- LLM-ready markdown output for downstream AI pipelines
- Runs in browser via WebAssembly — same code, zero backend
**Visual:** `doc_parse_demo_screenshot.png`
**Link:** Live demo at sunholo.com/ailang-demos/docparse.html
**Hashtags:** #DocumentAI #DataPipelines #WebAssembly

---

### Post 4 — Ambient Assistant (Day 10)
**Theme:** "An AI That Listens But Only Speaks When Spoken To"
**Angle:** The Ambient Assistant uses Gemini Live's proactive audio mode. The model is always listening, but only responds when you address it by name. This is the future of voice AI — ambient, not interrogative.
**Key points:**
- Always-on microphone, model decides when to respond
- 11 CLI tools: git, gh, file reads, calculations, reminders, caching
- Async tool execution — slow tools run in background, audio stays responsive
- Screen and webcam capture — "What's on my screen?"
- Per-project sessions with transcript persistence
- 30 voice presets (Charon, Sulafat, Puck, etc.)
**Visual:** `ambient-demo.png`
**Code snippet:** `ambient --mic --screen "Hey AILANG, what's on my screen?"`
**Link:** Live browser demo at sunholo.com/ailang-demos/streaming/ambient_assistant/
**Hashtags:** #VoiceAI #GeminiLive #DeveloperTools

---

### Post 5 — Capability Budgets (Day 13)
**Theme:** "What If Your AI Agent Had a Spending Limit?"
**Angle:** AILANG's capability budgets enforce hard limits on what AI can do. `AI @limit=10` means exactly 10 AI calls — not 11, not "about 10". The type system enforces this at compile time. This is how you make AI costs predictable.
**Key points:**
- `Net @limit=5` in the analytics demo means EXACTLY 4 API calls + 1 auth token
- Any deviation is a compiler error, not a surprise bill
- Budgets compose — nested modules inherit parent limits
- The ecommerce demo proves its BigQuery cost: exactly 7 queries per run
- This is data trust as a contract, not a policy
**Visual:** Code block showing capability annotations
**Code snippet:**
```
entry main(prompt: string) -> string
  ! {IO @limit=50, AI @limit=10}
```
**Hashtags:** #AICosts #DataTrust #Observability

---

### Post 6 — Website Builder (Day 16)
**Theme:** "AI Builds Your Website — From Phone Photos to Live Site"
**Angle:** Upload photos, documents, and text from your phone. Choose a style. AI generates a multi-page website with proper CSS. Published to GitHub Pages in seconds. Two build modes: browser-side (WASM, instant) or server-side (Cloud Run, higher quality).
**Key points:**
- 6-step wizard: Describe → Upload → Style → Build → Preview → Publish
- 6 style directions (warm, clean, bold, elegant, fun, auto)
- WASM build: ~10s in browser, no server needed
- Cloud build: ~30s on Cloud Run, higher token budget
- 7 contract-verified validators (HTML structure, JS safety, etc.)
- Published directly to GitHub Pages — no hosting to manage
**Visual:** `website_builder/docs/screenshots/upload-content.png` or `my-sites-dashboard.png`
**Link:** Live portal at sunholo.com/ailang-demos/website_builder/
**Hashtags:** #WebDev #AIWebsites #NoCode

---

### Post 7 — Z3 Verification Deep Dive (Day 19)
**Theme:** "The Compiler Found 4 Bugs the AI Couldn't See"
**Angle:** We ran Z3 theorem prover on 42 AILANG contracts. 38 passed. 4 failed — with concrete counterexamples. The bugs were real: a billing function that produces negative totals when credits exceed subtotal. The AI wrote the code; the math caught the bug.
**Key points:**
- 42 contracts across 4 modules (billing, access control, scheduling, arithmetic)
- 4 bugs caught with concrete counterexamples (not just "might fail")
- Cross-function proofs: verify 4-deep call chains
- Domain-specific reasoning: Z3 string theory for SQL, sequence theory for lists
- `brokenCreditApply(subtotal=0, credits=1)` → negative result. Contract violation.
**Visual:** `verify.html` screenshot or terminal output
**Link:** Live demo at sunholo.com/ailang-demos/verify.html
**Hashtags:** #FormalMethods #Z3 #CompilerDesign

---

### Post 8 — Voice Agent Tool Calling (Day 22)
**Theme:** "I Told My Terminal to Check the Git Status. It Spoke Back."
**Angle:** The `speak` CLI is a voice agent with contract-verified tool calling. Say "What's the git status?" and it runs `git status`, reads the output, and speaks the answer. All tool calls are allowlisted and contract-bounded.
**Key points:**
- 5 contract-verified tools: calculate, readFile, listFiles, runCommand, currentTime
- Command allowlist: git (status/log/diff/branch), gh (pr/issue list), ailang, ls, grep
- Dangerous commands blocked: git push, reset, force, checkout, rebase
- 30 voices — pick Charon for informative, Puck for upbeat, Sulafat for warm
- Session transcripts saved per git project
**Code snippet:** `speak --tools "What changed in the last commit?"`
**Hashtags:** #DeveloperTools #VoiceUI #CLITools

---

### Post 9 — Ecommerce: BigQuery Analytics (Day 25)
**Theme:** "7 GA4 Analytics Queries, Zero Python, Predictable Cost"
**Angle:** The ecommerce demo runs 7 BigQuery GA4 analytics queries using pure AILANG. OAuth2 ADC auth, nested JSON parsing, and a `Net @limit=20` budget that guarantees exactly how many API calls you make.
**Key points:**
- Top events, product revenue, category revenue, purchase funnel, device breakdown, geo distribution, session metrics
- Pure AILANG BigQuery REST API client (no Go dependencies, no Python)
- OAuth2 ADC token exchange built in AILANG
- Nested `rows[].f[].v` JSON parsing
- 14 inline tests on SQL generation — all passing
- React dashboard UI for interactive exploration
**Visual:** `ecommerce-dashboard-ui.png`
**Hashtags:** #BigQuery #Analytics #DataEngineering

---

### Post 10 — Contracts as Documentation (Day 28)
**Theme:** "The Best Documentation Is Code That Won't Compile If It's Wrong"
**Angle:** AILANG contracts serve as living documentation. `requires { a >= -1000.0 }` isn't a comment — it's enforced. 28 contracts in DocParse document exactly what each parser guarantees about its output. Change the code, break the contract, fail the build.
**Key points:**
- `ensures { listLength(result) == listLength(input) }` — map preserves length
- `requires { not contains(relPath, "..") }` — path safety
- `ensures { result >= 0 }` — non-negative output
- Contracts outlive comments — they can't go stale
- Z3 can prove them at compile time, or runtime checks verify them
- 28 contracts across DocParse, 5 in Safe Agent, 7 in Website Builder, 15+ in Ecommerce
**Hashtags:** #SoftwareEngineering #ContractProgramming #CodeQuality

---

### Post 11 — Document Extractor: Schema to Validation (Day 31)
**Theme:** "Upload a Document. Get a Typed, Validated Schema — Automatically."
**Angle:** The Document Extractor demo takes any document, detects its structure using AI, generates a typed AILANG schema, extracts data against that schema, and validates every field with contracts. 3-tier graceful degradation: WASM+AI > JS+API key > demo data.
**Key points:**
- 7 built-in presets: invoice, receipt, contract, bank statement, shipping, resume, PDF
- AI suggests fields, types, and constraints from sample document
- Generated AILANG code has `requires`/`ensures` on every field
- Runs in WebAssembly — same validation code in browser and server
- Supports text, images, and PDFs (multimodal via Gemini)
**Visual:** `extraction-demo-ui.png`
**Link:** Live demo at sunholo.com/ailang-demos/extractor.html
**Hashtags:** #DocumentAI #DataExtraction #Validation

---

### Post 12 — Streaming Protocols Made Simple (Day 34)
**Theme:** "SSE, WebSocket Bidi, Proactive Audio — One Abstraction"
**Angle:** AILANG's `std/stream` effect handles three fundamentally different streaming protocols through one abstraction. SSE for Claude, WebSocket bidi for Gemini Live, proactive audio for Ambient. The type system ensures protocol correctness.
**Key points:**
- `ssePost` for Server-Sent Events (Claude Chat, Gemini SSE)
- `connect` + `transmit` + `onEvent` for WebSocket bidirectional (Gemini Live)
- Binary frame handling for native audio streaming
- Effect budgets cap event consumption: `Stream @limit=500`
- Same pattern works CLI and browser (WASM bridges to JS WebSocket/EventSource)
**Code snippet:**
```
let conn = connect(url, headers) in
transmit(conn, setupMsg);
onEvent(conn, \ev. match ev {
  Binary(data) => handleAudio(data),
  Message(msg) => handleText(msg)
})
```
**Hashtags:** #StreamingAPI #WebSocket #ServerSentEvents

---

### Post 13 — Claude Chat SSE (Day 37)
**Theme:** "Stream Claude's Responses with 20 Lines of AILANG"
**Angle:** The Claude Chat demo is intentionally minimal — canonical SSE in pure AILANG. POST to the Messages API, receive text deltas via SSE events, print them as they arrive. The simplicity is the point.
**Key points:**
- Full Claude Messages API integration via `ssePost`
- Text delta streaming — each fragment is one SSE event
- Budget enforcement: `Stream @limit=500` caps events
- No SDK, no wrapper library — raw HTTP + SSE in a safe language
- Working CLI + browser demo
**Link:** Live demo at sunholo.com/ailang-demos/streaming/claude_chat/
**Hashtags:** #Claude #AnthropicAPI #Streaming

---

### Post 14 — Track Changes in AILANG (Day 40)
**Theme:** "Parsing Word Track Changes Without python-docx"
**Angle:** DocParse extracts track changes from DOCX files: inserts, deletes, move-to, move-from — with author and date attribution. Pure XML parsing, no Office libraries. The subtlety: deleted text uses `w:delText`, not `w:t`. Everyone gets this wrong.
**Key points:**
- 4 change types: insert, delete, move-to, move-from
- Author + date extracted from XML attributes
- `w:del` and `w:moveFrom` use `w:delText` (not `w:t`) — common trap
- Color-coded in browser: green/red/blue/orange
- Markdown output: strikethrough for deletions, bold for insertions
- Comments extracted separately from word/comments.xml
**Hashtags:** #DocumentParsing #OfficeAutomation #XML

---

### Post 15 — MCP + A2A Integration (Day 43)
**Theme:** "37 AILANG Functions as MCP Tools — Auto-Generated"
**Angle:** The ecommerce demo auto-generates REST endpoints, MCP tools, and A2A skills from AILANG type signatures. One codebase, three integration surfaces. Claude Desktop, Cursor, and any A2A agent can call the same functions.
**Key points:**
- `ailang serve-api` turns typed functions into REST + MCP + A2A
- OpenAPI 3.1 spec auto-generated from Hindley-Milner types
- Swagger UI + ReDoc documentation for free
- MCP HTTP transport: `POST /mcp/` for remote clients
- A2A Agent Card at `/.well-known/agent.json`
- Works with Claude Desktop — add to `mcpServers` config
**Visual:** `openapi-redoc.png`
**Hashtags:** #MCP #AgentToAgent #APIDesign

---

### Post 16 — WebAssembly: Same Code Everywhere (Day 46)
**Theme:** "DocParse Runs in Your Browser. Same AILANG Code. Zero Backend."
**Angle:** The DocParse CLI modules load directly into WASM in the browser. No transpilation, no consolidation. A 95-line adapter module bridges them. The same 10 modules, 51 tests, 28 contracts — running client-side.
**Key points:**
- CLI modules loaded unmodified in WASM REPL
- 95-line browser adapter (thin re-export layer)
- JSZip handles ZIP in browser, std/zip in CLI — same AILANG code
- Effect handlers bridge AILANG operations to JS Web APIs
- Website Builder uses the same pattern — WASM for fast, Cloud for quality
- No server needed for document parsing — runs entirely in browser
**Link:** Live demo at sunholo.com/ailang-demos/docparse.html
**Hashtags:** #WebAssembly #ClientSide #ZeroBackend

---

### Post 17 — Voice DocParse (Day 49)
**Theme:** "Upload a Spreadsheet. Ask It Questions. Out Loud."
**Angle:** Voice DocParse combines document parsing with voice Q&A. Upload a DOCX, PPTX, XLSX, or PDF. The content is parsed by AILANG's DocParse modules and injected into a Gemini Live voice session. Then just talk to your document.
**Key points:**
- Document parsing → content injection → voice Q&A, all in one pipeline
- Reuses DocParse modules directly (not a reimplementation)
- Gemini Live bidirectional audio for natural conversation
- AI image descriptions for embedded graphics
- Works for structured data (tables, lists) and unstructured text
**Link:** Live demo at sunholo.com/ailang-demos/streaming/voice_docparse/
**Hashtags:** #VoiceAI #DocumentAI #MultiModal

---

### Post 18 — Algebraic Effects (Day 52)
**Theme:** "Side Effects as Types — Why Your AI Agent Needs Algebraic Effects"
**Angle:** Every AILANG function declares its effects: `! {IO, AI, Net}`. The compiler rejects undeclared effects. An AI function can't secretly make network calls. A parser can't write files. This is the missing piece in AI safety — not what the model says, but what the code can physically do.
**Key points:**
- `! {AI @limit=10}` — this function makes at most 10 AI calls
- `! {Net @limit=5}` — exactly 5 network requests, no more
- `! {}` — pure function, zero side effects, deterministic
- Effects compose: `! {IO, AI}` means I/O and AI, nothing else
- The WASM sandbox enforces effects at runtime via host injection
- Capability security meets type theory
**Hashtags:** #TypeTheory #ProgrammingLanguages #AISafety

---

### Post 19 — Ecommerce Full Stack (Day 55)
**Theme:** "6 Demos, 1 Language: From AI Recommendations to BigQuery Dashboards"
**Angle:** The ecommerce vertical demo shows AILANG across an entire stack: AI product recommendations, data pipelines, BigQuery analytics, contract verification, REST API with React UI, and MCP integration. All type-safe. All budget-enforced.
**Key points:**
- AI recommendations with pluggable providers (Gemini, Claude, GPT, stub)
- Pure functional data pipeline (map, fold, filter on product records)
- Budget-as-contract: `Net @limit=5` = exactly 4 API calls + 1 auth
- BigQuery GA4 with 14 tested SQL queries
- React dashboard with 3 tabs (Contracts, Analytics, AI)
- MCP + A2A integration — agents can call every function
**Visual:** `ecommerce-dashboard-ui.png`
**Hashtags:** #Ecommerce #FullStack #DataPipelines

---

### Post 20 — The Vision (Day 58)
**Theme:** "What Happens When AI Writes All the Code?"
**Angle:** Wrap-up post. AILANG exists because AI writes most code now. The question isn't "can AI write code?" — it's "can you trust it?" Contracts, effects, budgets, and Z3 verification are the answer. 10 production demos prove it works today.
**Key points:**
- 48 AILANG modules across 10 demos
- 28+ verified contracts, 51+ inline tests
- 5 streaming protocols, 4 AI providers
- Runs CLI, browser (WASM), and cloud (Cloud Run)
- All deployed, all live, all AI-written
- The stack isn't "AI-assisted" — it's AI-authored with mathematical safety
**Visual:** `vision-stack.svg`
**Link:** Live hub at sunholo.com/ailang-demos/
**Hashtags:** #FutureOfCoding #AIEngineering #AILANG

---

## Visual Assets Available

| Asset | Best for Post | Path |
|-------|---------------|------|
| `vision-hero.svg` | Post 1 (Hook), Post 20 (Vision) | Root |
| `ai-engineer.svg` | Post 1 (Hook) | Root |
| `ailang-speak-contract.png` | Post 2 (Safe Agent), Post 10 (Contracts) | Root |
| `doc_parse_demo_screenshot.png` | Post 3 (DocParse) | `invoice_processor_wasm/assets/` |
| `ambient-demo.png` | Post 4 (Ambient) | `streaming/ambient_assistant/` |
| `upload-content.png` | Post 6 (Website Builder) | `website_builder/docs/screenshots/` |
| `my-sites-dashboard.png` | Post 6 (Website Builder) | `website_builder/docs/screenshots/` |
| `extraction-demo-ui.png` | Post 11 (Extractor) | `invoice_processor_wasm/assets/` |
| `ecommerce-dashboard-ui.png` | Post 9, 19 (Ecommerce) | `ecommerce/img/` |
| `openapi-redoc.png` | Post 15 (MCP/A2A) | `ecommerce/img/` |
| `demo-streaming-voice.svg` | Post 12 (Streaming) | Root |
| `demo-document-intelligence.svg` | Post 3, 14 (DocParse) | Root |
| `demo-contract-verified.svg` | Post 7 (Z3), Post 10 (Contracts) | Root |
| `vision-stack.svg` | Post 20 (Vision) | Root |
| Builder avatars (4x PNG) | Post 6 (Website Builder) | `website_builder/portal/public/avatars/` |
| Site thumbnails (5x PNG) | Any overview post | `site/thumbnails/` |
| `builder-selection.png` | Post 6 (Website Builder) | `website_builder/docs/screenshots/` |
| `ailang-cloud-build.png` | Post 6 (Website Builder) | `website_builder/docs/screenshots/` |

## Post Structure Template

```
[Hook — 1 sentence that makes someone stop scrolling]

[2-3 sentences of context/problem statement]

[3-5 bullet points showing the proof]

[Optional: code snippet or screenshot]

[CTA: link to live demo]

[Hashtags: 3-4 relevant tags]
```

## Scheduling Notes

- **Day 1** (Post 1): Start with the big vision — "10,000% AI-Coded"
- **Days 4-13** (Posts 2-5): Lead with strongest demos — Safe Agent, DocParse, Ambient, Budgets
- **Days 16-28** (Posts 6-10): Expand scope — Website Builder, Z3, Voice, BigQuery, Contracts
- **Days 31-49** (Posts 11-17): Deeper dives — Extractor, Streaming, Claude, Track Changes, MCP, WASM, Voice DocParse
- **Days 52-58** (Posts 18-20): Conceptual/vision — Effects, Full Stack, Wrap-up

## Live Demo URLs (for CTAs)

| Demo | URL |
|------|-----|
| Hub | sunholo.com/ailang-demos/ |
| Streaming Hub | sunholo.com/ailang-demos/streaming/ |
| DocParse | sunholo.com/ailang-demos/docparse.html |
| Document Extractor | sunholo.com/ailang-demos/extractor.html |
| Z3 Verify | sunholo.com/ailang-demos/verify.html |
| Website Builder | sunholo.com/ailang-demos/website_builder/ |
| Ambient Assistant | sunholo.com/ailang-demos/streaming/ambient_assistant/ |
| Claude Chat | sunholo.com/ailang-demos/streaming/claude_chat/ |
| Gemini Live | sunholo.com/ailang-demos/streaming/gemini_live/ |
| Safe Agent | sunholo.com/ailang-demos/streaming/safe_agent/ |
| Voice DocParse | sunholo.com/ailang-demos/streaming/voice_docparse/ |
