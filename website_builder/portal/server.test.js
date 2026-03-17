/**
 * Tests for rewriteMediaPaths() — the server-side media path normalizer.
 *
 * Run: node server.test.js
 *
 * This function ensures all bare image/video filenames in HTML get rewritten
 * to media/ paths before saving to disk or committing to GitHub.
 */

// Extract the function (same logic as in server.js)
function rewriteMediaPaths(html) {
  if (!html) return html;
  html = html.replace(/((?:src|poster)=["'])([^"'\/]+\.(jpe?g|png|gif|webp|svg|mp4|mov|webm|avi))(["'])/gi, (m, pre, filename, ext, post) => {
    return filename.startsWith('media/') ? m : `${pre}media/${filename}${post}`;
  });
  html = html.replace(/(url\(["']?)([^"')\/]+\.(jpe?g|png|gif|webp|svg))(["']?\))/gi, (m, pre, filename, ext, post) => {
    return filename.startsWith('media/') ? m : `${pre}media/${filename}${post}`;
  });
  return html;
}

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

// ── Basic rewrites ──

assert('bare jpg src',
  rewriteMediaPaths('<img src="photo.jpg">'),
  '<img src="media/photo.jpg">');

assert('bare png src',
  rewriteMediaPaths('<img src="logo.png">'),
  '<img src="media/logo.png">');

assert('bare mp4 src',
  rewriteMediaPaths('<video src="clip.mp4"></video>'),
  '<video src="media/clip.mp4"></video>');

assert('bare webm src',
  rewriteMediaPaths('<video src="clip.webm"></video>'),
  '<video src="media/clip.webm"></video>');

assert('bare svg src',
  rewriteMediaPaths('<img src="icon.svg">'),
  '<img src="media/icon.svg">');

// ── Filenames with spaces (WhatsApp-style) ──

assert('filename with spaces',
  rewriteMediaPaths('<img src="WhatsApp Image 2026-02-05 at 20.33.27 (2).jpeg">'),
  '<img src="media/WhatsApp Image 2026-02-05 at 20.33.27 (2).jpeg">');

assert('video with spaces',
  rewriteMediaPaths('<video src="WhatsApp Video 2026-02-05 at 20.33.52.mp4"></video>'),
  '<video src="media/WhatsApp Video 2026-02-05 at 20.33.52.mp4"></video>');

// ── Single quotes ──

assert('single-quoted src',
  rewriteMediaPaths("<img src='photo.jpg'>"),
  "<img src='media/photo.jpg'>");

// ── Already has media/ prefix — should NOT double-rewrite ──

assert('already has media/ prefix',
  rewriteMediaPaths('<img src="media/photo.jpg">'),
  '<img src="media/photo.jpg">');

// ── Already has a path — should NOT rewrite ──

assert('absolute URL preserved',
  rewriteMediaPaths('<img src="https://example.com/photo.jpg">'),
  '<img src="https://example.com/photo.jpg">');

assert('relative path with slash preserved',
  rewriteMediaPaths('<img src="/images/photo.jpg">'),
  '<img src="/images/photo.jpg">');

assert('nested path preserved',
  rewriteMediaPaths('<img src="assets/photo.jpg">'),
  '<img src="assets/photo.jpg">');

assert('data URI preserved',
  rewriteMediaPaths('<img src="data:image/jpeg;base64,/9j/4AAQ">'),
  '<img src="data:image/jpeg;base64,/9j/4AAQ">');

// ── poster attribute ──

assert('poster attribute rewritten',
  rewriteMediaPaths('<video poster="thumb.jpg" src="clip.mp4"></video>'),
  '<video poster="media/thumb.jpg" src="media/clip.mp4"></video>');

assert('poster with media/ preserved',
  rewriteMediaPaths('<video poster="media/thumb.jpg"></video>'),
  '<video poster="media/thumb.jpg"></video>');

// ── CSS url() ──

