<template>
  <div class="my-sites">
    <h1>My Websites</h1>
    <p class="subtitle" v-if="loading">Loading your sites...</p>
    <p class="subtitle" v-else-if="sites.length === 0 && !error">
      You haven't built any websites yet. It only takes a few minutes!
    </p>
    <p class="subtitle" v-else-if="error">
      Could not load sites. Is the sidecar running?
    </p>

    <!-- Loading a site into preview -->
    <div v-if="loadingSite" class="loading-site">
      <SvgIcon name="loader" :size="18" class="spinner" /> Loading {{ loadingSite }}...
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
        <a v-if="liveBaseUrl" :href="liveBaseUrl + site.slug + '/'" target="_blank" class="live-link">
          View live site <SvgIcon name="external-link" :size="14" />
        </a>
        <div class="site-meta">
          Updated {{ formatDate(site.updatedAt) }}
        </div>
        <div class="site-actions">
          <button class="btn-primary btn-sm" @click="viewSite(site)" :disabled="!!loadingSite">
            Open
          </button>
          <button class="btn-secondary btn-sm" @click="openFullScreen(site)" title="Open in new tab">
            <SvgIcon name="external-link" :size="16" />
          </button>
          <button
            class="btn-danger btn-sm"
            @click="confirmDelete(site)"
            :disabled="deleting === site.slug"
            title="Delete site"
          >
            <span v-if="deleting === site.slug">...</span>
            <SvgIcon v-else name="trash" :size="16" />
          </button>
        </div>

        <!-- Delete confirmation -->
        <div v-if="deleteConfirm === site.slug" class="delete-confirm">
          <span>This will permanently delete "{{ site.title }}". Are you sure?</span>
          <div class="delete-confirm-btns">
            <button class="btn-danger btn-sm" @click="doDelete(site)">Delete</button>
            <button class="btn-secondary btn-sm" @click="deleteConfirm = ''">Cancel</button>
          </div>
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
import { ref, computed, onMounted } from 'vue';
import SvgIcon from './SvgIcon.vue';
import { listSites, deleteSite, getSiteFile, siteFileUrl, getRepoConfig } from '../api.js';

const props = defineProps({
  userId: { type: String, required: true }
});
const emit = defineEmits(['new-site', 'view-site']);

const sites = ref([]);
const loading = ref(true);
const loadingSite = ref('');
const error = ref('');
const deleteConfirm = ref('');
const deleting = ref('');

const liveBaseUrl = computed(() => {
  const rc = getRepoConfig();
  if (!rc?.owner || !rc?.repo) return '';
  return `https://${rc.owner}.github.io/${rc.repo}/sites/${props.userId}/`;
});

onMounted(async () => {
  try {
    sites.value = await listSites(props.userId);
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
    // Fetch all pages HTML in parallel
    const pageEntries = await Promise.all(
      site.pages.map(async (page) => {
        const html = await getSiteFile(props.userId, site.slug, `${page}.html`);
        return [page, html];
      })
    );

    // Fetch all local CSS files referenced in any page, then inline them.
    // srcdoc has no base URL so relative <link href="...css"> won't resolve.
    const cssCache = {};
    async function fetchCss(href) {
      if (cssCache[href]) return cssCache[href];
      try {
        cssCache[href] = await getSiteFile(props.userId, site.slug, href);
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
        if (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('//')) {
          allHrefs.add(href);
        }
      }
    }
    await Promise.all([...allHrefs].map(fetchCss));

    // Inline each local <link rel="stylesheet"> with fetched content
    const pages = {};
    let combinedCss = Object.values(cssCache).join('\n');
    for (const [page, html] of pageEntries) {
      pages[page] = html.replace(
        /<link([^>]+)href=["']([^"']+\.css)["']([^>]*)\/?>/gi,
        (match, before, href, after) => {
          if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
            return match;
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
  const url = siteFileUrl(props.userId, site.slug, 'index.html');
  window.open(url, '_blank');
}

function confirmDelete(site) {
  deleteConfirm.value = deleteConfirm.value === site.slug ? '' : site.slug;
}

async function doDelete(site) {
  deleting.value = site.slug;
  deleteConfirm.value = '';
  try {
    await deleteSite(props.userId, site.slug);
    sites.value = sites.value.filter(s => s.slug !== site.slug);
  } catch (err) {
    error.value = `Delete failed: ${err.message}`;
  } finally {
    deleting.value = '';
  }
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
  padding: 2rem 1.25rem 6rem;
}
.my-sites h1 { font-size: 1.6rem; margin-bottom: 0.5rem; color: var(--text); font-weight: 700; }
.my-sites .subtitle { color: var(--text-muted); margin-bottom: 1.5rem; line-height: 1.6; font-size: 1rem; }

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
  padding: 1.25rem;
  transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
}
.site-card:hover {
  border-color: var(--primary-light);
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}

.site-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.4rem;
}
.site-card-header h3 {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}
.page-count {
  font-size: 0.75rem;
  color: var(--text-muted);
  background: var(--bg);
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  font-weight: 500;
}

.site-desc {
  font-size: 0.88rem;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
  line-height: 1.5;
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
  padding: 0.2rem 0.55rem;
  color: var(--text-muted);
}

.live-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.82rem;
  color: var(--primary);
  font-weight: 500;
  margin-bottom: 0.4rem;
  text-decoration: none;
  transition: color 0.15s;
}
.live-link:hover { color: var(--primary-light); text-decoration: underline; }

.site-meta {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-bottom: 0.75rem;
}

.site-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-sm {
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
  font-family: inherit;
  min-height: 40px;
}

.btn-danger {
  background: transparent;
  color: #CC0000;
  border: 1.5px solid var(--border);
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius);
  font-size: 0.85rem;
  font-family: inherit;
  cursor: pointer;
  min-height: 40px;
  transition: all 0.15s;
}
.btn-danger:hover { border-color: #CC0000; background: #FFF0F0; }

.delete-confirm {
  margin-top: 0.75rem;
  padding: 0.85rem;
  background: #FFF0F0;
  border: 1px solid #FFB3B3;
  border-radius: 10px;
  font-size: 0.88rem;
  color: #CC0000;
}
.delete-confirm-btns {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.new-site-section {
  text-align: center;
  padding-top: 0.5rem;
}

@media (max-width: 600px) {
  .my-sites { padding: 1.5rem 1rem 5.5rem; }
  .my-sites h1 { font-size: 1.35rem; }
  .site-card { padding: 1rem; }
  .site-card:hover { transform: none; } /* Disable hover lift on mobile (touch devices) */
  .site-actions { flex-wrap: wrap; }
  .btn-sm { padding: 0.45rem 0.85rem; font-size: 0.85rem; }
  .new-site-section .btn-primary { width: 100%; }
}
</style>
