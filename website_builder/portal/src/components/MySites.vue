<template>
  <div class="my-sites">
    <!-- Welcome banner with persona -->
    <div class="welcome-banner">
      <img
        v-if="personaAvatar"
        :src="personaAvatar"
        :alt="personaName"
        class="welcome-avatar"
      />
      <div class="welcome-text">
        <h1>My Websites</h1>
        <p class="welcome-tagline">{{ personaName ? `${personaName} here — ready to build something new!` : 'Build a website in minutes with AI.' }}</p>
      </div>
    </div>

    <!-- Tabs -->
    <div class="site-tabs">
      <button class="site-tab" :class="{ active: activeTab === 'mine' }" @click="activeTab = 'mine'">
        Mine
      </button>
      <button class="site-tab" :class="{ active: activeTab === 'shared' }" @click="switchToShared">
        Shared with me
        <span v-if="sharedSites.length > 0" class="tab-badge">{{ sharedSites.length }}</span>
      </button>
    </div>

    <!-- Loading a site into preview (shared across tabs) -->
    <div v-if="loadingSite" class="loading-site">
      <SvgIcon name="loader" :size="18" class="spinner" /> Loading {{ loadingSite }}...
    </div>

    <!-- My Sites tab -->
    <template v-if="activeTab === 'mine'">
      <!-- Top build button (when there are sites to scroll past) -->
      <button v-if="sites.length > 2" class="btn-primary btn-new-top" @click="$emit('new-site')">
        + Build a new website
      </button>

      <p class="subtitle" v-if="loading">Loading your sites...</p>
      <p class="subtitle" v-else-if="sites.length === 0 && !error">
        You haven't built any websites yet. It only takes a few minutes!
      </p>
      <p class="subtitle" v-else-if="error">
        Could not load sites. Is the sidecar running?
      </p>

      <!-- Site cards -->
      <div v-if="sites.length > 0" class="site-grid">
        <div v-for="site in sites" :key="site.slug" class="site-card">
          <!-- Live iframe thumbnail -->
          <div v-if="liveBaseUrl" class="site-thumbnail" @click="viewSite(site)">
            <iframe
              :src="liveBaseUrl + site.slug + '/'"
              sandbox="allow-same-origin"
              loading="lazy"
              tabindex="-1"
              aria-hidden="true"
            ></iframe>
            <div class="thumbnail-overlay">
              <span class="thumbnail-open">Open</span>
            </div>
          </div>
          <div v-else class="site-thumbnail site-thumbnail-placeholder">
            <SvgIcon name="globe" :size="32" />
          </div>
          <div class="site-card-body">
          <div class="site-card-header">
            <h3>{{ site.title }}</h3>
            <span class="page-count">{{ site.pages.length }} page{{ site.pages.length !== 1 ? 's' : '' }}</span>
          </div>
          <span v-if="site.builderName" class="builder-badge" :class="site.builderKey || ''">
            Built by {{ site.builderName }}
          </span>
          <p v-if="site.description" class="site-desc">{{ site.description }}</p>
          <div class="site-pages">
            <span v-for="page in site.pages" :key="page" class="page-pill">{{ page }}</span>
          </div>
          <a v-if="liveBaseUrl" :href="liveBaseUrl + site.slug + '/'" target="_blank" class="live-link">
            View live site <SvgIcon name="external-link" :size="14" />
          </a>
          <div class="site-meta">
            <template v-if="site.updatedAt || site.createdAt">
              <span v-if="site.updatedAt">Updated {{ formatDate(site.updatedAt) }}</span>
              <span v-if="site.createdAt && site.createdAt !== site.updatedAt" class="site-meta-created"> · Created {{ formatDate(site.createdAt) }}</span>
            </template>
            <span v-else class="site-meta-source">{{ site.source === 'github' ? 'Published' : 'Saved locally' }}</span>
          </div>
          <div class="site-actions">
            <button class="btn-primary btn-sm" @click="viewSite(site)" :disabled="!!loadingSite">
              Open
            </button>
            <button class="btn-secondary btn-sm" @click="openShareModal(site)" title="Share">
              <SvgIcon name="share" :size="16" />
            </button>
            <button class="btn-secondary btn-sm" @click="historyTarget = site" title="Version history">
              <SvgIcon name="history" :size="16" />
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
          </div><!-- /.site-card-body -->
        </div>
      </div>
    </template>

    <!-- Shared with me tab -->
    <template v-if="activeTab === 'shared'">
      <p class="subtitle" v-if="loadingShared">Loading shared sites...</p>
      <p class="subtitle" v-else-if="sharedSites.length === 0">
        No one has shared a website with you yet.
      </p>

      <div v-if="sharedSites.length > 0" class="site-grid">
        <div v-for="site in sharedSites" :key="site.id" class="site-card">
          <!-- Live iframe thumbnail -->
          <div v-if="site.liveUrl" class="site-thumbnail" @click="viewSharedSite(site)">
            <iframe
              :src="site.liveUrl"
              sandbox="allow-same-origin"
              loading="lazy"
              tabindex="-1"
              aria-hidden="true"
            ></iframe>
            <div class="thumbnail-overlay">
              <span class="thumbnail-open">Open</span>
            </div>
          </div>
          <div v-else class="site-thumbnail site-thumbnail-placeholder">
            <SvgIcon name="globe" :size="32" />
          </div>
          <div class="site-card-body">
          <div class="site-card-header">
            <h3>{{ site.title || site.siteSlug }}</h3>
            <span class="owner-badge"><SvgIcon name="user" :size="12" /> {{ site.ownerName || site.ownerEmail }}</span>
          </div>
          <div v-if="site.pages && site.pages.length > 0" class="site-pages">
            <span class="page-count">{{ site.pages.length }} page{{ site.pages.length !== 1 ? 's' : '' }}</span>
            <span v-for="page in site.pages" :key="page" class="page-pill">{{ page }}</span>
          </div>
          <a v-if="site.liveUrl" :href="site.liveUrl" target="_blank" class="live-link">
            View live site <SvgIcon name="external-link" :size="14" />
          </a>
          <div class="site-actions">
            <button class="btn-primary btn-sm" @click="viewSharedSite(site)" :disabled="!!loadingSite">
              Open
            </button>
            <button v-if="site.liveUrl" class="btn-secondary btn-sm" @click="openUrl(site.liveUrl)" title="Open in new tab">
              <SvgIcon name="external-link" :size="16" />
            </button>
          </div>
          </div><!-- /.site-card-body -->
        </div>
      </div>
    </template>

    <!-- Build new -->
    <div class="new-site-section">
      <button class="btn-primary" @click="$emit('new-site')">
        + Build a new website
      </button>
    </div>

    <!-- Share modal -->
    <ShareModal
      v-if="shareTarget"
      :owner-uid="props.userId"
      :site-slug="shareTarget.slug"
      :site-title="shareTarget.title"
      :live-url="liveBaseUrl ? liveBaseUrl + shareTarget.slug + '/' : ''"
      @close="shareTarget = null"
    />

    <!-- Version history modal -->
    <SiteHistoryModal
      v-if="historyTarget"
      :user-id="props.userId"
      :site-slug="historyTarget.slug"
      :site-title="historyTarget.title"
      @close="historyTarget = null"
      @restored="historyTarget = null"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import SvgIcon from './SvgIcon.vue';
