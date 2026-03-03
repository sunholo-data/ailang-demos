# Website Builder — Design Document

**"Turn your photos, documents, and ideas into a beautiful website."**

A mobile-friendly portal where non-technical users upload unstructured content (photos, Word docs, text notes) and AI turns it into a published website — powered by AILANG doc parsing, AI content structuring, and contract-verified generation, deployed to GitHub Pages.

Primary user: Mark's mum. Target audience: anyone who has content but no web skills.

---

## 1. User Journey (Mobile-First)

```
┌─────────────────────────────────────────────────────┐
│  1. SIGN IN                                         │
│     Open portal on phone → Sign in with Google      │
│     (Firebase Auth, one tap)                        │
├─────────────────────────────────────────────────────┤
│  2. UPLOAD CONTENT                                  │
│     - Take photos directly from camera              │
│     - Upload Word docs, PDFs, spreadsheets          │
│     - Type or paste text descriptions               │
│     - "Add more" button — no limit on uploads       │
├─────────────────────────────────────────────────────┤
│  3. DESCRIBE YOUR WEBSITE                           │
│     "What is this website for?"                     │
│     → "My flower arranging business"                │
│     "What pages do you want?"                       │
│     → AI suggests: Home, About, Gallery, Contact    │
│     → User taps to confirm or adjust                │
├─────────────────────────────────────────────────────┤
│  4. CHOOSE A STYLE DIRECTION                        │
│     Swipe through mood/vibe starting points          │
│     "Warm & friendly" / "Clean & modern" / etc.     │
│     These are STARTING POINTS, not rigid templates  │
│     → "I like the warm one but more purple"         │
│     → AI adjusts colours, fonts, layout freely      │
├─────────────────────────────────────────────────────┤
│  5. PREVIEW                                         │
│     Full preview of generated website               │
│     Rendered in-portal (iframe)                     │
│     "Looks great!" or "Change the colours"          │
│     Chat-style feedback → AI regenerates            │
├─────────────────────────────────────────────────────┤
│  6. PUBLISH                                         │
│     One button: "Publish My Website"                │
│     → Pushes to GitHub Pages                        │
│     → Shows live URL: yourname.github.io            │
│     → Can update anytime by repeating 2-5           │
└─────────────────────────────────────────────────────┘
```

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER (Mobile/Desktop)                 │
│                                                             │
│  ┌──────────┐  ┌───────────────┐  ┌──────────────────────┐ │
│  │ Firebase  │  │ AILANG WASM   │  │ Portal UI            │ │
│  │ Auth      │  │               │  │ (Vue 3 or React)     │ │
│  │           │  │ DocParse      │  │                      │ │
│  │ Google    │  │ Content AI    │  │ Upload, Template,    │ │
│  │ Sign-in   │  │ HTML Gen      │  │ Preview, Chat        │ │
│  │           │  │ Contracts     │  │                      │ │
│  └──────────┘  └───────────────┘  └──────────────────────┘ │
│        │              │                     │               │
│        │         AILANG effects             │               │
│        │         (AI, FS, IO)               │               │
│        ▼              ▼                     ▼               │
│  ┌──────────┐  ┌───────────────┐  ┌──────────────────────┐ │
│  │ Firestore │  │ Gemini API    │  │ GitHub API           │ │
│  │ (state)   │  │ (content AI)  │  │ (deploy)             │ │
│  └──────────┘  └───────────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

Local dev: runs entirely in browser, API keys in localStorage
Cloud future: AILANG coordinator handles AI + deploy server-side
```

### What runs where

| Component | Runs in | Technology |
|-----------|---------|------------|
| Auth | Browser | Firebase Auth (Google provider) |
| Doc parsing | Browser (WASM) | AILANG DocParse modules (reused) |
| Content structuring | Browser → Gemini API | AILANG `std/ai` via WASM effect handler |
| HTML generation | Browser (WASM) | AILANG AI + design brief → HTML/CSS |
| Contract verification | Browser (WASM) | AILANG `ensures`/`requires` |
| State persistence | Browser → Firestore | Firebase SDK |
| Preview | Browser | iframe rendering generated HTML |
| Deployment | Browser → GitHub API | REST API with user's token |
| Coordination messages | Local CLI (for now) | `ailang messages send` |

---

## 3. AILANG Modules

All website builder logic runs as AILANG — parsed, type-checked, contract-verified.

```
website_builder/
├── DESIGN.md                    ← this document
├── CLAUDE.md                    ← dev instructions
├── types/
│   └── content.ail              # Content block types (ADT)
├── services/
│   ├── content_extractor.ail    # Orchestrates DocParse for uploads
│   ├── site_structurer.ail      # AI structures content into pages/sections
│   ├── html_generator.ail       # AI generates HTML from content + design brief
│   ├── validator.ail            # Contracts for content quality + accessibility
│   └── website_builder_browser.ail  # WASM browser adapter (thin)
├── styles/                      # Style direction seed descriptions
│   └── directions.json          # Starting vibes (not rigid templates)
├── portal/                      # Browser app (see section 6)
│   ├── index.html
│   ├── package.json
│   └── src/
└── data/
    └── test_content/            # Test uploads for development
```

### 3.1 Content Types (`types/content.ail`)

```ailang
module website_builder/types/content

-- What the user uploads
export type UploadedItem
  = TextContent({text: string, label: string})
  | ImageContent({base64: string, mimeType: string, filename: string, description: string})
  | DocumentContent({blocks: List[string], filename: string, format: string})

-- What AI produces from uploads
export type SiteContent = {
  title: string,
  description: string,
  pages: List[PageContent]
}

