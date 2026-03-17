<template>
  <div class="step">
    <h1>{{ saved && !deploying ? 'Your website is live!' : 'Your website is ready!' }}</h1>
    <p class="subtitle" v-if="saving">Saving your website...</p>
    <p class="subtitle" v-else-if="deploying">Almost there — your website is going live!</p>
    <p class="subtitle" v-else-if="saved">Share it with anyone using the link below.</p>
    <p class="subtitle" v-else>Download your website files or view the live preview.</p>

    <!-- Deploying spinner -->
    <div v-if="deploying" class="deploy-card">
      <div class="spinner"></div>
      <h2>Publishing your website</h2>
      <p class="deploy-note">{{ deployEstimate }}</p>
    </div>

    <!-- Saved confirmation with live link -->
    <div v-if="saved && !deploying" class="success-card">
      <div class="success-icon"><SvgIcon name="check-circle" :size="48" class="icon-success" /></div>
      <h2>Website published!</h2>
      <p class="success-pages">{{ pageCount }} page{{ pageCount !== 1 ? 's' : '' }} saved</p>
      <div v-if="previewUrl" class="url-row">
        <a :href="previewUrl" target="_blank" class="live-url">{{ previewUrl }}</a>
        <button class="copy-btn" @click="copyLink">
          <SvgIcon :name="copied ? 'check' : 'clipboard'" :size="16" /> {{ copied ? 'Copied!' : 'Copy link' }}
        </button>
      </div>
      <p v-if="isLive" class="live-note">Your site is live and anyone with the link can see it.</p>
      <p v-else-if="previewUrl" class="live-note">Preview link (works while the local server is running).</p>
    </div>

    <!-- Save error (non-blocking) -->
    <div v-if="saveError" class="error-box">
      Save failed: {{ saveError }}. Your files are still available to download below.
    </div>

    <!-- Actions -->
    <div class="actions-card">
      <button v-if="saved && !deploying" class="btn-primary action-btn" @click="showShareModal = true">
        <SvgIcon name="share" :size="18" /> Share with someone
      </button>
      <button v-if="previewUrl && !deploying" class="btn-secondary action-btn" @click="openPreview">
        <SvgIcon name="external-link" :size="18" /> Open in browser
      </button>
      <button class="btn-secondary action-btn" @click="downloadFiles">
        <SvgIcon name="download" :size="18" /> Download files
      </button>
    </div>

    <!-- Share modal -->
    <ShareModal
      v-if="showShareModal"
      :owner-uid="props.userId"
      :site-slug="props.generated?.siteSlug || ''"
      :site-title="extractSiteName()"
      :live-url="previewUrl"
      @close="showShareModal = false"
    />

    <div class="nav-btns">
      <button class="btn-secondary" @click="$emit('back')"><SvgIcon name="arrow-left" :size="16" /> Back to preview</button>
      <button class="btn-secondary" @click="$emit('edit')"><SvgIcon name="pencil" :size="16" /> Make changes</button>
      <button class="btn-primary" @click="$emit('restart')">Start a new website</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import SvgIcon from '../SvgIcon.vue';
import ShareModal from '../ShareModal.vue';
import { saveSite, siteFileUrl, getRepoConfig, API_BASE } from '../../api.js';
import { saveSiteMetadata } from '../../firebase.js';

const props = defineProps({
  generated: { type: Object, required: true },
  userId: { type: String, default: 'default' },
  userName: { type: String, default: '' },
  userEmail: { type: String, default: '' },
});
defineEmits(['back', 'restart', 'edit']);

const saving = ref(false);
const saved = ref(false);
const deploying = ref(false);
const saveError = ref('');
const liveUrl = ref('');
const copied = ref(false);
const showShareModal = ref(false);
let copiedTimer = null;

const pageCount = computed(() => Object.keys(props.generated?.pages || {}).length);

const previewUrl = computed(() => {
  if (liveUrl.value) return liveUrl.value;
  if (props.generated?.liveUrl) return props.generated.liveUrl;
  const rc = getRepoConfig();
  const { userId, siteSlug } = props.generated || {};
  if (rc?.owner && rc?.repo && userId && siteSlug) {
    return `https://${rc.owner}.github.io/${rc.repo}/sites/${userId}/${siteSlug}/`;
  }
  if (!userId || !siteSlug) return '';
  return siteFileUrl(userId, siteSlug, 'index.html');
});

const isLive = computed(() => {
  const rc = getRepoConfig();
  return !!(liveUrl.value || props.generated?.liveUrl || (rc?.owner && rc?.repo));
});

const isCloudBuild = computed(() => props.generated?.buildMode === 'messages');
const deployEstimate = computed(() =>
  isCloudBuild.value
    ? 'Cloud builds can take up to 10 minutes — hang tight!'
    : 'This usually takes less than 30 seconds...'
);
const deployMaxWait = computed(() => isCloudBuild.value ? 600000 : 60000);

