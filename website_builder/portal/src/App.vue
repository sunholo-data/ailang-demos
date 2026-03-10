<template>
  <div class="app">
    <!-- API Key banner if missing -->
    <div v-if="showApiKeyBanner" class="api-key-banner">
      <span>⚠️ Gemini API key needed to generate websites.</span>
      <button @click="showSettings = true">Add Key</button>
    </div>

    <!-- Settings overlay -->
    <div v-if="showSettings" class="overlay" @click.self="showSettings = false">
      <div class="settings-panel">
        <div class="settings-header">
          <h2>Settings</h2>
          <button class="settings-close" @click="showSettings = false">&times;</button>
        </div>
        <div class="settings-body">
          <label>Gemini API Key</label>
          <input
            v-model="apiKeyInput"
            type="password"
            placeholder="AIza..."
            @keydown.enter="saveKey"
          />
          <p class="hint">Get a free key at <a href="https://aistudio.google.com" target="_blank">aistudio.google.com</a></p>

          <!-- Publishing (collapsible) -->
          <div class="settings-section">
            <button class="section-toggle" @click="showPublishing = !showPublishing">
              <span>Publishing</span>
              <span class="toggle-arrow" :class="{ open: showPublishing }">&#9662;</span>
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
              <span>Advanced</span>
              <span class="toggle-arrow" :class="{ open: showAdvanced }">&#9662;</span>
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
                    Cloud (Claude Code)
                    <span class="hint" style="display:block;margin:0">Sends brief to Claude Code for higher-quality generation</span>
                  </label>
                </div>
              </template>
            </div>
          </div>

          <div class="btn-row">
            <button class="btn-secondary" @click="clearKey">Clear</button>
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
        <span class="logo" @click="showDashboard = true" style="cursor:pointer">🌐 Website Builder</span>
        <div class="header-actions">
          <button class="icon-btn" title="Settings" @click="showSettings = true">⚙️</button>
          <div v-if="user" class="user-menu-wrap">
            <button class="icon-btn" title="Account" @click="showUserMenu = !showUserMenu">👤</button>
            <div v-if="showUserMenu" class="user-menu" @click="showUserMenu = false">
              <div class="user-menu-info">
                <span class="user-menu-name">{{ user.displayName || 'Signed in' }}</span>
                <span class="user-menu-email">{{ user.email }}</span>
              </div>
              <button class="user-menu-item" @click="handleSignOut">Sign out</button>
            </div>
          </div>
        </div>
      </header>

      <!-- Dashboard: show existing sites (if any) before wizard -->
      <MySites
        v-if="showDashboard"
        :user-id="userId"
        @new-site="showDashboard = false"
        @view-site="handleViewSite"
      />

      <!-- Main wizard -->
      <div v-else class="wizard">

      <!-- Step progress indicator -->
      <div class="step-dots">
        <span
          v-for="(label, i) in steps"
          :key="i"
          class="dot"
          :class="{ active: currentStep === i, done: currentStep > i }"
          :title="label"
        />
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
          @done="(result) => { data.generated = result; currentStep = 4 }"
          @back="currentStep = 2"
        />
        <PreviewStep
          v-else-if="currentStep === 4"
          :generated="data.generated"
          :description="data.description"
          :site-json="data.generated?.siteJson"
          :items="data.items"
          @publish="currentStep = 5"
          @rebuild="currentStep = 3"
          @update-generated="(g) => data.generated = g"
          @dashboard="showDashboard = true"
        />
        <PublishStep
          v-else-if="currentStep === 5"
          :generated="data.generated"
          @back="currentStep = 4"
          @restart="restart"
        />
      </div>
    </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import AuthGate from './components/AuthGate.vue';
import MySites from './components/MySites.vue';
import DescribeStep from './components/steps/DescribeStep.vue';
import UploadStep from './components/steps/UploadStep.vue';
import StyleStep from './components/steps/StyleStep.vue';
import BuildStep from './components/steps/BuildStep.vue';
import PreviewStep from './components/steps/PreviewStep.vue';
import PublishStep from './components/steps/PublishStep.vue';
import { onAuthChange, signOutUser, getUserSettings, saveUserSettings } from './firebase.js';
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
    }
  });
});

async function handleSignIn(u) {
  user.value = u;
  authed.value = true;
  showDashboard.value = true;
  // Settings loaded by onAuthChange listener
}

