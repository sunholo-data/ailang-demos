# DocParse

Universal document parsing in AILANG. Extracts structured content from DOCX, PPTX, XLSX, PDF, and image files into JSON and markdown, with optional AI for image descriptions and document summarization. Office formats use deterministic XML parsing; PDFs and images use AI multimodal extraction.

## Quick Start

```bash
# Parse any Office document
docparse/docparse report.docx
docparse/docparse presentation.pptx
docparse/docparse spreadsheet.xlsx

# PDF and images (AI auto-enabled)
docparse/docparse document.pdf
docparse/docparse photo.png

# With AI image descriptions (Office formats)
docparse/docparse presentation.pptx --describe

# With AI document summary (any format)
docparse/docparse report.docx --summarize

# Dev commands
docparse/docparse --check       # Type-check all 10 modules
docparse/docparse --test        # Run all inline tests
docparse/docparse --help        # Full usage info
```

The `docparse` CLI wrapper handles capabilities, AI model selection, and the `GOOGLE_API_KEY` workaround automatically. PDF/image formats auto-enable AI; Office formats use deterministic parsing by default.

### Install globally

Symlink the CLI wrapper to a directory on your `PATH` so `docparse` works from anywhere:

```bash
ln -s "$(pwd)/docparse/docparse" /usr/local/bin/docparse
```

Then from any directory:

```bash
docparse ~/Documents/report.docx
docparse /path/to/slides.pptx --describe
```

The script resolves paths relative to the project root automatically, so AILANG modules are always found regardless of your working directory.

<details>
<summary>Direct ailang invocation (without wrapper)</summary>

```bash
# Office formats (from project root)
ailang run --entry main --caps IO,FS,Env docparse/main.ail report.docx

# With AI
GOOGLE_API_KEY="" ailang run --entry main --caps IO,FS,Env,AI \
  --ai gemini-3-flash-preview docparse/main.ail presentation.pptx describe
```

</details>

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
$ docparse/docparse presentation.pptx --summarize

--- AI Summary ---
The presentation covers LLMs, an architectural diagram, and data tables.
Key points include provider management of approved LLMs, streaming support,
and multimodal models. A Venn diagram illustrates three components: SKILLS
(RPA workflows), BRAINS (AI agents), and KNOWLEDGE (RAG pipelines).

Summary written to docparse/data/output_summary.txt
```

### Example: PDF extraction via AI

```bash
$ docparse/docparse booking.pdf

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
$ docparse/docparse data.xlsx
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

| Mode | CLI Flag | What It Does |
|------|----------|-------------|
| Parse only | *(none)* | Extract text, tables, images from Office formats. Write JSON + markdown |
| Describe images | `--describe` | Parse + AI describes each embedded image |
| Summarize | `--summarize` | Parse + describe images + AI summary of full document |
| PDF/Image | *(auto)* | AI auto-enabled - content extracted via multimodal AI |
| Verify contracts | `--verify` | Enable runtime contract verification |
| Budget report | `--budget-report` | Show capability budget usage after run |

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
| `change` | `changeType`, `author`, `date`, `text` | Track changes (insert, delete, move-to, move-from) |

## AI Configuration

DocParse uses Vertex AI via Application Default Credentials. The `docparse` CLI wrapper handles the `GOOGLE_API_KEY` workaround automatically. Use `--ai MODEL` to override the default model:

```bash
docparse/docparse report.docx --describe --ai claude-haiku-4-5
```

AI usage is bounded by capability budgets (`AI @limit=20`), so costs are predictable.

## Running Tests

```bash
docparse/docparse --test        # Run all inline tests (41 tests)
docparse/docparse --check       # Type-check all 10 modules
```

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
├── docparse                    # CLI wrapper (handles caps, AI, flags)
├── main.ail                    # Entry point, CLI args, format routing
├── types/
│   └── document.ail            # Block ADT, TableCell, metadata types
├── services/
│   ├── format_router.ail       # Format detection (pure, 36 inline tests)
│   ├── zip_extract.ail         # ZIP layer wrapping std/zip (9 inline tests)
│   ├── docx_parser.ail         # DOCX XML -> Blocks (6 inline tests)
│   ├── pptx_parser.ail         # PPTX slides -> Blocks
│   ├── xlsx_parser.ail         # XLSX worksheets -> Blocks
│   ├── direct_ai_parser.ail    # PDF + image -> Blocks (AI multimodal)
│   ├── layout_ai.ail           # AI image descriptions + self-healing (optional)
│   ├── output_formatter.ail    # JSON, markdown, console output
│   └── docparse_browser.ail    # WASM browser adapter
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

The `docparse` CLI wrapper handles these automatically. For reference:

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
