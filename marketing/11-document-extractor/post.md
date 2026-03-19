---
title: Upload a Document. Get a Typed, Validated Schema — Automatically.
day: 31
demo: Document Extractor (Invoice Processor)
link: https://www.sunholo.com/ailang-demos/extractor.html
assets:
  - "Image: `invoice_processor_wasm/assets/extraction-demo-ui.png`"
---

Upload a document. AI detects its structure. AILANG generates a typed schema. Every extracted field is validated with contracts.

That's the Document Extractor demo.

The flow:
1. Upload any document (text, image, PDF — up to 20MB)
2. AI suggests fields, types, and constraints from the content
3. AILANG generates extraction code with `requires`/`ensures` on every field
4. Data is extracted against the schema
5. Contract validation runs on every result

7 built-in presets to try immediately:
- Invoice (vendor, totals, line items)
- Receipt (merchant, items, payment)
- Contract (parties, dates, terms)
- Bank Statement (account, balances, transactions)
- Shipping (sender, recipient, tracking)
- Resume (candidate, experience, education)
- PDF Invoice (real-world multimodal example)

The generated AILANG code looks like this:

```
func extractFields(document: string) -> string ! {AI}
export pure func validateOnly(jsonString: string) -> string
  requires { length(trim(jsonString)) > 0 }
  ensures  { result != "" }
```

3-tier graceful degradation:
- Full: WASM + AI (Gemini multimodal extraction)
- Medium: JS + API key (no WASM, still AI-powered)
- Demo: pre-loaded sample data (no API key needed)

The validation code runs in WebAssembly. Same contract enforcement as the CLI. In your browser.

Try it now: https://www.sunholo.com/ailang-demos/extractor.html

#DocumentAI #DataExtraction #Validation #WebAssembly
