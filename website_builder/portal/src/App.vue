<template>
  <div class="app">
    <!-- API Key banner if missing -->
    <div v-if="showApiKeyBanner" class="api-key-banner">
      <span>You'll need an AI key to build websites.</span>
      <button @click="showSettings = true">Set up</button>
    </div>

    <!-- Settings overlay -->
    <div v-if="showSettings" class="overlay" @click.self="showSettings = false">
      <div class="settings-panel">
        <div class="settings-header">
          <h2>Settings</h2>
          <button class="settings-close" @click="showSettings = false">&times;</button>
        </div>
        <div class="settings-body">
          <label>Your AI Key</label>
          <input
            v-model="apiKeyInput"
            type="text"
            inputmode="text"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder="AIza..."
            class="api-key-masked"
            @keydown.enter="saveKey"
          />
          <p class="hint">Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank">Google AI Studio</a>. Your key stays on your device.</p>

          <!-- Publishing (collapsible) -->
          <div class="settings-section">
            <button class="section-toggle" @click="showPublishing = !showPublishing">
              <span>Where your website goes</span>
              <SvgIcon name="chevron-down" :size="14" class="toggle-arrow" :class="{ open: showPublishing }" />
            </button>
            <div v-if="showPublishing" class="section-content">
              <p class="hint" style="margin-top:0">Set a custom GitHub repo for your published sites. Leave blank to use the default.</p>
              <label>GitHub Owner / Org</label>
              <input
                v-model="repoOwner"
                type="text"
                placeholder="e.g. my-github-username"
              />
              <label style="margin-top:0.5rem">Repository Name</label>
              <input
                v-model="repoName"
                type="text"
                placeholder="e.g. my-websites"
              />
              <p class="hint">Sites will be published to <code>https://&lt;owner&gt;.github.io/&lt;repo&gt;/</code></p>
            </div>
          </div>

          <!-- Advanced (collapsible) -->
          <div class="settings-section">
            <button class="section-toggle" @click="showAdvanced = !showAdvanced">
              <span>Extra options</span>
              <SvgIcon name="chevron-down" :size="14" class="toggle-arrow" :class="{ open: showAdvanced }" />
            </button>
            <div v-if="showAdvanced" class="section-content">
              <label>Contact Form Sheet ID</label>
              <input
                v-model="formSheetId"
                type="text"
                placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
              />
              <p class="hint">Share your sheet with: <code style="font-size:0.7em;word-break:break-all">ailang-dev-website-builder@ailang-multivac-dev.iam.gserviceaccount.com</code></p>

              <template v-if="messagesEnabled">
                <label style="margin-top:0.75rem">Build Mode</label>
                <div class="build-mode-toggle">
                  <label class="radio-label">
                    <input type="radio" v-model="buildMode" value="wasm" />
                    Browser (Gemini)
                    <span class="hint" style="display:block;margin:0">Builds in your browser using AILANG WASM + Gemini API</span>
                  </label>
                  <label class="radio-label">
                    <input type="radio" v-model="buildMode" value="messages" />
                    AILANG Cloud
                    <span class="hint" style="display:block;margin:0">Sends brief to AILANG Cloud for higher-quality generation</span>
                  </label>
                </div>
              </template>
            </div>
          </div>

          <div class="btn-row">
            <button class="btn-secondary btn-text" @click="clearKey">Remove key</button>
            <button class="btn-primary" @click="saveKey">Save</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Auth gate -->
    <AuthGate v-if="!authed" @signed-in="handleSignIn" @skip="handleSkipAuth" />

    <!-- Authenticated: global header + content -->
    <template v-else>
      <header class="wizard-header">
        <span class="logo" @click="showDashboard = true" style="cursor:pointer">
          <svg class="logo-icon" width="22" height="22" viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="ailg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#e73c17"/><stop offset="100%" stop-color="#c08015"/></linearGradient></defs><polygon points="488,256 372,457 140,457 24,256 140,55 372,55" fill="url(#ailg)"/><polygon points="456,256 356,429 156,429 56,256 156,83 356,83" fill="#0f1420"/><text x="256" y="252" text-anchor="middle" dominant-baseline="central" font-family="Georgia,serif" font-size="290" fill="#fff" opacity="0.95">&#x03BB;</text></svg>
          Mum's Website Builder
        </span>
        <div class="header-actions">
          <button class="icon-btn" title="Settings" @click="showSettings = true"><SvgIcon name="settings" :size="20" /></button>
          <div v-if="user" class="user-menu-wrap">
            <button class="icon-btn" title="Account" @click="showUserMenu = !showUserMenu"><SvgIcon name="user" :size="20" /></button>
            <div v-if="showUserMenu" class="user-menu" @click="showUserMenu = false">
              <div class="user-menu-info">
                <span class="user-menu-name">{{ user.displayName || 'Signed in' }}</span>
                <span class="user-menu-email">{{ user.email }}</span>
              </div>
              <button class="user-menu-item" @click="handleSignOut">Sign out</button>
            </div>
          </div>
          <button v-else class="btn-sign-in" @click="handleHeaderSignIn">Sign in</button>
        </div>
      </header>

      <!-- Dashboard: show existing sites (if any) before wizard -->
      <MySites
        v-if="showDashboard"
        :user-id="userId"
        :user-email="user?.email || ''"
        :user-name="user?.displayName || ''"
        @new-site="showDashboard = false"
        @view-site="handleViewSite"
      />

      <!-- Main wizard -->
      <div v-else class="wizard">

      <!-- Step progress bar -->
      <div class="step-bar">
        <div
          v-for="(label, i) in steps"
          :key="i"
          class="step-bar-item"
          :class="{ active: currentStep === i, done: currentStep > i, clickable: currentStep > i }"
          @click="currentStep > i && (currentStep = i)"
        >
          <div class="step-bar-circle">
            <SvgIcon v-if="currentStep > i" name="check" :size="14" class="step-check" />
            <span v-else>{{ i + 1 }}</span>
          </div>
          <span class="step-bar-label">{{ label }}</span>
        </div>
      </div>

      <!-- Step content -->
      <div class="step-content">
        <DescribeStep
          v-if="currentStep === 0"
          :description="data.description"
          @next="(desc) => { data.description = desc; currentStep = 1 }"
        />
        <UploadStep
          v-else-if="currentStep === 1"
          :items="data.items"
          @next="(items) => { data.items = items; currentStep = 2 }"
          @back="currentStep = 0"
        />
        <StyleStep
          v-else-if="currentStep === 2"
          :style-id="data.styleId"
          :custom-notes="data.customNotes"
          @next="(styleId, notes) => { data.styleId = styleId; data.customNotes = notes; currentStep = 3 }"
          @back="currentStep = 1"
        />
        <BuildStep
          v-else-if="currentStep === 3"
          :data="data"
          :build-mode="buildMode"
          :user-id="userId"
          @done="(result) => { data.generated = result; currentStep = 4 }"
          @back="currentStep = 2"
        />
        <PreviewStep
          v-else-if="currentStep === 4"
          :generated="data.generated"
          :description="data.description"
          :site-json="data.generated?.siteJson"
          :items="data.items"
          :owner-uid="data.generated?.userId || userId"
          :user-email="user?.email || ''"
          :user-name="user?.displayName || ''"
          @publish="currentStep = 5"
          @rebuild="currentStep = 3"
          @update-generated="(g) => data.generated = g"
          @dashboard="showDashboard = true"
        />
        <PublishStep
          v-else-if="currentStep === 5"
          :generated="data.generated"
          :user-id="userId"
          :user-name="user?.displayName || ''"
          :user-email="user?.email || ''"
          @back="currentStep = 4"
          @edit="currentStep = 0"
          @restart="restart"
        />
      </div>
    </div>
      <footer class="app-footer">
        <div class="footer-links">
          <a href="https://www.sunholo.com" target="_blank">sunholo.com</a>
          <span class="footer-sep">|</span>
          <a href="https://www.sunholo.com/ailang-demos/" target="_blank">Demos</a>
          <span class="footer-sep">|</span>
          <a href="https://ailang.sunholo.com" target="_blank">AILANG</a>
        </div>
        <div class="footer-copy">
          <svg class="footer-logo" width="16" height="16" viewBox="0 0 300 300" aria-hidden="true"><circle cx="107" cy="150" r="80" fill="#f9a697" opacity="0.3"/><circle cx="130" cy="150" r="80" fill="#e73c17" opacity="0.3"/><circle cx="153" cy="150" r="80" fill="#e73c17"/></svg>
          <span>&copy; 2026 Holosun ApS</span>
        </div>
      </footer>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import SvgIcon from './components/SvgIcon.vue';
