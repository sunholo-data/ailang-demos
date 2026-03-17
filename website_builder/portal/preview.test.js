/**
 * Tests for html-normalize.js — the shared HTML normalization module.
 *
 * Run: node preview.test.js
 *
 * Tests all functions: resolveImages, inlineCssSync, inlineCssAsync,
 * rewriteRelativePaths, normalizeHtml, sortSlugs.
 *
 * Also includes integration-style tests that simulate every display path
 * (iframe preview, open-in-tab, load from listing, feedback reload)
 * to catch CSS/image loss regressions.
 */

import {
  resolveImages,
  inlineCssSync,
  inlineCssAsync,
  rewriteRelativePaths,
  normalizeHtml,
  sortSlugs,
} from './src/html-normalize.js';

// ── Test harness ──

let passed = 0;
let failed = 0;

function assert(name, actual, expected) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${name}`);
    console.error(`  expected: ${expected}`);
    console.error(`  actual:   ${actual}`);
  }
}

function assertIncludes(name, actual, substring) {
  if (actual.includes(substring)) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${name}`);
    console.error(`  expected to contain: ${substring}`);
    console.error(`  actual: ${actual}`);
  }
}

function assertNotIncludes(name, actual, substring) {
  if (!actual.includes(substring)) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${name}`);
    console.error(`  expected NOT to contain: ${substring}`);
    console.error(`  actual: ${actual}`);
  }
}

function assertDeepEqual(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${name}`);
    console.error(`  expected: ${JSON.stringify(expected)}`);
    console.error(`  actual:   ${JSON.stringify(actual)}`);
  }
}

// ── Shared fixtures ──

const BASE = 'https://sunholo-data.github.io/sunholo-websites/sites/user123/my-site';
const REPO_CTX = { userId: 'user123', siteSlug: 'my-site', repoOwner: 'sunholo-data', repoName: 'sunholo-websites' };
const IMAGE_MAP = {
  'photo.jpg': 'data:image/jpeg;base64,/9j/abc',
  'hero.png': 'data:image/png;base64,iVBOR',
  'clip.mp4': 'blob:http://localhost:5174/abc-123',
};

// ════════════════════════════════════════════
// resolveImages
// ════════════════════════════════════════════

assert('resolveImages: bare filename → data URI',
  resolveImages('<img src="photo.jpg">', IMAGE_MAP),
  '<img src="data:image/jpeg;base64,/9j/abc">');

assert('resolveImages: media/ prefix → strips to basename, finds in map',
  resolveImages('<img src="media/photo.jpg">', IMAGE_MAP),
  '<img src="data:image/jpeg;base64,/9j/abc">');

assert('resolveImages: unknown filename → unchanged',
  resolveImages('<img src="unknown.jpg">', IMAGE_MAP),
  '<img src="unknown.jpg">');

assert('resolveImages: video src resolved',
  resolveImages('<video src="clip.mp4"></video>', IMAGE_MAP),
  '<video src="blob:http://localhost:5174/abc-123"></video>');

assert('resolveImages: poster resolved',
  resolveImages('<video poster="hero.png"></video>', IMAGE_MAP),
  '<video poster="data:image/png;base64,iVBOR"></video>');

assert('resolveImages: data URI preserved (not double-replaced)',
  resolveImages('<img src="data:image/gif;base64,R0lGO">', IMAGE_MAP),
  '<img src="data:image/gif;base64,R0lGO">');

assert('resolveImages: absolute URL with matching basename → resolved',
  resolveImages('<img src="https://cdn.example.com/photo.jpg">', IMAGE_MAP),
  '<img src="data:image/jpeg;base64,/9j/abc">');

assert('resolveImages: absolute URL with no matching basename → preserved',
  resolveImages('<img src="https://cdn.example.com/other.jpg">', IMAGE_MAP),
  '<img src="https://cdn.example.com/other.jpg">');

assert('resolveImages: empty map → no changes',
  resolveImages('<img src="photo.jpg">', {}),
  '<img src="photo.jpg">');

assert('resolveImages: null html → null',
  resolveImages(null, IMAGE_MAP),
  null);

