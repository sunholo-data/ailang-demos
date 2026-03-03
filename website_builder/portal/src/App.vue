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
        <h2>Settings</h2>
        <label>Gemini API Key</label>
        <input
          v-model="apiKeyInput"
          type="password"
          placeholder="AIza..."
          @keydown.enter="saveKey"
        />
        <p class="hint">Get a free key at <a href="https://aistudio.google.com" target="_blank">aistudio.google.com</a></p>
        <div class="btn-row">
          <button class="btn-secondary" @click="clearKey">Clear</button>
          <button class="btn-primary" @click="saveKey">Save</button>
        </div>
      </div>
    </div>

    <!-- Auth gate -->
    <AuthGate v-if="!authed" @signed-in="handleSignIn" @skip="authed = true" />

    <!-- Main wizard (shown after auth) -->
    <div v-else class="wizard">
      <header class="wizard-header">
        <span class="logo">🌐 Website Builder</span>
        <div class="header-actions">
          <button class="icon-btn" title="Settings" @click="showSettings = true">⚙️</button>
          <button v-if="user" class="icon-btn" title="Sign out" @click="handleSignOut">👤</button>
        </div>
      </header>

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
        />
        <PublishStep
          v-else-if="currentStep === 5"
          :generated="data.generated"
          @back="currentStep = 4"
          @restart="restart"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import AuthGate from './components/AuthGate.vue';
import DescribeStep from './components/steps/DescribeStep.vue';
import UploadStep from './components/steps/UploadStep.vue';
import StyleStep from './components/steps/StyleStep.vue';
import BuildStep from './components/steps/BuildStep.vue';
import PreviewStep from './components/steps/PreviewStep.vue';
import PublishStep from './components/steps/PublishStep.vue';
import { onAuthChange, signOutUser } from './firebase.js';
import { getApiKey, saveApiKey, clearApiKey } from './ailang.js';

const authed = ref(false);
const user = ref(null);
const currentStep = ref(0);
const showSettings = ref(false);
const apiKeyInput = ref('');

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
  // Listen for auth changes
  onAuthChange((u) => {
    user.value = u;
    if (u) authed.value = true;
  });
});

function handleSignIn(u) {
  user.value = u;
  authed.value = true;
}

async function handleSignOut() {
  await signOutUser();
  authed.value = false;
  user.value = null;
  restart();
}

function saveKey() {
  if (apiKeyInput.value.trim()) {
    saveApiKey(apiKeyInput.value);
  }
  showSettings.value = false;
}

function clearKey() {
  clearApiKey();
  apiKeyInput.value = '';
}

function restart() {
  currentStep.value = 0;
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
  padding: 1.5rem;
  width: 100%;
  max-width: 400px;
  box-shadow: var(--shadow);
}
.settings-panel h2 { margin-bottom: 1rem; }
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
</style>