import AuthGate from './components/AuthGate.vue';
import MySites from './components/MySites.vue';
import DescribeStep from './components/steps/DescribeStep.vue';
import UploadStep from './components/steps/UploadStep.vue';
import StyleStep from './components/steps/StyleStep.vue';
import BuildStep from './components/steps/BuildStep.vue';
import PreviewStep from './components/steps/PreviewStep.vue';
import PublishStep from './components/steps/PublishStep.vue';
import { onAuthChange, signOutUser, signInWithGoogle, getUserSettings, saveUserSettings, getSiteMetadata } from './firebase.js';
import { getApiKey, saveApiKey, clearApiKey } from './ailang.js';
import { getRepoConfig, saveRepoConfig, clearRepoConfig, getFormSheetId, saveFormSheetId } from './api.js';

const authed = ref(false);
const user = ref(null);
const showDashboard = ref(true); // show MySites first, then wizard
const currentStep = ref(0);
const showSettings = ref(false);
const apiKeyInput = ref('');
const repoOwner = ref('');
const repoName = ref('');
const formSheetId = ref('');
const buildMode = ref('wasm'); // 'wasm' or 'messages'
const messagesEnabled = ref(false); // admin-set, read-only for users
const showPublishing = ref(false); // collapsible settings section
const showAdvanced = ref(false); // collapsible settings section
const showUserMenu = ref(false); // user account dropdown
const pendingSharedSite = ref(''); // ?shared=ownerUid_siteSlug from URL

