/**
 * Normalize internal navigation links in generated HTML to consistent
 * relative slug.html format. This ensures links work in all contexts:
 * iframe srcdoc, sidecar URLs, GitHub Pages, and downloaded files.
 *
 * @param {string} html - The HTML string to process
 * @param {string[]} slugs - Known page slugs (e.g. ['home', 'about', 'contact'])
 * @returns {string} HTML with normalized navigation links
 */
export function normalizeNavLinks(html, slugs) {
  if (!html || !slugs || slugs.length === 0) return html;

  const slugSet = new Set(slugs.map(s => s.toLowerCase()));
  // Always recognize 'home' and 'index' as aliases
  slugSet.add('home');
  slugSet.add('index');

  return html.replace(/<a\s([^>]*?)href=["']([^"']*?)["']/gi, (match, pre, href) => {
    // Skip external, mailto, tel, javascript, data links
    if (/^(https?:|mailto:|tel:|javascript:|data:)/i.test(href)) return match;

    // Extract slug from various AI-generated formats:
    // #about, /about, about.html, ./about.html, /about/, about
    let slug = href
      .replace(/^[./]+/, '')    // strip leading ./ or /
      .replace(/\.html$/i, '')  // strip .html
      .replace(/^#/, '')        // strip leading #
      .replace(/\/$/, '')       // strip trailing /
      .split('?')[0]            // strip query string
      .split('#')[0]            // strip fragment
      .toLowerCase();

    if (!slug) return match;  // bare # or empty — leave as-is

    if (slugSet.has(slug)) {
      const target = (slug === 'home') ? 'index.html' : `${slug}.html`;
      return `<a ${pre}href="${target}"`;
    }
    return match;
  });
}

/**
 * Build a self-contained HTML page that embeds multiple pages and handles
 * navigation via JavaScript. Used for "open in new tab" when the site
 * hasn't been saved to the sidecar yet (blob URL context).
 *
 * @param {Object} pages - Map of slug → HTML content
 * @param {string} initialSlug - The page to show first
 * @returns {string} Self-contained HTML with embedded navigation
 */
export function buildSelfContainedHtml(pages, initialSlug) {
  // Encode each page's full HTML as a JSON-safe string
  const pagesJson = JSON.stringify(pages);
  const startSlug = initialSlug || Object.keys(pages)[0] || 'index';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Website Preview</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; }
.wb-nav-bar {
  position: sticky; top: 0; z-index: 9999;
  display: flex; gap: 0; background: #1a1a2e; padding: 0 1rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
.wb-nav-bar button {
  padding: 0.6rem 1.2rem; border: none; background: none;
  color: #a0a0c0; font-size: 0.85rem; cursor: pointer;
  border-bottom: 2px solid transparent; transition: all 0.2s;
}
.wb-nav-bar button:hover { color: #fff; background: rgba(255,255,255,0.05); }
.wb-nav-bar button.active { color: #fff; border-bottom-color: #7c5cbf; }
#wb-page-frame { width: 100%; border: none; height: calc(100vh - 42px); }
</style>
</head>
<body>
<nav class="wb-nav-bar" id="wb-nav"></nav>
<iframe id="wb-page-frame" sandbox="allow-same-origin allow-scripts"></iframe>
<script>
(function() {
  var pages = ${pagesJson};
  var current = ${JSON.stringify(startSlug)};
  var slugs = Object.keys(pages);
  var nav = document.getElementById('wb-nav');
  var frame = document.getElementById('wb-page-frame');

  function label(s) {
    if (s === 'index' || s === 'home') return 'Home';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Inject a link interception script into page HTML so clicks send postMessage
  var navScript = '<script>document.addEventListener("click",function(e){var a=e.target.closest("a[href]");if(!a)return;var h=a.getAttribute("href")||"";if(!h||h==="#"||/^(https?:|mailto:|tel:)/i.test(h))return;e.preventDefault();e.stopPropagation();if(h.startsWith("#"))h=h.substring(1)+".html";else if(h.startsWith("/")&&!h.startsWith("//"))h=h.substring(1)+(h.endsWith(".html")?"":".html");try{parent.postMessage({type:"wb-navigate",href:h},"*")}catch(x){}},true)<\\/script>';

  function injectNav(html) {
    var i = html.lastIndexOf('</body>');
    return i >= 0 ? html.slice(0, i) + navScript + html.slice(i) : html + navScript;
  }

  function show(slug) {
    current = slug;
    frame.srcdoc = injectNav(pages[slug] || '');
    // Update active button
    nav.querySelectorAll('button').forEach(function(b) {
      b.classList.toggle('active', b.dataset.slug === slug);
    });
  }

  // Build nav buttons
  slugs.forEach(function(slug) {
    var btn = document.createElement('button');
    btn.textContent = label(slug);
    btn.dataset.slug = slug;
    btn.onclick = function() { show(slug); };
    nav.appendChild(btn);
  });

  // Listen for navigation from inside the iframe
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'wb-navigate') {
      var href = e.data.href || '';
      var slug = href.replace(/^\\//, '').replace(/\\.html$/i, '').split('?')[0].split('#')[0] || 'home';
      if (slug === 'home' && pages['index']) slug = 'index';
      if (pages[slug]) show(slug);
    }
  });

  show(current);
})();
<\/script>
</body>
</html>`;
}
