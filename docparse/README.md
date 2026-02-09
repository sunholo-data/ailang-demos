# DocParse

Universal document parsing in AILANG. Extracts structured content from DOCX, PPTX, XLSX, PDF, and image files into JSON and markdown, with optional AI for image descriptions and document summarization. Office formats use deterministic XML parsing; PDFs and images use AI multimodal extraction.

## Quick Start

```bash
# Parse any Office document
ailang run --entry main --caps IO,FS,Env docparse/main.ail path/to/file.docx

# Office formats (deterministic XML parsing)
ailang run --entry main --caps IO,FS,Env docparse/main.ail report.docx
ailang run --entry main --caps IO,FS,Env docparse/main.ail presentation.pptx
ailang run --entry main --caps IO,FS,Env docparse/main.ail spreadsheet.xlsx

# PDF and images (AI multimodal extraction - always requires AI caps)
GOOGLE_API_KEY="" ailang run --entry main --caps IO,FS,Env,AI \
  --ai gemini-3-flash-preview docparse/main.ail document.pdf
GOOGLE_API_KEY="" ailang run --entry main --caps IO,FS,Env,AI \
  --ai gemini-3-flash-preview docparse/main.ail photo.png

# With AI image descriptions (Office formats)
GOOGLE_API_KEY="" ailang run --entry main --caps IO,FS,Env,AI \
  --ai gemini-3-flash-preview docparse/main.ail presentation.pptx describe

# With AI document summary (any format)
GOOGLE_API_KEY="" ailang run --entry main --caps IO,FS,Env,AI \
  --ai gemini-3-flash-preview docparse/main.ail report.docx summarize
```

### Output Files

Every run produces:
- `docparse/data/output.json` - Structured JSON with typed blocks
- `docparse/data/output.md` - Markdown rendering, ready to pass to an LLM

With `summarize`, also produces:
- `docparse/data/output_summary.txt` - AI-generated document summary

## Use Case: Document-to-AI Pipeline

DocParse is designed as a pipeline stage: document in, LLM-ready content out.

```
  .docx / .pptx / .xlsx         .pdf / .png / .jpg
          |                            |
  DocParse (pure XML parsing)    DocParse (AI extraction)
          |                            |
          +------------+---------------+
                       |
                 +-----+-----+
                 |             |
           output.json    output.md
           (structured)   (LLM-ready)
                 |             |
               Your app     Pass to AI
               (search,     (summarize,
                index,       Q&A,
                display)     extract)
```

The markdown output combines text, tables (as markdown tables), image descriptions, and section labels into a single string that any LLM can consume directly.

### Example: Summarizing a presentation

```bash
$ GOOGLE_API_KEY="" ailang run --entry main --caps IO,FS,Env,AI \
    --ai gemini-3-flash-preview docparse/main.ail presentation.pptx summarize

--- AI Summary ---
The presentation covers LLMs, an architectural diagram, and data tables.
Key points include provider management of approved LLMs, streaming support,
and multimodal models. A Venn diagram illustrates three components: SKILLS
(RPA workflows), BRAINS (AI agents), and KNOWLEDGE (RAG pipelines).

Summary written to docparse/data/output_summary.txt
```

### Example: PDF extraction via AI

```bash
$ GOOGLE_API_KEY="" ailang run --entry main --caps IO,FS,Env,AI \
    --ai gemini-3-flash-preview docparse/main.ail booking.pdf

--- Parsing PDF (AI) ---
Extracting metadata via AI...
Extracting content via AI...
Extracted 21 content blocks.

=== Document Summary ===
Title:    Customer Portal - Cartrawler
Blocks:   21
Headings: 10
Tables:   2
```

The PDF content is sent as a multimodal request (same pattern as invoice_processor_wasm). AI extracts structured blocks - headings, tables, lists - which render as clean markdown.

### Example: Markdown output for downstream AI

```bash
$ ailang run --entry main --caps IO,FS,Env docparse/main.ail data.xlsx
$ cat docparse/data/output.md

**Author:** Anton Antic

---

### Sheet

| Person | Age | Location |
| --- | --- | --- |
| Anton Antich | 23 | Switzerland |
| James Bond | 35 | Moscow |
```

This markdown can be piped directly into any LLM API for Q&A, extraction, or analysis.

## Modes

