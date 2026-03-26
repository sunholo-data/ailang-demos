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
│   ├── ambient_assistant/ # Always-listening voice assistant (mic, video, tools)
│   ├── claude_chat/       # Claude SSE streaming
│   ├── gemini_live/       # Gemini Live WebSocket bidi (audio)
│   ├── safe_agent/        # Contract-verified tool calling (REST + SSE)
│   ├── transcription/     # Deepgram speech-to-text
│   ├── voice_analytics/   # Voice → BigQuery queries
│   ├── voice_docparse/    # Voice → document analysis
│   └── voice_pipeline/    # STT → LLM → TTS pipeline
├── linkedin/              # LinkedIn marketing automation
│   ├── main.ail
│   ├── services/
│   └── CLAUDE.md          # LinkedIn API setup guide
├── marketing/             # 20 LinkedIn posts (YAML frontmatter format)
│   ├── linkedin-content-plan.md
│   └── 01-vision/ ... 20-wrap-up/
├── scripts/
│   └── serve.sh           # Local dev server (assembles _site/, symlinks for live editing)
└── invoice_processor_wasm/ # AILANG WASM runtime (hosts DocParse browser)
```

## Local Dev Server

One script to serve all browser demos locally with live editing (symlinks):

```bash
scripts/serve.sh                # serve on http://localhost:8080
scripts/serve.sh --port 3000    # custom port
scripts/serve.sh --build        # rebuild website builder portal first
```

URLs served:
- Hub: `http://localhost:8080/`
- Ambient: `http://localhost:8080/streaming/ambient_assistant/`
- Streaming: `http://localhost:8080/streaming/`
- DocParse: `http://localhost:8080/docparse.html`
- Website Builder: `http://localhost:8080/website_builder/`

Edits to source files are reflected immediately (refresh browser). The script assembles `_site/` with symlinks to source directories.

## Quick Commands

```bash
# Type-check ALL streaming demos
for f in streaming/*/main.ail streaming/test_sse.ail; do
  echo -n "$f: " && ailang check "$f" 2>&1 | tail -1
done

# ── Verified working CLI demos ──

# Ambient Assistant — always-listening voice assistant
ambient --mic "Hey AILANG"                    # mic + interactive
ambient --mic --screen "What's on my screen?" # + screen capture
ambient --mic --video "Can you see me?"       # + webcam
ambient --list                                # list sessions

# Gemini Live — speak CLI (Vertex AI via ADC)
speak "Tell me a joke"
speak --voice Charon "What is AILANG?"
speak --tools "What's the git status?"    # with tool calling
speak --list                              # show active sessions

# Gemini Live — speak CLI (Google AI Studio via API key)
GOOGLE_API_KEY=xxx speak --google-ai "Tell me a joke"  # uses gemini-3.1-flash-live

# Claude SSE (needs ANTHROPIC_API_KEY)
ANTHROPIC_API_KEY=sk-ant-... ailang run --entry main \
  --caps IO,Stream,Env streaming/claude_chat/main.ail "What is AILANG?"

# Gemini SSE (uses ADC — ensure GOOGLE_API_KEY is unset)
GOOGLE_API_KEY="" ailang run --entry main \
  --caps IO,Stream,Net,Env streaming/test_sse.ail "What is 2+2?"

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

**Important:** If `GOOGLE_API_KEY` env var is set, the streaming CLI demos (`speak`, `ambient`) connect to Google AI Studio (with `gemini-3.1-flash-live-preview`) instead of Vertex AI. Use `--google-ai` flag or set `GOOGLE_API_KEY=xxx`. Set `GOOGLE_API_KEY=""` to force ADC/Vertex AI.

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
| Ambient Assistant | WebSocket (`connect`) | **YES** | Proactive audio, tools, mic, video, async |

## Ambient Assistant (ambient)

Always-listening voice assistant. Only responds when addressed by name ("AILANG"). See `streaming/ambient_assistant/README.md` for full docs.

```bash
# Install
ln -s $(pwd)/streaming/ambient_assistant/ambient ~/.local/bin/ambient

