<template>
  <div class="my-sites">
    <h1>My Websites</h1>
    <p class="subtitle" v-if="loading">Loading your sites...</p>
    <p class="subtitle" v-else-if="sites.length === 0 && !error">
      You haven't built any websites yet. Let's create one!
    </p>
    <p class="subtitle" v-else-if="error">
      Could not load sites. Is the sidecar running?
    </p>

    <!-- Loading a site into preview -->
    <div v-if="loadingSite" class="loading-site">
      <span class="spinner">&#x27F3;</span> Loading {{ loadingSite }}...
    </div>

    <!-- Site cards -->
    <div v-if="sites.length > 0" class="site-grid">
      <div v-for="site in sites" :key="site.slug" class="site-card">
        <div class="site-card-header">
          <h3>{{ site.title }}</h3>
          <span class="page-count">{{ site.pages.length }} page{{ site.pages.length !== 1 ? 's' : '' }}</span>
        </div>
        <p v-if="site.description" class="site-desc">{{ site.description }}</p>
        <div class="site-pages">
          <span v-for="page in site.pages" :key="page" class="page-pill">{{ page }}</span>
        </div>
        <div class="site-meta">
          Updated {{ formatDate(site.updatedAt) }}
        </div>
        <div class="site-actions">
          <button class="btn-primary btn-sm" @click="viewSite(site)" :disabled="!!loadingSite">
            Edit / Preview
          </button>
          <button class="btn-secondary btn-sm" @click="openFullScreen(site)" title="Open in new tab">
            &#x2197;
          </button>
        </div>
      </div>
    </div>

    <!-- Build new -->
    <div class="new-site-section">
      <button class="btn-primary" @click="$emit('new-site')">
        + Build a new website
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const props = defineProps({
  userId: { type: String, required: true }
});
const emit = defineEmits(['new-site', 'view-site']);

const sites = ref([]);
const loading = ref(true);
const loadingSite = ref('');
const error = ref('');

onMounted(async () => {
  try {
    const res = await fetch(`/api/sites/${encodeURIComponent(props.userId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    sites.value = data.sites || [];
  } catch (err) {
    console.warn('[MySites] Could not fetch sites:', err.message);
    error.value = err.message;
  } finally {
    loading.value = false;
  }
});

async function viewSite(site) {
  loadingSite.value = site.title;
  try {
    const base = `/api/sites/${encodeURIComponent(props.userId)}/${encodeURIComponent(site.slug)}`;

    // Fetch all pages HTML (raw — PreviewStep injects its own selection script)
    const pageEntries = await Promise.all(
      site.pages.map(async (page) => {
        const res = await fetch(`${base}/${page}.html?raw=true`);
        if (!res.ok) throw new Error(`Failed to fetch ${page}.html`);
        const html = await res.text();
        return [page, html];
      })
    );
    // Fetch all local CSS files referenced in any page, then inline them.
    // srcdoc has no base URL so relative <link href="...css"> won't resolve.
    const cssCache = {};
    async function fetchCss(href) {
      if (cssCache[href]) return cssCache[href];
      try {
        const r = await fetch(`${base}/${href}`);
        if (r.ok) cssCache[href] = await r.text();
      } catch {}
      return cssCache[href] || '';
    }

    // Collect all local CSS hrefs from every page
    const localCssPattern = /<link[^>]+href=["']([^"']+\.css)["'][^>]*\/?>/gi;
    const allHrefs = new Set();
    for (const [, html] of pageEntries) {
      let m;
      while ((m = localCssPattern.exec(html)) !== null) {
        const href = m[1];
        // Skip external URLs (Google Fonts etc.)
        if (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('//')) {
          allHrefs.add(href);
        }
      }
    }
    // Pre-fetch all CSS files in parallel
    await Promise.all([...allHrefs].map(fetchCss));

    // Inline each local <link rel="stylesheet"> with fetched content
    const pages = {};
    let combinedCss = Object.values(cssCache).join('\n');
    for (const [page, html] of pageEntries) {
      pages[page] = html.replace(
        /<link([^>]+)href=["']([^"']+\.css)["']([^>]*)\/?>/gi,
        (match, before, href, after) => {
          if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
            return match; // keep external links (Google Fonts etc.)
          }
          const content = cssCache[href];
          return content ? `<style>/* ${href} */\n${content}</style>` : match;
        }
      );
    }

    // Sort slugs: index/home first, then alphabetical
    const sorted = [...site.pages].sort((a, b) => {
      if (a === 'index' || a === 'home') return -1;
      if (b === 'index' || b === 'home') return 1;
      return a.localeCompare(b);
    });

    // Build a minimal siteJson for PreviewStep
    const siteJson = JSON.stringify({
      title: site.title,
      description: site.description,
      pages: sorted.map(slug => ({ slug, title: slug.charAt(0).toUpperCase() + slug.slice(1) }))
    });

    emit('view-site', {
      siteJson,
      pages,
      css: combinedCss,
      slugs: sorted,
      userId: props.userId,
      siteSlug: site.slug
    });
  } catch (err) {
    console.error('[MySites] Failed to load site:', err);
    error.value = `Could not load site: ${err.message}`;
  } finally {
    loadingSite.value = '';
  }
}

function openFullScreen(site) {
  const url = `/api/sites/${encodeURIComponent(props.userId)}/${encodeURIComponent(site.slug)}/index.html?raw=true`;
  window.open(url, '_blank');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}
</script>

<style scoped>
.my-sites {
  max-width: 600px;
  margin: 0 auto;
  padding: 1.5rem 1rem 6rem;
}
.my-sites h1 { font-size: 1.6rem; margin-bottom: 0.5rem; color: var(--text); }
.my-sites .subtitle { color: var(--text-muted); margin-bottom: 1.5rem; line-height: 1.5; }

.loading-site {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--primary);
  font-size: 0.95rem;
  margin-bottom: 1rem;
}
.spinner { display: inline-block; animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.site-grid {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.site-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
  transition: border-color 0.15s;
}
.site-card:hover { border-color: var(--primary-light); }

.site-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.4rem;
}
.site-card-header h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}
.page-count {
  font-size: 0.75rem;
  color: var(--text-muted);
  background: var(--bg);
  padding: 0.15rem 0.5rem;
  border-radius: 10px;
}

.site-desc {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.site-pages {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-bottom: 0.5rem;
}
.page-pill {
  font-size: 0.72rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.15rem 0.5rem;
  color: var(--text-muted);
}

.site-meta {
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-bottom: 0.6rem;
}

.site-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-sm {
  padding: 0.45rem 1rem;
  font-size: 0.85rem;
}

.new-site-section {
  text-align: center;
}
</style>
