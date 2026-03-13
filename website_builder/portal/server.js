/**
 * Express sidecar for Website Builder portal.
 * Bridges the Vue frontend to the AILANG coordinator via REST API (or ailang CLI fallback).
 * Persists sites locally (git) or to GitHub (GITHUB_TOKEN env var).
 *
 * Endpoints:
 *   POST /api/save      — Persist WASM-generated site to disk + git
 *   POST /api/build     — Save files + brief, send build message
 *   POST /api/upload    — Multipart file upload to staging
 *   POST /api/feedback   — Send feedback message
 *   POST /api/form-submit — Contact form submission → Google Sheets
 *   GET  /api/status     — Poll for response messages
 *   GET  /api/staging/*  — Serve staged media files
 *   GET  /api/sites/*    — Serve generated website files
 */

import express from 'express';
import multer from 'multer';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, statSync, copyFileSync, rmSync } from 'fs';
import { join, resolve, extname, basename } from 'path';
import { homedir } from 'os';
import { createServer } from 'http';
import { google } from 'googleapis';
import WebSocket, { WebSocketServer } from 'ws';

const app = express();
const PORT = process.env.SIDECAR_PORT || 3456;

// Paths
const WEBSITES_REPO = process.env.WEBSITES_REPO || join(homedir(), 'dev/sunholo/sunholo-websites');
const STAGING_DIR = join(WEBSITES_REPO, 'staging');
const SITES_DIR = join(WEBSITES_REPO, 'sites');

// Form submission config
const FORMS_JSON_PATH = join(WEBSITES_REPO, 'forms.json');
const CLOUD_RUN_URL = process.env.CLOUD_RUN_URL || 'https://ailang-dev-website-builder-ejjw6zt3bq-ew.a.run.app';
const FORM_ENDPOINT_ABS = `${CLOUD_RUN_URL}/api/form-submit`;

// Coordinator REST API (replaces ailang CLI for messaging)
const COORDINATOR_URL = process.env.COORDINATOR_URL || '';
const COORDINATOR_API_KEY = process.env.COORDINATOR_API_KEY || '';

// Dashboard WebSocket (real-time task streaming)
const DASHBOARD_URL = process.env.DASHBOARD_URL || '';

/**
 * Send a message to the AILANG coordinator via REST API.
 * Falls back to ailang CLI if COORDINATOR_URL is not set.
 * @param {string} inbox - Target agent inbox
 * @param {string} title - Message title
 * @param {string} content - Message content (string or object)
 * @param {string} from - Sender identity
 * @returns {Promise<{message_id: string}|null>}
 */
async function sendCoordinatorMessage(inbox, title, content, from = 'portal', options = {}) {
  const payload = typeof content === 'string' ? content : JSON.stringify(content);

  if (COORDINATOR_URL) {
    const headers = { 'Content-Type': 'application/json' };
    if (COORDINATOR_API_KEY) headers['Authorization'] = `Bearer ${COORDINATOR_API_KEY}`;

    const resp = await fetch(`${COORDINATOR_URL}/api/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ inbox, title, content: payload, from, ...options }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Coordinator ${resp.status}: ${body}`);
    }
    return resp.json();
  }

  // Fallback: ailang CLI (local dev without coordinator)
  try {
    execSync(
      `ailang messages send ${inbox} '${payload.replace(/'/g, "'\\''")}' --title "${title}" --from ${from}`,
      { cwd: WEBSITES_REPO, timeout: 10000 }
    );
    return { message_id: `cli-${Date.now()}` };
  } catch (e) {
    console.error('Failed to send ailang message:', e.message);
    return null;
  }
}

/**
 * Poll for messages from the coordinator via REST API.
 * Falls back to ailang CLI if COORDINATOR_URL is not set.
 * @param {string} inbox - Inbox to poll
 * @returns {Promise<Array>}
 */