export type PageContent = {
  slug: string,
  title: string,
  sections: List[SectionContent]
}

export type SectionContent
  = HeroSection({heading: string, subheading: string, imageRef: string})
  | TextSection({heading: string, body: string})
  | GallerySection({heading: string, images: List[GalleryImage]})
  | ContactSection({heading: string, details: ContactDetails})
  | ListSection({heading: string, items: List[string]})
  | TestimonialSection({heading: string, quotes: List[{text: string, author: string}]})

export type GalleryImage = {
  ref: string,
  alt: string,
  caption: string
}

export type ContactDetails = {
  phone: string,
  email: string,
  address: string,
  hours: string
}

-- AI-generated design direction (not a rigid template)
export type DesignBrief = {
  mood: string,
  palette: Palette,
  typography: Typography,
  layout: LayoutStyle,
  personality: string
}

export type Palette = {
  primary: string,
  secondary: string,
  accent: string,
  background: string,
  text: string
}

export type Typography = {
  headingFont: string,
  bodyFont: string
}

export type LayoutStyle = {
  style: string,
  headerStyle: string,
  imageStyle: string
}
```

### 3.2 Content Extractor (`services/content_extractor.ail`)

Reuses DocParse modules already proven in the browser WASM demo.

```ailang
module website_builder/services/content_extractor

import website_builder/types/content (UploadedItem, TextContent, ImageContent, DocumentContent)

-- Called from JS for each uploaded file
-- For documents: JS already did JSZip extraction + AILANG DocParse
-- This function takes the parsed blocks JSON and wraps them
export func wrapDocumentContent(blocksJson: string, filename: string, format: string) -> string {
  -- Return JSON-encoded UploadedItem
  encode(jo([
    kv("type", js("document")),
    kv("blocks", js(blocksJson)),
    kv("filename", js(filename)),
    kv("format", js(format))
  ]))
}

-- For images: receives base64 + AI description from DocParse
export func wrapImageContent(base64: string, mimeType: string, filename: string, description: string) -> string {
  encode(jo([
    kv("type", js("image")),
    kv("base64", js(base64)),
    kv("mimeType", js(mimeType)),
    kv("filename", js(filename)),
    kv("description", js(description))
  ]))
}

-- For text: user-typed content
export func wrapTextContent(text: string, label: string) -> string {
  encode(jo([
    kv("type", js("text")),
    kv("text", js(text)),
    kv("label", js(label))
  ]))
}
```

### 3.3 Site Structurer (`services/site_structurer.ail`)

The core AI module. Takes all uploaded content and produces a structured site plan + design brief.

```ailang
module website_builder/services/site_structurer

import std/ai (callJsonSimple)
import std/json (encode, decode, jo, js, ja, kv)

-- Takes: all uploaded content as JSON array, user's description, style direction
-- Returns: structured SiteContent + design brief as JSON
export func structureSite(contentJson: string, description: string, styleDirection: string) -> string ! {AI} {
  let prompt = "You are a talented website designer helping a non-technical person create their website.\n\n" ++
    "The user wants: " ++ description ++ "\n\n" ++
    "Style direction (a starting point — you have creative freedom): " ++ styleDirection ++ "\n\n" ++
    "They have uploaded the following content:\n" ++ contentJson ++ "\n\n" ++
    "Do two things:\n" ++
    "1. Create a website structure with pages and sections using the uploaded content\n" ++
    "2. Design a complete visual identity (colours, fonts, layout style) that suits the content and style direction\n\n" ++
    "Return compact JSON (no whitespace) with this structure:\n" ++
    "{\"title\":\"...\",\"description\":\"...\",\"designBrief\":{\"mood\":\"...\"," ++
    "\"palette\":{\"primary\":\"#...\",\"secondary\":\"#...\",\"accent\":\"#...\",\"background\":\"#...\",\"text\":\"#...\"}," ++
    "\"typography\":{\"headingFont\":\"...\",\"bodyFont\":\"...\"}," ++
    "\"layout\":{\"style\":\"...\",\"headerStyle\":\"...\",\"imageStyle\":\"...\"}}," ++
    "\"pages\":[{\"slug\":\"home\",\"title\":\"Home\"," ++
    "\"sections\":[{\"type\":\"hero\",\"heading\":\"...\",\"subheading\":\"...\",\"imageRef\":\"...\"},...]},...]}";
  callJsonSimple(prompt)
}

-- Refine structure AND/OR design based on user feedback
-- The AI decides whether the feedback is about content, design, or both
export func refineSite(currentStructure: string, feedback: string) -> string ! {AI} {
  let prompt = "You are refining a website based on user feedback.\n\n" ++
    "Current website (structure + design brief):\n" ++ currentStructure ++ "\n\n" ++
    "User says: \"" ++ feedback ++ "\"\n\n" ++
    "The user is not technical — interpret their feedback generously.\n" ++
    "They might be asking about content, design, layout, or all three.\n" ++
    "Examples: 'more purple' = change palette, 'bigger photos' = change layout, " ++
    "'add my phone number' = change content.\n\n" ++
    "Apply the requested changes and return the COMPLETE updated structure " ++
    "(including designBrief) as compact JSON. Keep everything they didn't mention.";
  callJsonSimple(prompt)
}

-- Suggest pages based on description alone
export func suggestPages(description: string) -> string ! {AI} {
  let prompt = "A user wants a website for: " ++ description ++ "\n\n" ++
    "Suggest 3-5 pages that would work well. " ++
    "Return compact JSON: [{\"slug\":\"home\",\"title\":\"Home\",\"purpose\":\"...\"},...]";
  callJsonSimple(prompt)
}