// User identity: Firebase uid when logged in, 'default' for local dev (skip auth)
const userId = computed(() => user.value?.uid || 'default');

// Close user menu when clicking outside
function closeUserMenu(e) {
  if (showUserMenu.value && !e.target.closest('.user-menu-wrap')) {
    showUserMenu.value = false;
  }
}
onMounted(() => document.addEventListener('click', closeUserMenu));
onUnmounted(() => document.removeEventListener('click', closeUserMenu));

const steps = ['Describe', 'Upload', 'Style', 'Build', 'Preview', 'Publish'];

const data = ref({
  description: '',
  items: [],       // { type: 'image'|'text', ... }
  styleId: 'warm',
  customNotes: '',
  generated: null  // { siteJson, pages: { slug: html }, css }
});

const showApiKeyBanner = computed(() => {
  return authed.value && !getApiKey() && !showSettings.value;
});

onMounted(() => {
  apiKeyInput.value = getApiKey();
  formSheetId.value = getFormSheetId();
  const rc = getRepoConfig();
  if (rc) {
    repoOwner.value = rc.owner || '';
    repoName.value = rc.repo || '';
  }
  // Check for ?shared= URL parameter
  const params = new URLSearchParams(window.location.search);
  const sharedParam = params.get('shared');
  if (sharedParam) {
    pendingSharedSite.value = sharedParam;
    // Clean URL without reload
    const url = new URL(window.location);
    url.searchParams.delete('shared');
    history.replaceState({}, '', url.pathname + url.search);
  }
  // Listen for auth changes — load Firestore settings on sign-in
  onAuthChange(async (u) => {
    user.value = u;
    if (u) {
      authed.value = true;
      const settings = await getUserSettings(u.uid);
      if (settings) {
        // Merge Firestore → localStorage (Firestore wins)
        if (settings.geminiApiKey) { saveApiKey(settings.geminiApiKey); apiKeyInput.value = settings.geminiApiKey; }
        if (settings.repoConfig) { saveRepoConfig(settings.repoConfig); repoOwner.value = settings.repoConfig.owner || ''; repoName.value = settings.repoConfig.repo || ''; }
        if (settings.formSheetId) { saveFormSheetId(settings.formSheetId); formSheetId.value = settings.formSheetId; }
        if (settings.buildMode) buildMode.value = settings.buildMode;
        if (settings.messagesEnabled) messagesEnabled.value = true;
      }
      // Handle pending shared site link
      if (pendingSharedSite.value) {
        await openSharedSite(pendingSharedSite.value);
        pendingSharedSite.value = '';
      }
    }
  });
});

