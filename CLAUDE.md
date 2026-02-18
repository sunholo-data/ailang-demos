# CLAUDE.md — AILANG Demos

## Repo Purpose

**This repo demos and integration-tests AILANG.** Every demo must exercise AILANG code paths. The AILANG CLI module (`.ail`) is the primary deliverable for each demo.

**Do not** build standalone JS/HTML apps that bypass AILANG. Browser UIs should use AILANG WASM (like the DocParse browser demo does), not reimplement protocols in raw JS.

**Current state:** The streaming browser demos are pure JS tech debt — they work for visual demos but don't test AILANG. The CLI demos are the canonical integration tests.

## Project Structure

```
demos/
├── CLAUDE.md              ← you are here
├── ecommerce/             # AI, BigQuery, data pipelines
│   ├── main.ail
│   ├── services/
│   └── CLAUDE.md          # detailed ecommerce docs
├── docparse/              # Document parsing (DOCX, PPTX, XLSX, PDF)
│   ├── document.ail
│   └── services/
├── streaming/             # Streaming protocols (SSE, WebSocket bidi)
│   ├── index.html         # Hub page (links to browser UIs)
│   ├── test_sse.ail       # Minimal Gemini SSE test
│   ├── shared/            # Shared browser assets (audio-worklet, nav)
│   ├── claude_chat/       # Claude SSE streaming
│   ├── gemini_live/       # Gemini Live WebSocket bidi (audio)
│   ├── safe_agent/        # Contract-verified tool calling (REST + SSE)
│   ├── transcription/     # Deepgram speech-to-text
│   ├── voice_analytics/   # Voice → BigQuery queries
│   ├── voice_docparse/    # Voice → document analysis
│   └── voice_pipeline/    # STT → LLM → TTS pipeline
└── invoice_processor_wasm/ # AILANG WASM runtime (hosts DocParse browser)
```

## Quick Commands

```bash
# Type-check ALL streaming demos
for f in streaming/*/main.ail streaming/test_sse.ail; do
  echo -n "$f: " && ailang check "$f" 2>&1 | tail -1
done

# ── Verified working CLI demos ──

# Claude SSE (needs ANTHROPIC_API_KEY)
ANTHROPIC_API_KEY=sk-ant-... ailang run --entry main \
  --caps IO,Stream,Env streaming/claude_chat/main.ail "What is AILANG?"

# Gemini SSE (uses ADC — ensure GOOGLE_API_KEY is unset)
GOOGLE_API_KEY="" ailang run --entry main \
  --caps IO,Stream,Net,Env streaming/test_sse.ail "What is 2+2?"

# Gemini Live — AILANG speaks (symlinked to ~/.local/bin/speak)
speak "Tell me a joke"
speak --voice Charon "What is AILANG?"
speak -v Orus "Explain algebraic effects"

# Safe Agent with contract verification (uses ADC)
GOOGLE_API_KEY="" ailang run --entry main \
  --caps IO,FS,Stream,Net,Env --verify-contracts \
  streaming/safe_agent/main.ail "Calculate 500 times 300"

# ── Not yet tested (need API keys or missing features) ──

# Transcription (needs DEEPGRAM_API_KEY)
# Voice Pipeline (needs DEEPGRAM_API_KEY + ELEVENLABS_API_KEY)
# Voice Analytics / Voice DocParse (should work now — have writeFileBytes + std/process)
```

## Auth Patterns

| Provider | CLI Auth | Browser Auth |
|----------|----------|--------------|
| Google (Vertex AI) | ADC: `GOOGLE_API_KEY="" ailang run ...` | API key in localStorage |
| Google (AI Studio) | `GOOGLE_API_KEY=xxx` env var | API key in localStorage |
| Anthropic | `ANTHROPIC_API_KEY=sk-ant-...` env var | API key in localStorage |
| Deepgram | `DEEPGRAM_API_KEY=xxx` env var | API key in localStorage |
| ElevenLabs | `ELEVENLABS_API_KEY=xxx` env var | API key in localStorage |

**Important:** If `GOOGLE_API_KEY` env var is set, AILANG uses it as a Gemini API key instead of ADC. Set `GOOGLE_API_KEY=""` to force ADC.

## Streaming Demo Status

