# Website Builder Demo

Turns unstructured content (photos, docs, text) into structured website plans using AILANG AI, validated by contracts. See [DESIGN.md](DESIGN.md) for the full architecture.

## Quick Commands

```bash
# Type-check all modules
ailang check website_builder/

# Run end-to-end (needs ADC — ensure GOOGLE_API_KEY is unset)
GOOGLE_API_KEY="" ailang run --entry main --caps IO,AI,Env --ai gemini-2.5-flash \
  website_builder/main.ail "My flower arranging business"

# With contract verification
GOOGLE_API_KEY="" ailang run --entry main --caps IO,AI,Env --ai gemini-2.5-flash \
  --verify-contracts website_builder/main.ail "My flower arranging business"

# Custom style direction
STYLE="Bold and vibrant" GOOGLE_API_KEY="" ailang run --entry main \
  --caps IO,AI,Env --ai gemini-2.5-flash website_builder/main.ail "My tech startup"

# Elegant style
STYLE="Elegant and refined" GOOGLE_API_KEY="" ailang run --entry main \
  --caps IO,AI,Env --ai gemini-2.5-flash website_builder/main.ail "My photography portfolio"
```

## Module Structure

```
website_builder/
├── main.ail                              # CLI entry point (Phases 1-2)
├── types/
│   └── content.ail                       # ADT types: UploadedItem, SectionType
├── services/
│   ├── content_extractor.ail             # Wraps content into JSON for AI
│   ├── site_structurer.ail               # AI structures content into pages + design brief
│   ├── html_generator.ail                # AI HTML/CSS generation per page
│   ├── validator.ail                     # Contract-verified validation (7 validators)
│   └── website_builder_browser.ail       # WASM adapter (thin re-exports for JS)
├── styles/
│   └── directions.json                   # 6 style directions
├── output/                               # Generated HTML/CSS (CLI output)
├── portal/                               # Vue 3 + Vite browser portal (Phase 3)
│   ├── src/
│   │   ├── ailang.js                     # WASM module loader + Gemini AI handler
│   │   ├── firebase.js                   # Firebase Auth (Google sign-in)
│   │   ├── App.vue                       # Root: auth gate + 6-step wizard
│   │   └── components/
│   │       ├── AuthGate.vue              # Google sign-in
│   │       └── steps/                   # Wizard steps
│   │           ├── DescribeStep.vue      # Step 1: describe website
│   │           ├── UploadStep.vue        # Step 2: photos + text
│   │           ├── StyleStep.vue         # Step 3: vibe picker
│   │           ├── BuildStep.vue         # Step 4: AILANG WASM generation
│   │           ├── PreviewStep.vue       # Step 5: iframe + feedback chat
│   │           └── PublishStep.vue       # Step 6: GitHub Pages (Phase 4)
│   └── public/
│       ├── wasm/ -> invoice_processor_wasm/wasm/  # symlink to AILANG WASM
│       └── ailang/website_builder/               # symlinks to .ail source files
├── DESIGN.md                             # Full architecture document
└── CLAUDE.md                             # This file
```

## Phase 3: Portal (Current)

```bash
# Install dependencies
cd website_builder/portal && npm install

# Dev server (port 5174)
cd website_builder/portal && npm run dev
# Open http://localhost:5174

# Build for production
cd website_builder/portal && npm run build
# Note: WASM files NOT copied to dist/ (too large). For deploy, copy public/ alongside dist/.
```

Portal needs a Gemini API key — enter it in Settings (⚙️) after opening.
Firebase config is a placeholder — fill in `src/firebase.js` with the ailang-dev project config.

## Phase 1: Content Pipeline (Complete)

CLI-testable pipeline: test content → AI page suggestions → AI site structuring → contract validation.

- **5 AILANG modules**, all type-check
- **7 contract-verified validators** (site structure, pages, design brief, home page, HTML, JS safety)
- **3 AI functions** (structureSite, suggestPages, refineSite)
- Uses `callJsonSimple` (not `callJson`) to avoid large response corruption bug

## Auth

Uses ADC (Application Default Credentials) for Vertex AI. If `GOOGLE_API_KEY` is set in your environment, AILANG uses it as a direct Gemini API key instead of ADC.

```bash
# Force ADC
GOOGLE_API_KEY="" ailang run ...

# Or use API key directly
GOOGLE_API_KEY=your-key ailang run ...
```

## Known AILANG Issues Hit During Development

1. **Multi-statement lambdas in flatMap**: `flatMap(\x. let a = ...; let b = ...; expr, xs)` fails to parse when using block `{ }` syntax inside the lambda. Workaround: extract complex lambda bodies into named helper functions.
2. **Transitive imports required**: `main.ail` must import all stdlib modules that sub-modules use (std/json, std/ai, etc.)
3. **`not` in ensures clauses**: Use `x == false` instead of `not x` in contract predicates.
4. **Test harness bug**: Don't use inline `tests` on functions that call stdlib HOFs.