async function handleSignIn(u) {
  user.value = u;
  authed.value = true;
  showDashboard.value = true;
  // Settings loaded by onAuthChange listener
}

async function handleSkipAuth() {
  authed.value = true;
  showDashboard.value = true;
  // Handle pending shared site in dev mode
  if (pendingSharedSite.value) {
    await openSharedSite(pendingSharedSite.value);
    pendingSharedSite.value = '';
  }
}

async function handleHeaderSignIn() {
  try {
    const u = await signInWithGoogle();
    if (u) handleSignIn(u);
  } catch (err) {
    console.warn('[App] Sign-in failed:', err.message);
  }
}

async function handleSignOut() {
  await signOutUser();
  authed.value = false;
  user.value = null;
  restart();
}

async function saveKey() {
  if (apiKeyInput.value.trim()) {
    saveApiKey(apiKeyInput.value);
  }
  // Save repo config if either field is set
  const rc = (repoOwner.value.trim() || repoName.value.trim())
    ? { owner: repoOwner.value.trim() || undefined, repo: repoName.value.trim() || undefined }
    : null;
  if (rc) { saveRepoConfig(rc); } else { clearRepoConfig(); }
  saveFormSheetId(formSheetId.value);

  // Persist to Firestore if signed in
  if (user.value?.uid) {
    await saveUserSettings(user.value.uid, {
      geminiApiKey: apiKeyInput.value.trim() || null,
      repoConfig: rc || null,
      formSheetId: formSheetId.value.trim() || null,
      buildMode: buildMode.value,
    });
  }
  showSettings.value = false;
}

function clearKey() {
  clearApiKey();
  apiKeyInput.value = '';
}

function handleViewSite(generated) {
  data.value.generated = generated;
  showDashboard.value = false;
  currentStep.value = 4; // jump straight to PreviewStep
}

async function openSharedSite(docId) {
  // docId format: ownerUid_siteSlug
  const sepIdx = docId.indexOf('_');
  if (sepIdx < 1) return;
  const ownerUid = docId.substring(0, sepIdx);
  const siteSlug = docId.substring(sepIdx + 1);
  try {
    // Verify we have access via Firestore metadata
    const meta = await getSiteMetadata(ownerUid, siteSlug);
    if (!meta) {
      console.warn('[App] Shared site not found:', docId);
      return;
    }
    // Load site into preview (same as handleViewSite but with ownerUid)
    const filesRes = await fetch(`/api/files/${encodeURIComponent(ownerUid)}/${encodeURIComponent(siteSlug)}`);
    if (!filesRes.ok) return;
    const { files } = await filesRes.json();
    const htmlFiles = files.filter(f => f.ext === '.html').map(f => f.name.replace('.html', ''));
    const base = `/api/sites/${encodeURIComponent(ownerUid)}/${encodeURIComponent(siteSlug)}`;
    const pageEntries = await Promise.all(
      htmlFiles.map(async (page) => {
        try {
          const r = await fetch(`${base}/${page}.html`);
          return r.ok ? [page, await r.text()] : null;
        } catch { return null; }
      })
    );
    const validPages = pageEntries.filter(Boolean);
    const pages = Object.fromEntries(validPages);
    const sorted = [...htmlFiles].sort((a, b) => {
      if (a === 'index' || a === 'home') return -1;
      if (b === 'index' || b === 'home') return 1;
      return a.localeCompare(b);
    });
    data.value.generated = {
      siteJson: JSON.stringify({ title: meta.title || siteSlug, pages: sorted.map(s => ({ slug: s })) }),
      pages,
      css: '',
      slugs: sorted,
      userId: ownerUid,
      siteSlug,
    };
    showDashboard.value = false;
    currentStep.value = 4;
  } catch (err) {
    console.warn('[App] Failed to open shared site:', err.message);
  }
}

