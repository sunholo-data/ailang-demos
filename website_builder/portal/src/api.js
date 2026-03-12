/**
 * API helper for communicating with the Express sidecar.
 * All website building is done by AILANG Cloud — this module sends briefs
 * and polls for responses via ailang messages.
 */

// Vite injects VITE_API_URL at build time. Falls back to relative /api for local sidecar.
const API_BASE = import.meta.env.VITE_API_URL || '/api';
export { API_BASE };

/**
 * POST /api/build — Send a build brief to AILANG Cloud.
 * @param {Object} brief - The build brief (description, style, content, etc.)
 * @returns {Promise<{briefId: string, briefPath: string}>}
 */
export async function sendBuild(brief) {
  const formData = new FormData();
  formData.append('brief', JSON.stringify(brief));

  const res = await fetch(`${API_BASE}/build`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Build request failed (${res.status})`);
  }

  return res.json();
}

/**
 * POST /api/feedback — Send feedback to AILANG Cloud.
 * @param {Object} feedback - The feedback object
 * @returns {Promise<{ok: boolean}>}
 */
export async function sendFeedback(feedback) {
  const formData = new FormData();
  formData.append('feedback', JSON.stringify(feedback));

  const res = await fetch(`${API_BASE}/feedback`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Feedback request failed (${res.status})`);
  }

  return res.json();
}

/**
 * GET /api/status — Poll for response messages from AILANG Cloud.
 * @returns {Promise<Array>} Array of message objects
 */
export async function pollStatus() {
  const res = await fetch(`${API_BASE}/status`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.messages || [];
}

/**
 * POST /api/merge-branch — Merge a feature branch into main.
 * @param {string} branch - The source branch to merge
 * @returns {Promise<{ok: boolean, sha?: string}>}
 */
export async function mergeBranch(branch) {
  const res = await fetch(`${API_BASE}/merge-branch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branch }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Merge failed (${res.status})`);
  }
  return res.json();
}

/**
 * GET /api/files/:user/:site — List files in a generated site.
 * @param {string} user
 * @param {string} site
 * @returns {Promise<Array>} Array of {name, isDir, ext}
 */
export async function listSiteFiles(user, site) {
  const res = await fetch(`${API_BASE}/files/${encodeURIComponent(user)}/${encodeURIComponent(site)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.files || [];
}

/**
 * POST /api/save — Persist WASM-generated site to disk + git.
 * @param {Object} site - { user, siteName, pages, css, images, siteJson, description }
 * @returns {Promise<{userId: string, siteSlug: string, files: string[]}>}
 */
export async function saveSite(site) {
  const res = await fetch(`${API_BASE}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(site),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Save failed (${res.status})`);
  }

  return res.json();
}

/**
 * Build the preview URL for a site file served by the sidecar.
 * @param {string} user
 * @param {string} site
 * @param {string} [file='index.html']
 * @returns {string}
 */
export function siteFileUrl(user, site, file = 'index.html') {
  return `${API_BASE}/sites/${encodeURIComponent(user)}/${encodeURIComponent(site)}/${file}`;
}

/**
 * GET /api/sites/:user — List all saved sites for a user.
 * @param {string} user
 * @returns {Promise<Array>} Array of site objects
 */
export async function listSites(user) {
  const res = await fetch(`${API_BASE}/sites/${encodeURIComponent(user)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.sites || [];
}

/**
 * DELETE /api/sites/:user/:site — Delete a saved site.
 * @param {string} user
 * @param {string} site
 * @returns {Promise<{ok: boolean}>}
 */
export async function deleteSite(user, site) {
  const res = await fetch(`${API_BASE}/sites/${encodeURIComponent(user)}/${encodeURIComponent(site)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Delete failed (${res.status})`);
  }
  return res.json();
}

/**
 * Fetch a single file from a saved site (HTML, CSS, etc.).
 * @param {string} user
 * @param {string} site
 * @param {string} file - e.g. 'index.html', 'style.css'
 * @returns {Promise<string>} File contents as text
 */
export async function getSiteFile(user, site, file) {
  const res = await fetch(siteFileUrl(user, site, file));
  if (!res.ok) throw new Error(`Failed to fetch ${file} (${res.status})`);
  return res.text();
}

/**
 * POST /api/upload — Upload media files to sidecar staging in batches.
 * @param {Array<{file: File, filename: string}>} mediaItems
 * @param {string} user
 * @param {string} site
 * @param {Function} [onProgress] - Optional callback(uploaded, total)
 * @returns {Promise<Array<{originalName, storedName, stagingPath, size, mimeType}>>}
 */
export async function uploadMedia(mediaItems, user, site, onProgress) {
  const BATCH_SIZE = 5;
  const results = [];
  for (let i = 0; i < mediaItems.length; i += BATCH_SIZE) {
    const batch = mediaItems.slice(i, i + BATCH_SIZE);
    const form = new FormData();
    for (const item of batch) form.append('files', item.file, item.filename);
    const resp = await fetch(
      `${API_BASE}/upload?user=${encodeURIComponent(user)}&site=${encodeURIComponent(site)}`,
      { method: 'POST', body: form }
    );
    if (!resp.ok) throw new Error(`Upload failed (${resp.status}): ${await resp.text()}`);
    results.push(...await resp.json());
    onProgress?.(Math.min(i + BATCH_SIZE, mediaItems.length), mediaItems.length);
  }
  return results;
}

// ── GitHub repo config (per-user, stored in localStorage) ──

const REPO_CONFIG_KEY = 'wb-repo-config';

const DEFAULT_REPO_CONFIG = {
  owner: 'sunholo-data',
  repo: 'sunholo-websites',
  branch: 'main',
};

/**
 * Get the user's GitHub repo config.
 * Falls back to project defaults so GitHub Pages links work out of the box.
 * @returns {{ owner: string, repo: string, branch: string }}
 */
export function getRepoConfig() {
  try {
    const raw = localStorage.getItem(REPO_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_REPO_CONFIG, ...parsed };
    }
  } catch { /* fall through */ }
  return { ...DEFAULT_REPO_CONFIG };
}

/**
 * Save the user's GitHub repo config.
 * @param {{ owner?: string, repo?: string, branch?: string }} config
 */
export function saveRepoConfig(config) {
  localStorage.setItem(REPO_CONFIG_KEY, JSON.stringify(config));
}

export function clearRepoConfig() {
  localStorage.removeItem(REPO_CONFIG_KEY);
}

// ── Google Sheet config (per-user, stored in localStorage) ──

const SHEET_CONFIG_KEY = 'wb-form-sheet-id';

/**
 * Get the user's Google Sheet ID for form submissions.
 * @returns {string} spreadsheet ID or empty string
 */
export function getFormSheetId() {
  return localStorage.getItem(SHEET_CONFIG_KEY) || '';
}

/**
 * Save the user's Google Sheet ID for form submissions.
 * @param {string} sheetId
 */
export function saveFormSheetId(sheetId) {
  if (sheetId.trim()) {
    localStorage.setItem(SHEET_CONFIG_KEY, sheetId.trim());
  } else {
    localStorage.removeItem(SHEET_CONFIG_KEY);
  }
}
