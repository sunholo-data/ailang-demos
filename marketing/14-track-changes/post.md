---
title: Parsing Word Track Changes Without python-docx
day: 40
demo: "DocParse \u2014 Track Changes Deep Dive"
link: https://www.sunholo.com/ailang-demos/docparse.html
image: invoice_processor_wasm/assets/doc_parse_demo_screenshot.png
imageAlt: DocParse rendering a DOCX with colour-coded insertions, deletions, and authorship metadata.
assets:
  - "Screenshot needed: DocParse browser output showing color-coded track changes"
  - "Image: `invoice_processor_wasm/assets/doc_parse_demo_screenshot.png`"
---

Here's a trap that catches every DOCX parser at some point:

Deleted text in Word track changes uses `w:delText`, not `w:t`.

If your parser only looks for `w:t` elements, deleted text silently vanishes from your output. No error. No warning. Just missing data.

AILANG's DocParse handles all 4 track change types:
- Insert (`w:ins`) — new text added
- Delete (`w:del`) — text removed (uses `w:delText`)
- Move-to (`w:moveTo`) — text destination
- Move-from (`w:moveFrom`) — text origin (also uses `w:delText`)

Each change carries:
- Author (from `w:author` XML attribute)
- Date (from `w:date` XML attribute)
- The actual text content

The output:
```json
{"type":"change","changeType":"delete","author":"Jane","date":"2024-03-15","text":"removed paragraph"}
```

In the browser demo, changes are color-coded:
- Green: insertions
- Red: deletions
- Blue: move-to
- Orange: move-from

In markdown output:
- ~~Strikethrough~~ for deletions
- **Bold** for insertions
- Author/date attribution on each

Comments are separate — they live in `word/comments.xml`, not inline in `word/document.xml`. DocParse extracts both.

All pure XML parsing. No Office libraries. 28 contracts guaranteeing correctness.

Upload a tracked-changes document: https://www.sunholo.com/ailang-demos/docparse.html

#DocumentParsing #OfficeAutomation #XML #DataEngineering
