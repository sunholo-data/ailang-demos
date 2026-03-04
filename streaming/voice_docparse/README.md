# Voice DocParse — Talk to Your Documents

Upload a document and ask questions about it using your voice. Gemini Live bidirectional audio streaming connects via WebSocket and invokes DocParse tools to analyze DOCX, PPTX, XLSX, PDF, and images in real-time.

## Usage

```bash
# Text mode — ask a question about a document
GOOGLE_API_KEY="" ailang run --entry main \
  --caps IO,FS,Stream,Env \
  streaming/voice_docparse/main.ail data/sample.docx "What tables are in this document?"

# Voice mode — conversational document Q&A
GOOGLE_API_KEY="" ailang run --entry main \
  --caps IO,FS,Stream,Env \
  streaming/voice_docparse/main.ail data/sample.docx
```

## Budget

```
IO @limit=200      — Console output (transcription + results)
FS @limit=30       — Document parsing (ZIP entries for DOCX)
Stream @limit=100  — WebSocket messages (voice session)
Env                — Read environment variables
```

## Architecture

- `main.ail` — Entry point, Gemini Live WebSocket connection, tool dispatch
- `services/gemini_live.ail` — Gemini Live API integration
- `types/` — Type definitions for voice session state
- `browser/` — Browser UI with mic input and document upload

## Features

- Gemini Live WebSocket bidirectional audio streaming
- Tool calling: voice agent invokes DocParse for document analysis
- Composition with existing DocParse infrastructure (same AILANG modules)
- Browser: WASM + `getUserMedia()` for mic + Web Audio for speaker

## Browser Demo

[Try it live](https://www.sunholo.com/ailang-demos/streaming/voice_docparse/)