async function pollCoordinatorMessages(inbox) {
  if (COORDINATOR_URL) {
    const headers = {};
    if (COORDINATOR_API_KEY) headers['Authorization'] = `Bearer ${COORDINATOR_API_KEY}`;

    const resp = await fetch(
      `${COORDINATOR_URL}/api/messages?inbox=${encodeURIComponent(inbox)}&status=unread`,
      { headers }
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.messages || [];
  }

  // Fallback: ailang CLI
  try {
    const output = execSync(
      `ailang messages list --inbox ${inbox} --json --unread 2>/dev/null || echo "[]"`,
      { timeout: 10000, encoding: 'utf-8' }
    );
    return JSON.parse(output || '[]');
  } catch {
    return [];
  }
}

// In-memory rate limiting: IP → { count, resetAt }
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 60000; // 1 minute

/**
 * Normalize internal navigation links to relative slug.html format.
 * Ensures links work on GitHub Pages, sidecar, and downloaded files.
 */
function normalizeNavLinksServer(html, slugs) {
  if (!html || !slugs || slugs.length === 0) return html;
  const slugSet = new Set(slugs.map(s => s.toLowerCase()));
  slugSet.add('home');
  slugSet.add('index');
  return html.replace(/<a\s([^>]*?)href=["']([^"']*?)["']/gi, (match, pre, href) => {
    if (/^(https?:|mailto:|tel:|javascript:|data:)/i.test(href)) return match;
    let slug = href
      .replace(/^[./]+/, '').replace(/\.html$/i, '').replace(/^#/, '')
      .replace(/\/$/, '').split('?')[0].split('#')[0].toLowerCase();
    if (!slug) return match;
    if (slugSet.has(slug)) {
      const target = (slug === 'home') ? 'index.html' : `${slug}.html`;
      return `<a ${pre}href="${target}"`;
    }
    return match;
  });
}

// ── Google Sheets helpers ──

function loadFormsConfig() {
  try {
    if (existsSync(FORMS_JSON_PATH)) {
      return JSON.parse(readFileSync(FORMS_JSON_PATH, 'utf-8'));
    }
  } catch (err) {
    console.warn('[sidecar] Could not read forms.json:', err.message);
  }
  return {};
}

function saveFormsConfig(config) {
  mkdirSync(WEBSITES_REPO, { recursive: true });
  writeFileSync(FORMS_JSON_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

// Master spreadsheet shared with the SA (Editor). Each site gets its own tab.
// Set FORM_SHEET_ID env var or configure in portal Settings.
const FORM_SHEET_ID = process.env.FORM_SHEET_ID || '';

async function getOrCreateSheet(siteSlug, requestSheetId) {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  // Resolve spreadsheet ID: per-request (user setting) > env var > forms.json > per-site legacy
  const config = loadFormsConfig();
  const spreadsheetId = requestSheetId || FORM_SHEET_ID || config._master || config[siteSlug];
  if (!spreadsheetId) {
    throw new Error(
      'No form spreadsheet configured. Set FORM_SHEET_ID env var or configure in Settings. ' +
      'Create a Google Sheet and share it (Editor) with: ' +
      'ailang-dev-website-builder@ailang-multivac-dev.iam.gserviceaccount.com'
    );
  }

  // Ensure a tab exists for this site
  const sheets = google.sheets({ version: 'v4', auth });
  const tabName = siteSlug.substring(0, 100); // Sheet tab names max 100 chars
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
    const existing = meta.data.sheets.map(s => s.properties.title);
    if (!existing.includes(tabName)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: { properties: { title: tabName } },
          }],
        },
      });
      // Add header row to new tab
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${tabName}'!A1:H1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Timestamp', 'Page', 'Name', 'Email', 'Phone', 'Subject', 'Message', 'Other Fields']],
        },
      });
      console.log(`[sidecar] Created tab "${tabName}" in spreadsheet ${spreadsheetId}`);
    }
  } catch (err) {
    console.error(`[sidecar] Failed to ensure tab for ${siteSlug}:`, err.message);
    // Continue anyway — append will fail with a clear error if the tab is missing
  }

  return { spreadsheetId, tabName, auth };
}

async function appendFormRow(spreadsheetId, tabName, auth, page, fields, submittedAt) {
  const sheets = google.sheets({ version: 'v4', auth });
  const known = ['name', 'email', 'phone', 'subject', 'message'];
  const knownValues = known.map(k => fields[k] || '');
  const otherFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!known.includes(k) && k !== '_hp') otherFields[k] = v;
  }
  const otherJson = Object.keys(otherFields).length > 0 ? JSON.stringify(otherFields) : '';

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${tabName}'!A:H`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[submittedAt || new Date().toISOString(), page, ...knownValues, otherJson]] },
  });
}