import ShareModal from './ShareModal.vue';
import SiteHistoryModal from './SiteHistoryModal.vue';
import { listSites, listRepoSites, listRepoFiles, deleteSite, getSiteFile, getRepoFile, siteFileUrl, getRepoConfig } from '../api.js';
import { getSharedSites, saveSiteMetadata, listUserSitesMeta } from '../firebase.js';
import { inlineCssAsync, sortSlugs } from '../html-normalize.js';

const props = defineProps({
  userId: { type: String, required: true },
  userEmail: { type: String, default: '' },
  userName: { type: String, default: '' },
  personaName: { type: String, default: '' },
  personaAvatar: { type: String, default: '' },
});
const emit = defineEmits(['new-site', 'view-site']);

const activeTab = ref('mine');
const sites = ref([]);
const sharedSites = ref([]);
const loading = ref(true);
const loadingShared = ref(false);
const loadingSite = ref('');
const error = ref('');
const deleteConfirm = ref('');
const deleting = ref('');
const shareTarget = ref(null);
const historyTarget = ref(null);

function liveUrlForUser(userId) {
  const rc = getRepoConfig();
  if (!rc?.owner || !rc?.repo) return '';
  return `https://${rc.owner}.github.io/${rc.repo}/sites/${userId}/`;
}

const liveBaseUrl = computed(() => liveUrlForUser(props.userId));