assert('resolveImages: data-ref adds src',
  resolveImages('<div data-ref="photo.jpg"></div>', IMAGE_MAP),
  '<div data-ref="photo.jpg" src="data:image/jpeg;base64,/9j/abc"></div>');

// ════════════════════════════════════════════
// inlineCssSync
// ════════════════════════════════════════════

assert('inlineCssSync: replaces link tag with style',
  inlineCssSync('<head><link rel="stylesheet" href="style.css"></head>', 'body{color:red}'),
  '<head><style>body{color:red}</style></head>');

assert('inlineCssSync: handles single quotes',
  inlineCssSync("<link rel='stylesheet' href='style.css'>", 'h1{font-size:2em}'),
  '<style>h1{font-size:2em}</style>');

// inlineCssSync replaces ALL stylesheet links (it has the CSS text, doesn't
// distinguish local vs external). The async version preserves external links.
assert('inlineCssSync: replaces all stylesheet links including external',
  inlineCssSync('<link rel="stylesheet" href="https://cdn.example.com/lib.css">', 'body{}'),
  '<style>body{}</style>');

assert('inlineCssSync: no css → no change',
  inlineCssSync('<link rel="stylesheet" href="style.css">', ''),
  '<link rel="stylesheet" href="style.css">');

assert('inlineCssSync: no link tag → no change',
  inlineCssSync('<h1>Hello</h1>', 'body{color:red}'),
  '<h1>Hello</h1>');

assert('inlineCssSync: null html → null',
  inlineCssSync(null, 'body{}'),
  null);

assert('inlineCssSync: multiple link tags all replaced',
  inlineCssSync('<link rel="stylesheet" href="a.css"><link rel="stylesheet" href="b.css">', 'body{}'),
  '<style>body{}</style><style>body{}</style>');

assert('inlineCssSync: self-closing link tag',
  inlineCssSync('<link rel="stylesheet" href="style.css" />', 'body{}'),
  '<style>body{}</style>');

// ════════════════════════════════════════════
// inlineCssAsync
// ════════════════════════════════════════════

const asyncTests = async () => {
  // Simulate fetching CSS
  const mockFetch = async (href) => {
    if (href === 'style.css') return 'body { color: red; }';
    if (href === 'extra.css') return 'h1 { font-size: 2em; }';
    return '';
  };

  const pages = [
    ['index', '<html><head><link rel="stylesheet" href="style.css"></head><body>Home</body></html>'],
    ['about', '<html><head><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="extra.css"></head><body>About</body></html>'],
  ];

  const result = await inlineCssAsync(pages, mockFetch);

  assertIncludes('inlineCssAsync: index has inlined CSS',
    result.pages['index'], '<style>/* style.css */\nbody { color: red; }</style>');
  assertNotIncludes('inlineCssAsync: index link tag removed',
    result.pages['index'], 'href="style.css"');

  assertIncludes('inlineCssAsync: about has both CSS files inlined',
    result.pages['about'], 'body { color: red; }');
  assertIncludes('inlineCssAsync: about has extra.css inlined',
    result.pages['about'], 'h1 { font-size: 2em; }');

  assertIncludes('inlineCssAsync: combinedCss has all CSS',
    result.combinedCss, 'body { color: red; }');
  assertIncludes('inlineCssAsync: combinedCss has extra CSS',
    result.combinedCss, 'h1 { font-size: 2em; }');

  // External CSS links preserved
  const extPages = [['index', '<link rel="stylesheet" href="https://cdn.example.com/lib.css">']];
  const extResult = await inlineCssAsync(extPages, mockFetch);
  assertIncludes('inlineCssAsync: external link preserved',
    extResult.pages['index'], 'href="https://cdn.example.com/lib.css"');

  // Failed fetch — link tag stays
  const failFetch = async () => { throw new Error('404'); };
  const failPages = [['index', '<link rel="stylesheet" href="missing.css">']];
  const failResult = await inlineCssAsync(failPages, failFetch);
  assertIncludes('inlineCssAsync: failed fetch leaves link tag',
    failResult.pages['index'], 'href="missing.css"');
};

// ════════════════════════════════════════════
// rewriteRelativePaths
// ════════════════════════════════════════════

