---
title: Universal Document Parsing — No Python, No Dependencies
day: 7
demo: DocParse
link: https://www.sunholo.com/ailang-demos/docparse.html
assets:
  - "Image: `invoice_processor_wasm/assets/doc_parse_demo_screenshot.png`"
  - "Alt image: `demo-document-intelligence.svg` (root)"
---

DocParse extracts structured data from DOCX, PPTX, XLSX, PDF, and images.

No python-docx. No unstructured.io. No heavy dependencies.

Just pure functional XML + ZIP parsing in AILANG, with 28 verified contracts guaranteeing correctness.

What it handles:
- Track changes with author and date attribution (insert, delete, move-to, move-from)
- Merged cells in tables (the thing every parser gets wrong)
- Embedded images with optional AI descriptions
- Comments extracted from Word's comments.xml
- LLM-ready markdown output for downstream AI pipelines

The numbers:
- 10 modules, 51 inline tests, 28 contracts verified
- 17 real-world test files (Pandoc, Unstructured, python-pptx sources)
- Block ADT: TextBlock, HeadingBlock, TableBlock, ListBlock, ImageBlock, SectionBlock, ChangeBlock

And here's the thing most people miss: it runs in your browser via WebAssembly.

Same 10 modules. Same 28 contracts. Same code. Zero backend. A 95-line adapter bridges CLI modules to the browser. No transpilation, no reimplementation.

Upload a DOCX right now and see the structured output: https://www.sunholo.com/ailang-demos/docparse.html

#DocumentAI #DataPipelines #WebAssembly #DocumentParsing
