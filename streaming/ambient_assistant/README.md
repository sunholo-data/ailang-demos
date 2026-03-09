# Ambient AILANG Assistant

An always-listening voice assistant powered by Gemini Live and AILANG. It listens passively to conversation and only responds when addressed directly by name ("AILANG"). Uses proactive audio so the model decides when to respond — no wake word detection needed.

Inspired by Google's [Project Livewire](https://github.com/nickhobbs-at-google/project-livewire).

![Ambient AILANG Assistant — Browser Demo](ambient-demo.png)

## Quick Start

```bash
# Install (symlink to PATH)
ln -s $(pwd)/streaming/ambient_assistant/ambient ~/.local/bin/ambient

# Start listening (mic + interactive)
ambient --mic "Hey AILANG"

# Screen sharing
ambient --mic --screen "What do you see?"

# Webcam
ambient --mic --video "Can you see me?"
```

Requires GCP Application Default Credentials:
```bash
gcloud auth application-default login
```

## Features

| Feature | Flag | Description |
|---------|------|-------------|
| **Proactive Audio** | (always on) | Model decides when to respond — stays silent unless addressed |
| **Microphone** | `--mic` | Live audio capture via `sox rec` (16kHz mono PCM) |
| **Screen Capture** | `--screen` | Sends screen frames to Gemini via ffmpeg (1 FPS) |
| **Webcam** | `--video` | Sends webcam frames via ffmpeg (1 FPS) |
| **Tool Calling** | (always on) | 11 tools including shell commands, caching, reminders |
| **Async Tools** | (automatic) | Slow tools run in background — audio pipeline stays responsive |
| **Proactive PA** | (always on) | Model silently pre-fetches data when it hears conversational cues |
| **Sessions** | (automatic) | Context persists across invocations (2-hour Gemini handles) |
| **Interactive** | (default) | Type follow-up messages while listening |
| **Thinking** | `--thinking N` | Extended reasoning with token budget |
| **Affective** | `--affective` | Emotion-aware tone (AI Studio v1alpha only) |

## Usage

```bash
ambient [flags] [prompt]
```

### Flags

```
--mic, -m              Enable microphone capture (needs sox)
--screen               Enable screen capture (needs ffmpeg)
--video                Enable webcam capture (needs ffmpeg)
--fps N                Video frame rate (default: 1 FPS)
--voice NAME, -v NAME  Voice selection (default: Sulafat)
--new                  Start fresh session (clear history)
--session NAME, -s     Named session scope
--list                 List all sessions
--no-interactive       Single-prompt mode (no follow-ups)
--thinking N           Thinking budget in tokens
--thoughts             Show thinking output
--no-interrupt         Disable user interruption
--affective, -a        Enable affective dialog
```

### Examples

```bash
# Basic voice interaction
ambient --mic "What's the git status?"

# Screen sharing for code review
ambient --mic --screen "Review the code on my screen"

# Named session for a specific project
ambient --mic --session myproject "Let's work on the API"

# Non-interactive (single response)
ambient --no-interactive "Summarize the last 5 commits"

# Custom voice and frame rate
ambient --mic --video --fps 2 --voice Charon "Watch me code"

# List all sessions
ambient --list
```

## Tools

### CLI Tools (Full Set)

| Tool | Description | Safety |
|------|-------------|--------|
| `currentTime` | Current date/time/timezone | Read-only |
| `calculate` | Arithmetic (add/sub/mul/div) | Contract-verified |
| `readFile` | Read text files | Path-safe (no `..`) |
| `listFiles` | Directory listing | Path-safe |
| `runCommand` | Shell commands (allowlisted) | Command + subcommand filtering |
| `summarizeContext` | Conversation summary from transcript | Session-scoped |
| `searchNotes` | Keyword search in notes directory | Path-safe |
| `remindLater` | Save timestamped reminders | Session-scoped |
| `cacheResult` | Cache key-value with TTL | Session-scoped |
| `getCachedResult` | Retrieve cached values | Session-scoped |
| `prefetch` | Run command + cache result | Combines runCommand + cache |

**Allowed shell commands** (via `runCommand`):
- **git**: status, log, diff, branch, show, blame, add, commit
- **gh**: pr/issue list/view/status
- **ailang**: messages, check, docs, prompt, version
- **General**: ls, date, echo, wc, head, tail, grep, pwd, whoami, uname

### Browser Tools

The browser demo includes 9 tools adapted for the browser environment:

| Tool | Description |
|------|-------------|
| `currentTime` | Current date/time/timezone |
| `calculate` | Arithmetic (add/sub/mul/div) |
| `remindLater` | Save timestamped reminders |
| `cacheResult` | Cache key-value with TTL |
| `getCachedResult` | Retrieve cached values |
| `summarizeContext` | Conversation summary |
| `takeScreenshot` | Capture frame from shared screen (requires Screen Share) |
| `saveNote` | Save notes to local storage |
| `webFetch` | Fetch web pages (via CORS proxy) |

### Proactive Data Gathering

