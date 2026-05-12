---
title: I Told My Terminal to Check the Git Status. It Spoke Back.
day: 22
demo: Speak CLI (Gemini Live Voice Agent)
link: https://www.sunholo.com/ailang-demos/streaming/gemini_live/
image: streaming/gemini_live/ailang-speak-contract.png
imageAlt: The speak CLI mid-conversation with Gemini Live, tool-call responses verified by AILANG contracts.
assets:
  - "Screenshot needed: Terminal showing speak with tool call output"
  - "Image: `streaming/gemini_live/ailang-speak-contract.png`"
---

```
speak --tools "What changed in the last commit?"
```

The `speak` CLI is a voice agent that lives in your terminal.

It connects to Gemini Live via bidirectional WebSocket, sends your text, and speaks the answer back. With 30 voice presets. And contract-verified tool calling.

Say "What's the git status?" and it:
1. Recognises the intent needs a tool call
2. Runs `git status` (allowlisted command)
3. Reads the output
4. Speaks a natural summary

The safety model:
- 5 contract-verified tools: calculate, readFile, listFiles, runCommand, currentTime
- git: status, log, diff, branch, show, blame — but NOT push, reset, force, checkout
- gh: pr/issue list and view — but NOT merge, close, create, delete
- File reads are path-safe (no directory traversal)
- Calculator inputs clamped to [-1000, 1000]

Every constraint is a contract. Every contract is verifiable by Z3.

30 voices available — Charon (informative), Sulafat (warm), Puck (upbeat), Fenrir (excitable), Kore (firm), and 25 more.

Sessions persist per git project. Pick up where you left off with a 2-hour Gemini handle.

```
speak "Tell me a joke"
speak --voice Charon "What is AILANG?"
speak --tools "How many open PRs do we have?"
```

#DeveloperTools #VoiceUI #CLITools #GeminiLive