-- Generate a design brief from style direction + content analysis
export func generateDesignBrief(styleDirection: string, contentSummary: string) -> string ! {AI} {
  let prompt = "You are a web designer creating a visual identity.\n\n" ++
    "Style direction: " ++ styleDirection ++ "\n" ++
    "Content summary: " ++ contentSummary ++ "\n\n" ++
    "Generate a complete design brief with:\n" ++
    "- Mood description\n" ++
    "- Colour palette (primary, secondary, accent, background, text) with hex codes\n" ++
    "- Typography (heading font + body font from Google Fonts)\n" ++
    "- Layout style (header approach, section spacing, image treatment)\n" ++
    "- Personality sentence (how the website should 'feel')\n\n" ++
    "For each choice, include a brief rationale explaining WHY (so the user can steer).\n" ++
    "Return compact JSON.";
  callJsonSimple(prompt)
}
```

### 3.4 HTML Generator (`services/html_generator.ail`)

Turns structured content + AI-generated design brief into actual HTML/CSS. The design brief gives the AI creative direction, not rigid constraints.

```ailang
module website_builder/services/html_generator

import std/ai (callJsonSimple)
import std/json (encode, decode, jo, js, kv)

-- Generate complete HTML for a page
-- siteJson: the full SiteContent JSON (includes designBrief)
-- pageSlug: which page to render
-- Returns: complete HTML string
export func generatePageHtml(siteJson: string, pageSlug: string) -> string ! {AI} {
  let prompt = "Generate a complete, mobile-responsive HTML page.\n\n" ++
    "Site structure and design brief:\n" ++ siteJson ++ "\n\n" ++
    "Render the page with slug: " ++ pageSlug ++ "\n\n" ++
    "Use the designBrief for colours, fonts, and layout direction — but apply your own " ++
    "design judgement to create something beautiful. The brief is guidance, not a rigid spec.\n\n" ++
    "Requirements:\n" ++
    "- Single HTML file with inline <style> (no external CSS files)\n" ++
    "- Link Google Fonts in <head>\n" ++
    "- Mobile-first responsive design (looks great on a phone)\n" ++
    "- Navigation bar linking all pages (hamburger menu on mobile)\n" ++
    "- Image placeholders use data-ref='filename.jpg' (JS injects real images)\n" ++
    "- Clean, semantic HTML5\n" ++
    "- Accessible (alt text, aria labels, good contrast)\n" ++
    "- No JavaScript (static HTML/CSS only)\n" ++
    "- Return ONLY the raw HTML, no markdown code fences";
  callJsonSimple(prompt)
}

-- Generate shared CSS for the entire site
-- siteJson includes the designBrief
export func generateSiteCss(siteJson: string) -> string ! {AI} {
  let prompt = "Generate mobile-first CSS for a multi-page website.\n\n" ++
    "Site structure and design brief:\n" ++ siteJson ++ "\n\n" ++
    "Use the designBrief for the visual identity but apply your design expertise.\n\n" ++
    "Requirements:\n" ++
    "- Mobile-first (base styles for phones, media queries for tablet/desktop)\n" ++
    "- Responsive navigation (hamburger on mobile, horizontal on desktop)\n" ++
    "- Hero sections with full-width images\n" ++
    "- Gallery grid (1 col mobile, 2 tablet, 3 desktop)\n" ++
    "- Contact section with clear layout\n" ++
    "- Smooth transitions and subtle hover states\n" ++
    "- Print-friendly basics\n" ++
    "- Return ONLY the raw CSS, no markdown code fences";
  callJsonSimple(prompt)
}
```

### 3.5 Validator (`services/validator.ail`)

Contract-verified content quality checks.

```ailang
module website_builder/services/validator

import std/string (length, find)
import std/list (length as listLength, filter, map, any)
import std/json (decode, get, getArray, getString, asArray, asString, asObject)

-- Verify site structure has required elements
export func validateSiteStructure(siteJson: string) -> {valid: bool, errors: List[string]}
  ensures {
    result.valid == (listLength(result.errors) == 0)
  }
{
  let parsed = decode(siteJson);
  match parsed {
    Ok(json) => {
      let errors: List[string] = [];
      -- Must have a title
      let titleCheck = match getString(json, "title") {
        Some(t) => if length(t) > 0 then [] else ["Site must have a title"],
        None => ["Site must have a title"]
      };
      -- Must have at least one page
      let pagesCheck = match getArray(json, "pages") {
        Some(pages) => if listLength(pages) > 0 then [] else ["Site must have at least one page"],
        None => ["Site must have at least one page"]
      };
      let allErrors = concat(titleCheck, pagesCheck);
      {valid: listLength(allErrors) == 0, errors: allErrors}
    },
    Err(e) => {valid: false, errors: ["Invalid JSON: " ++ e]}
  }
}

-- Verify no broken image references
export func validateImageRefs(siteJson: string, availableRefs: List[string]) -> {valid: bool, missing: List[string]}
  ensures {
    result.valid == (listLength(result.missing) == 0)
  }
{
  -- Extract all imageRef values from the site JSON
  -- Compare against available uploaded images
  -- Return list of missing references
  let missing: List[string] = []; -- TODO: implement ref extraction
  {valid: listLength(missing) == 0, missing: missing}
}

