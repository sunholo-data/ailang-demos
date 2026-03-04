# Streaming Demos

Real-time streaming protocols in AILANG — SSE, WebSocket bidirectional, and hybrid REST+SSE.

Every demo has a CLI module (`.ail`) as the canonical integration test, plus a browser UI served via GitHub Pages.

## Demos

| Demo | Directory | Protocol | CLI Status | Description |
|------|-----------|----------|-----------|-------------|
| **Gemini Live** | [gemini_live/](gemini_live/) | WebSocket bidi | Working | Text to streaming audio — 30 voices, native WAV generation |
| **Claude Chat** | [claude_chat/](claude_chat/) | SSE | Working | Streaming text responses from Claude Messages API |
| **Safe Agent** | [safe_agent/](safe_agent/) | REST + SSE | Working | Contract-verified AI tool calling with safety guarantees |
| **Voice DocParse** | [voice_docparse/](voice_docparse/) | WebSocket bidi | Type-checks | Voice-based document Q&A via Gemini Live + DocParse |
| **Gemini SSE** | [test_sse.ail](test_sse.ail) | SSE | Working | Minimal Gemini streaming test |

## Quick Start

```bash
# Gemini Live (uses ADC)
speak "Tell me a joke"
speak --tools "What's the git status?"

# Claude SSE (needs ANTHROPIC_API_KEY)
ANTHROPIC_API_KEY=sk-ant-... ailang run --entry main \
  --caps IO,Stream,Env streaming/claude_chat/main.ail "What is AILANG?"

# Gemini SSE (uses ADC)
GOOGLE_API_KEY="" ailang run --entry main \
  --caps IO,Stream,Net,Env streaming/test_sse.ail "What is 2+2?"

# Safe Agent with contract verification (uses ADC)
GOOGLE_API_KEY="" ailang run --entry main \
  --caps IO,FS,Stream,Net,Env --verify-contracts \
  streaming/safe_agent/main.ail "Calculate 500 times 300"
```

## Shared Assets

[shared/](shared/) contains browser assets used across all streaming demos: navigation bar, audio worklet processor, and the AILANG logo.

## Browser Hub

[index.html](index.html) is the streaming demo hub page, deployed to [sunholo.com/ailang-demos/streaming/](https://www.sunholo.com/ailang-demos/streaming/).

## Auth

| Provider | CLI | Browser |
|----------|-----|---------|
| Google (Vertex AI / ADC) | `GOOGLE_API_KEY="" ailang run ...` | API key in localStorage |
| Anthropic | `ANTHROPIC_API_KEY=sk-ant-...` env var | API key in localStorage |