async function sendWebhookNotification(site, page, fields) {
  const webhookUrl = process.env.FORM_WEBHOOK_URL;
  if (!webhookUrl) return;

  const name = fields.name || 'Anonymous';
  const email = fields.email || '';
  const message = (fields.message || '').substring(0, 200);

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `New form submission on *${site}* (${page})\nFrom: ${name}${email ? ` <${email}>` : ''}\n${message || '(no message)'}`,
      }),
    });
  } catch (err) {
    console.warn(`[sidecar] Webhook failed: ${err.message}`);
  }
}

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// ── Form handler script (injected into saved/served HTML) ──

function buildFormScriptServer(endpoint, siteSlug) {
  return `<meta name="wb-site" content="${siteSlug}"><script data-wb-form>
(function(){var EP='${endpoint}';if(!EP)return;
document.addEventListener('submit',function(e){
var f=e.target;if(!f||f.tagName!=='FORM')return;e.preventDefault();
var fd=new FormData(f),fields={};fd.forEach(function(v,k){fields[k]=v;});
var hp=f.querySelector('input[name="_hp"]');if(hp&&hp.value){fields._hp=hp.value;}
var page='unknown';try{var p=location.pathname.split('/').pop().replace('.html','');if(p)page=p;if(page==='index')page='home';}catch(x){}
var site='${siteSlug}';
var btn=f.querySelector('[type="submit"]'),orig=btn?btn.textContent:'';
if(btn){btn.disabled=true;btn.textContent='Sending...';}
var prev=f.querySelector('.wb-form-status');if(prev)prev.remove();
fetch(EP,{method:'POST',headers:{'Content-Type':'application/json'},
body:JSON.stringify({site:site,page:page,fields:fields,submittedAt:new Date().toISOString()})
}).then(function(r){return r.json()}).then(function(d){
var el=document.createElement('div');el.className='wb-form-status';
el.style.cssText='padding:1rem;margin-top:1rem;border-radius:8px;text-align:center;font-weight:600;';
if(d.ok){el.style.background='#E8F5E9';el.style.color='#2E7D32';el.style.border='1px solid #A5D6A7';
el.textContent=d.message||'Thank you!';f.reset();}
else{el.style.background='#FFF3E0';el.style.color='#E65100';el.style.border='1px solid #FFCC80';
el.textContent=d.message||'Something went wrong.';}
f.appendChild(el);if(btn){btn.disabled=false;btn.textContent=orig;}
}).catch(function(){
var el=document.createElement('div');el.className='wb-form-status';
el.style.cssText='padding:1rem;margin-top:1rem;border-radius:8px;text-align:center;font-weight:600;background:#FFF3E0;color:#E65100;border:1px solid #FFCC80;';
el.textContent=location.protocol==='file:'?'Form submission requires hosting.':'Could not submit form. Please try again later.';
f.appendChild(el);if(btn){btn.disabled=false;btn.textContent=orig;}});
},true);})();
<\/script>`;
}

// Ensure directories exist
mkdirSync(STAGING_DIR, { recursive: true });
mkdirSync(SITES_DIR, { recursive: true });

app.use(express.json({ limit: '50mb' }));