-- Verify HTML is well-formed (basic checks)
export pure func validateHtml(html: string) -> {valid: bool, errors: List[string]}
  ensures {
    result.valid == (listLength(result.errors) == 0)
  }
{
  let errors: List[string] = [];
  let hasDoctype = find(html, "<!DOCTYPE html>") >= 0 || find(html, "<!doctype html>") >= 0;
  let hasHead = find(html, "<head") >= 0;
  let hasBody = find(html, "<body") >= 0;
  let hasClosingHtml = find(html, "</html>") >= 0;
  let checks = [
    if hasDoctype then [] else ["Missing <!DOCTYPE html>"],
    if hasHead then [] else ["Missing <head>"],
    if hasBody then [] else ["Missing <body>"],
    if hasClosingHtml then [] else ["Missing </html>"]
  ];
  let allErrors = foldl(\acc errs. concat(acc, errs), [], checks);
  {valid: listLength(allErrors) == 0, errors: allErrors}
}

-- Verify accessibility basics
export pure func validateAccessibility(html: string) -> {score: int, issues: List[string]}
  ensures {
    result.score >= 0 && result.score <= 100
  }
{
  let issues: List[string] = [];
  let hasViewport = find(html, "viewport") >= 0;
  let hasLang = find(html, "lang=") >= 0;
  let score = 100;
  let deductions = [
    if hasViewport then 0 else 20,
    if hasLang then 0 else 10
  ];
  let totalDeductions = foldl(\acc d. acc + d, 0, deductions);
  let allIssues = concat(
    if hasViewport then [] else ["Missing viewport meta tag"],
    if hasLang then [] else ["Missing lang attribute on <html>"]
  );
  {score: score - totalDeductions, issues: allIssues}
}
```

### 3.6 Browser Adapter (`services/website_builder_browser.ail`)

Thin WASM entry point — same pattern as DocParse browser adapter.

```ailang
module website_builder/services/website_builder_browser

import website_builder/services/content_extractor (wrapDocumentContent, wrapImageContent, wrapTextContent)
import website_builder/services/site_structurer (structureSite, refineSite, suggestPages, generateDesignBrief)
import website_builder/services/html_generator (generatePageHtml, generateSiteCss)
import website_builder/services/validator (validateSiteStructure, validateHtml, validateAccessibility)

-- Re-export all functions for JS to call via engine.callFunction()
-- Each takes/returns strings (JSON serialized)

export func parseAndWrapDocument(blocksJson: string, filename: string, format: string) -> string {
  wrapDocumentContent(blocksJson, filename, format)
}

export func parseAndWrapImage(base64: string, mimeType: string, filename: string, description: string) -> string {
  wrapImageContent(base64, mimeType, filename, description)
}

export func parseAndWrapText(text: string, label: string) -> string {
  wrapTextContent(text, label)
}

export func buildSiteStructure(contentJson: string, description: string, styleDirection: string) -> string ! {AI} {
  structureSite(contentJson, description, styleDirection)
}

export func refineStructure(currentStructure: string, feedback: string) -> string ! {AI} {
  refineSite(currentStructure, feedback)
}

export func getPageSuggestions(description: string) -> string ! {AI} {
  suggestPages(description)
}

export func renderPage(siteJson: string, pageSlug: string) -> string ! {AI} {
  generatePageHtml(siteJson, pageSlug)
}

export func renderCss(siteJson: string) -> string ! {AI} {
  generateSiteCss(siteJson)
}

export func createDesignBrief(styleDirection: string, contentSummary: string) -> string ! {AI} {
  generateDesignBrief(styleDirection, contentSummary)
}

export func validate(siteJson: string) -> string {
  let result = validateSiteStructure(siteJson);
  encode(jo([
    kv("valid", jb(result.valid)),
    kv("errors", ja(map(\e. js(e), result.errors)))
  ]))
}

export func validatePage(html: string) -> string {
  let structResult = validateHtml(html);
  let a11yResult = validateAccessibility(html);
  encode(jo([
    kv("structure", jo([
      kv("valid", jb(structResult.valid)),
      kv("errors", ja(map(\e. js(e), structResult.errors)))
    ])),
    kv("accessibility", jo([
      kv("score", jnum(intToFloat(a11yResult.score))),
      kv("issues", ja(map(\e. js(e), a11yResult.issues)))
    ]))
  ]))
}
```

---

## 4. Design System (AI-Generated, User-Directed)

**There are no rigid templates.** The AI generates the entire design — layout, colours, fonts, spacing, everything — based on the user's content and preferences. "Style directions" are soft starting points that the user can steer freely through conversation.

### 4.1 How It Works

```
User picks a vibe ("Warm & friendly")
  → AI generates a full design brief (palette, fonts, layout, spacing)
  → User sees preview
  → "I want more purple" / "Make it less busy" / "Bigger photos"
  → AI regenerates design from scratch (not patching a template)
  → Repeat until happy