onMounted(async () => {
  // Always re-save — pages may have been edited inline since last save
  if (props.generated?.pages) {
    saving.value = true;
    try {
      const siteName = extractSiteName();
      const result = await saveSite({
        user: props.userId || 'default',
        siteName,
        siteSlug: props.generated.siteSlug || undefined,
        pages: props.generated.pages,
        css: props.generated.css,
        siteJson: props.generated.siteJson,
        description: siteName,
        repoConfig: getRepoConfig(),
      });
      saved.value = true;
      saving.value = false;
      // Propagate save info back
      if (props.generated) {
        props.generated.userId = result.userId;
        props.generated.siteSlug = result.siteSlug;
        props.generated.liveUrl = result.liveUrl || '';
      }
      // Save site metadata to Firestore for sharing (must complete before Share button works)
      await saveSiteMetadata(result.userId, result.siteSlug, {
        ownerEmail: props.userEmail,
        ownerName: props.userName,
        title: siteName,
        liveUrl: buildGitHubPagesUrl(result.userId, result.siteSlug) || result.liveUrl || '',
        builderName: props.generated.builderName || '',
        builderKey: props.generated.builderKey || '',
      });

      const ghUrl = buildGitHubPagesUrl(result.userId, result.siteSlug);
      liveUrl.value = ghUrl || result.liveUrl || '';

      // Wait for GitHub Pages to deploy before showing "live" state
      if (ghUrl) {
        deploying.value = true;
        await waitForDeploy(ghUrl, deployMaxWait.value);
        deploying.value = false;
      }
    } catch (err) {
      saveError.value = err.message;
      saving.value = false;
    }
  }
});

// Poll GitHub Pages URL via sidecar proxy until the site is deployed (or timeout).
// GitHub Pages typically deploys within 30s of a commit.
async function waitForDeploy(ghUrl, maxWait = 60000) {
  const start = Date.now();
  const interval = 4000;
  // Use sidecar to proxy-check the actual GitHub Pages URL (avoids CORS)
  const checkUrl = `${API_BASE}/check-deploy?url=${encodeURIComponent(ghUrl)}`;
  while (Date.now() - start < maxWait) {
    try {
      const res = await fetch(checkUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.live) return;
      }
    } catch {}
    await new Promise(r => setTimeout(r, interval));
  }
  // Timeout — show the link anyway, it'll be live shortly
}

function buildGitHubPagesUrl(userId, siteSlug) {
  const rc = getRepoConfig();
  const uid = userId || props.generated?.userId;
  const slug = siteSlug || props.generated?.siteSlug;
  if (rc?.owner && rc?.repo && uid && slug) {
    return `https://${rc.owner}.github.io/${rc.repo}/sites/${uid}/${slug}/`;
  }
  return '';
}

function extractSiteName() {
  try {
    const site = JSON.parse(props.generated?.siteJson || '{}');
    return site.title || 'my-website';
  } catch {
    return 'my-website';
  }
}

async function copyLink() {
  if (!previewUrl.value) return;
  try {
    await navigator.clipboard.writeText(previewUrl.value);
    copied.value = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { copied.value = false; }, 2000);
  } catch {
    // Fallback: select the URL text
    const el = document.querySelector('.live-url');
    if (el) {
      const range = document.createRange();
      range.selectNodeContents(el);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    }
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
.deploy-card {
  text-align: center;
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  padding: 2rem 1.5rem;
  margin-bottom: 1.5rem;
}
.deploy-card h2 { margin-bottom: 0.5rem; font-size: 1.1rem; }
.deploy-note { font-size: 0.9rem; color: var(--text-muted); }
.spinner {
  width: 40px; height: 40px;
  margin: 0 auto 1rem;
  border: 4px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.success-card {
  text-align: center;
  background: var(--success-light);
  border: 1.5px solid var(--success);
  border-radius: var(--radius);
  padding: 2rem 1.5rem;
  margin-bottom: 1.5rem;
}
.success-icon { margin-bottom: 0.75rem; }
.icon-success { color: var(--success); }
.success-card h2 { margin-bottom: 0.5rem; color: #2D6B4A; }
.success-pages { font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1rem; }

.url-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.live-url {
  display: block;
  color: var(--primary);
  font-size: 0.95rem;
  font-weight: 600;
  word-break: break-all;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.copy-btn {
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 10px;
  padding: 0.5rem 1.2rem;
  font-size: 0.9rem;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
  min-height: 44px;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.copy-btn:hover { background: var(--primary-light); }
.live-note { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem; }

.actions-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}
.action-btn { width: 100%; }

.info-box {
  background: var(--primary-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem;
  margin-bottom: 1rem;
}
.info-box p { font-size: 0.9rem; color: var(--text); margin: 0; }

.error-box {
  background: #FFF0F0;
  border: 1px solid #FFB3B3;
  border-radius: var(--radius);
  padding: 0.85rem;
  font-size: 0.9rem;
  color: #CC0000;
  margin-bottom: 1rem;
}

@media (max-width: 600px) {
  .deploy-card, .success-card { padding: 1.5rem 1rem; }
  .success-icon { margin-bottom: 0.5rem; }
  .live-url { font-size: 0.88rem; }
  .copy-btn { width: 100%; }
  .info-box { padding: 1rem; }
  .info-box p { font-size: 0.85rem; }
}
</style>