| Mode | Flag | Caps Required | What It Does |
|------|------|---------------|-------------|
| Parse only | *(none)* | `IO,FS,Env` | Extract text, tables, images from Office formats. Write JSON + markdown |
| Describe images | `describe` | `IO,FS,Env,AI` | Parse + AI describes each embedded image |
| Summarize | `summarize` | `IO,FS,Env,AI` | Parse + describe images + AI summary of full document |
| PDF/Image | *(auto)* | `IO,FS,Env,AI` | AI always required - content extracted via multimodal AI |

## Supported Content

| Format | Parsing Strategy | Content Extracted |
|--------|-----------------|-------------------|
| **DOCX** | Deterministic (ZIP+XML) | Headings, paragraphs, tables (with merged cells), lists, images, headers/footers, footnotes/endnotes, text boxes, track changes, hyperlinks, SDT content |
| **PPTX** | Deterministic (ZIP+XML) | Slide titles, body text, tables (with merged cells), images, text boxes, group shapes, placeholder-based heading detection |
| **XLSX** | Deterministic (ZIP+XML) | All worksheets, shared strings, inline strings, rich text, booleans, errors, numbers. First row as headers |
| **PDF** | AI multimodal | Headings, paragraphs, tables, lists, image descriptions. AI extracts structure from rendered pages |
| **Images** | AI multimodal | PNG, JPG, GIF, BMP, WebP, TIFF. AI describes content, text, data, and visual structure |

## Output Format

### JSON (`output.json`)

```json
{
  "document": {
    "format": "docx",
    "filename": "report.docx",
    "metadata": {
      "title": "Quarterly Report",
      "author": "Jane Smith",
      "created": "2026-01-15T00:00:00Z",
      "modified": "2026-02-01T12:00:00Z",
      "pageCount": 0
    },
    "blocks": [
      {"type": "heading", "text": "Introduction", "level": 1},
      {"type": "text", "text": "Body paragraph...", "style": "Normal", "level": 0},
      {"type": "table", "headers": ["Name", "Value"], "rows": [["A", "1"], ["B", "2"]]},
      {"type": "list", "items": ["Item 1", "Item 2"], "ordered": false},
      {"type": "image", "description": "A chart showing...", "mime": "image/png"},
      {"type": "section", "kind": "slide", "blocks": [...]}
    ],
    "summary": {"totalBlocks": 12, "headings": 3, "tables": 1, "images": 2}
  },
  "warnings": [],
  "aiCallsUsed": 0
}
```

### Markdown (`output.md`)

Renders blocks as clean markdown: headings, paragraphs, markdown tables, lists, image descriptions in brackets, and section separators for slides/sheets.

### Block Types

| Type | Fields | When Used |
|------|--------|-----------|
| `heading` | `text`, `level` (1-6) | Document headings, slide titles |
| `text` | `text`, `style`, `level` | Paragraphs, body text |
| `table` | `headers`, `rows` | Tables with cell text |
| `list` | `items`, `ordered` | Bullet and numbered lists |
| `image` | `data` (base64), `description`, `mime` | Embedded images |
| `section` | `kind`, `blocks` | Headers, footers, footnotes, slides, sheets |

## AI Configuration

DocParse uses Vertex AI via Application Default Credentials. If you have `GOOGLE_API_KEY` set in your environment, prefix commands with `GOOGLE_API_KEY=""` to force ADC:

```bash
# Force Vertex AI (ADC) instead of Gemini API key
GOOGLE_API_KEY="" ailang run --entry main --caps IO,FS,Env,AI \
  --ai gemini-3-flash-preview docparse/main.ail file.docx describe
```

AI usage is bounded by capability budgets (`AI @limit=20`), so costs are predictable.

## Running Tests

### Inline Tests (41 tests)

```bash
ailang test docparse/services/format_router.ail   # 26 tests
ailang test docparse/services/zip_extract.ail      # 9 tests
ailang test docparse/services/docx_parser.ail      # 6 tests
```

### Type Checking (all 10 modules)

```bash
ailang check docparse/main.ail
ailang check docparse/types/document.ail
ailang check docparse/services/format_router.ail
ailang check docparse/services/zip_extract.ail
ailang check docparse/services/docx_parser.ail
ailang check docparse/services/pptx_parser.ail
ailang check docparse/services/xlsx_parser.ail
ailang check docparse/services/direct_ai_parser.ail
ailang check docparse/services/layout_ai.ail
ailang check docparse/services/output_formatter.ail
```

All 10 modules type-check cleanly.

### Real-World Test Files

17 test files from established parser test suites are included in `data/test_files/`. All parse successfully:

