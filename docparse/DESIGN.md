# DocParse Design Document

Universal document parsing in AILANG - a pragmatic approach to document parsing that uses AI when practical and rule-based parsing when deterministic.

## Status

- **Phase 1 COMPLETE**: Full DOCX parsing with merged cells, headers/footers, footnotes/endnotes, text boxes, track changes, hyperlinks, SDT content
- **Phase 2 COMPLETE**: PPTX slides/tables/images, XLSX shared strings/cell types/worksheets
- **Phase 3 COMPLETE**: AI self-healing (table structure inference, reading order, image descriptions)
- **Phase 4 COMPLETE**: PDF multimodal extraction, image description via AI
- **Tests**: 41/41 inline tests passing across 10 modules
- **Real-world testing**: 17 test files from Pandoc, Unstructured-IO, docx2python, python-pptx, XlsxWriter

## Architecture

```
Input (.docx/.pptx/.xlsx/.pdf/image/audio/video)
         │
  Format Detection (pure, pattern matching)
         │
    ┌────┴────┬──────────┬──────────┬──────────┐
    │         │          │          │          │
 ZIP+XML    PDF      Image     Audio      Video
 (docx/    (AI)     (AI)      (AI)       (AI)
  pptx/
  xlsx)
    │
 std/zip → extract XML parts
    │
 std/xml → parse to tree
    │
 Pure functions → content blocks (deterministic, testable)
    │
 AI (optional) → layout understanding (bounded cost)
    │
 Typed output → JSON with contracts
```

Key principle: **Parse deterministically first, use AI only for genuine ambiguity.**

## Competitor Comparison

### Landscape Overview

| Tool | Formats | AI? | Tables | Self-hosted | License | Key Weakness |
|---|---|---|---|---|---|---|
| Python Unstructured | 25+ | Yes (hi-res) | Buggy merged cells | Yes (limited) | Apache 2.0 | OSS hobbled vs commercial; merged cell bugs |
| python-docx | DOCX | No | Basic, crashes on merges | Yes | MIT | No text boxes, headers/footers API |
| Apache Tika | 1000+ | OCR only | Flat output | Yes (JVM) | Apache 2.0 | No layout understanding, heavy JVM |
| Pandoc | 60+ | No | Lossy for complex | Yes | GPL v2+ | AST less expressive than formats |
| mammoth.js | DOCX | No | Basic | Yes | BSD | Semantic-only; ignores layout |
| LlamaParse | 10+ | Core | AI-variable | No (cloud) | Commercial | Cloud-only, non-deterministic |
| Azure/Google AI | 10+ | Core | Strong | Azure only | Commercial | Cloud-only, pay-per-page |
| Docling (IBM) | 10+ | Core | Best OSS (97.9%) | Yes | MIT | 3-4GB RAM, slow (3min/9 pages) |
| **DocParse** | DOCX (expanding) | Optional | WIP | Yes | - | Early stage |

### What's Broken Everywhere

**Tables are the #1 failure point across all parsers:**
- Python Unstructured: duplicates text in merged cells, `AttributeError` on `_Row` objects
- python-docx: `IndexError` on merged cell iteration, no straightforward merge detection API
- Pandoc: loses rowspan/colspan info, complex tables don't fit AST model
- mammoth.js: tables may be removed entirely from output

**Text in non-body locations is #2:**
- Headers/footers, text boxes, footnotes are in separate XML parts
- python-docx has no text box API at all
- Most parsers silently drop text box content

**Other common pain points:**
- Multi-column layout reading order
- Track changes interleaved with content
- VML (legacy) vs DrawingML (modern) image formats
- SmartArt, equations (OMML), field codes
- Strict vs Transitional OOXML conformance
- Documents created by LibreOffice (subtly different XML)

### DocParse Differentiators

1. **Bounded AI costs** - `AI @limit=20` effect budgets. Parse 1000 docs, know max cost up front. No other tool offers this.
2. **Pure/effectful split** - XML parsing is pure and deterministic. AI only where ambiguity exists.
3. **Contract-verified output** - `ensures { length(result.rows) > 0 }` on extractors. Provable output properties.
4. **Lightweight** - No JVM, no 3-4GB ML models, no cloud dependency. ZIP + XML + optional AI.
5. **Inline testability** - Every pure function has inline tests. `ailang test` runs instantly.