// CORS — allow the SPA on GitHub Pages (or any origin in dev) to call the API
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

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
async function commitToRepo(filePaths, message, repoConfig = {}) {
  try {
    if (process.env.GITHUB_TOKEN) {
      // Per-request overrides (from user settings) fall back to env vars
      const owner = repoConfig.owner || process.env.GITHUB_OWNER || 'sunholo-data';
      const repo = repoConfig.repo || process.env.GITHUB_REPO || 'sunholo-websites';
      const branch = repoConfig.branch || process.env.GITHUB_BRANCH || 'main';

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
    const { user = 'default', siteName, pages, css, images, siteJson, description, repoConfig, formSheetId } = req.body;
    if (!siteName || !pages) {
      return res.status(400).json({ error: 'siteName and pages are required' });
    }

    const slug = siteName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60) || 'site';
    const siteDir = join(SITES_DIR, user, slug);
    mkdirSync(siteDir, { recursive: true });

    const writtenFiles = [];

    // Normalize navigation links + inject form handler script before writing to disk.
    const allSlugs = Object.keys(pages);
    const formScript = buildFormScriptServer(FORM_ENDPOINT_ABS, slug);
    for (const [pageSlug, rawHtml] of Object.entries(pages)) {
      const fileSlug = pageSlug === 'home' ? 'index' : pageSlug;
      const filePath = join(siteDir, `${fileSlug}.html`);
      let html = normalizeNavLinksServer(rawHtml, allSlugs);
      // Inject form handler script (for GitHub Pages / standalone)
      if (!html.includes('data-wb-form')) {
        const bodyClose = html.lastIndexOf('</body>');
        if (bodyClose >= 0) html = html.slice(0, bodyClose) + formScript + html.slice(bodyClose);
      }
      writeFileSync(filePath, html, 'utf-8');
      writtenFiles.push(`sites/${user}/${slug}/${fileSlug}.html`);
    }

    // Write CSS
    if (css) {
      const cssPath = join(siteDir, 'style.css');
      writeFileSync(cssPath, css, 'utf-8');
      writtenFiles.push(`sites/${user}/${slug}/style.css`);
    }

    // Write images — to site root (AI references by bare filename)
    if (images && Array.isArray(images)) {
      for (const img of images) {
        if (img.stagingPath) {
          const src = resolve(WEBSITES_REPO, img.stagingPath);
          if (existsSync(src)) {
            const dest = join(siteDir, img.filename);
            copyFileSync(src, dest);
            writtenFiles.push(`sites/${user}/${slug}/${img.filename}`);
          }
        } else if (img.base64) {
          const dest = join(siteDir, img.filename);
          writeFileSync(dest, Buffer.from(img.base64, 'base64'));
          writtenFiles.push(`sites/${user}/${slug}/${img.filename}`);
        }
      }
    }

    // Copy staged media files (videos, posters, etc.) to site root
    const mediaStagingDir = join(STAGING_DIR, user, slug, 'media');
    if (existsSync(mediaStagingDir)) {
      for (const f of readdirSync(mediaStagingDir)) {
        if (f.startsWith('.')) continue;
        const src = join(mediaStagingDir, f);
        const dest = join(siteDir, f);
        if (!existsSync(dest)) {
          copyFileSync(src, dest);
          writtenFiles.push(`sites/${user}/${slug}/${f}`);
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
      source: 'wasm',
      ...(formSheetId ? { formSheetId } : {}),
    }, null, 2));
    writtenFiles.push(`staging/${user}/${slug}/brief.json`);

    // Git commit (best-effort, async)
    await commitToRepo(writtenFiles, `Save: ${siteName} (WASM)`, repoConfig);

    // Build the GitHub Pages URL for the response
    const ghOwner = repoConfig?.owner || process.env.GITHUB_OWNER || 'sunholo-data';
    const ghRepo = repoConfig?.repo || process.env.GITHUB_REPO || 'sunholo-websites';
    const liveUrl = process.env.GITHUB_TOKEN
      ? `https://${ghOwner}.github.io/${ghRepo}/sites/${user}/${slug}/`
      : null;

    console.log(`[sidecar] Saved site: ${user}/${slug} (${writtenFiles.length} files)`);
    res.json({ userId: user, siteSlug: slug, files: writtenFiles, liveUrl });
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
app.post('/api/build', upload.array('files', 20), async (req, res) => {
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

    // Commit media files to GitHub repo so they're available on GitHub Pages.
    // Copy from staging to sites dir, commit, then update brief with relative paths.
    const mediaStagingDir = join(STAGING_DIR, user, site, 'media');
    const mediaFiles = [];
    if (existsSync(mediaStagingDir)) {
      const siteMediaDir = join(WEBSITES_REPO, 'sites', user, site, 'media');
      mkdirSync(siteMediaDir, { recursive: true });
      for (const f of readdirSync(mediaStagingDir)) {
        if (f.startsWith('.')) continue;
        copyFileSync(join(mediaStagingDir, f), join(siteMediaDir, f));
        mediaFiles.push(`sites/${user}/${site}/media/${f}`);
      }
    }
    // Also handle images saved directly to staging (base64 path above)
    const stagingDir = join(STAGING_DIR, user, site);
    if (existsSync(stagingDir)) {
      const siteDir = join(WEBSITES_REPO, 'sites', user, site);
      mkdirSync(siteDir, { recursive: true });
      for (const f of readdirSync(stagingDir)) {
        if (f.startsWith('.') || f === 'media' || f === 'brief.json') continue;
        const ext = extname(f).toLowerCase();
        if (BINARY_EXTS.has(ext)) {
          copyFileSync(join(stagingDir, f), join(siteDir, f));
          mediaFiles.push(`sites/${user}/${site}/${f}`);
        }
      }
    }
    if (mediaFiles.length > 0) {
      // Commit to main — the agent's feature branch is created from main,
      // so images will be available when the agent generates HTML
      await commitToRepo(mediaFiles, `Upload media for ${site}`, { ...brief.repoConfig, branch: 'main' });
      console.log(`[sidecar] Committed ${mediaFiles.length} media files for ${user}/${site}`);
    }

    // Replace staging paths with relative paths in the brief so the agent
    // generates HTML with <img src="media/filename.jpeg"> instead of /api/staging/...
    if (brief.content?.images) {
      for (const img of brief.content.images) {
        if (img.stagingPath) {
          img.repoPath = `media/${basename(img.stagingPath)}`;
          delete img.stagingPath;
        }
      }
    }

    // Extract BYOK key before saving — never persist to disk
    const anthropicApiKey = brief.anthropicApiKey;
    delete brief.anthropicApiKey;

    // Save brief.json to staging (key already stripped)
    const briefDir = join(STAGING_DIR, user, site);
    mkdirSync(briefDir, { recursive: true });
    const briefPath = join(briefDir, 'brief.json');
    writeFileSync(briefPath, JSON.stringify(brief, null, 2));

    // Send full brief to coordinator (repo paths in place of staging paths)
    const msgContent = { ...brief, type: 'build' };
    const title = `Build: ${brief.siteName || 'website'}`;

    try {
      const opts = {};
      if (anthropicApiKey) opts.anthropic_api_key = anthropicApiKey;
      const result = await sendCoordinatorMessage('website-builder', title, msgContent, 'portal', opts);
      res.json({ briefId, briefPath: `staging/${user}/${site}/brief.json`, messageId: result?.message_id });
    } catch (e) {
      console.error('Failed to send coordinator message:', e.message);
      // Continue anyway — brief is saved, can be picked up manually
      res.json({ briefId, briefPath: `staging/${user}/${site}/brief.json` });
    }
  } catch (err) {
    console.error('Build error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/feedback — Send feedback to Claude Code.
 */
app.post('/api/feedback', upload.array('files', 10), async (req, res) => {
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

    const title = `Feedback: ${(feedback.feedback || '').substring(0, 50)}`;

    try {
      await sendCoordinatorMessage('website-builder', title, feedback);
    } catch (e) {
      console.error('Failed to send coordinator message:', e.message);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Feedback error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/form-submit — Receive a contact form submission.
 * Stores in Google Sheets (per-site spreadsheet), sends optional webhook.
 */
app.post('/api/form-submit', async (req, res) => {
  try {
    const { site, page, fields, submittedAt, formSheetId } = req.body;

    if (!site || typeof site !== 'string') {
      return res.status(400).json({ ok: false, message: 'Missing site identifier.' });
    }
    if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
      return res.status(400).json({ ok: false, message: 'No form data received.' });
    }

    // Honeypot: if _hp field is filled, silently accept (bot)
    if (fields._hp) {
      console.log(`[sidecar] Honeypot triggered for ${site}/${page}`);
      return res.json({ ok: true, message: 'Thank you! Your message has been received.' });
    }

    // Rate limit
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ ok: false, message: 'Too many submissions. Please try again in a minute.' });
    }

    // Resolve sheet ID: request body > site brief.json > env var
    let sheetId = formSheetId;
    if (!sheetId) {
      try {
        // Look up from any user's brief.json that matches this site slug
        for (const u of existsSync(STAGING_DIR) ? readdirSync(STAGING_DIR) : []) {
          const bp = join(STAGING_DIR, u, site, 'brief.json');
          if (existsSync(bp)) {
            const brief = JSON.parse(readFileSync(bp, 'utf-8'));
            if (brief.formSheetId) { sheetId = brief.formSheetId; break; }
          }
        }
      } catch { /* ignore */ }
    }
    const { spreadsheetId, tabName, auth } = await getOrCreateSheet(site, sheetId);
    await appendFormRow(spreadsheetId, tabName, auth, page || 'unknown', fields, submittedAt);
    console.log(`[sidecar] Form submission stored for ${site}/${page}`);

    // Webhook (async, don't block response)
    sendWebhookNotification(site, page, fields).catch(() => {});

    res.json({ ok: true, message: 'Thank you! Your message has been received.' });
  } catch (err) {
    console.error('[sidecar] Form submission error:', err.message);
    const isConfig = err.message?.includes('No form spreadsheet configured');
    res.status(isConfig ? 503 : 500).json({
      ok: false,
      message: isConfig
        ? 'Form submissions are not configured yet. The site owner needs to set up a Google Sheet.'
        : 'Something went wrong. Please try again later.',
    });
  }
});

/**
 * GET /api/status — Poll for completion messages from AILANG Cloud.
 * Completions are posted to the agent's own inbox (website-builder),
 * not a separate "portal" inbox.
 */
app.get('/api/status', async (req, res) => {
  try {
    const inbox = req.query.inbox || 'website-builder';
    const messages = await pollCoordinatorMessages(inbox);
    res.json({ messages });
  } catch (err) {
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

  // Serve HTML files — inject form handler script if not already present
  if (extname(filePath) === '.html') {
    let html = readFileSync(filePath, 'utf-8');
    if (!html.includes('data-wb-form')) {
      const formScript = buildFormScriptServer('/api/form-submit', req.params.site);
      const bodyClose = html.lastIndexOf('</body>');
      if (bodyClose >= 0) html = html.slice(0, bodyClose) + formScript + html.slice(bodyClose);
    }
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
 * DELETE /api/sites/:user/:site — Delete a saved site.
 */
app.delete('/api/sites/:user/:site', async (req, res) => {
  const { user, site } = req.params;
  const siteDir = resolve(SITES_DIR, user, site);
  const stagingDir = resolve(STAGING_DIR, user, site);

  // Security: ensure paths are within expected directories
  if (!siteDir.startsWith(resolve(SITES_DIR))) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  try {
    // Delete from GitHub repo if configured
    if (process.env.GITHUB_TOKEN) {
      const owner = process.env.GITHUB_OWNER || 'sunholo-data';
      const repo = process.env.GITHUB_REPO || 'sunholo-websites';
      const branch = process.env.GITHUB_BRANCH || 'main';
      const prefix = `sites/${user}/${site}`;

      try {
        // Get the tree for this site to find all files
        const ref = await githubApi('GET', `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
        const headSha = ref.object.sha;
        const headCommit = await githubApi('GET', `/repos/${owner}/${repo}/git/commits/${headSha}`);
        const baseTreeSha = headCommit.tree.sha;

        // Get recursive tree to find files under this prefix
        const fullTree = await githubApi('GET', `/repos/${owner}/${repo}/git/trees/${baseTreeSha}?recursive=1`);
        const filesToDelete = (fullTree.tree || [])
          .filter(item => item.path.startsWith(prefix + '/') && item.type === 'blob');

        if (filesToDelete.length > 0) {
          // Create a tree that removes these files (sha: null deletes)
          const treeItems = filesToDelete.map(f => ({
            path: f.path, mode: '100644', type: 'blob', sha: null
          }));
          const newTree = await githubApi('POST', `/repos/${owner}/${repo}/git/trees`, {
            base_tree: baseTreeSha, tree: treeItems
          });
          const newCommit = await githubApi('POST', `/repos/${owner}/${repo}/git/commits`, {
            message: `Delete site: ${site}`, tree: newTree.sha, parents: [headSha]
          });
          await githubApi('PATCH', `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
            sha: newCommit.sha
          });
        }
      } catch (err) {
        console.warn(`[sidecar] GitHub delete failed (continuing local): ${err.message}`);
      }
    }

    // Delete local directories
    if (existsSync(siteDir)) rmSync(siteDir, { recursive: true });
    if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

/**
 * GET /api/repo-sites/:user — List all site directories for a user from the GitHub repo.
 * Complements the local /api/sites/:user for AILANG Cloud builds (agent pushes to GitHub, not sidecar disk).
 */
app.get('/api/repo-sites/:user', async (req, res) => {
  if (!process.env.GITHUB_TOKEN) return res.json({ sites: [] });

  const owner = process.env.GITHUB_OWNER || 'sunholo-data';
  const repo = process.env.GITHUB_REPO || 'sunholo-websites';
  const dirPath = `sites/${req.params.user}`;

  try {
    const result = await githubApi('GET', `/repos/${owner}/${repo}/contents/${encodeURIComponent(dirPath).replace(/%2F/g, '/')}`);
    const dirs = (Array.isArray(result) ? result : []).filter(f => f.type === 'dir');

    // For each site dir, list files to get page names
    const sites = await Promise.all(dirs.map(async (dir) => {
      try {
        const files = await githubApi('GET', `/repos/${owner}/${repo}/contents/${encodeURIComponent(dirPath + '/' + dir.name).replace(/%2F/g, '/')}`);
        const fileList = Array.isArray(files) ? files.filter(f => f.type === 'file') : [];
        const htmlFiles = fileList.filter(f => f.name.endsWith('.html'));
        return {
          slug: dir.name,
          title: dir.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          description: '',
          pages: htmlFiles.map(f => f.name.replace('.html', '')),
          fileCount: fileList.length,
          source: 'github',
        };
      } catch {
        return { slug: dir.name, title: dir.name, pages: [], fileCount: 0, source: 'github' };
      }
    }));

    res.json({ sites });
  } catch (err) {
    // 404 = no sites dir for this user — not an error
    if (err.message.includes('404')) return res.json({ sites: [] });
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/repo-files/:user/:site — List files in a site directory from the GitHub repo.
 * Used by AILANG Cloud builds to discover what pages the agent created.
 */
app.get('/api/repo-files/:user/:site', async (req, res) => {
  if (!process.env.GITHUB_TOKEN) return res.status(501).json({ error: 'No GITHUB_TOKEN configured' });

  const owner = process.env.GITHUB_OWNER || 'sunholo-data';
  const repo = process.env.GITHUB_REPO || 'sunholo-websites';
  const dirPath = `sites/${req.params.user}/${req.params.site}`;

  try {
    const result = await githubApi('GET', `/repos/${owner}/${repo}/contents/${encodeURIComponent(dirPath).replace(/%2F/g, '/')}`);
    const files = (Array.isArray(result) ? result : [])
      .filter(f => f.type === 'file')
      .map(f => f.name);
    res.json(files);
  } catch (err) {
    const status = err.message.includes('404') ? 404 : 500;
    res.status(status).json({ error: status === 404 ? 'Site directory not found in repo' : err.message });
  }
});

/**
 * GET /api/repo-file/:user/:site/* — Fetch a site file from the GitHub repo.
 * Used by AILANG Cloud builds: the agent pushes directly to GitHub, so files
 * aren't on the sidecar's local disk. This proxies via the GitHub Contents API,
 * avoiding CORS issues with GitHub Pages.
 */
app.get('/api/repo-file/:user/:site/*path', async (req, res) => {
  if (!process.env.GITHUB_TOKEN) return res.status(501).json({ error: 'No GITHUB_TOKEN configured' });

  const owner = process.env.GITHUB_OWNER || 'sunholo-data';
  const repo = process.env.GITHUB_REPO || 'sunholo-websites';
  const rawPath = Array.isArray(req.params.path) ? req.params.path.join('/') : (req.params.path || 'index.html');
  const repoPath = `sites/${req.params.user}/${req.params.site}/${rawPath}`;

  try {
    const result = await githubApi('GET', `/repos/${owner}/${repo}/contents/${encodeURIComponent(repoPath).replace(/%2F/g, '/')}`);
    const content = Buffer.from(result.content, 'base64').toString('utf-8');
    const ext = rawPath.split('.').pop();
    res.type(ext === 'css' ? 'text/css' : 'text/html').send(content);
  } catch (err) {
    const status = err.message.includes('404') ? 404 : 500;
    res.status(status).json({ error: status === 404 ? 'File not found in repo' : err.message });
  }
});

/**
 * POST /api/merge-branch — Merge a feature branch into main (or configured branch).
 * Used after AILANG Cloud builds: the agent pushes to a feature branch,
 * and we merge it into main so GitHub Pages can serve the site.
 */
app.post('/api/merge-branch', async (req, res) => {
  const { branch: sourceBranch } = req.body || {};
  if (!sourceBranch) return res.status(400).json({ error: 'Missing branch' });
  if (!process.env.GITHUB_TOKEN) return res.status(501).json({ error: 'No GITHUB_TOKEN configured' });

  const owner = process.env.GITHUB_OWNER || 'sunholo-data';
  const repo = process.env.GITHUB_REPO || 'sunholo-websites';
  const targetBranch = process.env.GITHUB_BRANCH || 'main';

  if (sourceBranch === targetBranch) {
    return res.json({ ok: true, message: 'Already on target branch' });
  }

  try {
    const result = await githubApi('POST', `/repos/${owner}/${repo}/merges`, {
      base: targetBranch,
      head: sourceBranch,
      commit_message: `Merge ${sourceBranch} into ${targetBranch}`,
    });
    console.log(`[sidecar] Merged ${sourceBranch} → ${targetBranch}: ${result.sha?.substring(0, 7)}`);
    res.json({ ok: true, sha: result.sha });
  } catch (err) {
    console.error(`[sidecar] Merge failed: ${err.message}`);
    res.status(500).json({ error: `Merge failed: ${err.message}` });
  }
});

// ── WebSocket proxy: portal connects here, sidecar relays to dashboard ──

const server = createServer(app);

server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/api/ws') { socket.destroy(); return; }
  if (!DASHBOARD_URL) {
    console.log('[sidecar] WebSocket proxy: no DASHBOARD_URL configured');
    socket.destroy();
    return;
  }

  // Connect to dashboard with API key (accept https:// or wss://, normalize to wss)
  const dashUrl = new URL(DASHBOARD_URL);
  if (dashUrl.protocol === 'https:') dashUrl.protocol = 'wss:';
  else if (dashUrl.protocol === 'http:') dashUrl.protocol = 'ws:';
  // Ensure /ws path
  if (!dashUrl.pathname.endsWith('/ws')) dashUrl.pathname = dashUrl.pathname.replace(/\/?$/, '/ws');
  if (COORDINATOR_API_KEY) dashUrl.searchParams.set('api_key', COORDINATOR_API_KEY);

  // Log the target (mask the key)
  const logUrl = new URL(dashUrl.toString());
  if (logUrl.searchParams.has('api_key')) logUrl.searchParams.set('api_key', '***');
  console.log(`[sidecar] WebSocket proxy connecting to: ${logUrl.toString()}`);

  const upstream = new WebSocket(dashUrl.toString());
  const wss = new WebSocketServer({ noServer: true });

  upstream.on('unexpected-response', (_req, res) => {
    console.log(`[sidecar] WebSocket upstream rejected: HTTP ${res.statusCode}`);
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      if (body) console.log(`[sidecar] WebSocket upstream response: ${body.substring(0, 200)}`);
      socket.destroy();
    });
  });

  upstream.on('error', (err) => {
    console.log('[sidecar] WebSocket upstream error:', err.message);
    socket.destroy();
  });

  upstream.on('open', () => {
    wss.handleUpgrade(req, socket, head, (clientWs) => {
      console.log('[sidecar] WebSocket proxy connected');

      // Relay: dashboard → client
      upstream.on('message', (data) => {
        if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
      });
      // Relay: client → dashboard
      clientWs.on('message', (data) => {
        if (upstream.readyState === WebSocket.OPEN) upstream.send(data);
      });
      // Cleanup
      clientWs.on('close', () => {
        console.log('[sidecar] WebSocket proxy client disconnected');
        upstream.close();
      });
      upstream.on('close', () => {
        if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
      });
    });
  });
});

server.listen(PORT, () => {
  console.log(`[sidecar] Website Builder API running on http://localhost:${PORT}`);
  console.log(`[sidecar] Websites repo: ${WEBSITES_REPO}`);
  console.log(`[sidecar] Staging dir: ${STAGING_DIR}`);
  if (DASHBOARD_URL) console.log(`[sidecar] Dashboard WebSocket proxy: /api/ws → ${DASHBOARD_URL}`);
});