function restart() {
  currentStep.value = 0;
  showDashboard.value = true;
  data.value = {
    description: '',
    items: [],
    styleId: 'warm',
    customNotes: '',
    generated: null
  };
}
</script>

<style>
/* ── Design Tokens ─────────────────────────────────────────────────────────── */
:root {
  --primary: #6B52A3;
  --primary-light: #8E77C0;
  --primary-soft: #F0EBF8;
  --accent: #E8A87C;
  --accent-light: #FFF4ED;
  --success: #4AA675;
  --success-light: #EDFAF2;
  --bg: #FAF8F5;
  --surface: #FFFFFF;
  --text: #33302E;
  --text-muted: #8A847E;
  --border: #E8E4DF;
  --radius: 14px;
  --shadow: 0 2px 16px rgba(0,0,0,0.06);
  --shadow-elevated: 0 8px 32px rgba(0,0,0,0.1);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}

.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ── API key banner ────────────────────────────────────────────────────────── */
.api-key-banner {
  background: var(--accent-light);
  border-bottom: 1px solid #F0D4BB;
  padding: 0.65rem 1rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 0.9rem;
  color: var(--text);
}
.api-key-banner button {
  background: var(--accent);
  color: white;
  border: none;
  padding: 0.35rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  transition: opacity 0.15s;
}
.api-key-banner button:hover { opacity: 0.85; }

/* ── Settings overlay ──────────────────────────────────────────────────────── */
.overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.settings-panel {
  background: var(--surface);
  border-radius: var(--radius);
  width: 100%;
  max-width: 420px;
  max-height: 90vh;
  box-shadow: var(--shadow-elevated);
  display: flex;
  flex-direction: column;
}
.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem 0;
}
.settings-header h2 { margin: 0; font-size: 1.2rem; }
.settings-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  line-height: 1;
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.settings-close:hover { background: var(--bg); color: var(--text); }
.settings-body {
  padding: 1rem 1.5rem 1.5rem;
  overflow-y: auto;
  flex: 1;
}
.settings-panel label { display: block; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.4rem; font-weight: 500; }
.settings-panel input {
  width: 100%;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  padding: 0.75rem;
  font-size: 1rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.settings-panel input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.api-key-masked {
  -webkit-text-security: disc;
  text-security: disc;
}
.hint { font-size: 0.8rem; color: var(--text-muted); margin: 0.5rem 0 1rem; line-height: 1.5; }
.hint a { color: var(--primary); text-decoration: underline; text-underline-offset: 2px; }
.hint code { background: var(--bg); padding: 0.1rem 0.3rem; border-radius: 4px; font-size: 0.85em; }

/* Collapsible settings sections */
.settings-section { border-top: 1px solid var(--border); margin-top: 0.75rem; }
.section-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background: none;
  border: none;
  padding: 0.75rem 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
  font-family: inherit;
}
.section-toggle:hover { color: var(--primary); }
.toggle-arrow {
  font-size: 0.75rem;
  transition: transform 0.2s;
  color: var(--text-muted);
}
.toggle-arrow.open { transform: rotate(180deg); }
.section-content { padding-bottom: 0.5rem; }

