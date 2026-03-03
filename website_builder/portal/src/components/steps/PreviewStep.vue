<template>
  <div class="preview-step" :class="{ 'is-fullscreen': isFullscreen }">
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
      <div class="tab-spacer"></div>
      <button class="tab-action" :title="isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen preview'" @click="toggleFullscreen">
        {{ isFullscreen ? '⊡' : '⛶' }}
      </button>
      <button class="tab-action" title="Open current page in new tab" @click="openInTab">↗</button>
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
        <span class="spinner-inline">⟳</span> {{ refineStatus }}
      </div>
      <template v-else>
        <!-- Selected element context chip -->
        <div v-if="selectedElement" class="context-chip">
          <span>📌 Re: <strong>{{ selectedElement.area || 'selected element' }}</strong></span>
          <button class="chip-clear" @click="selectedElement = null" title="Clear selection">✕</button>
        </div>

        <!-- Pending added content chips -->
        <div v-if="pendingItems.length > 0" class="pending-list">
          <div v-for="(item, i) in pendingItems" :key="i" class="pending-chip">
            <span>{{ item.type === 'image' ? '📷' : item.type === 'document' ? '📄' : '📝' }} {{ item.label }}</span>
            <button
              v-if="item.type === 'image'"
              class="use-toggle-small"
              :class="{ 'content-only': item.useOnSite === false }"
              :title="item.useOnSite === false ? 'Click to show this image on the website' : 'Click to use for content only'"
              @click="item.useOnSite = !item.useOnSite"
            >{{ item.useOnSite === false ? '📝' : '🖼️' }}</button>
            <button class="chip-clear" @click="pendingItems.splice(i, 1)" title="Remove">✕</button>
          </div>
          <span v-if="pendingStatus" class="pending-status">{{ pendingStatus }}</span>
        </div>
        <div v-else-if="pendingStatus" class="pending-status-row">
          <span class="spinner-inline">⟳</span> {{ pendingStatus }}
        </div>

        <!-- Inline text note input -->
        <div v-if="showTextInput" class="text-note-row">
          <textarea
            v-model="textNote"
            class="text-note-input"
            placeholder="Type content to add to the site (e.g. your address, opening hours, a tagline...)"
            rows="3"
            @keydown.escape="showTextInput = false"
          />
          <div class="text-note-actions">
            <button class="btn-small" @click="addTextNote" :disabled="!textNote.trim()">Add note</button>
            <button class="btn-small btn-cancel" @click="showTextInput = false">Cancel</button>
          </div>
        </div>

        <!-- Chat input row -->
        <div class="chat-input-row">
          <input
            v-model="feedback"
            class="chat-input"
            :placeholder="selectedElement ? 'What to change about this section?' : 'e.g. more purple, add my phone number, bigger hero photo...'"
            @keydown.enter="sendFeedback"
          />
          <button class="add-btn" title="Add images, PDFs or text files" @click="triggerAddFile">📎</button>
          <button class="add-btn" title="Add a text note (address, hours, info...)" @click="showTextInput = !showTextInput">✎</button>
          <button class="send-btn" :disabled="!canSend" @click="sendFeedback">Send</button>
        </div>
        <!-- Hidden file input for adding content (images + PDFs + text files) -->
        <input ref="addFileInput" type="file" accept="image/*,.pdf,.txt,.md,.csv" multiple style="display:none" @change="handleAddFiles" />
      </template>
      <div v-if="refineError" class="chat-error">{{ refineError }}</div>
    </div>

    <!-- History panel (collapsible, above action bar) -->
    <transition name="slide-up">
      <div v-if="showHistory" class="history-panel">
        <div class="history-header">
          <span>Build history</span>
          <button class="chip-clear" @click="showHistory = false">✕</button>
        </div>
        <div class="history-list">
          <div v-for="(entry, i) in history" :key="i" class="history-entry">
            <span class="history-icon">{{ entry.icon }}</span>
            <div class="history-body">
              <div class="history-summary">{{ entry.summary }}</div>
              <div class="history-detail">{{ entry.detail }}</div>
              <div class="history-time">{{ entry.time }}</div>
              <!-- Expand to view attached files/images -->
              <button v-if="entry.items?.length" class="history-files-btn" @click="entry.expanded = !entry.expanded">
                {{ entry.expanded ? '▲ Hide' : `▼ View ${entry.items.length} file${entry.items.length !== 1 ? 's' : ''}` }}
              </button>
              <div v-if="entry.expanded && entry.items?.length" class="history-files">
                <div v-for="(item, j) in entry.items" :key="j" class="history-file" @click="openHistoryItem(item)" title="Click to view">
                  <img
                    v-if="item.type === 'image' && (item.preview || item.base64)"
                    :src="item.preview || `data:${item.mimeType || 'image/jpeg'};base64,${item.base64}`"
                    class="history-thumb"
                    :alt="item.filename || item.label"
                  />
                  <div v-else-if="item.type === 'document'" class="history-file-icon">📄</div>
                  <div v-else class="history-file-icon">📝</div>
                  <span class="history-file-name">{{ item.filename || item.label || 'Text note' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- Lightbox for viewing history items -->
    <teleport to="body">
      <div v-if="lightboxItem" class="lightbox-overlay" @click.self="lightboxItem = null">
        <div class="lightbox-content">
          <button class="lightbox-close" @click="lightboxItem = null">✕</button>
          <img v-if="lightboxItem.type === 'image'" :src="lightboxItem.src" class="lightbox-img" :alt="lightboxItem.label" />
          <div v-else class="lightbox-text">
            <p class="lightbox-label">{{ lightboxItem.label }}</p>
            <p>{{ lightboxItem.text }}</p>
          </div>
        </div>
      </div>
    </teleport>

    <!-- Bottom action bar -->
    <div class="action-bar">
      <button class="btn-secondary" @click="$emit('rebuild')">
        ↩ Rebuild
      </button>
      <button
        class="btn-history"
        :class="{ active: showHistory }"
        @click="showHistory = !showHistory"
        title="Build history"
      >
        📋 {{ history.length }}
      </button>
      <button class="btn-primary" @click="$emit('publish')">
        Publish → 🚀
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { callAI, callPure, describeImageWithGemini, extractDocumentContent } from '../../ailang.js';

const props = defineProps({
  generated: { type: Object, required: true },
  description: { type: String, default: '' },
  siteJson: { type: String, default: '' },
  items: { type: Array, default: () => [] },
});
const emit = defineEmits(['publish', 'rebuild', 'update-generated']);

const slugs = computed(() => props.generated?.slugs || []);
const currentSlug = ref(slugs.value[0] || 'home');

console.log('[Preview] generated:', {
  slugs: props.generated?.slugs,
  pageKeys: Object.keys(props.generated?.pages || {}),
  pageLengths: Object.fromEntries(Object.entries(props.generated?.pages || {}).map(([k, v]) => [k, (v || '').length])),
});

const feedback = ref('');
const refining = ref(false);
const refineStatus = ref('');
const refineError = ref('');
const isFullscreen = ref(false);
const lightboxItem = ref(null); // { type: 'image'|'text', src?, text?, label }

// Build history
const history = ref([]);
const showHistory = ref(false);

function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function pushHistory(icon, summary, detail, items = null) {
  history.value.push({ icon, summary, detail, time: now(), items: items || [], expanded: false });
}

// Element selection (via postMessage from iframe)
const selectedElement = ref(null); // { area, text }

// Pending content to add to the next refine
const pendingItems = ref([]); // [{ type: 'image'|'text', label, description, base64?, mimeType?, useOnSite? }]
// Images that were added post-build and placed on the site (persisted so imageMap survives refine)
const persistedImages = ref([]); // [{ label, base64, mimeType }]
const pendingStatus = ref('');
const addFileInput = ref(null);
const showTextInput = ref(false);
const textNote = ref('');

const canSend = computed(() =>
  (feedback.value.trim() || pendingItems.value.length > 0) && !refining.value
);

// When generated changes (e.g. after refine), stay on current slug if it exists
watch(slugs, (newSlugs) => {
  if (!newSlugs.includes(currentSlug.value)) {
    currentSlug.value = newSlugs[0] || 'home';
  }
});

const currentHtml = computed(() => {
  return props.generated?.pages?.[currentSlug.value] || '';
});

// Build filename→dataURI map from original uploaded items + pending + persisted post-build additions
const imageMap = computed(() => {
  const map = {};
  for (const item of props.items) {
    if (item.type === 'image' && item.base64 && item.filename) {
      map[item.filename] = `data:${item.mimeType || 'image/jpeg'};base64,${item.base64}`;
    }
  }
  for (const item of persistedImages.value) {
    if (item.base64 && item.label) {
      map[item.label] = `data:${item.mimeType || 'image/jpeg'};base64,${item.base64}`;
    }
  }
  for (const item of pendingItems.value) {
    if (item.type === 'image' && item.base64 && item.label) {
      map[item.label] = `data:${item.mimeType || 'image/jpeg'};base64,${item.base64}`;
    }
  }
  return map;
});

// Script injected into preview iframe for link interception + element hover/selection.
// Uses capture phase for nav so preventDefault fires before any other handler.
const SELECTION_SCRIPT = `<style>
[data-wb-h]{outline:2px dashed rgba(124,92,191,0.35)!important;outline-offset:3px!important;cursor:crosshair!important}
[data-wb-s]{outline:2px solid rgba(124,92,191,0.85)!important;outline-offset:3px!important;box-shadow:0 0 0 4px rgba(124,92,191,0.1)!important}
</style><script>(function(){
// Link interception (capture phase — fires before any inline onclick or other listeners)
document.addEventListener('click',function(e){
  var a=e.target.closest('a[href]');
  if(!a)return;
  var href=a.getAttribute('href')||'';
  if(href.startsWith('#'))return;
  e.preventDefault();
  e.stopPropagation();
  try{parent.postMessage({type:'wb-navigate',href:href},'*');}catch(err){}
},true);
// Element selection (bubble phase — only for non-link clicks)
var sel=null;
function ctx(el){
  var s=el.closest('section,header,footer,article,[class*="hero"],[class*="banner"],[class*="gallery"],[class*="about"],[class*="contact"],[class*="service"],[class*="team"],[class*="feature"]')||el.parentElement||el;
  var h=s&&s.querySelector('h1,h2,h3,h4');
  var area=(h?h.innerText:(s&&(s.id||s.getAttribute('class'))||el.tagName)).trim().substring(0,60);
  return{area:area,text:(el.innerText||el.getAttribute('alt')||'').trim().substring(0,100)};
}
document.addEventListener('mouseover',function(e){
  if(e.target===document.body||e.target===document.documentElement)return;
  e.target.setAttribute('data-wb-h','1');
});
document.addEventListener('mouseout',function(e){e.target.removeAttribute('data-wb-h');});
document.addEventListener('click',function(e){
  if(e.target.closest('a[href]'))return;
  if(sel)sel.removeAttribute('data-wb-s');
  sel=e.target;
  sel.setAttribute('data-wb-s','1');
  var c=ctx(sel);
  try{parent.postMessage({type:'wb-selected',area:c.area,text:c.text},'*');}catch(err){}
});
})()\x3c/script>`;

// Resolve image filenames → data URIs in any HTML string
function resolveImages(html) {
  const map = imageMap.value;
  if (!html || Object.keys(map).length === 0) return html;
  const resolve = (val) => {
    const basename = val.split('/').pop();
    return map[basename] || map[val] || null;
  };
  return html
    .replace(/src=["']([^"']+)["']/g, (match, src) => {
      const uri = resolve(src);
      return uri ? `src="${uri}"` : match;
    })
    .replace(/data-ref=["']([^"']+)["']/g, (match, ref) => {
      const uri = resolve(ref);
      return uri ? `${match} src="${uri}"` : match;
    });
}

const htmlWithImages = computed(() => {
  const html = resolveImages(currentHtml.value);
  if (!html) return html;
  // Inject element selection + nav interception script before </body>
  const insertAt = html.lastIndexOf('</body>');
  return insertAt >= 0
    ? html.slice(0, insertAt) + SELECTION_SCRIPT + html.slice(insertAt)
    : html + SELECTION_SCRIPT;
});

// Listen for messages from iframe (element selection + link navigation)
function onIframeMessage(e) {
  if (e.data?.type === 'wb-selected') {
    selectedElement.value = { area: e.data.area || '', text: e.data.text || '' };
    console.log('[iframe] element selected:', selectedElement.value);
  } else if (e.data?.type === 'wb-navigate') {
    const href = e.data.href || '';
    const slug = href.replace(/^\//, '').replace(/\.html$/, '').split('?')[0].split('#')[0] || 'home';
    if (slugs.value.includes(slug)) currentSlug.value = slug;
  }
}
onMounted(() => {
  window.addEventListener('message', onIframeMessage);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (lightboxItem.value) lightboxItem.value = null;
      else isFullscreen.value = false;
    }
  });
  // Log initial build
  let siteTitle = 'Website';
  try { siteTitle = JSON.parse(props.generated.siteJson)?.title || 'Website'; } catch {}
  const pageList = (props.generated.slugs || []).map(s => slugLabel(s)).join(', ');
  pushHistory('🏗️', `Built "${siteTitle}"`,
    `${(props.generated.slugs || []).length} pages (${pageList}) · ${props.items.length} item${props.items.length !== 1 ? 's' : ''}`,
    props.items
  );
});
onUnmounted(() => window.removeEventListener('message', onIframeMessage));

