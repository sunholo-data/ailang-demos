# Website Builder

Builds websites from unstructured content descriptions using AILANG + Gemini AI. Given a text description of a business or project, it generates a structured multi-page website with HTML and CSS.

## Usage

```bash
# Structure only (preview what pages will be generated)
GOOGLE_API_KEY="" ailang run --entry main --caps IO,AI,Env \
  --ai gemini-2.5-flash \
  website_builder/main.ail "My flower arranging business"

# Structure + HTML generation
GENERATE=true GOOGLE_API_KEY="" ailang run --entry main --caps IO,FS,AI,Env \
  --ai gemini-2.5-flash \
  website_builder/main.ail "My flower arranging business"

# Custom style direction
STYLE="Bold and vibrant" GENERATE=true GOOGLE_API_KEY="" ailang run --entry main \
  --caps IO,FS,AI,Env --ai gemini-2.5-flash \
  website_builder/main.ail "My tech startup"
```

## Budget

```
IO @limit=200  — Console output
FS @limit=50   — Write generated HTML/CSS files
AI @limit=50   — Gemini calls for content structuring + HTML generation
Env            — Read environment variables (GENERATE, STYLE)
```

## Architecture

```
website_builder/
├── main.ail                         # Entry point, CLI pipeline
├── types/content.ail                # ADTs: UploadedItem, TextContent, ImageContent, etc.
├── services/
│   ├── content_extractor.ail        # Wraps raw content into typed items
│   ├── site_structurer.ail          # AI: generates site structure (pages, nav)
│   ├── validator.ail                # Validates structure, HTML, JavaScript
│   └── html_generator.ail           # AI: generates HTML per page + site CSS
├── styles/directions.json           # 6 style directions (warm, clean, bold, elegant, fun, auto)
├── output/                          # Generated HTML + CSS files
├── data/test_content/               # Sample input content
├── portal/                          # Vue.js preview portal
└── scripts/                         # Build/serve scripts
```

## Pipeline

1. **Content extraction** — wraps description into typed `UploadedItem` ADT
2. **Site structuring** — AI generates page list, navigation, design brief
3. **Validation** — checks structure has home page, valid pages, design brief
4. **HTML generation** — AI generates HTML per page + shared CSS
5. **Output** — writes `output/<slug>.html` and `style.css`

## Style Directions

Set `STYLE` env var or use one of the presets in `styles/directions.json`: warm, clean, bold, elegant, fun, auto.
