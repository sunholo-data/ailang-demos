/**
 * Express sidecar for Website Builder portal.
 * Bridges the Vue frontend to Claude Code via ailang messages.
 *
 * Endpoints:
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
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, statSync } from 'fs';
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

// Multer for media uploads — larger limits (videos up to 200MB)
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
  limits: { fileSize: 200 * 1024 * 1024 }
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