The model silently pre-fetches data when it hears conversational cues:

- "Let's look at the issues" → `prefetch(key='gh_issues', command='gh', subcommand='issue list')`
- "What changed since yesterday?" → `prefetch(key='git_log', command='git', subcommand='log', args='--since=yesterday')`
- "Check the build status" → `prefetch(key='gh_runs', command='gh', subcommand='run list')`

Pre-fetched data is cached for 5 minutes. When asked directly, the model retrieves and speaks it instantly.

### Async Tool Execution

Slow tools (runCommand, prefetch, searchNotes) execute in background subprocesses:
- Audio pipeline stays responsive (mic keeps capturing, playback continues)
- Fast tools (currentTime, calculate, getCachedResult) execute synchronously
- Per-call file isolation prevents race conditions with concurrent tools

## Architecture

```
ambient (bash)
  └── main.ail (AILANG entry point)
        ├── selectEvents loop (multiplexes stdin + WebSocket + mic + video)
        ├── services/ambient_tools.ail (tool declarations + dispatch)
        ├── gemini_live/services/speak_tools.ail (base tool set)
        └── gemini_live/services/live_config.ail (setup config)

scripts/
  └── capture_frames.sh (ffmpeg → JPEG splitter → base64 lines)

browser/
  ├── index.html (dark theme UI with conversation log + context sidebar)
  └── ambient_browser.ail (WASM bridge — self-contained, no transitive imports)
```

### Event Loop

The `selectEvents` loop multiplexes multiple input sources with priority-based dispatch:

1. **WebSocket** (priority 10) — Gemini server messages (audio, text, tool calls)
2. **Mic** (priority 8) — PCM audio chunks from `sox rec` (16kHz, 150ms)
3. **Video** (priority 6) — Base64 JPEG frames from `capture_frames.sh`
4. **Stdin** (priority 5) — User text input for follow-up messages
5. **Pending tools** — Checked on each event tick for completed async tools

### Sessions

Sessions are scoped per git repository (auto-detected) or custom-named:

```
~/.ailang/ambient/sessions/
  └── <scope>/
      ├── session.handle      # Gemini session handle (2-hour validity)
      ├── transcript.jsonl    # Full conversation transcript
      ├── reminders.txt       # Saved reminders
      ├── cache/              # Pre-fetched data cache
      │   └── <key>.json      # Cached values with TTL
      └── pending_tools/      # In-flight async tool state
          ├── <callId>.json   # Tool metadata
          ├── <callId>.result # Tool output
          └── <callId>.done   # Completion marker
```

## Browser Demo

**[Try it live](https://www.sunholo.com/ailang-demos/streaming/ambient_assistant/)**

The browser version runs at `streaming/ambient_assistant/` via any static file server. It uses AILANG WASM for protocol construction and falls back to pure JS if WASM isn't available.

```bash
# Serve locally
scripts/serve.sh
# Open http://localhost:8080/streaming/ambient_assistant/
```

Features:
- **Ambient Orb** — animated pulsing orb that visualizes connection state (idle, listening, speaking, thinking)
- Dark theme with emerald/amber accents
- Two-column layout: conversation log + context sidebar (heard/AILANG/tools)
- Mic capture via Web Audio API (AudioWorklet)
- Screen sharing via `getDisplayMedia()` — enables `takeScreenshot` tool
- Screenshot preview thumbnails in chat when captured
- Tool calling with 9 browser tools (dispatched in JS)
- Thinking bubble display for extended reasoning
- Session stats: duration, data transferred, latency
- Config panel: API key, model, voice selector, thinking budget

**Note:** The browser demo uses AI Studio (API key auth), not Vertex AI ADC. Enter a Gemini API key in the config panel.

## Requirements

| Component | Requires |
|-----------|----------|
| Core | `ailang` CLI, GCP ADC |
| Microphone | `sox` (`brew install sox`) |
| Video | `ffmpeg` (`brew install ffmpeg`), `python3` |
| Browser | Modern browser with Web Audio API |

## Voices

30 Gemini prebuilt voices are available. Set with `--voice NAME` or `GEMINI_VOICE` env var.

Default: **Sulafat** (Warm)

Popular choices: Charon (Informative), Puck (Upbeat), Kore (Firm), Fenrir (Excitable), Aoede (Breezy), Achird (Friendly)

Full list: `ambient --list` or see the voice catalog in `ambient_browser.ail`.

## Comparison with `speak`

| | `speak` | `ambient` |
|---|---------|-----------|
| **Purpose** | Text-to-speech agent | Always-listening assistant |
| **Input** | Text prompt → audio response | Continuous mic/video |
| **Response** | Always responds to every prompt | Only when addressed by name |
| **Proactive** | Optional (`--proactive`) | Always on |
| **Tools** | 5 base tools | 11 tools (base + ambient) |
| **Async tools** | No | Yes (background subprocess) |
| **Video** | No | Screen + webcam capture |
| **Interactive** | Optional (`--interactive`) | Default on |
| **Caching** | No | Proactive data pre-fetching |
