---
title: An AI That Listens But Only Speaks When Spoken To
day: 10
demo: Ambient Assistant
link: https://www.sunholo.com/ailang-demos/streaming/ambient_assistant/
image: site/thumbnails/streaming-ambient_assistant.png
imageAlt: The Ambient Assistant browser demo with the animated orb in its always-listening state.
assets:
  - "Image: `streaming/ambient_assistant/ambient-demo.png`"
  - "Screenshot needed: Browser demo showing the ambient orb in \"speaking\" state"
---

Most voice assistants wait for a wake word, then listen for a command, then respond.

The Ambient Assistant is always listening. But it only speaks when you address it by name.

This is Gemini Live's proactive audio mode: the model is always on, processing ambient audio, but it decides when to respond. No wake word detection. No command structure. Just natural conversation.

"Hey AILANG, what's on my screen?"

It captures your screen via ffmpeg, sends the frame to Gemini Live, and speaks the answer. While you keep working.

What it can do:
- 11 contract-verified CLI tools (git status, gh issues, file reads, calculations, reminders)
- Async tool execution: slow commands run in background, audio stays responsive
- Screen capture and webcam input at 1 FPS
- Per-project sessions with transcript persistence
- 30 voice presets (Charon for informative, Sulafat for warm, Puck for upbeat)
- Proactive data gathering: mention "issues" and it pre-fetches `gh issue list`

The browser version has an animated ambient orb that visualizes connection state: idle, listening, speaking, thinking.

This is what ambient AI looks like. Not interrogative. Not command-based. Just there when you need it.

```
ambient --mic --screen "Hey AILANG, what changed since yesterday?"
```

Try the browser demo: https://www.sunholo.com/ailang-demos/streaming/ambient_assistant/

#VoiceAI #GeminiLive #DeveloperTools #AmbientComputing