function slugLabel(slug) {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value;
}

function openInTab() {
  // Use the clean image-resolved HTML without the selection/nav injection script
  const html = resolveImages(currentHtml.value);
  if (!html) return;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function openHistoryItem(item) {
  if (item.type === 'image') {
    const src = item.preview || `data:${item.mimeType || 'image/jpeg'};base64,${item.base64}`;
    lightboxItem.value = { type: 'image', src, label: item.filename || item.label || 'Image' };
  } else if (item.type === 'text') {
    lightboxItem.value = { type: 'text', text: item.text || '', label: item.label || 'Text note' };
  } else if (item.type === 'document' && !item.base64) {
    // Text-only document (e.g. .txt): show extracted content in lightbox
    lightboxItem.value = { type: 'text', text: item.description || '', label: item.label || 'Document' };
  } else if (item.type === 'document' && item.base64) {
    // Binary document (PDF etc): open as blob in new tab
    try {
      const binary = atob(item.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const mimeMap = {
        pdf: 'application/pdf',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        doc: 'application/msword',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      };
      const mime = mimeMap[item.format] || 'application/octet-stream';
      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { console.error('Could not open document', e); }
  }
}

// Add content (images, PDFs, text files) to the pending list
function triggerAddFile() {
  addFileInput.value?.click();
}

async function handleAddFiles(e) {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    pendingStatus.value = `Processing ${file.name}...`;
    try {
      if (file.type.startsWith('image/')) {
        // Image: get visual description, store base64 for rendering on site
        const base64 = await fileToBase64(file);
        const description = await describeImageWithGemini(base64, file.type);
        pendingItems.value.push({ type: 'image', label: file.name, description, base64, mimeType: file.type, useOnSite: true });
      } else if (file.type === 'application/pdf') {
        // PDF: use Gemini to extract text content
        const base64 = await fileToBase64(file);
        const content = await extractDocumentContent(base64, file.type, file.name);
        pendingItems.value.push({ type: 'document', label: file.name, description: content, base64, format: 'pdf', mimeType: file.type });
      } else if (file.type.startsWith('text/') || file.name.match(/\.(txt|md|csv)$/i)) {
        // Plain text: read directly, no API call needed
        const text = await fileToText(file);
        pendingItems.value.push({ type: 'document', label: file.name, description: text, format: 'txt' });
      } else {
        refineError.value = `"${file.name}": unsupported format. Please use images, PDFs, or text files.`;
      }
    } catch (err) {
      refineError.value = `Could not process ${file.name}: ${err.message}`;
    }
  }
  pendingStatus.value = '';
  e.target.value = '';
}

function addTextNote() {
  const text = textNote.value.trim();
  if (!text) return;
  pendingItems.value.push({ type: 'text', label: 'Text note', description: text, text });
  textNote.value = '';
  showTextInput.value = false;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fileToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

async function sendFeedback() {
  if (!canSend.value) return;
  refineError.value = '';
  refining.value = true;

  // Build full feedback message from: element context + pending content + user text
  const parts = [];
  if (selectedElement.value?.area) {
    parts.push(`About the "${selectedElement.value.area}" section:`);
  }
  if (pendingItems.value.length > 0) {
    const contentDesc = pendingItems.value.map(item => {
      if (item.type === 'image') {
        return item.useOnSite === false
          ? `[Content reference image '${item.label}' (description only, do not show on site): ${item.description}]`
          : `[Add image '${item.label}' visually on the website. Include '${item.label}' in the relevant section's images array. Description: ${item.description}]`;
      }
      if (item.type === 'document') {
        return `[Document '${item.label}' content to incorporate:\n${item.description}]`;
      }
      // text note
      return `[Text content to add to the site: ${item.text || item.description}]`;
    }).join('\n\n');
    parts.push(`New content to incorporate: ${contentDesc}`);
  }
  if (feedback.value.trim()) {
    parts.push(feedback.value.trim());
  }
  const msg = parts.join('\n\n');
  feedback.value = '';

  // Is this a targeted single-page change (element selected, no new content to add)?
  const isTargeted = !!selectedElement.value && pendingItems.value.length === 0;
  console.log('[sendFeedback] isTargeted:', isTargeted, '| selectedElement:', selectedElement.value, '| pendingItems:', pendingItems.value.length);

  try {
    // 1. Refine site structure
    refineStatus.value = 'Applying your changes...';
    const updatedSiteJson = await callAI('refineStructure', props.generated.siteJson, msg);

    let newPages, newCss, newSlugs;

    if (isTargeted) {
      // Targeted change: only re-render the current page, keep everything else
      refineStatus.value = `Updating ${currentSlug.value} page...`;
      const updatedHtml = await callAI('renderPage', updatedSiteJson, currentSlug.value);
      newSlugs = props.generated.slugs;
      newPages = { ...props.generated.pages, [currentSlug.value]: updatedHtml };
      newCss = props.generated.css; // keep existing CSS
    } else {
      // Global change: regenerate all pages and CSS
      const slugsJson = callPure('getPageSlugs', updatedSiteJson);
      newSlugs = JSON.parse(slugsJson);

      let done = 0;
      refineStatus.value = `Writing ${newSlugs.length} pages...`;
      const pageEntries = await Promise.all(
        newSlugs.map(slug =>
          callAI('renderPage', updatedSiteJson, slug).then(html => {
            done++;
            refineStatus.value = `Writing pages... ${done}/${newSlugs.length} done`;
            return [slug, html];
          })
        )
      );
      newPages = Object.fromEntries(pageEntries);

      refineStatus.value = 'Finalising design...';
      newCss = await callAI('renderCss', updatedSiteJson);
    }

    // Log to history — attach any newly added images so they're viewable
    const scope = isTargeted
      ? `Updated ${currentSlug.value} page`
      : `Updated all ${newSlugs.length} pages`;
    const msgPreview = msg.length > 80 ? msg.substring(0, 80) + '…' : msg;
    const addedItems = pendingItems.value.filter(i => i.type === 'image' || i.type === 'document' || i.type === 'text');
    pushHistory('✏️', `"${msgPreview}"`, scope, addedItems.length > 0 ? addedItems : null);

    // Persist on-site images so they stay in imageMap after pendingItems is cleared
    for (const item of pendingItems.value) {
      if (item.type === 'image' && item.useOnSite !== false) {
        persistedImages.value.push({ label: item.label, base64: item.base64, mimeType: item.mimeType });
      }
    }

    // Prune persistedImages: drop any image no longer referenced in the updated siteJson
    // (so images the AI was asked to remove don't linger in imageMap)
    try {
      const siteStr = JSON.stringify(JSON.parse(updatedSiteJson));
      persistedImages.value = persistedImages.value.filter(img => siteStr.includes(img.label));
    } catch { /* ignore parse errors — keep all */ }

    // Clear pending items; keep selectedElement for targeted refines so the user
    // can keep iterating on the same element without re-selecting it each time.
    // For global refines, clear selection since the page structure may have changed.
    pendingItems.value = [];
    if (!isTargeted) selectedElement.value = null;

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
    refineStatus.value = '';
  }
}
</script>

<style scoped>
.preview-step {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 130px);
}

/* Fullscreen mode: take over the whole viewport */
.preview-step.is-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 200;
  height: 100vh;
}
.preview-step.is-fullscreen .preview-wrap { flex: 1; }
.preview-step.is-fullscreen .chat-bar,
.preview-step.is-fullscreen .history-panel,
.preview-step.is-fullscreen .action-bar { display: none; }

.page-tabs {
  display: flex;
  overflow-x: auto;
  gap: 0.25rem;
  padding: 0.5rem 1rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  scrollbar-width: none;
  align-items: center;
}
.page-tabs::-webkit-scrollbar { display: none; }

.tab-spacer { flex: 1; min-width: 0.5rem; }

.tab-action {
  flex-shrink: 0;
  background: none;
  border: none;
  padding: 0.3rem 0.45rem;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  color: var(--text-muted);
  border-radius: 6px;
  transition: all 0.15s;
}
.tab-action:hover { color: var(--primary); background: var(--bg); }

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
.page-tab.active { background: var(--primary); border-color: var(--primary); color: white; }

.preview-wrap { flex: 1; overflow: hidden; background: white; }
.preview-frame { width: 100%; height: 100%; border: none; }

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
}