onMounted(async () => {
  try {
    // Fetch from sidecar, GitHub repo, and Firestore in parallel
    const [local, repo, meta] = await Promise.all([
      listSites(props.userId).catch(() => []),
      listRepoSites(props.userId).catch(() => []),
      listUserSitesMeta(props.userId).catch(() => ({})),
    ]);
    // Merge: local wins on duplicates (has richer metadata from brief.json),
    // BUT if the local entry came from the sidecar's GitHub fallback (i.e. no
    // files actually on disk — which is the norm on Cloud Run since instances
    // scale to zero), the repo entry has the real page list. Prefer it.
    const bySlug = new Map();
    for (const s of repo) bySlug.set(s.slug, s);
    for (const s of local) {
      const existing = bySlug.get(s.slug);
      const localIsEmpty = !s.pages || s.pages.length === 0;
      if (existing && localIsEmpty && existing.pages?.length > 0) {
        // Keep the repo entry's pages, but fold in any local-only metadata
        bySlug.set(s.slug, { ...existing, ...s, pages: existing.pages, source: existing.source || 'github' });
      } else {
        bySlug.set(s.slug, s);
      }
    }
    // Enrich with Firestore metadata (timestamps, title)
    for (const [slug, site] of bySlug) {
      const m = meta[slug];
      if (m) {
        if (m.updatedAt?.toDate) site.updatedAt = m.updatedAt.toDate().toISOString();
        else if (m.updatedAt) site.updatedAt = m.updatedAt;
        if (m.createdAt?.toDate) site.createdAt = m.createdAt.toDate().toISOString();
        else if (m.createdAt) site.createdAt = m.createdAt;
        if (m.title && !site.title) site.title = m.title;
        if (m.builderName) site.builderName = m.builderName;
        if (m.builderKey) site.builderKey = m.builderKey;
      }
    }
    // Sort by most recently updated/created first
    const allSites = [...bySlug.values()];
    allSites.sort((a, b) => {
      const aDate = a.updatedAt || a.createdAt || '';
      const bDate = b.updatedAt || b.createdAt || '';
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return new Date(bDate) - new Date(aDate);
    });
    sites.value = allSites;
  } catch (err) {
    console.warn('[MySites] Could not fetch sites:', err.message);
    error.value = err.message;
  } finally {
    loading.value = false;
  }
});