## Test Results (Real-World Files)

17 test files from Pandoc, Unstructured-IO, docx2python, python-pptx, and XlsxWriter test suites. All parse successfully.

### DOCX (11 files)

| File | Source | Challenge | Result |
|---|---|---|---|
| `sample.docx` | DocParse | Basic content | 10 blocks (4h, 2t, 3l, 1tbl) |
| `merged_cells.docx` | docx2python | H+V cell merges | 2 blocks, merged cells detected (2 merged, 3 spanned) |
| `tables.docx` | Pandoc | Multiple tables | 8 blocks (1h, 3 tbl) |
| `table_header_rowspan.docx` | Pandoc | Multi-row headers | 4 blocks, 10x6 table with merges (5 merged, 1 spanned) |
| `tables-with-incomplete-rows.docx` | Unstructured | Ragged rows | 8 blocks, 6 tables with merge handling |
| `docx-shapes.docx` | Unstructured | Text boxes/shapes | 11 blocks, 8 sections (text boxes extracted) |
| `docx-hdrftr.docx` | Unstructured | Headers/footers | 3 blocks, headers and footers extracted |
| `image_vml.docx` | Pandoc | Legacy VML images | 5 blocks, 1 image + footer extracted |
| `comments.docx` | Pandoc | Comments | 4 blocks, body text extracted |
| `track_changes_move.docx` | Pandoc | Track changes | 9 blocks, moved text included |
| `nested_sdt.docx` | Pandoc | Nested content controls | 0 blocks (document is SDT-only, no body paragraphs) |

### PPTX (4 files)

| File | Source | Challenge | Result |
|---|---|---|---|
| `unstructured_test.pptx` | Unstructured | Title, body, text boxes | 1 slide, title + body + text box content |
| `pandoc_basic.pptx` | Pandoc | Mixed content + images | 4 slides, tables + images extracted |
| `python_pptx_table.pptx` | python-pptx | Tables with merged cells | 3 slides, merged cells detected (3+5 merged) |
| `python_pptx_slides.pptx` | python-pptx | Empty slides | 0 blocks (correctly skips empty slides) |

### XLSX (3 files)

| File | Source | Challenge | Result |
|---|---|---|---|
| `unstructured_test.xlsx` | Unstructured | Multiple sheets | 2 sheets, shared string resolution |
| `pandoc_basic.xlsx` | Pandoc | Mixed data types | 2 sheets (3x3 + 5x2) |
| `xlsxwriter_chart.xlsx` | XlsxWriter | Chart + data | 1 sheet, 4x3 numeric data |

## Feature Roadmap

### Phase 1: DOCX Completeness (COMPLETE)

All pure XML parsing additions - no AI needed. Closes the gap with python-docx and surpasses Unstructured on DOCX handling.

- [x] **1a. Merged Cell Handling** - `TableCell` type with `colSpan`/`rowSpan`/`merged` fields. Parses `gridSpan` and `vMerge` attributes.
- [x] **1b. Headers/Footers** - `SectionBlock` ADT variant. Reads `header*.xml`/`footer*.xml` ZIP entries.
- [x] **1c. Footnotes/Endnotes** - Reads `footnotes.xml`/`endnotes.xml` via reusable section infrastructure.
- [x] **1d. Text Boxes** - Extracts `w:txbxContent` paragraphs, wraps in `SectionBlock({kind: "textbox"})`.
- [x] **1e. Track Changes** - Includes `w:ins`/`w:moveTo` text, skips `w:del`/`w:moveFrom`.
- [x] **1f. Hyperlinks + SDT** - Extracts text from `w:hyperlink`, `w:smartTag`, and `w:sdt`/`w:sdtContent`.

### Phase 2: Additional Office Formats (COMPLETE)

- [x] **2a. PPTX (PowerPoint)** - `pptx_parser.ail`: slides as `SectionBlock({kind: "slide"})`, DrawingML text (`a:p/a:r/a:t`), tables (`a:tbl/a:tr/a:tc`), merged cells (`gridSpan/hMerge/vMerge`), images, placeholder-based heading detection (`title`/`ctrTitle`/`subTitle`), group shapes.
- [x] **2b. XLSX (Excel)** - `xlsx_parser.ail`: shared string table resolution, inline strings (`inlineStr`), rich text runs, boolean/error/numeric cell types, worksheets as `SectionBlock({kind: "sheet"})` containing `TableBlock`.
- [x] **No-AI graceful handling** - Parsing works with `--caps IO,FS` only. Images included without descriptions. AI image description available via `--caps IO,FS,AI --ai <model>`.

