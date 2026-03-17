/**
 * Shared HTML normalization module.
 *
 * Every code path that displays website HTML (iframe preview, open-in-tab,
 * load from sidecar, load from GitHub, feedback reload) must produce HTML
 * where all resources are either inline or at absolute URLs. This module
 * provides the single set of functions to do that.
 *
 * Pure functions only — no Vue, no browser globals, no component state.
 */

// ── Regex patterns ──

const LOCAL_CSS_LINK = /<link([^>]+)href=["']([^"']+\.css)["']([^>]*)\/?>/gi;

function isExternalUrl(href) {
  return /^(https?:\/\/|\/\/)/i.test(href);
}

// ── Exported functions ──

/**
 * Resolve image/video filenames in HTML to data URIs or blob URLs.
 *
 * Looks up both the full path and the basename in the imageMap,
 * so src="media/photo.jpg" finds map["photo.jpg"].
 *
 * @param {string} html
 * @param {Object<string, string>} imageMap - filename → data URI / blob URL
 * @returns {string}
 */
export function resolveImages(html, imageMap) {
  if (!html || !imageMap || Object.keys(imageMap).length === 0) return html;
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

/**
 * Inline CSS synchronously when the CSS text is already in memory.
 * Replaces all local <link rel="stylesheet" href="...css"> with <style> blocks.
 *
 * @param {string} html
 * @param {string} cssText - the CSS content to inline
 * @returns {string}
 */
export function inlineCssSync(html, cssText) {
  if (!html || !cssText) return html;
  return html.replace(
    /<link\s+rel=["']stylesheet["']\s+href=["'][^"']*\.css["']\s*\/?>/gi,
    `<style>${cssText}</style>`
  );
}

/**
 * Inline CSS asynchronously by fetching CSS files referenced in <link> tags.
 *
 * @param {Array<[string, string]>} pageEntries - [[slug, html], ...]
 * @param {(href: string) => Promise<string>} fetchFn - fetches CSS by href, returns text or ''
 * @returns {Promise<{pages: Object<string, string>, combinedCss: string}>}
 */
export async function inlineCssAsync(pageEntries, fetchFn) {
  // Collect all local CSS hrefs
  const allHrefs = new Set();
  for (const [, html] of pageEntries) {
    let m;
    const pattern = new RegExp(LOCAL_CSS_LINK.source, LOCAL_CSS_LINK.flags);
    while ((m = pattern.exec(html)) !== null) {
      const href = m[2];
      if (!isExternalUrl(href)) allHrefs.add(href);
    }
  }

  // Fetch all CSS in parallel
  const cssCache = {};
  await Promise.all([...allHrefs].map(async (href) => {
    try {
      const text = await fetchFn(href);
      if (text) cssCache[href] = text;
    } catch { /* skip unfetchable CSS */ }
  }));

  // Inline into each page
  const pages = {};
  for (const [slug, html] of pageEntries) {
    pages[slug] = html.replace(
      new RegExp(LOCAL_CSS_LINK.source, LOCAL_CSS_LINK.flags),
      (match, before, href) => {
        if (isExternalUrl(href)) return match;
        const content = cssCache[href];
        return content ? `<style>/* ${href} */\n${content}</style>` : match;
      }
    );
  }

  return { pages, combinedCss: Object.values(cssCache).join('\n') };
}

/**
 * Rewrite relative src=, poster=, and CSS url() paths to absolute URLs.
 * Needed because srcdoc iframes and blob: URLs have no base URL.
 *
 * Skips absolute URLs (http/https), data URIs, blob URIs, protocol-relative, and fragment-only.
 *
 * @param {string} html
 * @param {{ userId: string, siteSlug: string, repoOwner: string, repoName: string }} ctx
 * @returns {string}
 */
export function rewriteRelativePaths(html, { userId, siteSlug, repoOwner, repoName } = {}) {
  if (!html || !userId || !siteSlug) return html;
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

/**
 * Full sync normalization pipeline: resolveImages → inlineCssSync → rewriteRelativePaths.
 *
 * All parameters are optional — omit any to skip that step.
 * This is the ONE function that every display path should use for sync HTML.
 *
 * @param {string} html
 * @param {{ imageMap?: Object, css?: string, repoCtx?: Object }} opts
 * @returns {string}
 */
export function normalizeHtml(html, { imageMap, css, repoCtx } = {}) {
  if (!html) return html;
  if (imageMap && Object.keys(imageMap).length > 0) {
    html = resolveImages(html, imageMap);
  }
  if (css) {
    html = inlineCssSync(html, css);
  }
  if (repoCtx) {
    html = rewriteRelativePaths(html, repoCtx);
  }
  return html;
}

/**
 * Sort page slugs: index/home first, then alphabetical.
 *
 * @param {string[]} slugs
 * @returns {string[]}
 */
export function sortSlugs(slugs) {
  return [...slugs].sort((a, b) => {
    if (a === 'index' || a === 'home') return -1;
    if (b === 'index' || b === 'home') return 1;
    return a.localeCompare(b);
  });
}
