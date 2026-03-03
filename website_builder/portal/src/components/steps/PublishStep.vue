<template>
  <div class="step">
    <h1>Publish your website</h1>
    <p class="subtitle">Your website will be published to GitHub Pages — free hosting with your own URL.</p>

    <div v-if="published" class="success-card">
      <div class="success-icon">🎉</div>
      <h2>Your website is live!</h2>
      <a :href="publishedUrl" target="_blank" class="live-url">{{ publishedUrl }}</a>
      <p class="live-note">It may take a minute for GitHub Pages to activate. Refresh the link if it's not ready yet.</p>
      <div class="btn-row">
        <button class="btn-secondary" @click="copyUrl">{{ copied ? 'Copied!' : '📋 Copy link' }}</button>
        <button class="btn-primary" @click="$emit('restart')">Make another site</button>
      </div>
    </div>

    <div v-else>
      <!-- GitHub token setup -->
      <div class="card">
        <h3>GitHub Personal Access Token</h3>
        <p class="card-desc">
          We need a token to create a GitHub repository and publish your files.
          <a href="https://github.com/settings/tokens/new?scopes=repo&description=Website+Builder" target="_blank">
            Create one here
          </a>
          (needs <code>repo</code> scope).
        </p>
        <input
          v-model="githubToken"
          type="password"
          class="token-input"
          placeholder="ghp_..."
        />
      </div>

      <!-- Repo name -->
      <div class="card">
        <h3>Repository name</h3>
        <p class="card-desc">Your site will be at <code>username.github.io/<strong>{{ repoName || 'my-website' }}</strong></code></p>
        <input
          v-model="repoName"
          type="text"
          class="token-input"
          placeholder="my-website"
        />
      </div>

      <!-- Error -->
      <div v-if="deployError" class="error-box">{{ deployError }}</div>

      <!-- Coming soon note for MVP -->
      <div class="coming-soon">
        <p>📦 GitHub deployment is coming in Phase 4. For now, your generated files are ready to download.</p>
        <button class="btn-primary download-btn" @click="downloadFiles">
          ⬇️ Download website files
        </button>
      </div>

      <div class="nav-btns">
        <button class="btn-secondary" @click="$emit('back')">← Back to preview</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  generated: { type: Object, required: true }
});
defineEmits(['back', 'restart']);

const githubToken = ref('');
const repoName = ref('my-website');
const published = ref(false);
const publishedUrl = ref('');
const deployError = ref('');
const copied = ref(false);

function copyUrl() {
  navigator.clipboard.writeText(publishedUrl.value);
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);
}

function downloadFiles() {
  if (!props.generated) return;

  const { pages, css, slugs } = props.generated;

  // Download each HTML page
  for (const slug of (slugs || [])) {
    const html = pages?.[slug];
    if (html) downloadString(`${slug}.html`, html, 'text/html');
  }

  // Download CSS
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
.success-card h2 { margin-bottom: 0.75rem; }
.live-url {
  display: block;
  color: var(--primary);
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  word-break: break-all;
}
.live-note { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.5rem; }

.card {
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem;
  margin-bottom: 1rem;
}
.card h3 { margin-bottom: 0.5rem; }
.card-desc { font-size: 0.88rem; color: var(--text-muted); margin-bottom: 0.75rem; line-height: 1.5; }
.card-desc a { color: var(--primary); }
.card-desc code { background: var(--bg); padding: 0.1rem 0.3rem; border-radius: 4px; font-size: 0.85rem; }

.token-input {
  width: 100%;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  padding: 0.7rem;
  font-size: 0.95rem;
  outline: none;
  font-family: monospace;
}
.token-input:focus { border-color: var(--primary); }

.coming-soon {
  background: #EFF8FF;
  border: 1px solid #B3D7FF;
  border-radius: var(--radius);
  padding: 1.25rem;
  margin-bottom: 1rem;
}
.coming-soon p { font-size: 0.9rem; color: #1A5276; margin-bottom: 1rem; }
.download-btn { width: 100%; }

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