assert('CSS url() rewritten',
  rewriteMediaPaths('<div style="background: url(hero.jpg)">'),
  '<div style="background: url(media/hero.jpg)">');

assert('CSS url() with quotes',
  rewriteMediaPaths('<div style="background: url(\'hero.jpg\')">'),
  '<div style="background: url(\'media/hero.jpg\')">');

assert('CSS url() with double quotes',
  rewriteMediaPaths('<div style="background-image: url(&quot;hero.png&quot;)">'),
  // HTML-encoded quotes won't match our regex — this is fine, browsers decode before CSS
  '<div style="background-image: url(&quot;hero.png&quot;)">');

assert('CSS url() with path preserved',
  rewriteMediaPaths('<style>body { background: url(media/hero.jpg) }</style>'),
  '<style>body { background: url(media/hero.jpg) }</style>');

// ── Multiple images in one HTML string ──

assert('multiple images rewritten',
  rewriteMediaPaths('<img src="a.jpg"><img src="b.png"><video src="c.mp4">'),
  '<img src="media/a.jpg"><img src="media/b.png"><video src="media/c.mp4">');

// ── Mixed: some bare, some with paths ──

assert('mixed bare and pathed',
  rewriteMediaPaths('<img src="bare.jpg"><img src="media/already.png"><img src="https://cdn.example.com/ext.webp">'),
  '<img src="media/bare.jpg"><img src="media/already.png"><img src="https://cdn.example.com/ext.webp">');

// ── Case insensitivity ──

assert('uppercase JPG',
  rewriteMediaPaths('<img src="PHOTO.JPG">'),
  '<img src="media/PHOTO.JPG">');

assert('mixed case Jpeg',
  rewriteMediaPaths('<img src="photo.Jpeg">'),
  '<img src="media/photo.Jpeg">');

// ── Edge cases ──

assert('null input',
  rewriteMediaPaths(null),
  null);

assert('empty string',
  rewriteMediaPaths(''),
  '');

assert('no images in HTML',
  rewriteMediaPaths('<h1>Hello World</h1>'),
  '<h1>Hello World</h1>');

assert('non-image extension untouched',
  rewriteMediaPaths('<a href="document.pdf">Download</a>'),
  '<a href="document.pdf">Download</a>');

assert('script src untouched (no image extension)',
  rewriteMediaPaths('<script src="app.js"></script>'),
  '<script src="app.js"></script>');

// ── Full page simulation (realistic WASM output) ──

const wasmOutput = `<!DOCTYPE html>
<html><head><title>Test</title>
<link rel="stylesheet" href="style.css">
</head><body>
<div class="hero" style="background-image: url('hero-bg.jpg')">
  <video autoplay muted loop poster="hero-poster.jpg">
    <source src="WhatsApp Video 2026-02-05 at 20.33.52.mp4" type="video/mp4">
  </video>
</div>
<section>
  <img src="WhatsApp Image 2026-02-05 at 20.33.27 (2).jpeg" alt="Flowers">
  <img src="media/already-correct.png" alt="OK">
  <img src="https://cdn.example.com/external.jpg" alt="External">
</section>
</body></html>`;

const expectedOutput = `<!DOCTYPE html>
<html><head><title>Test</title>
<link rel="stylesheet" href="style.css">
</head><body>
<div class="hero" style="background-image: url('media/hero-bg.jpg')">
  <video autoplay muted loop poster="media/hero-poster.jpg">
    <source src="media/WhatsApp Video 2026-02-05 at 20.33.52.mp4" type="video/mp4">
  </video>
</div>
<section>
  <img src="media/WhatsApp Image 2026-02-05 at 20.33.27 (2).jpeg" alt="Flowers">
  <img src="media/already-correct.png" alt="OK">
  <img src="https://cdn.example.com/external.jpg" alt="External">
</section>
</body></html>`;

assert('full page WASM output',
  rewriteMediaPaths(wasmOutput),
  expectedOutput);

// ── Results ──

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