| Demo | Protocol | CLI Verified | Notes |
|------|----------|-------------|-------|
| Claude Chat | SSE (`ssePost`) | **YES** | Text streaming works |
| Gemini SSE | SSE (`ssePost`) | **YES** | `?alt=sse` endpoint |
| Gemini Live | WebSocket (`connect`) | **YES** | Audio→WAV native, 30 voices, `&& afplay` to play |
| Safe Agent | REST + SSE | **YES** | Contract verification works |
| Transcription | WebSocket (`connect`) | No | Needs Deepgram key |
| Voice Analytics | WebSocket (`connect`) | No | Audio-only model output |
| Voice DocParse | WebSocket (`connect`) | No | Audio-only model output |
| Voice Pipeline | WebSocket (`connect`) | No | Needs Deepgram + ElevenLabs keys |

## Known AILANG Issues

### Transitive imports required
Each entry module must import all transitive dependencies. If `main.ail` imports `services/foo.ail` which uses `std/list.map`, then `main.ail` must also `import std/list (map)`.

### Gemini Live sends binary frames
In AILANG CLI, Gemini Live API sends ALL WebSocket messages as binary frames (not text). The `Binary(data)` handler must JSON-parse with `decode(data)` to detect `setupComplete`, `serverContent`, and `turnComplete`. The `Message(msg)` handler never fires.

### Test harness bug
Inline `tests [...]` on pure functions that call imported stdlib functions fail with "cannot apply non-function value: nil". Workaround: test via `main()` instead.

### Audio playback pattern
- **CLI**: `appendFileBytes` per frame → `wavHeader` + `writeFileBytes` → `exec("afplay", [...])` via `std/process`
- **Browser**: AILANG WASM writes bytes → JS picks them up for Web Audio playback
- Native playback via `std/process` (v0.8.0) — no shell chain needed

### Gemini Live voice selection
Set `GEMINI_VOICE` env var to any of the 30 prebuilt voices. Default: `Sulafat` (Warm).
Accent is controlled via system instruction (default: British English).
Available voices: Zephyr (Bright), Puck (Upbeat), Charon (Informative), Kore (Firm), Fenrir (Excitable), Leda (Youthful), Orus (Firm), Aoede (Breezy), Callirrhoe (Easy-going), Autonoe (Bright), Enceladus (Breathy), Iapetus (Clear), Umbriel (Easy-going), Algieba (Smooth), Despina (Smooth), Erinome (Clear), Algenib (Gravelly), Rasalgethi (Informative), Laomedeia (Upbeat), Achernar (Soft), Alnilam (Firm), Schedar (Even), Gacrux (Mature), Pulcherrima (Forward), Achird (Friendly), Zubenelgenubi (Casual), Vindemiatrix (Gentle), Sadachbia (Lively), Sadaltager (Knowledgeable), Sulafat (Warm).

### WASM build
`std/stream` is compiled into the WASM binary (all builtins: `_stream_connect`, `_stream_onEvent`, `_stream_sse_post`, etc.). To rebuild:
```bash
pushd /path/to/ailang && GOOS=js GOARCH=wasm go build -o /tmp/ailang.wasm ./cmd/wasm/ && popd
cp /tmp/ailang.wasm invoice_processor_wasm/wasm/ailang.wasm
```
Browser demos should load AILANG modules via `ailangLoadModule()` and use `ailangSetEffectHandler("Stream", {...})` to bridge stream operations to browser WebSocket/EventSource APIs.

## CLI Tools (symlinked to ~/.local/bin/)

| Command | Symlink | Script | Purpose |
|---------|---------|--------|---------|
| `docparse` | `~/.local/bin/docparse` | `docparse/docparse` | Document parsing |
| `speak` | `~/.local/bin/speak` | `streaming/gemini_live/speak` | Text to speech |

Install: `ln -s $(pwd)/streaming/gemini_live/speak ~/.local/bin/speak`

Both resolve symlinks to find the repo root, handle ADC auth, and set correct caps automatically.

## When Working on This Repo

1. **Every demo must exercise AILANG code** — no standalone JS/HTML apps
2. **CLI module first**, browser UI second (and use WASM when possible)
3. **Type-check before committing**: `ailang check path/to/main.ail`
4. **Use `ailang docs <module>`** to check stdlib before assuming features are missing
5. **Use `ailang messages send`** to report bugs/feature requests to AILANG core
6. **Set `GOOGLE_API_KEY=""`** when using ADC for Vertex AI
