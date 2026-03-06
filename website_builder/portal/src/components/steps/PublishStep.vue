<template>
  <div class="step">
    <h1>Your website is ready!</h1>
    <p class="subtitle" v-if="saving">Saving your website...</p>
    <p class="subtitle" v-else-if="saved">Your website has been saved and is ready to share.</p>
    <p class="subtitle" v-else>Download your website files or view the live preview.</p>

    <!-- Saved confirmation with live link -->
    <div v-if="saved" class="success-card">
      <div class="success-icon">🎉</div>
      <h2>Website published!</h2>
      <p class="success-pages">{{ pageCount }} page{{ pageCount !== 1 ? 's' : '' }} saved</p>
      <a v-if="previewUrl" :href="previewUrl" target="_blank" class="live-url">{{ previewUrl }}</a>
      <p v-if="isLive" class="live-note">Your site is live on GitHub Pages. It may take up to 30 seconds for changes to appear.</p>
      <p v-else-if="previewUrl" class="live-note">Preview link (works while the local server is running).</p>
    </div>

    <!-- Save error (non-blocking) -->
    <div v-if="saveError" class="error-box">
      Save failed: {{ saveError }}. Your files are still available to download below.
    </div>

    <!-- Actions -->
    <div class="actions-card">
      <button class="btn-primary download-btn" @click="downloadFiles">
        ⬇️ Download website files
      </button>
      <button v-if="previewUrl" class="btn-secondary download-btn" @click="openPreview">
        ↗ Open in new tab
      </button>
    </div>

    <!-- Tip for custom domain -->
    <div v-if="isLive" class="info-box">
      <p>To use a custom domain, configure it in your GitHub repository's Pages settings.</p>
    </div>

    <div class="nav-btns">
      <button class="btn-secondary" @click="$emit('back')">← Back to preview</button>
      <button class="btn-primary" @click="$emit('restart')">Make another site</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { saveSite, siteFileUrl, getRepoConfig } from '../../api.js';

const props = defineProps({
  generated: { type: Object, required: true }
});
defineEmits(['back', 'restart']);

const saving = ref(false);
const saved = ref(false);
const saveError = ref('');
const liveUrl = ref('');

const pageCount = computed(() => Object.keys(props.generated?.pages || {}).length);

const previewUrl = computed(() => {
  // Prefer the live GitHub Pages URL
  if (liveUrl.value) return liveUrl.value;
  if (props.generated?.liveUrl) return props.generated.liveUrl;
  // Try to construct GitHub Pages URL from repo config
  const rc = getRepoConfig();
  const { userId, siteSlug } = props.generated || {};
  if (rc?.owner && rc?.repo && userId && siteSlug) {
    return `https://${rc.owner}.github.io/${rc.repo}/sites/${userId}/${siteSlug}/`;
  }
  // Fallback to sidecar preview (uses API_BASE so works with Cloud Run)
  if (!userId || !siteSlug) return '';
  return siteFileUrl(userId, siteSlug, 'index.html');
});

const isLive = computed(() => {
  const rc = getRepoConfig();
  return !!(liveUrl.value || props.generated?.liveUrl || (rc?.owner && rc?.repo));
});

onMounted(async () => {
  // If already saved (has userId/siteSlug), mark as saved
  if (props.generated?.userId && props.generated?.siteSlug) {
    saved.value = true;
    liveUrl.value = props.generated.liveUrl || '';
    return;
  }

  // Otherwise try to save now
  if (props.generated?.pages) {
    saving.value = true;
    try {
      const siteName = extractSiteName();
      const result = await saveSite({
        user: 'default',
        siteName,
        pages: props.generated.pages,
        css: props.generated.css,
        siteJson: props.generated.siteJson,
        description: siteName,
        repoConfig: getRepoConfig(),
      });
      saved.value = true;
      liveUrl.value = result.liveUrl || '';
      // Propagate save info back so it's available if user goes back/forward
      if (props.generated) {
        props.generated.userId = result.userId;
        props.generated.siteSlug = result.siteSlug;
        props.generated.liveUrl = result.liveUrl || '';
      }
    } catch (err) {
      saveError.value = err.message;
    } finally {
      saving.value = false;
    }
  }
});

function extractSiteName() {
  try {
    const site = JSON.parse(props.generated?.siteJson || '{}');
    return site.title || 'my-website';
  } catch {
    return 'my-website';
  }
}

function openPreview() {
  if (previewUrl.value) window.open(previewUrl.value, '_blank');
}

function downloadFiles() {
  if (!props.generated) return;
  const { pages, css, slugs } = props.generated;

  for (const slug of (slugs || Object.keys(pages || {}))) {
    const html = pages?.[slug];
    if (html) downloadString(`${slug}.html`, html, 'text/html');
  }

  if (css) downloadString('style.css', css, 'text/css');
}

function downloadString(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<style scoped>
.success-card {
  text-align: center;
  background: var(--surface);
  border: 1.5px solid #B2DFDB;
  border-radius: var(--radius);
  padding: 2rem 1.5rem;
  margin-bottom: 1.5rem;
}
.success-icon { font-size: 3rem; margin-bottom: 0.75rem; }
.success-card h2 { margin-bottom: 0.5rem; }
.success-pages { font-size: 0.9rem; color: var(--text-muted); margin-bottom: 0.75rem; }
.live-url {
  display: block;
  color: var(--primary);
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  word-break: break-all;
}
.live-note { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem; }

.actions-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}
.download-btn { width: 100%; }

.info-box {
  background: #EFF8FF;
  border: 1px solid #B3D7FF;
  border-radius: var(--radius);
  padding: 1.25rem;
  margin-bottom: 1rem;
}
.info-box p { font-size: 0.9rem; color: #1A5276; margin: 0; }

.error-box {
  background: #FFF0F0;
  border: 1px solid #FFB3B3;
  border-radius: 8px;
  padding: 0.85rem;
  font-size: 0.9rem;
  color: #CC0000;
  margin-bottom: 1rem;
}
</style>
