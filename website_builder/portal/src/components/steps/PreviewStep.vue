<template>
  <div class="preview-step">
    <!-- Page tabs -->
    <div class="page-tabs">
      <button
        v-for="slug in slugs"
        :key="slug"
        class="page-tab"
        :class="{ active: currentSlug === slug }"
        @click="currentSlug = slug"
      >
        {{ slugLabel(slug) }}
      </button>
    </div>

    <!-- Website preview iframe -->
    <div class="preview-wrap">
      <iframe
        v-if="currentHtml"
        class="preview-frame"
        :srcdoc="htmlWithImages"
        sandbox="allow-same-origin allow-scripts"
        title="Website preview"
      />
      <div v-else class="preview-placeholder">
        <p>Generating preview...</p>
        <div class="debug-info">
          <p><strong>Debug:</strong> slugs={{ slugs.join(', ') || '(none)' }}, currentSlug={{ currentSlug }}, pageKeys={{ Object.keys(props.generated?.pages || {}).join(', ') || '(none)' }}</p>
        </div>
      </div>
    </div>

    <!-- Feedback chat -->
    <div class="chat-bar">
      <div v-if="refining" class="refining-msg">
        <span class="spinner-inline">⟳</span> Updating your website...
      </div>
      <div v-else class="chat-input-row">
        <input
          v-model="feedback"
          class="chat-input"
          placeholder='Say anything: "more purple", "bigger photos", "add my phone number"...'
          @keydown.enter="sendFeedback"
        />
        <button class="send-btn" :disabled="!feedback.trim() || refining" @click="sendFeedback">
          Send
        </button>
      </div>
      <div v-if="refineError" class="chat-error">{{ refineError }}</div>
    </div>

    <!-- Bottom action bar -->
    <div class="action-bar">
      <button class="btn-secondary" @click="$emit('rebuild')">
        ↩ Rebuild
      </button>
      <button class="btn-primary" @click="$emit('publish')">
        Publish → 🚀
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { callAI, callPure, isReady } from '../../ailang.js';

const props = defineProps({
  generated: { type: Object, required: true },
  description: { type: String, default: '' },
  siteJson: { type: String, default: '' },
  items: { type: Array, default: () => [] },
});
const emit = defineEmits(['publish', 'rebuild', 'update-generated']);

const slugs = computed(() => props.generated?.slugs || []);
const currentSlug = ref(slugs.value[0] || 'home');

// Diagnostic logging
console.log('[Preview] generated:', {
  slugs: props.generated?.slugs,
  pageKeys: Object.keys(props.generated?.pages || {}),
  pageLengths: Object.fromEntries(Object.entries(props.generated?.pages || {}).map(([k, v]) => [k, (v || '').length])),
});
const feedback = ref('');
const refining = ref(false);
const refineError = ref('');

// When generated changes (e.g. after refine), stay on current slug if it exists
watch(slugs, (newSlugs) => {
  if (!newSlugs.includes(currentSlug.value)) {
    currentSlug.value = newSlugs[0] || 'home';
  }
});

const currentHtml = computed(() => {
  return props.generated?.pages?.[currentSlug.value] || '';
});

// Build a filename→dataURI map from uploaded image items
const imageMap = computed(() => {
  const map = {};
  for (const item of props.items) {
    if (item.type === 'image' && item.base64 && item.filename) {
      map[item.filename] = `data:${item.mimeType || 'image/jpeg'};base64,${item.base64}`;
    }
  }
  return map;
});

// Replace placeholder img src attributes matching uploaded filenames with data URIs
const htmlWithImages = computed(() => {
  let html = currentHtml.value;
  if (!html) return html;
  const map = imageMap.value;
  if (Object.keys(map).length === 0) return html;

  // Replace any src="filename.jpg" (or src='...') that matches an uploaded file
  return html.replace(/src=["']([^"']+)["']/g, (match, src) => {
    // Check if the src basename matches any uploaded filename
    const basename = src.split('/').pop();
    if (map[basename]) return `src="${map[basename]}"`;
    if (map[src]) return `src="${map[src]}"`;
    return match;
  });
});

function slugLabel(slug) {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

async function sendFeedback() {
  if (!feedback.value.trim() || refining.value) return;
  refineError.value = '';
  refining.value = true;
  const msg = feedback.value.trim();
  feedback.value = '';

  try {
    // Refine site structure based on feedback
    const updatedSiteJson = await callAI('refineStructure', props.generated.siteJson, msg);

    // Get new slugs
    const slugsJson = callPure('getPageSlugs', updatedSiteJson);
    const newSlugs = JSON.parse(slugsJson);

    // Re-generate all pages with new structure
    const newPages = {};
    for (const slug of newSlugs) {
      newPages[slug] = await callAI('renderPage', updatedSiteJson, slug);
    }
    const newCss = await callAI('renderCss', updatedSiteJson);

    emit('update-generated', {
      siteJson: updatedSiteJson,
      pages: newPages,
      css: newCss,
      slugs: newSlugs
    });
  } catch (err) {
    refineError.value = err.message;
  } finally {
    refining.value = false;
  }
}
</script>

<style scoped>
.preview-step {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 130px); /* below wizard-header + dots */
}

.page-tabs {
  display: flex;
  overflow-x: auto;
  gap: 0.25rem;
  padding: 0.5rem 1rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  scrollbar-width: none;
}
.page-tabs::-webkit-scrollbar { display: none; }

.page-tab {
  padding: 0.4rem 0.85rem;
  border-radius: 20px;
  border: 1.5px solid var(--border);
  background: transparent;
  font-size: 0.85rem;
  cursor: pointer;
  white-space: nowrap;
  color: var(--text-muted);
  transition: all 0.15s;
}
.page-tab:hover { border-color: var(--primary-light); color: var(--primary); }
.page-tab.active {
  background: var(--primary);
  border-color: var(--primary);
  color: white;
}

.preview-wrap {
  flex: 1;
  overflow: hidden;
  background: white;
}

.preview-frame {
  width: 100%;
  height: 100%;
  border: none;
}

.preview-placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  gap: 0.75rem;
  padding: 1rem;
}

.debug-info {
  font-size: 0.75rem;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  max-width: 100%;
  word-break: break-all;
  text-align: left;
}

.chat-bar {
  background: var(--surface);
  border-top: 1px solid var(--border);
  padding: 0.75rem 1rem;
}

.chat-input-row {
  display: flex;
  gap: 0.5rem;
}
.chat-input {
  flex: 1;
  border: 1.5px solid var(--border);
  border-radius: 24px;
  padding: 0.6rem 1rem;
  font-size: 0.9rem;
  outline: none;
  font-family: inherit;
}
.chat-input:focus { border-color: var(--primary); }

.send-btn {
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 24px;
  padding: 0.6rem 1.2rem;
  font-size: 0.9rem;
  cursor: pointer;
}
.send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.refining-msg {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--primary);
  font-size: 0.9rem;
  padding: 0.3rem 0;
}
.spinner-inline {
  display: inline-block;
  animation: spin 1s linear infinite;
}
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.chat-error {
  font-size: 0.85rem;
  color: #CC0000;
  margin-top: 0.4rem;
}

.action-bar {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--surface);
  border-top: 1px solid var(--border);
}
.action-bar .btn-primary { flex: 1; }
</style>