```

The AI has full creative freedom within the user's direction. It can:
- Choose any colour palette (not locked to predefined colours)
- Mix fonts creatively
- Decide layout (grid, single-column, asymmetric, etc.)
- Choose header styles (hero image, text-only, video background, etc.)
- Design responsive breakpoints appropriate for the content

### 4.2 Style Directions (Starting Points)

These are conversation starters, not constraints. Each is a short description the AI uses as initial inspiration:

| Direction | Description | Starting Feel |
|-----------|-------------|---------------|
| **Warm & Friendly** | "Soft earth tones, rounded corners, welcoming" | Cosy, approachable |
| **Clean & Modern** | "Lots of white space, sharp lines, minimal" | Professional, crisp |
| **Bold & Vibrant** | "Strong colours, large typography, energetic" | Eye-catching, lively |
| **Elegant & Refined** | "Muted palette, serif fonts, sophisticated" | Premium, tasteful |
| **Fun & Playful** | "Bright colours, friendly shapes, casual" | Cheerful, informal |
| **Let AI Decide** | "Look at my content and suggest a style" | AI analyses uploads and picks |

The "Let AI Decide" option analyses the uploaded content (business type, image colours, tone of text) and proposes a design direction — which the user can then steer.

### 4.3 Design Brief (AI-Generated)

Instead of a static template JSON, the AI generates a **design brief** that drives HTML/CSS generation:

```json
{
  "designBrief": {
    "mood": "warm and welcoming with a touch of elegance",
    "palette": {
      "primary": "#7B4B94",
      "secondary": "#F0E6F6",
      "accent": "#D4956B",
      "background": "#FFFBF5",
      "text": "#2D2D2D",
      "rationale": "Purple evokes creativity (user asked for more purple), warm accent complements the flower photos"
    },
    "typography": {
      "headingFont": "Playfair Display",
      "bodyFont": "Source Sans Pro",
      "headingWeight": "700",
      "bodySize": "18px",
      "rationale": "Serif headings feel elegant, sans-serif body stays readable on mobile"
    },
    "layout": {
      "style": "flowing single-column on mobile, two-column on desktop",
      "headerStyle": "full-width hero image with overlay text",
      "sectionSpacing": "generous",
      "imageStyle": "rounded corners, subtle shadows",
      "rationale": "Full-width images showcase the flower arrangements, generous spacing feels unhurried"
    },
    "personality": "A website that feels like walking into a lovely flower shop — warm, inviting, with beautiful things to look at"
  }
}
```

The design brief includes **rationale** so the user can understand *why* the AI made each choice, and steer more precisely ("I like the fonts but want a different header style").

### 4.4 Design Conversation

The feedback chat isn't just for content changes — it's the primary design tool:

```
Mum: "I like it but it's too dark"
AI: Lightens the palette, regenerates
    "I've brightened the background and softened the text colour.
     The purple is now a lighter lavender. How's this?"

Mum: "Can the photos be bigger?"
AI: Increases image sizes, adjusts layout
    "I've made the gallery images larger and switched to a
     single-column layout so each arrangement gets more space."

Mum: "My friend's website has a nice scrolling thing"
AI: Adds parallax scrolling or smooth scroll effects
    "I've added a gentle parallax effect on the hero image
     and smooth scrolling between sections. Take a look!"
```

The AI is instructed to:
- Explain every change it makes in plain English
- Offer 2-3 options when the request is ambiguous
- Never use technical jargon
- Show before/after when making significant design changes

---

## 5. Deployment Pipeline

### 5.1 Preview (In-Portal)

The generated HTML is rendered directly in the portal via an iframe. No GitHub deployment needed for preview — instant feedback loop.

```
User uploads content
  → AILANG WASM parses documents
  → AI structures content into pages
  → AI generates HTML per page
  → AILANG contracts validate HTML
  → Rendered in sandboxed iframe
  → User sees their website immediately
```

The preview iframe uses `srcdoc` to render the generated HTML safely. Images are injected as base64 data URIs for preview (no server needed).

### 5.2 Publish (GitHub Pages)

When the user hits "Publish", the portal:

1. **Authenticates with GitHub** (OAuth via Firebase, or personal access token for MVP)
2. **Creates/updates a repo** (e.g., `username/my-website`)
3. **Pushes generated files** (all committed to GitHub, including images):
   ```
   index.html          ← Home page
   about/index.html    ← About page
   gallery/index.html  ← Gallery page
   contact/index.html  ← Contact page
   css/style.css       ← Generated CSS
   js/site.js          ← Generated JS (contract-verified safe)
   images/             ← Uploaded images (resized, committed to repo)
   CNAME               ← Custom domain (if configured)
   ```
   Images are committed directly to the GitHub repo (same pattern as sunholo.com).
   GitHub Pages serves them via CDN — no external image hosting needed.
4. **Enables GitHub Pages** on the repo (via API)
5. **Shows the live URL** to the user

### 5.3 Updates

To update the site, the user returns to the portal, makes changes, previews, and publishes again. The portal overwrites the repo contents (the user doesn't need to know about git).

### 5.4 AI Generation Tiers

The quality of generated websites scales with the AI generation strategy. The architecture supports upgrading tiers without changing the AILANG contract/validation layer — the same `validateAll`, `validateHtml`, `validateJavaScript` functions gate every tier.

#### Tier 1: Single-Call AI (Current — Phases 1-4)

```
Portal → AILANG std/ai callJsonSimple → structured JSON → callJsonSimple → HTML
```

- One API call per page to generate HTML
- Good enough for simple sites (5-10 pages, basic layouts)
- Fast iteration (seconds per preview)
- Runs entirely in browser (WASM) or CLI
- Limited by single-call context window and output quality

#### Tier 2: Multi-Call AI with Feedback (Phase 5)

```
Portal → AILANG coordinator → multiple AI calls → HTML
  ↑                                                  ↓
  └──── contract validation feedback loop ───────────┘
```

- Coordinator makes multiple AI calls: one for structure, one for CSS, one per page
- Contract validators check each output; failures trigger re-generation with error context
- AI sees validation errors and self-corrects ("Missing viewport meta tag" → regenerates with viewport)
- Still single-shot calls but orchestrated with AILANG's effect system
- Significantly better output quality through iterative refinement

#### Tier 3: Agentic Coder (Phase 6+)

```
Portal → ailang messages send → AILANG Coordinator
                                       ↓
                              Launch agentic coder
                              (Claude Code / custom agent)
                                       ↓
                              Creates project structure
                              Writes HTML/CSS/JS iteratively
                              Runs Lighthouse / contract checks
                              Fixes issues autonomously
                              Commits to GitHub
                                       ↓
                              ailang messages send → Portal
                              "Your website is ready"
