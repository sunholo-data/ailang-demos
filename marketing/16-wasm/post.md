---
title: Same Code Runs CLI and Browser. Zero Transpilation.
day: 46
demo: WebAssembly (Cross-demo)
link: https://www.sunholo.com/ailang-demos/docparse.html
image: invoice_processor_wasm/assets/doc_parse_demo_screenshot.png
imageAlt: DocParse running entirely in the browser via AILANG WebAssembly — no server.
assets:
  - "Image: `invoice_processor_wasm/assets/doc_parse_demo_screenshot.png`"
---

DocParse has 10 AILANG modules, 51 tests, and 28 contracts. It parses DOCX, PPTX, XLSX, PDF, and images.

It runs in the CLI.

It also runs in your browser. Same modules. Same tests. Same contracts. Zero transpilation. Zero reimplementation.

How:
- AILANG compiles to a WASM binary (`ailang.wasm`)
- CLI modules load directly into the WASM REPL — unmodified
- A 95-line browser adapter re-exports functions for JavaScript to call
- Effect handlers bridge AILANG operations to browser APIs

The adapter is thin:
```
JS calls engine.callFunction('docparse_browser', 'parseDocument', data)
  → routes to the same parser modules
  → returns the same typed Block ADT output
```

Where this pattern repeats:
- DocParse: full document parsing in browser
- Website Builder: AI site generation in browser (WASM) or server (Cloud Run)
- Document Extractor: schema validation in browser

The capability security model works in both runtimes:
- CLI: AILANG runtime enforces effect budgets
- Browser: WASM sandbox + JS effect handlers enforce the same budgets

No backend required. The contract guarantees travel with the code.

Upload a document and parse it entirely client-side: https://www.sunholo.com/ailang-demos/docparse.html

#WebAssembly #ClientSide #ZeroBackend #WASM
