/**
 * Express sidecar for Website Builder portal.
 * Bridges the Vue frontend to Claude Code via ailang messages.
 * Persists sites locally (git) or to GitHub (GITHUB_TOKEN env var).
 *
 * Endpoints:
 *   POST /api/save      — Persist WASM-generated site to disk + git
 *   POST /api/build     — Save files + brief, send build message
 *   POST /api/upload    — Multipart file upload to staging
 *   POST /api/feedback   — Send feedback message
 *   GET  /api/status     — Poll for response messages
 *   GET  /api/staging/*  — Serve staged media files
 *   GET  /api/sites/*    — Serve generated website files
 */

import express from 'express';
import multer from 'multer';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, statSync, copyFileSync } from 'fs';
import { join, resolve, extname, basename } from 'path';
import { homedir } from 'os';

const app = express();
const PORT = process.env.SIDECAR_PORT || 3456;

// Paths
const WEBSITES_REPO = process.env.WEBSITES_REPO || join(homedir(), 'dev/sunholo/sunholo-websites');
const STAGING_DIR = join(WEBSITES_REPO, 'staging');
const SITES_DIR = join(WEBSITES_REPO, 'sites');

// Ensure directories exist
mkdirSync(STAGING_DIR, { recursive: true });
mkdirSync(SITES_DIR, { recursive: true });

app.use(express.json({ limit: '50mb' }));

// Multer for brief file uploads (existing endpoints)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const user = req.body?.user || 'default';
    const site = req.body?.siteName || 'site';
    const dir = join(STAGING_DIR, user, site);
    mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// Multer for media uploads — videos up to 50MB (GitHub-friendly)
const mediaStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const user = req.query.user || 'default';
    const site = req.query.site || 'site';
    const dir = join(STAGING_DIR, user, site, 'media');
    mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Timestamp prefix for uniqueness, sanitised original name
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const mediaUpload = multer({
  storage: mediaStorage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

/**
 * POST /api/upload?user=X&site=Y — Upload media files to staging.
 * Multipart form data, field name: "files". Batches of up to 10 files.
 * Returns array of { originalName, storedName, stagingPath, size, mimeType }.
 */
app.post('/api/upload', mediaUpload.array('files', 10), (req, res) => {
  try {
    const user = req.query.user || 'default';
    const site = req.query.site || 'site';
    const results = (req.files || []).map(f => ({
      originalName: f.originalname,
      storedName: f.filename,
      stagingPath: `staging/${user}/${site}/media/${f.filename}`,
      size: f.size,
      mimeType: f.mimetype
    }));
    console.log(`[sidecar] Uploaded ${results.length} files for ${user}/${site}`);
    res.json(results);
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/staging/:user/:site/media/:filename — Serve a staged media file.
 */
app.get('/api/staging/:user/:site/media/:filename', (req, res) => {
  const filePath = resolve(STAGING_DIR, req.params.user, req.params.site, 'media', req.params.filename);
  if (!filePath.startsWith(resolve(STAGING_DIR))) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.sendFile(filePath);
});

/**
 * GitHub REST API helper — uses native fetch (Node 18+).
 */
async function githubApi(method, path, body) {
  const token = process.env.GITHUB_TOKEN;
  const resp = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GitHub API ${method} ${path}: ${resp.status} ${text.substring(0, 300)}`);
  }
  return resp.json();
}

// File extensions treated as binary for GitHub blob encoding
const BINARY_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.ico', '.bmp', '.tiff',
  '.svg', '.pdf', '.mp4', '.mov', '.avi', '.mp3', '.wav', '.ogg',
  '.woff', '.woff2', '.ttf', '.otf', '.zip', '.gz'
]);

/**
 * Commit files to the sunholo-websites repo.
 * Local: execSync git add + commit.
 * Production (GITHUB_TOKEN set): GitHub Git Data API (blobs → tree → commit → ref).
 * Best-effort — failure is logged but doesn't block the caller.
 */
async function commitToRepo(filePaths, message) {
  try {
    if (process.env.GITHUB_TOKEN) {
      const owner = process.env.GITHUB_OWNER || 'sunholo-voight-kampff';
      const repo = process.env.GITHUB_REPO || 'sunholo-websites';
      const branch = process.env.GITHUB_BRANCH || 'main';

      // 1. Get current branch HEAD
      const ref = await githubApi('GET', `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
      const headSha = ref.object.sha;

      // 2. Get tree SHA from HEAD commit
      const headCommit = await githubApi('GET', `/repos/${owner}/${repo}/git/commits/${headSha}`);
      const baseTreeSha = headCommit.tree.sha;

      // 3. Create blobs for each file
      const treeItems = [];
      for (const filePath of filePaths) {
        const absPath = join(WEBSITES_REPO, filePath);
        if (!existsSync(absPath)) continue;

        const ext = extname(filePath).toLowerCase();
        const isBinary = BINARY_EXTS.has(ext);

        const content = isBinary
          ? readFileSync(absPath).toString('base64')
          : readFileSync(absPath, 'utf-8');
        const encoding = isBinary ? 'base64' : 'utf-8';

        const blob = await githubApi('POST', `/repos/${owner}/${repo}/git/blobs`, { content, encoding });
        treeItems.push({ path: filePath, mode: '100644', type: 'blob', sha: blob.sha });
      }

      if (treeItems.length === 0) return;

      // 4. Create new tree
      const newTree = await githubApi('POST', `/repos/${owner}/${repo}/git/trees`, {
        base_tree: baseTreeSha,
        tree: treeItems
      });

      // 5. Create commit
      const newCommit = await githubApi('POST', `/repos/${owner}/${repo}/git/commits`, {
        message,
        tree: newTree.sha,
        parents: [headSha]
      });

      // 6. Update branch ref
      await githubApi('PATCH', `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
        sha: newCommit.sha
      });

      console.log(`[sidecar] GitHub commit: ${newCommit.sha.substring(0, 7)} — ${message} (${treeItems.length} files)`);
      return;
    }

    // Local: git add + commit (only site files — staging/ is gitignored)
    const sitePaths = filePaths.filter(p => p.startsWith('sites/'));
    if (sitePaths.length === 0) return;
    const addPaths = sitePaths.map(p => `"${p}"`).join(' ');
    execSync(`git add ${addPaths}`, { cwd: WEBSITES_REPO, timeout: 10000 });
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: WEBSITES_REPO, timeout: 10000 });
    console.log(`[sidecar] Committed: ${message}`);
  } catch (err) {
    // Best-effort — files are on disk even if git fails
    console.warn(`[sidecar] Git commit failed (files still saved): ${err.message}`);
  }
}

/**
 * POST /api/save — Persist WASM-generated website to disk + git.
 * Body (JSON): { user, siteName, pages, css, images, siteJson, description }
 */
app.post('/api/save', async (req, res) => {
  try {
    const { user = 'default', siteName, pages, css, images, siteJson, description } = req.body;
    if (!siteName || !pages) {
      return res.status(400).json({ error: 'siteName and pages are required' });
    }

    const slug = siteName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60) || 'site';
    const siteDir = join(SITES_DIR, user, slug);
    mkdirSync(siteDir, { recursive: true });

    const writtenFiles = [];

    // Write HTML pages
    for (const [pageSlug, html] of Object.entries(pages)) {
      const filePath = join(siteDir, `${pageSlug}.html`);
      writeFileSync(filePath, html, 'utf-8');
      writtenFiles.push(`sites/${user}/${slug}/${pageSlug}.html`);
    }

    // Write CSS
    if (css) {
      const cssPath = join(siteDir, 'style.css');
      writeFileSync(cssPath, css, 'utf-8');
      writtenFiles.push(`sites/${user}/${slug}/style.css`);
    }

    // Write images — from base64 or copy from staging
    if (images && Array.isArray(images)) {
      const imagesDir = join(siteDir, 'images');
      mkdirSync(imagesDir, { recursive: true });
      for (const img of images) {
        if (img.stagingPath) {
          // Copy from staging
          const src = resolve(WEBSITES_REPO, img.stagingPath);
          if (existsSync(src)) {
            const dest = join(imagesDir, img.filename);
            copyFileSync(src, dest);
            writtenFiles.push(`sites/${user}/${slug}/images/${img.filename}`);
          }
        } else if (img.base64) {
          const dest = join(imagesDir, img.filename);
          writeFileSync(dest, Buffer.from(img.base64, 'base64'));
          writtenFiles.push(`sites/${user}/${slug}/images/${img.filename}`);
        }
      }
    }

    // Write brief.json to staging for MySites metadata
    const briefDir = join(STAGING_DIR, user, slug);
    mkdirSync(briefDir, { recursive: true });
    const briefPath = join(briefDir, 'brief.json');
    writeFileSync(briefPath, JSON.stringify({
      siteName: siteName,
      description: description || '',
      siteJson: siteJson || '',
      savedAt: new Date().toISOString(),
      source: 'wasm'
    }, null, 2));
    writtenFiles.push(`staging/${user}/${slug}/brief.json`);

    // Git commit (best-effort, async)
    await commitToRepo(writtenFiles, `Save: ${siteName} (WASM)`);

    console.log(`[sidecar] Saved site: ${user}/${slug} (${writtenFiles.length} files)`);
    res.json({ userId: user, siteSlug: slug, files: writtenFiles });
  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/build — Start a new website build.
 * Body (JSON): { brief } where brief is the full build brief object.
 * Also accepts files via multipart (field name: "files").
 */
app.post('/api/build', upload.array('files', 20), (req, res) => {
  try {
    const brief = JSON.parse(req.body.brief || '{}');
    const user = brief.user || 'default';
    const site = brief.siteName || 'site';

    // Save any uploaded files that came as base64 in the brief
    if (brief.content?.images) {
      for (const img of brief.content.images) {
        if (img.base64) {
          const dir = join(STAGING_DIR, user, site);
          mkdirSync(dir, { recursive: true });
          const filePath = join(dir, img.filename);
          writeFileSync(filePath, Buffer.from(img.base64, 'base64'));
          img.stagingPath = `staging/${user}/${site}/${img.filename}`;
          delete img.base64; // Don't send base64 in the message
        }
      }
    }
    if (brief.content?.documents) {
      for (const doc of brief.content.documents) {
        if (doc.base64) {
          const dir = join(STAGING_DIR, user, site);
          mkdirSync(dir, { recursive: true });
          const filePath = join(dir, doc.filename);
          writeFileSync(filePath, Buffer.from(doc.base64, 'base64'));
          doc.stagingPath = `staging/${user}/${site}/${doc.filename}`;
          delete doc.base64;
        }
      }
    }

    // Generate brief ID
    const briefId = `brief-${Date.now()}`;
    brief.id = briefId;
    brief.outputDir = `sites/${user}/${site}`;

    // Save brief.json to staging
    const briefDir = join(STAGING_DIR, user, site);
    mkdirSync(briefDir, { recursive: true });
    const briefPath = join(briefDir, 'brief.json');
    writeFileSync(briefPath, JSON.stringify(brief, null, 2));

    // Send ailang message
    const msgContent = JSON.stringify({
      type: 'build',
      briefId,
      briefPath: `staging/${user}/${site}/brief.json`,
      outputDir: brief.outputDir
    });
    const title = `Build: ${brief.siteName || 'website'}`;

    try {
      execSync(
        `ailang messages send website-builder '${msgContent.replace(/'/g, "'\\''")}' --title "${title}" --from portal`,
        { cwd: WEBSITES_REPO, timeout: 10000 }
      );
    } catch (e) {
      console.error('Failed to send ailang message:', e.message);
      // Continue anyway — brief is saved, can be picked up manually
    }

    res.json({ briefId, briefPath: `staging/${user}/${site}/brief.json` });
  } catch (err) {
    console.error('Build error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/feedback — Send feedback to Claude Code.
 */
app.post('/api/feedback', upload.array('files', 10), (req, res) => {
  try {
    const feedback = JSON.parse(req.body.feedback || '{}');

    // Save any new files
    if (feedback.addedContent) {
      for (const item of feedback.addedContent) {
        if (item.base64 && item.filename) {
          const dir = join(STAGING_DIR, feedback.user || 'default', feedback.siteName || 'site');
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, item.filename), Buffer.from(item.base64, 'base64'));
          item.stagingPath = `staging/${feedback.user || 'default'}/${feedback.siteName || 'site'}/${item.filename}`;
          delete item.base64;
        }
      }
    }

    const msgContent = JSON.stringify(feedback);
    const title = `Feedback: ${(feedback.feedback || '').substring(0, 50)}`;

    try {
      execSync(
        `ailang messages send website-builder '${msgContent.replace(/'/g, "'\\''")}' --title "${title}" --from portal`,
        { cwd: WEBSITES_REPO, timeout: 10000 }
      );
    } catch (e) {
      console.error('Failed to send ailang message:', e.message);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Feedback error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/status — Poll for response messages from Claude Code.
 */
app.get('/api/status', (req, res) => {
  try {
    const output = execSync(
      'ailang messages list --inbox portal --json --unread 2>/dev/null || echo "[]"',
      { timeout: 10000, encoding: 'utf-8' }
    );
    const messages = JSON.parse(output || '[]');
    res.json({ messages });
  } catch (err) {
    // If ailang messages fails, return empty
    res.json({ messages: [] });
  }
});

/**
 * GET /api/sites/:user/:site/* — Serve generated website files.
 * Injects the element selection script into HTML files for preview interactivity.
 */
app.get('/api/sites/:user/:site/*path', (req, res) => {
  // Express 5 wildcard returns an array — join it back into a path string
  const rawPath = Array.isArray(req.params.path) ? req.params.path.join('/') : (req.params.path || 'index.html');
  const filePath = resolve(SITES_DIR, req.params.user, req.params.site, rawPath);

  // Security: ensure path is within SITES_DIR
  if (!filePath.startsWith(resolve(SITES_DIR))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Serve HTML files with correct content type (no script injection —
  // PreviewStep handles selection script client-side for edit mode)
  if (extname(filePath) === '.html') {
    const html = readFileSync(filePath, 'utf-8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } else {
    res.sendFile(filePath);
  }
});

/**
 * GET /api/sites/:user — List all sites for a user.
 */
app.get('/api/sites/:user', (req, res) => {
  const userDir = resolve(SITES_DIR, req.params.user);
  if (!userDir.startsWith(resolve(SITES_DIR)) || !existsSync(userDir)) {
    return res.json({ sites: [] });
  }

  try {
    const sites = readdirSync(userDir)
      .filter(f => !f.startsWith('.') && statSync(join(userDir, f)).isDirectory())
      .map(name => {
        const siteDir = join(userDir, name);
        const files = readdirSync(siteDir).filter(f => !f.startsWith('.'));
        const htmlFiles = files.filter(f => extname(f) === '.html');
        const stat = statSync(siteDir);
        // Try to read brief.json from staging for metadata
        let title = name;
        let description = '';
        const briefPath = join(STAGING_DIR, req.params.user, name, 'brief.json');
        if (existsSync(briefPath)) {
          try {
            const brief = JSON.parse(readFileSync(briefPath, 'utf-8'));
            title = brief.siteName || name;
            description = brief.description || '';
          } catch {}
        }
        return {
          slug: name,
          title,
          description,
          pages: htmlFiles.map(f => basename(f, '.html')),
          fileCount: files.length,
          updatedAt: stat.mtime.toISOString()
        };
      });
    res.json({ sites });
  } catch {
    res.json({ sites: [] });
  }
});

/**
 * GET /api/files/:user/:site — List files in a site directory.
 */
app.get('/api/files/:user/:site', (req, res) => {
  const dir = resolve(SITES_DIR, req.params.user, req.params.site);
  if (!dir.startsWith(resolve(SITES_DIR)) || !existsSync(dir)) {
    return res.json({ files: [] });
  }

  try {
    const files = readdirSync(dir)
      .filter(f => !f.startsWith('.'))
      .map(f => ({
        name: f,
        isDir: statSync(join(dir, f)).isDirectory(),
        ext: extname(f)
      }));
    res.json({ files });
  } catch {
    res.json({ files: [] });
  }
});

app.listen(PORT, () => {
  console.log(`[sidecar] Website Builder API running on http://localhost:${PORT}`);
  console.log(`[sidecar] Websites repo: ${WEBSITES_REPO}`);
  console.log(`[sidecar] Staging dir: ${STAGING_DIR}`);
});