assert('rewriteRelativePaths: media/ path → GitHub Pages URL',
  rewriteRelativePaths('<img src="media/photo.jpg">', REPO_CTX),
  `<img src="${BASE}/media/photo.jpg">`);

assert('rewriteRelativePaths: bare filename → GitHub Pages URL',
  rewriteRelativePaths('<img src="photo.jpg">', REPO_CTX),
  `<img src="${BASE}/photo.jpg">`);

assert('rewriteRelativePaths: ./ prefix stripped',
  rewriteRelativePaths('<img src="./media/photo.jpg">', REPO_CTX),
  `<img src="${BASE}/media/photo.jpg">`);

assert('rewriteRelativePaths: absolute URL preserved',
  rewriteRelativePaths('<img src="https://cdn.example.com/photo.jpg">', REPO_CTX),
  '<img src="https://cdn.example.com/photo.jpg">');

assert('rewriteRelativePaths: data URI preserved',
  rewriteRelativePaths('<img src="data:image/jpeg;base64,/9j/abc">', REPO_CTX),
  '<img src="data:image/jpeg;base64,/9j/abc">');

assert('rewriteRelativePaths: blob URI preserved',
  rewriteRelativePaths('<img src="blob:http://localhost/abc">', REPO_CTX),
  '<img src="blob:http://localhost/abc">');

assert('rewriteRelativePaths: poster rewritten',
  rewriteRelativePaths('<video poster="media/thumb.jpg"></video>', REPO_CTX),
  `<video poster="${BASE}/media/thumb.jpg"></video>`);

assert('rewriteRelativePaths: CSS url() rewritten',
  rewriteRelativePaths('<div style="background: url(media/hero.jpg)">', REPO_CTX),
  `<div style="background: url(${BASE}/media/hero.jpg)">`);

assert('rewriteRelativePaths: CSS url() with quotes',
  rewriteRelativePaths("<div style=\"background: url('media/hero.jpg')\">", REPO_CTX),
  `<div style="background: url('${BASE}/media/hero.jpg')">`);

assert('rewriteRelativePaths: no userId → no rewrite',
  rewriteRelativePaths('<img src="photo.jpg">', { userId: '', siteSlug: 'x', repoOwner: 'o', repoName: 'r' }),
  '<img src="photo.jpg">');

assert('rewriteRelativePaths: no siteSlug → no rewrite',
  rewriteRelativePaths('<img src="photo.jpg">', { userId: 'u', siteSlug: '', repoOwner: 'o', repoName: 'r' }),
  '<img src="photo.jpg">');

assert('rewriteRelativePaths: fallback to sidecar URL when no repo config',
  rewriteRelativePaths('<img src="media/photo.jpg">', { userId: 'u', siteSlug: 's', repoOwner: '', repoName: '' }),
  '<img src="/api/sites/u/s/media/photo.jpg">');

assert('rewriteRelativePaths: href= NOT rewritten (handled by CSS inlining instead)',
  rewriteRelativePaths('<link rel="stylesheet" href="style.css">', REPO_CTX),
  '<link rel="stylesheet" href="style.css">');

// ════════════════════════════════════════════
// normalizeHtml (full pipeline)
// ════════════════════════════════════════════

const WASM_HTML = `<!DOCTYPE html>
<html><head><title>Test</title>
<link rel="stylesheet" href="style.css">
</head><body>
<div style="background: url('hero.png')">
  <video poster="hero.png" src="clip.mp4"></video>
</div>
<img src="photo.jpg" alt="Photo">
<img src="unknown.webp" alt="Not uploaded">
<img src="https://cdn.example.com/external.jpg" alt="External">
</body></html>`;

const CSS = 'body { color: red; }';

const pipelineResult = normalizeHtml(WASM_HTML, { imageMap: IMAGE_MAP, css: CSS, repoCtx: REPO_CTX });

assertIncludes('normalizeHtml: known image → data URI',
  pipelineResult, 'src="data:image/jpeg;base64,/9j/abc"');

assertIncludes('normalizeHtml: known video → blob URI preserved',
  pipelineResult, 'src="blob:http://localhost:5174/abc-123"');

assertIncludes('normalizeHtml: poster → data URI',
  pipelineResult, 'poster="data:image/png;base64,iVBOR"');