async function viewSite(site) {
  loadingSite.value = site.title;
  // For GitHub-sourced sites, fetch via repo proxy; for local, use sidecar
  const fetchFile = site.source === 'github'
    ? (file) => getRepoFile(props.userId, site.slug, file)
    : (file) => getSiteFile(props.userId, site.slug, file);
  try {
    // Fetch all pages HTML in parallel
    const pageEntries = await Promise.all(
      site.pages.map(async (page) => {
        const html = await fetchFile(`${page}.html`);
        return [page, html];
      })
    );

    // Inline CSS (fetch via same source as pages)
    const cssFetch = async (href) => { try { return await fetchFile(href); } catch { return ''; } };
    const { pages, combinedCss } = await inlineCssAsync(pageEntries, cssFetch);

    const sorted = sortSlugs(site.pages);
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

function openUrl(url) {
  window.open(url, '_blank');
}

async function openShareModal(site) {
  // Ensure site metadata exists in Firestore before opening modal
  await saveSiteMetadata(props.userId, site.slug, {
    ownerEmail: props.userEmail,
    ownerName: props.userName,
    title: site.title,
    liveUrl: liveBaseUrl.value ? liveBaseUrl.value + site.slug + '/' : '',
  });
  shareTarget.value = site;
}

async function switchToShared() {
  if (sharedSites.value.length === 0 && props.userEmail && !loadingShared.value) {
    loadingShared.value = true;
    activeTab.value = 'shared';
    try {
      const raw = await getSharedSites(props.userEmail);
      // Enrich each shared site with page list and live URL from GitHub
      sharedSites.value = await Promise.all(raw.map(async (site) => {
        const base = liveUrlForUser(site.ownerUid);
        const enriched = {
          ...site,
          liveUrl: base ? base + site.siteSlug + '/' : site.liveUrl || '',
          pages: [],
        };
        try {
          const files = await listRepoFiles(site.ownerUid, site.siteSlug);
          const fileList = Array.isArray(files) ? files : (files?.files || []);
          enriched.pages = fileList
            .filter(f => (f.name || f).toString().endsWith('.html'))
            .map(f => (f.name || f).toString().replace('.html', ''));
        } catch {}
        // Derive display title from slug if missing
        if (!enriched.title) {
          enriched.title = (site.siteSlug || '')
            .replace(/-[a-z0-9]{5}$/, '')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
        }
        return enriched;
      }));
    } finally {
      loadingShared.value = false;
    }
  } else {
    activeTab.value = 'shared';
  }
}

async function viewSharedSite(site) {
  loadingSite.value = site.title || site.siteSlug;
  try {
    // Use GitHub repo for shared sites (other user's files aren't on our sidecar)
    const fetchFile = (file) => getRepoFile(site.ownerUid, site.siteSlug, file);

    // Discover pages from the enriched page list, fall back to index
    let allPages = site.pages && site.pages.length > 0 ? site.pages : ['index'];

    // Fetch all pages
    const allEntries = await Promise.all(
      allPages.map(async (page) => {
        try {
          const html = await fetchFile(`${page}.html`);
          return [page, html];
        } catch { return null; }
      })
    );
    const validPages = allEntries.filter(Boolean);

    // Inline CSS
    const cssFetch = async (href) => { try { return await fetchFile(href); } catch { return ''; } };
    const { pages, combinedCss } = await inlineCssAsync(validPages, cssFetch);

    const sorted = sortSlugs(allPages);
    const siteJson = JSON.stringify({
      title: site.title || site.siteSlug,
      description: '',
      pages: sorted.map(s => ({ slug: s, title: s.charAt(0).toUpperCase() + s.slice(1) }))
    });

    emit('view-site', {
      siteJson,
      pages,
      css: combinedCss,
      slugs: sorted,
      userId: site.ownerUid,
      siteSlug: site.siteSlug,
    });
  } catch (err) {
    console.error('[MySites] Failed to load shared site:', err);
    error.value = `Could not load site: ${err.message}`;
  } finally {
    loadingSite.value = '';
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
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  padding: 2rem 1.25rem 6rem;
}
/* Welcome banner */
.welcome-banner {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.25rem;
}
.welcome-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: 0 3px 12px rgba(0,0,0,0.1);
}
.welcome-text h1 { font-size: 1.6rem; margin-bottom: 0.15rem; color: var(--text); font-weight: 700; }
.welcome-tagline { color: var(--text-muted); font-size: 0.92rem; line-height: 1.4; }
.my-sites .subtitle { color: var(--text-muted); margin-bottom: 1.5rem; line-height: 1.6; font-size: 1rem; }

/* Tabs */
.site-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 1.25rem;
  border-bottom: 2px solid var(--border);
}
.site-tab {
  background: none;
  border: none;
  padding: 0.6rem 1rem;
  font-size: 0.9rem;
  font-family: inherit;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: color 0.15s, border-color 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.site-tab:hover { color: var(--primary); }
.site-tab.active { color: var(--primary); border-bottom-color: var(--primary); }
.tab-badge {
  background: var(--primary);
  color: white;
  font-size: 0.7rem;
  padding: 0.1rem 0.45rem;
  border-radius: 10px;
  font-weight: 700;
}
.owner-badge {
  font-size: 0.72rem;
  color: var(--text-muted);
  background: var(--bg);
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

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
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.site-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
}
.site-card:hover {
  border-color: var(--primary-light);
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}
.site-card-body {
  padding: 1rem 1.25rem 1.25rem;
}

/* Iframe thumbnail */
.site-thumbnail {
  position: relative;
  width: 100%;
  height: 200px;
  overflow: hidden;
  cursor: pointer;
  background: var(--bg, #f5f5f5);
}
.site-thumbnail iframe {
  width: 1280px;
  height: 800px;
  transform: scale(0.234375); /* 300/1280 */
  transform-origin: top left;
  border: none;
  pointer-events: none;
}
.site-thumbnail .thumbnail-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0);
  transition: background 0.2s;
}
.site-thumbnail:hover .thumbnail-overlay {
  background: rgba(0,0,0,0.35);
}
.site-thumbnail .thumbnail-open {
  opacity: 0;
  color: #fff;
  font-weight: 600;
  font-size: 0.95rem;
  padding: 0.4rem 1rem;
  border-radius: var(--radius);
  background: var(--primary);
  transition: opacity 0.2s;
}
.site-thumbnail:hover .thumbnail-open {
  opacity: 1;
}
.site-thumbnail-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
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
.site-meta-created { opacity: 0.7; }

.builder-badge {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 8px;
  margin-bottom: 0.4rem;
  background: var(--primary-soft);
  color: var(--primary);
}
.builder-badge.wasm { background: #E8F5E9; color: #2E7D32; }
.builder-badge.messages { background: var(--primary-soft); color: var(--primary); }
.builder-badge.messages-byok { background: #FFF3E0; color: #E65100; }
.builder-badge.openai-byok { background: #E3F2FD; color: #1565C0; }

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

.btn-new-top {
  width: 100%;
  margin-bottom: 1rem;
}

.new-site-section {
  text-align: center;
  padding-top: 0.5rem;
}

@media (max-width: 600px) {
  .my-sites { padding: 1.5rem 1rem 5.5rem; }
  .welcome-avatar { width: 52px; height: 52px; }
  .welcome-text h1 { font-size: 1.35rem; }
  .welcome-tagline { font-size: 0.85rem; }
  .site-grid { grid-template-columns: 1fr; }
  .site-card:hover { transform: none; } /* Disable hover lift on mobile (touch devices) */
  .site-thumbnail { height: 160px; }
  .site-actions { flex-wrap: wrap; }
  .btn-sm { padding: 0.45rem 0.85rem; font-size: 0.85rem; }
  .new-site-section .btn-primary { width: 100%; }
}
</style>
