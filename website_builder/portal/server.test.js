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

// ── Save pipeline: image handling regression tests ──
// These test the logic for resolving images from staging paths vs base64 fallback.
// Mirrors the logic in server.js POST /api/save (lines 588-604).

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

function processImagePayload(images, websitesRepo, siteMediaDir) {
  // Same logic as server.js save endpoint
  const writtenFiles = [];
  mkdirSync(siteMediaDir, { recursive: true });
  for (const img of images) {
    if (img.stagingPath) {
      const src = resolve(websitesRepo, img.stagingPath);
      if (existsSync(src)) {
        const dest = join(siteMediaDir, img.filename);
        copyFileSync(src, dest);
        writtenFiles.push(img.filename);
      } else if (img.base64) {
        const dest = join(siteMediaDir, img.filename);
        writeFileSync(dest, Buffer.from(img.base64, 'base64'));
        writtenFiles.push(img.filename);
      }
    } else if (img.base64) {
      const dest = join(siteMediaDir, img.filename);
      writeFileSync(dest, Buffer.from(img.base64, 'base64'));
      writtenFiles.push(img.filename);
    }
  }
  return writtenFiles;
}

const testDir = join(tmpdir(), `wb-test-${Date.now()}`);
const stagingDir = join(testDir, 'staging');
const mediaDir = join(testDir, 'media');
mkdirSync(stagingDir, { recursive: true });

// Test: base64-only image gets written
{
  const dir = join(mediaDir, 'test1');
  const files = processImagePayload([
    { filename: 'photo.jpg', base64: Buffer.from('fake-image-data').toString('base64') }
  ], testDir, dir);
  assert('base64-only image written', files.length, 1);
  assert('base64-only filename', files[0], 'photo.jpg');
  assert('base64-only file exists', existsSync(join(dir, 'photo.jpg')), true);
}

// Test: staging path exists — uses staging (not base64)
{
  const stagingFile = join(stagingDir, 'staged.jpg');
  writeFileSync(stagingFile, 'staged-data');
  const dir = join(mediaDir, 'test2');
  const files = processImagePayload([
    { filename: 'staged.jpg', stagingPath: 'staging/staged.jpg', base64: Buffer.from('fallback').toString('base64') }
  ], testDir, dir);
  assert('staging path used', files.length, 1);
  assert('staging file content', readFileSync(join(dir, 'staged.jpg'), 'utf-8'), 'staged-data');
}

// Test: staging path MISSING — falls back to base64 (regression guard)
{
  const dir = join(mediaDir, 'test3');
  const files = processImagePayload([
    { filename: 'gone.jpg', stagingPath: 'staging/nonexistent.jpg', base64: Buffer.from('fallback-data').toString('base64') }
  ], testDir, dir);
  assert('staging miss falls back to base64', files.length, 1);
  assert('fallback file exists', existsSync(join(dir, 'gone.jpg')), true);
  assert('fallback file content', readFileSync(join(dir, 'gone.jpg'), 'utf-8'), 'fallback-data');
}

// Test: staging path MISSING, no base64 — image is lost (should be 0 files)
{
  const dir = join(mediaDir, 'test4');
  const files = processImagePayload([
    { filename: 'lost.jpg', stagingPath: 'staging/nowhere.jpg' }
  ], testDir, dir);
  assert('staging miss no fallback skips image', files.length, 0);
}

// Test: empty images array — no crash
{
  const dir = join(mediaDir, 'test5');
  const files = processImagePayload([], testDir, dir);
  assert('empty images array', files.length, 0);
}

// Test: multiple images, mixed sources
{
  const dir = join(mediaDir, 'test6');
  const stagingFile = join(stagingDir, 'real.png');
  writeFileSync(stagingFile, 'real-png');
  const files = processImagePayload([
    { filename: 'real.png', stagingPath: 'staging/real.png' },
    { filename: 'inline.jpg', base64: Buffer.from('inline').toString('base64') },
    { filename: 'fallback.gif', stagingPath: 'staging/missing.gif', base64: Buffer.from('fb').toString('base64') },
  ], testDir, dir);
  assert('mixed sources count', files.length, 3);
  assert('mixed: staging file', readFileSync(join(dir, 'real.png'), 'utf-8'), 'real-png');
  assert('mixed: base64 file', existsSync(join(dir, 'inline.jpg')), true);
  assert('mixed: fallback file', existsSync(join(dir, 'fallback.gif')), true);
}

// Clean up
rmSync(testDir, { recursive: true, force: true });

// ── Results ──

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