/* Build mode toggle */
.build-mode-toggle { display: flex; flex-direction: column; gap: 0.5rem; }
.radio-label {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.6rem 0.8rem;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.95rem;
  transition: border-color 0.15s;
}
.radio-label:hover { border-color: var(--primary-light); }
.radio-label input[type="radio"] { margin-top: 0.15rem; accent-color: var(--primary); }

/* ── Wizard layout ─────────────────────────────────────────────────────────── */
.wizard {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
.wizard-header {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 0.8rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 10;
}
.logo {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--primary);
  padding: 0.25rem 0;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.logo-icon { flex-shrink: 0; }
.header-actions { display: flex; gap: 0.25rem; }
.icon-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0.4rem;
  border-radius: 8px;
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.icon-btn:hover { background: var(--bg); }
.btn-sign-in {
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 20px;
  padding: 0.4rem 1rem;
  font-size: 0.85rem;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
  min-height: 40px;
  transition: background 0.15s;
}
.btn-sign-in:hover { background: var(--primary-light); }

/* User account dropdown */
.user-menu-wrap { position: relative; }
.user-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  background: white;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-elevated);
  min-width: 200px;
  z-index: 100;
  overflow: hidden;
}
.user-menu-info {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
}
.user-menu-name {
  display: block;
  font-weight: 600;
  font-size: 0.9rem;
}
.user-menu-email {
  display: block;
  font-size: 0.8rem;
  color: var(--text-muted);
  word-break: break-all;
}
.user-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.65rem 1rem;
  background: none;
  border: none;
  font-size: 0.9rem;
  cursor: pointer;
  color: #CC0000;
  font-family: inherit;
}
.user-menu-item:hover { background: #FFF0F0; }

/* ── Step progress bar ─────────────────────────────────────────────────────── */
.step-bar {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  gap: 0;
  padding: 0.75rem 0.5rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.step-bar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  flex: 1;
  max-width: 90px;
  position: relative;
  transition: opacity 0.2s;
}
/* Connector line between steps */
.step-bar-item:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 14px;
  left: calc(50% + 16px);
  width: calc(100% - 32px);
  height: 2px;
  background: var(--border);
  transition: background 0.3s;
}
.step-bar-item.done:not(:last-child)::after {
  background: var(--success);
}
.step-bar-circle {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  background: var(--bg);
  color: var(--text-muted);
  border: 2px solid var(--border);
  transition: all 0.3s;
  position: relative;
  z-index: 1;
}
.step-bar-item.active .step-bar-circle {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
  box-shadow: 0 0 0 4px var(--primary-soft);
}
.step-bar-item.done .step-bar-circle {
  background: var(--success);
  color: white;
  border-color: var(--success);
}
.step-check { font-size: 0.8rem; line-height: 1; }
.step-bar-label {
  font-size: 0.65rem;
  font-weight: 500;
  color: var(--text-muted);
  text-align: center;
  line-height: 1.2;
  letter-spacing: 0.01em;
}
.step-bar-item.active .step-bar-label {
  color: var(--primary);
  font-weight: 700;
}
.step-bar-item.done .step-bar-label {
  color: var(--success);
}
.step-bar-item.clickable { cursor: pointer; }
.step-bar-item.clickable:hover .step-bar-circle { transform: scale(1.1); }

.step-content {
  flex: 1;
  overflow-y: auto;
}

/* ── Shared button styles ──────────────────────────────────────────────────── */
.btn-primary {
  background: var(--primary);
  color: white;
  border: none;
  padding: 0.85rem 1.8rem;
  border-radius: var(--radius);
  font-size: 1rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  min-height: 48px;
  transition: background 0.2s, transform 0.1s, box-shadow 0.2s;
  box-shadow: 0 2px 8px rgba(107,82,163,0.2);
}
.btn-primary:hover { background: var(--primary-light); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(107,82,163,0.3); }
.btn-primary:active { transform: translateY(0) scale(0.98); box-shadow: 0 1px 4px rgba(107,82,163,0.2); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }

.btn-secondary {
  background: transparent;
  color: var(--primary);
  border: 1.5px solid var(--border);
  padding: 0.85rem 1.8rem;
  border-radius: var(--radius);
  font-size: 1rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  min-height: 48px;
  transition: background 0.15s, border-color 0.15s;
}
.btn-secondary:hover { background: var(--primary-soft); border-color: var(--primary-light); }

.btn-text {
  border: none;
  background: none;
  padding: 0.5rem 1rem;
  min-height: auto;
  font-weight: 500;
  color: var(--text-muted);
}
.btn-text:hover { color: var(--primary); background: none; border: none; }

.btn-row {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
}

/* ── Shared step container ─────────────────────────────────────────────────── */
.step {
  max-width: 600px;
  margin: 0 auto;
  padding: 2rem 1.25rem 6rem;
}
.step h1 {
  font-size: 1.6rem;
  margin-bottom: 0.5rem;
  color: var(--text);
  font-weight: 700;
  letter-spacing: -0.01em;
}
.step .subtitle {
  color: var(--text-muted);
  margin-bottom: 1.5rem;
  line-height: 1.6;
  font-size: 1rem;
}

.nav-btns {
  display: flex;
  gap: 0.75rem;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 0.75rem 1rem;
  padding-bottom: calc(0.75rem + env(safe-area-inset-bottom));
  background: var(--surface);
  border-top: 1px solid var(--border);
  z-index: 5;
}
.nav-btns .btn-primary { flex: 1; }

/* ── Footer ────────────────────────────────────────────────────────────────── */
.app-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 1.5rem 1rem;
  padding-bottom: calc(1.5rem + env(safe-area-inset-bottom));
  font-size: 0.75rem;
  color: var(--text-muted);
}
.footer-links { display: flex; gap: 0.4rem; align-items: center; }
.footer-links a { color: var(--text-muted); text-decoration: none; }
.footer-links a:hover { color: var(--primary); text-decoration: underline; }
.footer-sep { opacity: 0.4; }
.footer-copy { display: flex; align-items: center; gap: 0.4rem; }
.footer-logo { flex-shrink: 0; }

/* ── Mobile responsive ─────────────────────────────────────────────────────── */
@media (max-width: 600px) {
  /* Settings: full-screen on mobile */
  .overlay { padding: 0; align-items: stretch; }
  .settings-panel {
    max-width: 100%;
    max-height: 100%;
    height: 100%;
    border-radius: 0;
  }
  .settings-header { padding: 1rem 1rem 0; }
  .settings-body { padding: 0.75rem 1rem 1.5rem; }

  /* Typography */
  .step h1 { font-size: 1.35rem; }
  .step .subtitle { font-size: 0.92rem; margin-bottom: 1.25rem; }

  /* Step container */
  .step { padding: 1.5rem 1rem 5.5rem; }

  /* Step bar: compact on mobile */
  .step-bar { padding: 0.6rem 0.25rem; }
  .step-bar-item { max-width: 70px; }
  .step-bar-circle { width: 24px; height: 24px; font-size: 0.7rem; }
  .step-bar-item:not(:last-child)::after { top: 12px; left: calc(50% + 12px); width: calc(100% - 24px); }
  .step-bar-label { font-size: 0.58rem; }

  /* Header */
  .wizard-header { padding: 0.6rem 0.75rem; }
  .logo { font-size: 1rem; }

  /* Navigation */
  .btn-primary, .btn-secondary { padding: 0.75rem 1rem; font-size: 0.95rem; }

  /* API key banner */
  .api-key-banner { font-size: 0.85rem; flex-wrap: wrap; gap: 0.5rem; padding: 0.5rem 0.75rem; }
}

@media (max-width: 360px) {
  .step-bar-label { display: none; }
  .step-bar-item { max-width: 50px; }
  .step { padding: 1.25rem 0.75rem 5.5rem; }
}
</style>