assertIncludes('normalizeHtml: unknown image → GitHub Pages URL',
  pipelineResult, `src="${BASE}/unknown.webp"`);

assertIncludes('normalizeHtml: external URL preserved',
  pipelineResult, 'src="https://cdn.example.com/external.jpg"');

assertIncludes('normalizeHtml: CSS inlined',
  pipelineResult, '<style>body { color: red; }</style>');
assertNotIncludes('normalizeHtml: CSS link removed',
  pipelineResult, 'href="style.css"');

assertIncludes('normalizeHtml: CSS url() → GitHub Pages URL',
  pipelineResult, `url('${BASE}/hero.png')`);

// Partial pipeline — only some options
assert('normalizeHtml: images only (no css, no repoCtx)',
  normalizeHtml('<img src="photo.jpg">', { imageMap: IMAGE_MAP }),
  '<img src="data:image/jpeg;base64,/9j/abc">');

assert('normalizeHtml: css only (no images, no repoCtx)',
  normalizeHtml('<link rel="stylesheet" href="x.css">', { css: 'h1{}' }),
  '<style>h1{}</style>');

assert('normalizeHtml: null html → null',
  normalizeHtml(null, { imageMap: IMAGE_MAP, css: CSS, repoCtx: REPO_CTX }),
  null);

assert('normalizeHtml: no options → unchanged',
  normalizeHtml('<img src="photo.jpg">'),
  '<img src="photo.jpg">');

// ════════════════════════════════════════════
// sortSlugs
// ════════════════════════════════════════════

assertDeepEqual('sortSlugs: index first',
  sortSlugs(['about', 'index', 'contact']),
  ['index', 'about', 'contact']);

assertDeepEqual('sortSlugs: home first',
  sortSlugs(['gallery', 'home', 'about']),
  ['home', 'about', 'gallery']);

assertDeepEqual('sortSlugs: alphabetical after index',
  sortSlugs(['contact', 'gallery', 'about', 'index']),
  ['index', 'about', 'contact', 'gallery']);

assertDeepEqual('sortSlugs: empty array',
  sortSlugs([]),
  []);

assertDeepEqual('sortSlugs: does not mutate input',
  (() => { const arr = ['b', 'a']; sortSlugs(arr); return arr; })(),
  ['b', 'a']);

// ════════════════════════════════════════════
// Integration: simulate every display path
// ════════════════════════════════════════════

// These tests ensure that ALL display paths produce HTML with:
// 1. No bare <link rel="stylesheet"> tags (CSS must be inline)
// 2. No relative src= attributes (must be data URI, blob, or absolute URL)
// 3. Images resolved where possible

const SITE_HTML = `<html><head>
<link rel="stylesheet" href="style.css">
</head><body>
<img src="media/photo.jpg">
<video poster="media/thumb.jpg" src="media/clip.mp4"></video>
<div style="background: url('media/bg.jpg')"></div>
</body></html>`;

const SITE_CSS = 'body { margin: 0; background: url(media/bg.jpg); }';

function assertNoRelativePaths(name, html) {
  // Should have no relative src= (except data: or blob: or absolute)
  const relSrc = html.match(/src=["'](?!https?:\/\/|data:|blob:)([^"']+)["']/gi);
  if (relSrc) {
    failed++;
    console.error(`FAIL: ${name} — found relative src: ${relSrc.join(', ')}`);
  } else {
    passed++;
  }
}

function assertNoCssLinkTags(name, html) {
  const links = html.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi);
  // Allow external links, only flag local ones
  const localLinks = (links || []).filter(l => !l.includes('http://') && !l.includes('https://'));
  if (localLinks.length > 0) {
    failed++;
    console.error(`FAIL: ${name} — found local CSS link: ${localLinks.join(', ')}`);
  } else {
    passed++;
  }
}