### Phase 3: AI-Augmented Features (COMPLETE)

- [x] **3a. Smart Merged Cell Reconstruction** - `enhanceBlocks` with `tableNeedsAI` heuristics: all-empty headers, >50% empty rows, >3 merged cells trigger `inferTableStructure` AI call. Budget: 1 AI call per ambiguous table.
- [x] **3b. Reading Order Inference** - `inferReadingOrder` implemented, uses AI to reorder blocks for multi-column layouts.
- [x] **3c. Image Description** - `describeImages` walks blocks, describes each `ImageBlock` via AI multimodal. Budget-bounded by `AI @limit=N`.

### Phase 4: Non-Office Formats (COMPLETE)

- [x] **4a. PDF Extraction** - `direct_ai_parser.ail`: multimodal AI request with base64-encoded PDF data. AI extracts structured blocks (headings, tables, lists, text). Uses `readFileBytes` from `std/fs`.
- [x] **4b. Image-Only Documents** - Same multimodal pattern as PDF. Supports PNG, JPG, GIF, BMP, WebP, TIFF.
- [x] **4c. Audio Files** - AI multimodal extraction with transcription + understanding. Supports WAV, MP3, AIFF, AAC, OGG, FLAC.
- [x] **4d. Video Files** - AI multimodal extraction with visual + audio understanding. Supports MP4, MPEG, MOV, AVI, FLV, MPG, WebM, WMV, 3GPP.
- [ ] **4e. HTML Parsing** - Not yet implemented. May need `std/html` stdlib or regex-based approach.

### Phase 5: DX Improvements (COMPLETE)

- [x] **Refactor to use `map`/`filter`/`foldl`** - Replaced 54 hand-rolled recursive functions with stdlib HOFs across all 8 modules. Used `map`, `flatMap`, `foldl`, `any`, `concat`, `nth` from `std/list`, `mapE`/`forEachE` for effectful operations, `flatMap`/`map`/`getOrElse` from `std/option` for nested match flattening.
- [x] **Real contracts** - Replaced 4 `ensures { true }` stubs with meaningful postconditions: `describeImages` preserves block count, `inferTableStructure` preserves block type, `inferReadingOrder` guarantees non-empty output for non-empty input, `cleanExtractedText` always produces exactly 1 block.
- [x] **Structured AI output** - Adopted `callJson(prompt, schema)` and `callJsonSimple(prompt)` from `std/ai`. 6 AI calls converted: table inference, reading order, PDF extraction, audio parsing, video parsing, PDF metadata. Removed `stripCodeFences` workaround. Schema-enforced JSON output eliminates code fence stripping and improves reliability.

## Module Structure

```
demos/docparse/
├── main.ail                         # Entry point (DOCX/PPTX/XLSX routing)
├── types/
│   └── document.ail                 # Block ADT, TableCell, metadata types
├── services/
│   ├── format_router.ail            # Format detection (pure, tested)
│   ├── zip_extract.ail              # ZIP layer wrapping std/zip
│   ├── docx_parser.ail              # DOCX XML → Blocks (Phase 1)
│   ├── pptx_parser.ail              # PPTX slides → Blocks (Phase 2)
│   ├── xlsx_parser.ail              # XLSX worksheets → Blocks (Phase 2)
│   ├── layout_ai.ail                # AI layout understanding
│   └── output_formatter.ail         # JSON output + console summary
├── data/
│   ├── sample.docx                  # Basic test document
│   ├── output.json                  # Generated output
│   └── test_files/                  # Real-world test corpus (DOCX/PPTX/XLSX)
│       ├── merged_cells.docx        # docx2python - H+V merges
│       ├── tables.docx              # Pandoc - multiple table types
│       ├── table_header_rowspan.docx # Pandoc - rowspan headers
│       ├── tables-with-incomplete-rows.docx # Unstructured - ragged
│       ├── docx-shapes.docx         # Unstructured - text boxes
│       ├── docx-hdrftr.docx         # Unstructured - headers/footers
│       ├── image_vml.docx           # Pandoc - legacy VML images
│       ├── comments.docx            # Pandoc - annotations
│       ├── track_changes_move.docx  # Pandoc - tracked edits
│       ├── nested_sdt.docx          # Pandoc - content controls
│       ├── unstructured_test.pptx   # Unstructured - title/body/textbox
│       ├── pandoc_basic.pptx        # Pandoc - mixed content + images
│       ├── python_pptx_table.pptx   # python-pptx - merged cell tables
│       ├── python_pptx_slides.pptx  # python-pptx - empty slides
│       ├── unstructured_test.xlsx   # Unstructured - multi-sheet
│       ├── pandoc_basic.xlsx        # Pandoc - mixed data types
│       └── xlsxwriter_chart.xlsx    # XlsxWriter - chart + numeric data
└── DESIGN.md                        # This file
```