```

- The coordinator launches a full coding agent (e.g., Claude Code instance, or AILANG's own agent system)
- The agent treats website building as a software engineering task: creates files, tests them, iterates
- Can produce production-quality websites with proper responsive design, animations, accessibility
- Uses the same AILANG contracts as gatekeeping — agent must pass `validateAll` before publishing
- Communication via `ailang messages` (local now, cloud later)
- This is where the real magic happens — the agent can do things a single API call never could:
  - Optimise images and generate responsive `srcset`
  - Write proper hamburger menu JS with keyboard nav
  - Run contrast ratio checks and fix accessibility issues
  - Generate `sit

---

## 6. Portal UI

### 6.1 Framework: Vue 3 + Vite

**Decision: Vue 3** with Vite for dev/build tooling.

- ~33KB bundle (lighter on mobile)
- Composition API (`ref`, `computed`, `watch`) close to vanilla JS patterns in existing demos
- Single-file components (`.vue`) keep template + logic + style together
- Built-in reactivity — no external state library needed for this scale
- Vite gives instant HMR in dev, optimised production builds

### 6.2 Screen Flow (Mobile)

```
┌─────────────────┐
│ ☰  Website      │
│     Builder      │
│                  │
│  ┌────────────┐  │
│  │  Sign In   │  │
│  │  with      │  │
│  │  Google    │  │
│  └────────────┘  │
│                  │
│  One tap to     │
│  get started    │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ ☰  My Website   │
│                  │
│  What's your    │
│  website about? │
│  ┌────────────┐  │
│  │ My flower  │  │
│  │ arranging  │  │
│  │ business   │  │
│  └────────────┘  │
│                  │
│  Suggested pages:│
│  ☑ Home          │
│  ☑ About Me      │
│  ☑ Gallery       │
│  ☑ Contact       │
│  ☐ Prices        │
│                  │
│  [ Continue → ]  │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ ☰  Add Content  │
│                  │
│  ┌────────────┐  │
│  │ 📷 Camera  │  │
│  └────────────┘  │
│  ┌────────────┐  │
│  │ 📄 Files   │  │
│  └────────────┘  │
│  ┌────────────┐  │
│  │ ✏️  Type   │  │
│  └────────────┘  │
│                  │
│  Added:          │
│  • photo1.jpg ✓  │
│  • menu.docx ✓   │
│  • "We do wed.." │
│                  │
│  [ Continue → ]  │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ ☰  Pick a Vibe  │
│                  │
│  How should your │
│  website feel?   │
│                  │
│  ○ Warm &        │
│    Friendly      │
│  ○ Clean &       │
│    Modern        │
│  ○ Bold &        │
│    Vibrant       │
│  ○ Elegant &     │
│    Refined       │
│  ○ Fun &         │
│    Playful       │
│  ○ You Decide!   │
│    (AI picks)    │
│                  │
│  Anything else?  │
│  ┌────────────┐  │
│  │ More purple │  │
│  │ please     │  │
│  └────────────┘  │
│                  │
│  [ Build It → ]  │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ ☰  Preview      │
│                  │
│  ┌─────────────┐ │
│  │  [Website   │ │
│  │   preview   │ │
│  │   in        │ │
│  │   iframe]   │ │
│  │             │ │
│  └─────────────┘ │
│                  │
│  💬 "Make the   │
│  header bigger"  │
│  [Send]          │
│                  │
│  Home|About|Gall │
│                  │
│  [ Publish → ]   │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ ☰  Published!   │
│                  │
│  Your website    │
│  is live at:     │
│                  │
│  🔗 yoursite.   │
│     github.io   │
│                  │
│  [ Share ]       │
│  [ Edit Site ]   │
│                  │
└─────────────────┘
```

### 6.3 Key UI Components

| Component | Purpose | Mobile Consideration |
|-----------|---------|---------------------|
| **AuthGate** | Firebase sign-in | Google one-tap, full-screen on mobile |
| **DescriptionStep** | Capture website purpose | Large text input, voice input option |
| **ContentUploader** | File + photo upload | Camera access, drag-drop on desktop |
| **StylePicker** | Vibe selection + custom notes | Radio buttons + text input for custom direction |
| **SitePreview** | iframe preview | Full-width, tab bar for pages |
| **FeedbackChat** | Refinement chat | Bottom-sheet chat input |
| **PublishButton** | Deploy to GitHub Pages | Single prominent button |
| **StatusBar** | WASM loading, progress | Slim progress indicator |

### 6.4 WASM Integration

Same pattern as DocParse browser demo:

```javascript
// Module loading order
const WEBSITE_BUILDER_MODULES = [
  // First: DocParse modules (reused for document parsing)
  ...DOCPARSE_MODULES,
  // Then: Website builder modules
  { name: 'website_builder/types/content', path: 'ailang/website_builder/types/content.ail' },
  { name: 'website_builder/services/content_extractor', path: 'ailang/website_builder/services/content_extractor.ail' },
  { name: 'website_builder/services/site_structurer', path: 'ailang/website_builder/services/site_structurer.ail' },
  { name: 'website_builder/services/html_generator', path: 'ailang/website_builder/services/html_generator.ail' },
  // No template_engine — AI generates designs freely
  { name: 'website_builder/services/validator', path: 'ailang/website_builder/services/validator.ail' },
  { name: 'website_builder/services/website_builder_browser', path: 'ailang/website_builder/services/website_builder_browser.ail' },
];

// Call AILANG functions from JS
const structure = await engine.callFunction(
  'website_builder/services/website_builder_browser',
  'buildSiteStructure',
  contentJson, description, styleDirection  // e.g. "warm and friendly with purple accents"
);
```