function assertHasStyles(name, html) {
  if (html.includes('<style>') || html.includes('<style ')) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${name} — no <style> tag found`);
  }
}

// Path 1: Fresh WASM build → iframe preview (normalizeHtml with all options)
const path1 = normalizeHtml(SITE_HTML, { imageMap: {}, css: SITE_CSS, repoCtx: REPO_CTX });
assertNoCssLinkTags('path1 (WASM preview): no local CSS links', path1);
assertHasStyles('path1 (WASM preview): has inline styles', path1);
assertNoRelativePaths('path1 (WASM preview): no relative src', path1);

// Path 2: Open in new tab (same as path 1 — normalizeHtml)
const path2 = normalizeHtml(SITE_HTML, { imageMap: {}, css: SITE_CSS, repoCtx: REPO_CTX });
assertNoCssLinkTags('path2 (open in tab): no local CSS links', path2);
assertHasStyles('path2 (open in tab): has inline styles', path2);
assertNoRelativePaths('path2 (open in tab): no relative src', path2);

// Path 3: Loaded from MySites (CSS already inlined in HTML, repoCtx for remaining paths)
const preInlined = SITE_HTML.replace(
  /<link\s+rel=["']stylesheet["']\s+href=["'][^"']*\.css["']\s*\/?>/gi,
  `<style>${SITE_CSS}</style>`
);
const path3 = normalizeHtml(preInlined, { imageMap: {}, css: SITE_CSS, repoCtx: REPO_CTX });
assertNoCssLinkTags('path3 (from listing): no local CSS links', path3);
assertHasStyles('path3 (from listing): has inline styles', path3);
assertNoRelativePaths('path3 (from listing): no relative src', path3);

// Path 4: CSS already inlined but url() still relative — rewriteRelativePaths must fix
const inlinedWithRelUrl = `<html><head><style>body { background: url('media/bg.jpg'); }</style></head>
<body><img src="media/photo.jpg"></body></html>`;
const path4 = normalizeHtml(inlinedWithRelUrl, { repoCtx: REPO_CTX });
assertNoRelativePaths('path4 (pre-inlined CSS): no relative src', path4);
assertIncludes('path4 (pre-inlined CSS): url() rewritten',
  path4, `url('${BASE}/media/bg.jpg')`);

// Path 5: Loaded from listing WITHOUT repoCtx (no GitHub Pages URL available)
// Should still inline CSS even without repoCtx
const path5 = normalizeHtml(SITE_HTML, { css: SITE_CSS });
assertNoCssLinkTags('path5 (no repoCtx): no local CSS links', path5);
assertHasStyles('path5 (no repoCtx): has inline styles', path5);

// ════════════════════════════════════════════
// Regression: openInTab WITHOUT rewriteRelativePaths
// ════════════════════════════════════════════

function brokenPipeline(html, css, imageMap) {
  let result = resolveImages(html, imageMap);
  if (css) result = inlineCssSync(result, css);
  // Missing: rewriteRelativePaths — this is what was broken
  return result;
}

const broken = brokenPipeline(
  '<img src="unknown.webp"><link rel="stylesheet" href="style.css">',
  CSS, IMAGE_MAP
);

assertIncludes('regression: broken pipeline leaves bare filename',
  broken, 'src="unknown.webp"');
assertNotIncludes('regression: broken pipeline has no GitHub Pages URL',
  broken, 'github.io');

const fixed = normalizeHtml(
  '<img src="unknown.webp"><link rel="stylesheet" href="style.css">',
  { imageMap: IMAGE_MAP, css: CSS, repoCtx: REPO_CTX }
);
assertIncludes('regression: fixed pipeline rewrites to GitHub Pages URL',
  fixed, `src="${BASE}/unknown.webp"`);

// ════════════════════════════════════════════
// Edge: filenames with spaces (WhatsApp-style)
// ════════════════════════════════════════════

const SPACE_MAP = { 'WhatsApp Image 2026-02-05 at 20.33.27 (2).jpeg': 'data:image/jpeg;base64,AAAA' };

assert('resolveImages: filename with spaces',
  resolveImages('<img src="WhatsApp Image 2026-02-05 at 20.33.27 (2).jpeg">', SPACE_MAP),
  '<img src="data:image/jpeg;base64,AAAA">');

assert('resolveImages: media/ + filename with spaces → strips to basename',
  resolveImages('<img src="media/WhatsApp Image 2026-02-05 at 20.33.27 (2).jpeg">', SPACE_MAP),
  '<img src="data:image/jpeg;base64,AAAA">');

// ── Run async tests then report ──

asyncTests().then(() => {
  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
});
