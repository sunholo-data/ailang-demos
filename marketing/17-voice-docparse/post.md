---
title: Upload a Spreadsheet. Ask It Questions. Out Loud.
day: 49
demo: Voice DocParse
link: https://www.sunholo.com/ailang-demos/streaming/voice_docparse/
assets:
  - "Screenshot needed: Browser demo with uploaded document + voice conversation visible"
---

Upload a spreadsheet. Then ask it questions using your voice.

"What's the total revenue in Q3?"
"Which product had the most returns?"
"Summarise the key findings."

Voice DocParse combines two AILANG demos into one pipeline:

1. DocParse parses your document (DOCX, PPTX, XLSX, PDF, or image)
2. The structured content is injected into a Gemini Live voice session
3. You talk to your document naturally via bidirectional audio

The document parsing reuses the exact same AILANG modules from DocParse — not a reimplementation. Same 28 contracts. Same typed Block ADT output.

Then Gemini Live gets the full document context: tables, lists, headings, image descriptions. And you have a voice conversation about the content.

What this means in practice:
- Upload a financial spreadsheet → ask about trends
- Upload meeting notes → ask for action items
- Upload a slide deck → ask what's on slide 7
- Upload an image → AI describes it, then you discuss

Works for structured data (tables with numbers) and unstructured text (paragraphs, lists).

The parsing is deterministic (pure AILANG). The conversation is AI-powered (Gemini Live). The boundary between them is clean.

Try it: https://www.sunholo.com/ailang-demos/streaming/voice_docparse/

#VoiceAI #DocumentAI #MultiModal #GeminiLive