---

## 7. Firebase Configuration

### 7.1 Auth

Using the existing `ailang-dev` Firebase project.

```javascript
const firebaseConfig = {
  // ailang-dev project config
  // Google sign-in provider only (simplest for non-technical users)
};

// Auth state determines portal access
onAuthStateChanged(auth, (user) => {
  if (user) {
    // Show builder
    // Check if admin (Firestore allowlist or Firebase custom claims)
  } else {
    // Show sign-in
  }
});
```

### 7.2 Firestore (State Persistence)

```
users/{uid}/
  ├── sites/{siteId}/
  │   ├── description: string
  │   ├── template: string
  │   ├── structure: string (JSON)
  │   ├── pages: map
  │   ├── uploads: array
  │   ├── githubRepo: string
  │   ├── published: boolean
  │   ├── publishedUrl: string
  │   ├── createdAt: timestamp
  │   └── updatedAt: timestamp
  └── profile/
      ├── displayName: string
      └── githubToken: string (encrypted)
```

### 7.3 Admin Access

For the MVP (mum's use), admin is a simple allowlist:

```javascript
const ADMIN_EMAILS = ['mum@gmail.com', 'mark@sunholo.com'];
// Or use Firebase custom claims for production
```

---

## 8. GitHub Integration

### 8.1 Authentication Options

| Option | Complexity | Security | UX |
|--------|-----------|----------|-----|
| **Personal Access Token** | Low | Token in Firestore | User pastes token once |
| **GitHub OAuth App** | Medium | OAuth flow | "Connect GitHub" button |
| **GitHub App** | High | Installation-based | Best but most setup |

**MVP: Personal Access Token** — Mark sets up the GitHub token, mum never sees it. The portal stores it in Firestore (encrypted) and uses it for all deployments.

**Future: GitHub OAuth** — users connect their own GitHub account.

### 8.2 Deployment API Calls

```javascript
// Create repo (first publish)
await octokit.repos.createForAuthenticatedUser({
  name: 'my-website',
  description: 'Built with AILANG Website Builder',
  homepage: 'https://username.github.io/my-website',
  auto_init: true
});

// Push files (create/update)
// Use GitHub Contents API or Git Data API for multi-file commits
await pushFiles(repo, [
  { path: 'index.html', content: homeHtml },
  { path: 'about/index.html', content: aboutHtml },
  { path: 'css/style.css', content: css },
  // ... images as base64
]);

// Enable GitHub Pages
await octokit.repos.createPagesSite({
  owner, repo,
  source: { branch: 'main', path: '/' }
});
```

---

## 9. AILANG Messaging Integration

For local development, the portal uses `ailang messages` to coordinate:

```bash
# When user hits "Build" — send content to coordinator
ailang messages send builder \
  "Build website: flower arranging business" \
  --title "New Site Request" \
  --from "website-builder-portal"

# When coordinator finishes — portal checks for response
ailang messages read --from "ailang-coordinator" --unread
```

This is the bridge to the cloud architecture where AILANG Coordinator handles AI generation server-side.

---

## 10. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| API key exposure | Gemini key in localStorage (same as existing demos); future: server-side via coordinator |
| GitHub token | Stored in Firestore, encrypted at rest; scoped to `repo` permission only |
| User uploads | Processed client-side in WASM sandbox; never sent to our server |
| Generated HTML | Contract-validated; iframe sandboxed in preview |
| Auth | Firebase Auth (Google provider); admin allowlist |
| XSS in generated sites | AI instructed to generate safe HTML; contract checks for script tags |

---

## 11. Development Phases

### Phase 1: Content Pipeline (AILANG Core)
- [ ] `types/content.ail` — content block types
- [ ] `services/content_extractor.ail` — wrap DocParse output
- [ ] `services/site_structurer.ail` — AI content structuring
- [ ] `services/validator.ail` — contracts
- [ ] CLI test: upload a DOCX + description → get structured JSON
- [ ] Type-check all modules: `ailang check`

### Phase 2: Design + HTML Generation
- [ ] `services/html_generator.ail` — AI HTML generation from design brief
- [ ] Style direction seed descriptions (`styles/directions.json`)
- [ ] Design brief generation (AI creates palette, fonts, layout)
- [ ] CLI test: structured JSON + style direction → design brief → HTML file
- [ ] Contract validation on generated HTML
- [ ] Design conversation: refine brief via feedback

### Phase 3: Portal MVP
- [ ] Vue 3 + Vite setup (or React — decide first)
- [ ] Firebase Auth integration
- [ ] WASM module loading (reuse DocParse loader pattern)
- [ ] Step-by-step wizard UI (mobile-first)
- [ ] Content upload (camera + files + text)
- [ ] Style direction picker + custom input
- [ ] Preview iframe
- [ ] Design + content feedback chat (the main design tool)

### Phase 4: GitHub Deployment
- [ ] GitHub API integration (personal access token)
- [ ] Multi-file push (HTML + CSS + images)
- [ ] GitHub Pages activation
- [ ] Published URL display
- [ ] Update flow (re-publish)

### Phase 5: Polish
- [ ] Image optimisation (resize before upload)
- [ ] Custom domain support
- [ ] Multi-page navigation in preview
- [ ] Loading states and progress indicators
- [ ] Error handling and recovery
- [ ] Mobile testing on real devices

### Phase 6: Cloud (Future)
- [ ] AILANG Coordinator integration
- [ ] Server-side AI generation (no user API key)
- [ ] GitHub OAuth for user accounts
- [ ] Multi-site management
- [ ] Analytics integration

---

## 12. Success Criteria

For the demo to be "done" (Phase 1-4):

1. **Mum can use it on her phone** — sign in, upload photos and a Word doc, describe her business, pick a vibe, steer the design, and get a live website
2. **Every content transformation uses AILANG** — doc parsing, content structuring, HTML generation, validation
3. **Contracts verify** the generated output — site structure, HTML well-formedness, accessibility basics
4. **Preview works in-portal** — no deployment needed to see changes
5. **One-button publish** — to GitHub Pages with a real URL
6. **Feedback loop works** — "change the colour" → AI updates → new preview

---

## 13. Decisions Made

1. **Framework**: **Vue 3 + Vite** — lighter bundle, Composition API close to existing vanilla JS patterns
2. **Image hosting**: **GitHub repo** — images committed alongside HTML/CSS, same as sunholo.com. Simple, no extra service.
3. **Generated JS**: **Yes, with contract-verified safety** — AI can generate JS for interactivity (hamburger menus, lightboxes, scroll effects, galleries) but AILANG contracts verify no dangerous patterns (see Section 14)

## 14. JavaScript Safety Contracts

Generated websites can include JavaScript for interactivity, but AILANG contracts enforce a safety boundary. The AI generates JS, and before publishing, the validator checks it.

### 14.1 What's Allowed

| Pattern | Example | Why |
|---------|---------|-----|
| DOM manipulation | `querySelector`, `classList.toggle` | Hamburger menus, accordions |
| Event listeners | `addEventListener('click', ...)` | Buttons, navigation |
| CSS transitions | `element.style.transform` | Smooth animations |
| Scroll effects | `IntersectionObserver` | Lazy loading, reveal-on-scroll |
| Image lightbox | Modal overlay on click | Gallery viewing |
| Form handling | `preventDefault`, basic validation | Contact forms |

### 14.2 What's Blocked (Contract-Verified)

| Pattern | Detection | Risk |
|---------|-----------|------|
| `eval()` / `Function()` | String match | Code injection |
| `innerHTML` with variables | Pattern match | XSS |
| `document.write` | String match | Page hijacking |
| External script loading | `<script src=` to non-CDN | Data exfiltration |
| `fetch` / `XMLHttpRequest` to unknown hosts | URL pattern | Data leaking |
| `localStorage`/`sessionStorage` writes | String match | Tracking |
| `document.cookie` | String match | Cookie theft |
| Crypto mining patterns | `WebAssembly`, `Worker` with crypto | Resource abuse |
| Obfuscated code | Entropy analysis (high char variance) | Hidden malice |

### 14.3 AILANG Contract

```ailang
-- Verify generated JavaScript is safe for publishing
export pure func validateJavaScript(js: string) -> {safe: bool, violations: List[string]}
  ensures {
    result.safe == (listLength(result.violations) == 0)
  }
{
  let dangerousPatterns = [
    {pattern: "eval(", label: "eval() — code injection risk"},
    {pattern: "Function(", label: "Function() constructor — code injection risk"},
    {pattern: "document.write", label: "document.write — page hijacking risk"},
    {pattern: "document.cookie", label: "document.cookie access — cookie theft risk"},
    {pattern: ".innerHTML", label: "innerHTML — potential XSS"},
    {pattern: "XMLHttpRequest", label: "XMLHttpRequest — network access"},
    {pattern: "importScripts", label: "importScripts — external code loading"},
    {pattern: "crypto.subtle", label: "crypto API — potential mining"},
    {pattern: "WebSocket(", label: "WebSocket — network access"},
    {pattern: "navigator.sendBeacon", label: "sendBeacon — data exfiltration"}
  ];
  let violations = flatMap(
    \p. if find(js, p.pattern) >= 0 then [p.label] else [],
    dangerousPatterns
  );
  {safe: listLength(violations) == 0, violations: violations}
}

-- Verify no external scripts (only allowed CDNs like Google Fonts, cdnjs)
export pure func validateScriptSources(html: string) -> {safe: bool, violations: List[string]}
  ensures {
    result.safe == (listLength(result.violations) == 0)
  }
{
  -- Check for script tags with src attributes
  -- Allow: fonts.googleapis.com, cdnjs.cloudflare.com, unpkg.com
  -- Block: everything else
  let violations: List[string] = []; -- TODO: implement src extraction + allowlist check
  {safe: listLength(violations) == 0, violations: violations}
}
```

The validator runs **before publish** — if any violation is found, the portal shows the issue and asks the AI to regenerate without the dangerous pattern. The user never sees this; it's a safety net.

### 14.4 CDN Allowlist

Generated sites may link to these external sources only:

| CDN | Purpose |
|-----|---------|
| `fonts.googleapis.com` / `fonts.gstatic.com` | Google Fonts |
| `cdnjs.cloudflare.com` | Common libraries (if needed) |
| `unpkg.com` | npm packages (if needed) |
| `cdn.jsdelivr.net` | npm packages (alternative) |

Everything else is blocked by contract.

## 15. Open Questions (Remaining)

1. **Custom domains**: Support in MVP or Phase 5?
2. **Multi-site**: Can one user have multiple websites? (Yes in data model, but MVP = 1)
3. **Offline**: Should the portal work offline after initial load? (WASM is already cached)
4. **Analytics**: Add simple visitor tracking to generated sites?
5. **Design guardrails**: Should contracts verify colour contrast ratios, font readability, etc.? (Recommendation: yes, accessibility contracts)