function handleSkipAuth() {
  authed.value = true;
  showDashboard.value = true;
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
/* Global */
:root {
  --primary: #7C5CBF;
  --primary-light: #9B7DD4;
  --accent: #E8A87C;
  --bg: #F8F6FF;
  --surface: #FFFFFF;
  --text: #2D2640;
  --text-muted: #7A7190;
  --border: #E2DCF5;
  --radius: 12px;
  --shadow: 0 2px 12px rgba(124,92,191,0.12);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}

.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* API key banner */
.api-key-banner {
  background: #FFF3E0;
  border-bottom: 1px solid #FFCC80;
  padding: 0.6rem 1rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 0.9rem;
}
.api-key-banner button {
  background: var(--accent);
  color: white;
  border: none;
  padding: 0.3rem 0.8rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  white-space: nowrap;
}

/* Settings overlay */
.overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
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
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
}
.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem 0;
}
.settings-header h2 { margin: 0; }
.settings-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  line-height: 1;
}
.settings-close:hover { background: var(--bg); color: var(--text); }
.settings-body {
  padding: 1rem 1.5rem 1.5rem;
  overflow-y: auto;
  flex: 1;
}
.settings-panel label { display: block; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.4rem; }
.settings-panel input {
  width: 100%;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  padding: 0.7rem;
  font-size: 1rem;
  outline: none;
}
.settings-panel input:focus { border-color: var(--primary); }
.hint { font-size: 0.8rem; color: var(--text-muted); margin: 0.5rem 0 1rem; }
.hint a { color: var(--primary); }
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
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.95rem;
  transition: border-color 0.15s;
}
.radio-label:hover { border-color: var(--primary-light); }
.radio-label input[type="radio"] { margin-top: 0.15rem; accent-color: var(--primary); }

/* Wizard */
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
.logo { font-size: 1.1rem; font-weight: 700; color: var(--primary); }
.header-actions { display: flex; gap: 0.5rem; }
.icon-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0.3rem;
  border-radius: 6px;
}
.icon-btn:hover { background: var(--bg); }

/* User account dropdown */
.user-menu-wrap { position: relative; }
.user-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  background: white;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
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
}
.user-menu-item:hover { background: #FFF0F0; }

/* Step dots */
.step-dots {
  display: flex;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.8rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--border);
  transition: all 0.2s;
}
.dot.active { background: var(--primary); transform: scale(1.3); }
.dot.done { background: var(--primary-light); }

.step-content {
  flex: 1;
  overflow-y: auto;
}

/* Shared button styles */
.btn-primary {
  background: var(--primary);
  color: white;
  border: none;
  padding: 0.85rem 1.8rem;
  border-radius: var(--radius);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
}
.btn-primary:hover { background: var(--primary-light); }
.btn-primary:active { transform: scale(0.98); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
  background: transparent;
  color: var(--primary);
  border: 1.5px solid var(--primary);
  padding: 0.85rem 1.8rem;
  border-radius: var(--radius);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}
.btn-secondary:hover { background: var(--bg); }

.btn-row {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
}

/* Shared step container */
.step {
  max-width: 600px;
  margin: 0 auto;
  padding: 1.5rem 1rem 6rem;
}
.step h1 { font-size: 1.6rem; margin-bottom: 0.5rem; color: var(--text); }
.step .subtitle { color: var(--text-muted); margin-bottom: 1.5rem; line-height: 1.5; }

.nav-btns {
  display: flex;
  gap: 0.75rem;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 1rem;
  background: var(--surface);
  border-top: 1px solid var(--border);
  z-index: 5;
}
.nav-btns .btn-primary { flex: 1; }

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
  .step h1 { font-size: 1.3rem; }
  .step .subtitle { font-size: 0.9rem; margin-bottom: 1rem; }

  /* Step container */
  .step { padding: 1.25rem 0.75rem 5rem; }

  /* Header */
  .wizard-header { padding: 0.6rem 0.75rem; }
  .logo { font-size: 1rem; }

  /* Navigation */
  .nav-btns { padding: 0.75rem; padding-bottom: calc(0.75rem + env(safe-area-inset-bottom)); }
  .btn-primary, .btn-secondary { padding: 0.7rem 1rem; font-size: 0.9rem; }

  /* API key banner */
  .api-key-banner { font-size: 0.8rem; flex-wrap: wrap; gap: 0.5rem; padding: 0.5rem 0.75rem; }
}
</style>