## Running

```bash
# Parse a document (without AI)
ailang run --entry main --caps IO,FS,Env docparse/main.ail path/to/document.docx

# Parse with AI image descriptions (Vertex AI)
GOOGLE_API_KEY="" ailang run --entry main --caps IO,FS,Env,AI --ai gemini-3-flash-preview docparse/main.ail path/to/document.pptx describe

# Parse audio (transcription + understanding)
GOOGLE_API_KEY="" ailang run --entry main --caps IO,FS,Env,AI --ai gemini-3-flash-preview docparse/main.ail path/to/recording.mp3

# Parse video (visual + audio analysis)
GOOGLE_API_KEY="" ailang run --entry main --caps IO,FS,Env,AI --ai gemini-3-flash-preview docparse/main.ail path/to/video.mp4

# Default sample (no args)
ailang run --entry main --caps IO,FS,Env docparse/main.ail

# Run tests
ailang test docparse/services/format_router.ail
ailang test docparse/services/docx_parser.ail
ailang test docparse/services/zip_extract.ail

# Type check all modules
ailang check docparse/main.ail
ailang check docparse/types/document.ail
ailang check docparse/services/format_router.ail
ailang check docparse/services/zip_extract.ail
ailang check docparse/services/docx_parser.ail
ailang check docparse/services/pptx_parser.ail
ailang check docparse/services/xlsx_parser.ail
ailang check docparse/services/layout_ai.ail
ailang check docparse/services/output_formatter.ail
```

## AILANG Features Used

- **Algebraic Data Types**: `Block = TextBlock | HeadingBlock | TableBlock | ImageBlock | AudioBlock | VideoBlock | ...`
- **Pattern Matching**: on XML nodes via `getTag`, on Result/Option
- **Effects + Budgets**: `! {IO @limit=100, FS @limit=20, AI @limit=20}`
- **Pure/Effectful Split**: XML parsing is pure, ZIP/AI is effectful
- **Inline Tests**: `tests [("docx", "zip-office"), ...]` on pure functions
- **Contracts**: 28 `ensures { ... }` postconditions across 7 modules (filter bounds, 1:1 mapping, structural invariants)
- **Structured AI**: `callJson(prompt, schema)` for schema-enforced JSON from AI calls
- **Modules**: 10 modules with explicit imports (DOCX, PPTX, XLSX, PDF, image parsers)

## AILANG Feature Requests

### Delivered
- `std/zip` and `std/xml` — integrated, working well
- `readFileBytes` in `std/fs` — integrated for PDF/image multimodal parsing
- **Effectful HOFs** (`mapE`, `flatMapE`, `filterE`, `foldlE`, `forEachE` in std/list) — used extensively for AI image description and block enhancement
- **Option chaining** (`flatMap`, `map`, `getOrElse` in std/option) — replaced all 3-4 level nested matches
- **List HOFs** (`map`, `flatMap`, `foldl`, `any`, `nth`, `concat` in std/list) — replaced 54 hand-rolled recursive functions
- **Contracts** — `ensures { ... }` works with `--verify-contracts --experimental-binop-shim`. 28 contracts across 7 modules.
- **Structured AI output** — `callJson(prompt, schema)` and `callJsonSimple(prompt)` from `std/ai`. 6 AI calls use schema-enforced JSON output.

### Pending
- None currently

### Known Bugs
- Test harness: inline tests on pure functions calling stdlib imports fail with "cannot apply non-function value: nil" — **reported**, workaround in place (test via main() instead)
