# Claude Chat — SSE Streaming

Streams responses from Claude's Messages API using Server-Sent Events. The canonical SSE demo — Claude uses SSE (not WebSocket), making it ideal for showcasing AILANG's SSE protocol support.

## Usage

```bash
ANTHROPIC_API_KEY=sk-ant-... ailang run --entry main \
  --caps IO,Stream,Env \
  streaming/claude_chat/main.ail "What is AILANG?"

# With budget
ANTHROPIC_API_KEY=sk-ant-... ailang run --entry main \
  --caps "IO,Env,Stream.recv @limit=100" \
  streaming/claude_chat/main.ail "Explain streaming in 3 sentences"
```

## Budget

```
IO @limit=200      — Console output (streaming text fragments)
Stream @limit=500  — SSE events (each text delta = 1 event)
Env                — Read ANTHROPIC_API_KEY
```

## Architecture

- `main.ail` — Entry point, CLI arg parsing, event loop
- `services/claude_sse.ail` — Claude API connection, SSE event parsing, request body builder
- `browser/` — Browser UI (deployed to GitHub Pages)

## Browser Demo

[Try it live](https://www.sunholo.com/ailang-demos/streaming/claude_chat/)