# Basic usage
ambient --mic "Hey AILANG"                    # mic + interactive
ambient --mic --screen "What's on my screen?" # + screen capture
ambient --mic --video "Can you see me?"       # + webcam
ambient --no-interactive "Quick query"        # single-prompt
ambient --list                                # list sessions
```

| Feature | Description |
|---------|-------------|
| Proactive audio | Model decides when to respond (always on) |
| 12 tools | speak_tools + summarize, search, remind, cache, prefetch, takeScreenshot |
| Async tools | Slow tools run in background, audio stays responsive |
| Video input | Screen/webcam via ffmpeg (512px/320px, 1 FPS) |
| On-demand screenshot | `takeScreenshot` tool — single frame, no continuous streaming needed |
| Sessions | Per-project, auto-resumed (2-hour Gemini handles) |

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
Set `GEMINI_VOICE` env var to any of the 30 prebuilt voices. Default: `Charon` (Informative) for ambient, `Sulafat` (Warm) for speak.
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
| `ambient` | `~/.local/bin/ambient` | `streaming/ambient_assistant/ambient` | Ambient voice assistant |
| `speak` | `~/.local/bin/speak` | `streaming/gemini_live/speak` | Text to speech |
| `linkedin` | `~/.local/bin/linkedin` | `linkedin/linkedin` | LinkedIn marketing |

Install: `ln -s $(pwd)/streaming/gemini_live/speak ~/.local/bin/speak`
Install: `ln -s $(pwd)/linkedin/linkedin ~/.local/bin/linkedin`

Both resolve symlinks to find the repo root, handle ADC auth, and set correct caps automatically.

## Voice Agent (speak) Capabilities

The `speak` CLI is a voice agent powered by Gemini Live with tool calling:

| Tool | Capability | Safety |
|------|-----------|--------|
| `currentTime` | Current date/time/timezone | Read-only |
| `calculate` | Arithmetic (add/sub/mul/div) | Contract-verified, inputs clamped |
| `readFile` | Read text files | Path-safe (prefix + no `..`) |
| `listFiles` | Directory listing | Path-safe |
| `runCommand` | Shell commands (allowlisted) | Command + subcommand filtering |

**runCommand subcommand safety:**
- **git**: status, log, diff, branch, show, blame, add, commit — blocks push, reset, force, checkout, rebase, clean
- **gh**: pr/issue list/view/status only — blocks merge, close, create, delete
- **ailang**: messages, check, docs, prompt, version only
- **General**: ls, date, echo, wc, head, tail, grep, pwd, whoami, uname

**Sessions:** Scoped per git repo (auto-detected). Session resumption via Gemini handles (valid 2 hours). Transcript saved to `~/.ailang/speak/sessions/<project>/transcript.jsonl`.

## Claude Code Hooks

### Voice Debrief (Stop Hook)

`~/.claude/hooks/session_end_speak.sh` runs `speak` when Claude Code finishes:
- Extracts Claude's last response from the session transcript
- Pre-fetches git status and includes it inline (no tool calls)
- Shows macOS notification with transcript text (no TextEdit focus grab)
- Serializes overlapping sessions with a lockfile
- Skips sub-agents (only debriefs top-level sessions)

### Waiting Alert (PreToolUse / PostToolUse)

`~/.claude/hooks/waiting_alert_pre.sh` and `waiting_alert_post.sh` give a vocal alert when Claude Code has been waiting for user input for more than 60 seconds:
- PreToolUse: records pending state, spawns a 60-second background watcher
- PostToolUse: clears pending state (auto-approved tools clear instantly)
- Uses macOS `say` for instant TTS (no API call) + notification with "Funk" sound
- Excludes directories matching patterns in `CLAUDE_ALERT_EXCLUDE` env var or `~/.claude/hooks/alert_exclude.conf`
- Default excludes: `/tmp`, `/private/tmp`, `/ailang_eval`

### Install

1. Clone this repo (speak needs the AILANG modules in `streaming/gemini_live/`)
2. Symlink speak: `ln -s $(pwd)/streaming/gemini_live/speak ~/.local/bin/speak`
3. Copy hooks:
   ```bash
   cp scripts/hooks/session_end_speak.sh ~/.claude/hooks/
   cp scripts/hooks/waiting_alert_pre.sh ~/.claude/hooks/
   cp scripts/hooks/waiting_alert_post.sh ~/.claude/hooks/
   chmod +x ~/.claude/hooks/waiting_alert_*.sh ~/.claude/hooks/session_end_speak.sh
   ```
4. Merge hook config into `~/.claude/settings.json` — see `scripts/hooks/example-claude-settings.json`
5. Ensure GCP ADC is configured: `gcloud auth application-default login`

No-ops silently if `speak` is not in PATH. Waiting alert works independently (no speak needed).

## When Working on This Repo

1. **Every demo must exercise AILANG code** — no standalone JS/HTML apps
2. **CLI module first**, browser UI second (and use WASM when possible)
3. **Type-check before committing**: `ailang check path/to/main.ail`
4. **Use `ailang docs <module>`** to check stdlib before assuming features are missing
5. **Use `ailang messages send`** to report bugs/feature requests to AILANG core
6. **Set `GOOGLE_API_KEY=""`** when using ADC for Vertex AI