| Format | Files | Source Projects | All Pass |
|--------|-------|----------------|----------|
| DOCX | 11 | Pandoc, Unstructured, docx2python | Yes |
| PPTX | 4 | Pandoc, Unstructured, python-pptx | Yes |
| XLSX | 3 | Pandoc, Unstructured, XlsxWriter | Yes |

## Architecture

```
docparse/
├── main.ail                    # Entry point, CLI args, format routing
├── types/
│   └── document.ail            # Block ADT, TableCell, metadata types
├── services/
│   ├── format_router.ail       # Format detection (pure, 26 inline tests)
│   ├── zip_extract.ail         # ZIP layer wrapping std/zip (9 inline tests)
│   ├── docx_parser.ail         # DOCX XML -> Blocks (6 inline tests)
│   ├── pptx_parser.ail         # PPTX slides -> Blocks
│   ├── xlsx_parser.ail         # XLSX worksheets -> Blocks
│   ├── direct_ai_parser.ail    # PDF + image -> Blocks (AI multimodal)
│   ├── layout_ai.ail           # AI image descriptions + self-healing (optional)
│   └── output_formatter.ail    # JSON, markdown, console output
└── data/
    ├── sample.docx             # Basic test document
    ├── output.json             # Structured JSON output
    ├── output.md               # LLM-ready markdown output
    └── test_files/             # 17 real-world test files
```

### AI Self-Healing

When running with AI enabled (`describe` or `summarize` flags), DocParse applies a self-healing step after deterministic parsing. The `enhanceBlocks` function walks all parsed blocks and uses heuristics to detect quality issues that AI can fix:

| Heuristic | Trigger | AI Action |
|-----------|---------|-----------|
| All-empty headers | Every header cell is blank | Infer column headers from row data |
| Mostly empty rows | >50% of rows have all-empty cells | Reconstruct table from merged cell layout |
| Many merged cells | >3 merged cells in table | Re-align columns and fix spans |

Only tables that fail these heuristics trigger an AI call - good blocks pass through untouched, keeping AI budget usage predictable.

```
Deterministic XML parsing
        |
        v
  [Raw blocks]
        |
        v
  tableNeedsAI?  ──no──>  Keep block as-is
        |
       yes
        |
        v
  inferTableStructure (AI)
        |
        v
  [Fixed block]
```

This hybrid approach means most documents use zero AI calls for parsing. AI is only invoked when the deterministic parser produces ambiguous results.

### Design Principles

1. **Parse deterministically where possible, use AI where necessary.** Office formats (DOCX/PPTX/XLSX) are parsed deterministically via XML. PDFs and images go through AI multimodal extraction. AI is optional for Office formats and bounded everywhere.
2. **Pure/effectful split.** Pure functions handle XML trees. Effects (`FS`, `IO`, `AI`) are declared and budgeted.
3. **Typed output.** ADTs (`Block = TextBlock | HeadingBlock | TableBlock | ...`) with pattern matching. Same block types regardless of input format.
4. **Bounded AI costs.** `AI @limit=20` caps AI calls per document. Even AI-heavy formats (PDF, images) have predictable costs.
5. **Lightweight.** No JVM, no 3GB ML models, no cloud dependency.

## Capabilities Required

| Capability | Required | Purpose |
|------------|----------|---------|
| `IO` | Yes | Console output |
| `FS` | Yes | Read files (ZIP entries, binary), write JSON/markdown output |
| `Env` | Yes | Read CLI arguments |
| `AI` | For PDF/images; optional for Office | Image descriptions, document summarization, PDF/image content extraction |

## Comparison with Other Parsers

| Feature | DocParse | Python Unstructured | python-docx | Pandoc |
|---------|----------|--------------------|----|--------|
| DOCX merged cells | Yes | Buggy (duplicates) | Crashes | Loses spans |
| Text boxes | Yes | Drops silently | No API | Drops silently |
| Headers/footers | Yes | Limited | Limited | Partial |
| PPTX tables | Yes | Basic | N/A | Lossy |
| XLSX shared strings | Yes | Yes | N/A | N/A |
| PDF extraction | Yes (AI) | Yes (heavy deps) | N/A | Yes |
| Image description | Yes (AI) | No | N/A | No |
| AI self-healing | Yes (heuristic-triggered) | No | No | No |
| AI document summary | Yes (bounded) | No | No | No |
| LLM-ready markdown | Yes | No | No | Yes |
| Bounded AI costs | `@limit=N` | No | No | No |
| Typed output | ADTs | Dicts | Objects | AST |
| Self-hosted | Yes | Yes (limited) | Yes | Yes |
| Dependencies | AILANG only | Heavy | Python | Haskell |
