/**
 * API helper for communicating with the Express sidecar.
 * All website building is done by Claude Code — this module sends briefs
 * and polls for responses via ailang messages.
 */

// Vite injects VITE_API_URL at build time. Falls back to relative /api for local sidecar.
const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * POST /api/build — Send a build brief to Claude Code.
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
 * POST /api/feedback — Send feedback to Claude Code.
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
 * GET /api/status — Poll for response messages from Claude Code.
 * @returns {Promise<Array>} Array of message objects
 */
export async function pollStatus() {
  const res = await fetch(`${API_BASE}/status`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.messages || [];
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

// ── GitHub repo config (per-user, stored in localStorage) ──

const REPO_CONFIG_KEY = 'wb-repo-config';

const DEFAULT_REPO_CONFIG = {
  owner: 'sunholo-voight-kampff',
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