.chat-bar {
  background: var(--surface);
  border-top: 1px solid var(--border);
  padding: 0.6rem 1rem;
}

/* Context chip (selected element) */
.context-chip {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: rgba(124,92,191,0.08);
  border: 1px solid rgba(124,92,191,0.25);
  border-radius: 8px;
  padding: 0.3rem 0.6rem;
  font-size: 0.8rem;
  color: var(--primary);
  margin-bottom: 0.5rem;
}

/* Pending items */
.pending-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.5rem;
}
.pending-chip {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 0.25rem 0.6rem;
  font-size: 0.8rem;
  color: var(--text);
}
.pending-status { font-size: 0.8rem; color: var(--text-muted); align-self: center; }
.pending-status-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  color: var(--primary);
  margin-bottom: 0.5rem;
}

.chip-clear {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  color: var(--text-muted);
  padding: 0;
  line-height: 1;
}
.chip-clear:hover { color: #CC0000; }

.use-toggle-small {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0;
  line-height: 1;
  opacity: 0.9;
  title: attr(title);
}
.use-toggle-small:hover { opacity: 1; transform: scale(1.15); }
.use-toggle-small.content-only { opacity: 0.5; }

.chat-input-row { display: flex; gap: 0.5rem; }
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

.add-btn {
  background: var(--bg);
  border: 1.5px solid var(--border);
  border-radius: 50%;
  width: 2.4rem;
  height: 2.4rem;
  font-size: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: border-color 0.15s;
}
.add-btn:hover { border-color: var(--primary); }

.send-btn {
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 24px;
  padding: 0.6rem 1.2rem;
  font-size: 0.9rem;
  cursor: pointer;
  white-space: nowrap;
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
.spinner-inline { display: inline-block; animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.chat-error { font-size: 0.85rem; color: #CC0000; margin-top: 0.4rem; }

/* History panel */
.history-panel {
  background: var(--surface);
  border-top: 1px solid var(--border);
  max-height: 280px;
  overflow-y: auto;
}
.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.6rem 1rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--surface);
}
.history-list { padding: 0.5rem 0; }
.history-entry {
  display: flex;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--border);
}
.history-entry:last-child { border-bottom: none; }
.history-icon { font-size: 1rem; flex-shrink: 0; padding-top: 0.1rem; }
.history-body { flex: 1; min-width: 0; }
.history-summary {
  font-size: 0.85rem;
  color: var(--text);
  word-break: break-word;
}
.history-detail {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 0.1rem;
}
.history-time {
  font-size: 0.7rem;
  color: var(--text-muted);
  margin-top: 0.15rem;
}
.history-files-btn {
  background: none;
  border: none;
  font-size: 0.72rem;
  color: var(--primary);
  cursor: pointer;
  padding: 0.2rem 0;
  margin-top: 0.25rem;
  display: block;
}
.history-files-btn:hover { text-decoration: underline; }
.history-files {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.history-file {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  max-width: 72px;
  cursor: pointer;
  border-radius: 8px;
  padding: 0.25rem;
  transition: background 0.15s;
}
.history-file:hover { background: var(--bg); }
.history-thumb {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--border);
}
.history-file-icon {
  font-size: 1.8rem;
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  border-radius: 6px;
  border: 1px solid var(--border);
}
.history-file-name {
  font-size: 0.62rem;
  color: var(--text-muted);
  text-align: center;
  word-break: break-all;
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-text-preview {
  font-size: 0.7rem;
  color: var(--text);
  background: var(--bg);
  border-radius: 6px;
  padding: 0.35rem 0.5rem;
  line-height: 1.4;
  max-width: 220px;
  margin-top: 0.15rem;
  word-break: break-word;
}

/* Lightbox */
.lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.88);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.lightbox-content {
  position: relative;
  max-width: 92vw;
  max-height: 92vh;
}
.lightbox-close {
  position: absolute;
  top: -2.2rem;
  right: 0;
  background: none;
  border: none;
  color: white;
  font-size: 1.4rem;
  cursor: pointer;
  line-height: 1;
  padding: 0.2rem 0.4rem;
}
.lightbox-close:hover { color: #ccc; }
.lightbox-img {
  display: block;
  max-width: 100%;
  max-height: 85vh;
  border-radius: 8px;
  object-fit: contain;
}
.lightbox-text {
  background: var(--surface);
  border-radius: 12px;
  padding: 1.5rem;
  max-width: 520px;
  max-height: 80vh;
  overflow-y: auto;
  line-height: 1.6;
  white-space: pre-wrap;
  color: var(--text);
}
.lightbox-label {
  font-size: 0.8rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.75rem;
}

/* Slide-up transition */
.slide-up-enter-active, .slide-up-leave-active { transition: max-height 0.2s ease, opacity 0.2s ease; }
.slide-up-enter-from, .slide-up-leave-to { max-height: 0; opacity: 0; overflow: hidden; }

.action-bar {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--surface);
  border-top: 1px solid var(--border);
}
.action-bar .btn-primary { flex: 1; }

/* Inline text note input */
.text-note-row {
  margin-bottom: 0.5rem;
}
.text-note-input {
  width: 100%;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  padding: 0.6rem 0.75rem;
  font-size: 0.85rem;
  font-family: inherit;
  resize: vertical;
  outline: none;
  color: var(--text);
  background: var(--bg);
}
.text-note-input:focus { border-color: var(--primary); }
.text-note-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.35rem;
}
.btn-small {
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 16px;
  padding: 0.3rem 0.85rem;
  font-size: 0.8rem;
  cursor: pointer;
}
.btn-small:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-small.btn-cancel {
  background: transparent;
  border: 1.5px solid var(--border);
  color: var(--text-muted);
}
.btn-small.btn-cancel:hover { border-color: var(--primary); color: var(--primary); }

.btn-history {
  background: transparent;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  padding: 0.6rem 0.85rem;
  font-size: 0.9rem;
  cursor: pointer;
  color: var(--text-muted);
  white-space: nowrap;
  transition: all 0.15s;
}
.btn-history:hover, .btn-history.active {
  border-color: var(--primary);
  color: var(--primary);
  background: rgba(124,92,191,0.06);
}
</style>
