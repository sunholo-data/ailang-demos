/**
 * Tests for client-side preview image/media resolution.
 *
 * Run: node preview.test.js
 *
 * Tests the three functions that transform HTML for preview and "open in tab":
 *   resolveImages  — maps bare filenames to data URIs / blob URLs via imageMap
 *   rewriteRelativePaths — rewrites relative paths to absolute GitHub Pages URLs
 *   openInTab pipeline — the full composition that must produce self-contained HTML
 */

// ── Extracted logic (same as PreviewStep.vue) ──

function resolveImages(html, imageMap) {
  if (!html || Object.keys(imageMap).length === 0) return html;
  const resolve = (val) => {
    const basename = val.split('/').pop();
    return imageMap[basename] || imageMap[val] || null;
  };
  return html
    .replace(/src=["']([^"']+)["']/g, (match, src) => {
      const uri = resolve(src);
      return uri ? `src="${uri}"` : match;
    })
    .replace(/poster=["']([^"']+)["']/g, (match, poster) => {
      const uri = resolve(poster);
      return uri ? `poster="${uri}"` : match;
    })
    .replace(/data-ref=["']([^"']+)["']/g, (match, ref) => {
      const uri = resolve(ref);
      return uri ? `${match} src="${uri}"` : match;
    });
}

function rewriteRelativePaths(html, { userId, siteSlug, repoOwner, repoName }) {
  if (!userId || !siteSlug) return html;
  const base = (repoOwner && repoName)
    ? `https://${repoOwner}.github.io/${repoName}/sites/${userId}/${siteSlug}`
    : `/api/sites/${encodeURIComponent(userId)}/${encodeURIComponent(siteSlug)}`;
  const rewriteAttr = (m, pre, path, post) => {
    const clean = path.replace(/^\.\//, '');
    return `${pre}${base}/${clean}${post}`;
  };
  return html
    .replace(/(src=["'])(?!https?:\/\/|data:|blob:|\/\/|#)([^"']+)(["'])/gi, rewriteAttr)
    .replace(/(poster=["'])(?!https?:\/\/|data:|blob:|\/\/|#)([^"']+)(["'])/gi, rewriteAttr)
    .replace(/(url\(["']?)(?!https?:\/\/|data:|blob:|\/\/|#)([^"')]+)(["']?\))/gi, rewriteAttr);
}

// Simulates the openInTab pipeline: resolveImages → inline CSS → rewriteRelativePaths
function openInTabPipeline(html, css, imageMap, repoCtx) {
  let result = resolveImages(html, imageMap);
  if (css) {
    result = result.replace(/<link\s+rel=["']stylesheet["']\s+href=["'][^"']*\.css["']\s*\/?>/gi,
      `<style>${css}</style>`);
  }
  result = rewriteRelativePaths(result, repoCtx);
  return result;
}

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

// resolveImages uses basename matching, so https://cdn.example.com/photo.jpg
// matches 'photo.jpg' in the map. This is intentional — uploaded images override
// any URL with the same filename. Use rewriteRelativePaths to skip absolute URLs.
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

// rewriteRelativePaths only handles src=, poster=, and url() — not href=.
// CSS links are inlined separately (replaced with <style> tags) in the pipeline.
assert('rewriteRelativePaths: href= NOT rewritten (handled by CSS inlining instead)',
  rewriteRelativePaths('<link rel="stylesheet" href="style.css">', REPO_CTX),
  '<link rel="stylesheet" href="style.css">');

// ════════════════════════════════════════════
// openInTab pipeline (full composition)
// ════════════════════════════════════════════

// This is the critical test: the pipeline that "open in new tab" uses.
// It must produce HTML where ALL resources are either inline or absolute URLs.

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

const result = openInTabPipeline(WASM_HTML, CSS, IMAGE_MAP, REPO_CTX);

// Known images should be data URIs (from resolveImages)
assertIncludes('pipeline: known image → data URI',
  result, 'src="data:image/jpeg;base64,/9j/abc"');

// Video src should be blob URL (from resolveImages), then rewriteRelativePaths skips it
assertIncludes('pipeline: known video → blob URI preserved',
  result, 'src="blob:http://localhost:5174/abc-123"');

// Poster should be data URI (from resolveImages)
assertIncludes('pipeline: poster → data URI',
  result, 'poster="data:image/png;base64,iVBOR"');

// Unknown image should be rewritten to GitHub Pages URL (resolveImages can't resolve, rewriteRelativePaths kicks in)
assertIncludes('pipeline: unknown image → GitHub Pages URL',
  result, `src="${BASE}/unknown.webp"`);

// External URL should be preserved
assertIncludes('pipeline: external URL preserved',
  result, 'src="https://cdn.example.com/external.jpg"');

// CSS should be inlined
assertIncludes('pipeline: CSS inlined',
  result, '<style>body { color: red; }</style>');
assertNotIncludes('pipeline: CSS link removed',
  result, 'href="style.css"');

// CSS url() with known image — resolveImages doesn't touch url(), but rewriteRelativePaths does.
// hero.png was resolved in the src/poster attributes, but url('hero.png') is handled by rewriteRelativePaths
// (resolveImages only handles src=, poster=, data-ref= — NOT url())
// After resolveImages: url('hero.png') unchanged. After rewriteRelativePaths: absolute URL.
// BUT rewriteRelativePaths skips data: URIs. Since hero.png wasn't touched by resolveImages in url(),
// it gets the GitHub Pages URL.
assertIncludes('pipeline: CSS url() → GitHub Pages URL',
  result, `url('${BASE}/hero.png')`);

// ════════════════════════════════════════════
// Regression: openInTab WITHOUT rewriteRelativePaths
// This is what was broken before the fix.
// ════════════════════════════════════════════

function brokenOpenInTab(html, css, imageMap) {
  let result = resolveImages(html, imageMap);
  if (css) {
    result = result.replace(/<link\s+rel=["']stylesheet["']\s+href=["'][^"']*\.css["']\s*\/?>/gi,
      `<style>${css}</style>`);
  }
  // Missing: rewriteRelativePaths(result, repoCtx)
  return result;
}

const broken = brokenOpenInTab(
  '<img src="unknown.webp"><link rel="stylesheet" href="style.css">',
  CSS, IMAGE_MAP
);

// Without rewriteRelativePaths, unknown images stay as bare filenames — broken in blob context
assertIncludes('regression: broken pipeline leaves bare filename',
  broken, 'src="unknown.webp"');
assertNotIncludes('regression: broken pipeline has no GitHub Pages URL',
  broken, 'github.io');

// With the fix, the same input produces absolute URLs
const fixed = openInTabPipeline(
  '<img src="unknown.webp"><link rel="stylesheet" href="style.css">',
  CSS, IMAGE_MAP, REPO_CTX
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

// ── Results ──

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
