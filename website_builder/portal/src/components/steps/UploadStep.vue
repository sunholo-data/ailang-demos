<template>
  <div class="step">
    <h1>Add your content</h1>
    <p class="subtitle">Upload photos, videos, documents, or type some text. The more you share, the better your website will be.</p>

    <!-- Upload buttons -->
    <div class="upload-buttons">
      <button class="upload-btn" @click="triggerCamera">
        <span class="upload-icon">📷</span>
        <span>Take a photo</span>
      </button>
      <button class="upload-btn" @click="triggerFileUpload">
        <span class="upload-icon">📁</span>
        <span>Upload files</span>
      </button>
      <button class="upload-btn" @click="showTextInput = !showTextInput">
        <span class="upload-icon">✏️</span>
        <span>Add text</span>
      </button>
    </div>

    <!-- Hidden file inputs -->
    <input ref="cameraInput" type="file" accept="image/*" capture="environment" style="display:none" @change="handleFiles" />
    <input ref="fileInput" type="file" accept="image/*,video/*,.docx,.pptx,.xlsx,.doc,.pdf" multiple style="display:none" @change="handleFiles" />

    <!-- Processing progress -->
    <div v-if="processing" class="progress-bar-container">
      <div class="progress-text">Getting your photos ready... {{ processedCount }} of {{ totalToProcess }}</div>
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: progressPct + '%' }" />
      </div>
    </div>

    <!-- Text input area -->
    <div v-if="showTextInput" class="text-input-area">
      <textarea
        v-model="textDraft"
        class="text-input"
        placeholder="e.g. We offer free delivery within Edinburgh. Order by 2pm for same-day delivery. Our studio is open Tuesday–Saturday."
        rows="4"
      />
      <button
        class="btn-primary add-text-btn"
        :disabled="!textDraft.trim()"
        @click="addText"
      >
        Add this text
      </button>
    </div>

    <!-- Items list -->
    <div v-if="items.length > 0" class="items-list">
      <h3>Your content ({{ items.length }} item{{ items.length !== 1 ? 's' : '' }})</h3>
      <div v-for="(item, i) in items" :key="i" class="item-row" :class="{ 'item-error': item.error }">
        <div class="item-preview">
          <img v-if="item.type === 'image'" :src="item.preview" class="item-thumb" :alt="item.filename" />
          <div v-else-if="item.type === 'video'" class="video-thumb-wrap">
            <img :src="item.preview" class="item-thumb" :alt="item.filename" />
            <span class="duration-badge">{{ item.durationLabel }}</span>
          </div>
          <span v-else-if="item.type === 'document'" class="item-text-icon">📄</span>
          <span v-else class="item-text-icon">📝</span>
        </div>
        <div class="item-info">
          <span class="item-name">{{ item.filename || 'Text note' }}</span>
          <span class="item-type">{{ item.formatLabel || item.type }}</span>
          <span v-if="item.error" class="item-error-text">{{ item.error }}</span>
        </div>
        <!-- Use toggle — only for images and videos -->
        <button
          v-if="item.type === 'image' || item.type === 'video'"
          class="use-toggle"
          :class="{ 'content-only': item.useOnSite === false }"
          :title="item.useOnSite === false ? 'Click to show on your website' : 'Click to use as background info only'"
          @click="toggleUseOnSite(i)"
        >
          {{ item.useOnSite === false ? 'Use as info' : 'Show on website' }}
        </button>
        <button class="remove-btn" @click="removeItem(i)">✕</button>
      </div>
    </div>

    <div v-else class="empty-hint">
      <span class="empty-icon">📸</span>
      <p>Share some photos, files, or write a few notes about what you'd like on your website.</p>
    </div>

    <div class="nav-btns">
      <button class="btn-secondary" @click="$emit('back')">← Back</button>
      <button
        class="btn-primary"
        :disabled="items.length === 0 || processing"
        @click="$emit('next', items)"
      >
        Continue →
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { resizeImage, createThumbnail, extractVideoThumbnail, formatFileSize, formatDuration } from '../../media.js';

const props = defineProps({ items: { type: Array, default: () => [] } });
defineEmits(['next', 'back']);

const items = ref([...props.items]);
const cameraInput = ref(null);
const fileInput = ref(null);
const showTextInput = ref(false);
const textDraft = ref('');

// Processing state
const processing = ref(false);
const processedCount = ref(0);
const totalToProcess = ref(0);

const progressPct = computed(() =>
  totalToProcess.value > 0 ? Math.round((processedCount.value / totalToProcess.value) * 100) : 0
);

const totalSizeLabel = computed(() => {
  const total = items.value.reduce((sum, i) => sum + (i.fileSize || 0), 0);
  return total > 0 ? formatFileSize(total) : '';
});

function triggerCamera() { cameraInput.value?.click(); }
function triggerFileUpload() { fileInput.value?.click(); }

const DOC_FORMATS = {
  docx: 'Word document',
  doc: 'Word document',
  pptx: 'PowerPoint',
  xlsx: 'Excel spreadsheet',
  pdf: 'PDF',
};

function getDocFormat(filename) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return ext in DOC_FORMATS ? ext : 'docx';
}

async function handleFiles(e) {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  processing.value = true;
  processedCount.value = 0;
  totalToProcess.value = files.length;

  // Process one at a time to limit memory pressure
  for (const file of files) {
    try {
      if (file.type.startsWith('image/')) {
        await processImage(file);
      } else if (file.type.startsWith('video/')) {
        await processVideo(file);
      } else {
        await processDocument(file);
      }
    } catch (err) {
      console.error(`Error processing ${file.name}:`, err);
      // Add with error badge so user can see it failed
      items.value.push({
        type: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'document',
        filename: file.name,
        mimeType: file.type,
        file,
        fileSize: file.size,
        sizeLabel: formatFileSize(file.size),
        preview: null,
        useOnSite: true,
        error: `Could not process: ${err.message}`
      });
    }
    processedCount.value++;
  }

  processing.value = false;
  e.target.value = '';
}

async function processImage(file) {
  // Resize to max 2000px and create thumbnail in parallel
  const [resized, thumbnail] = await Promise.all([
    resizeImage(file),
    createThumbnail(file)
  ]);

  items.value.push({
    type: 'image',
    filename: file.name,
    mimeType: 'image/jpeg', // resized output is always JPEG
    file: new File([resized.blob], file.name, { type: 'image/jpeg' }),
    fileSize: resized.blob.size,
    sizeLabel: formatFileSize(resized.blob.size),
    dimensions: `${resized.width}×${resized.height}`,
    width: resized.width,
    height: resized.height,
    preview: thumbnail,
    useOnSite: true,
  });
}

async function processVideo(file) {
  const info = await extractVideoThumbnail(file);

  items.value.push({
    type: 'video',
    filename: file.name,
    mimeType: file.type,
    file,
    fileSize: file.size,
    sizeLabel: formatFileSize(file.size),
    dimensions: `${info.width}×${info.height}`,
    width: info.width,
    height: info.height,
    duration: info.duration,
    durationLabel: formatDuration(info.duration),
    preview: info.thumbnail,
    useOnSite: true,
  });
}

async function processDocument(file) {
  const format = getDocFormat(file.name);
  // Documents stay as base64 — they're small and DocParse WASM needs base64
  const base64Full = await fileToBase64(file);

  items.value.push({
    type: 'document',
    filename: file.name,
    format,
    formatLabel: DOC_FORMATS[format] || 'Document',
    mimeType: file.type,
    base64: base64Full.split(',')[1],
    fileSize: file.size,
    sizeLabel: formatFileSize(file.size),
  });
}

function addText() {
  if (!textDraft.value.trim()) return;
  items.value.push({
    type: 'text',
    text: textDraft.value.trim(),
    filename: null,
    label: 'User note'
  });
  textDraft.value = '';
  showTextInput.value = false;
}

function toggleUseOnSite(i) {
  const item = items.value[i];
  if (item.type === 'image' || item.type === 'video') {
    item.useOnSite = item.useOnSite === false;
  }
}

function removeItem(i) {
  items.value.splice(i, 1);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
</script>

<style scoped>
.upload-buttons {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.upload-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.25rem 0.75rem;
  background: var(--surface);
  border: 2px dashed var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 0.9rem;
  font-family: inherit;
  color: var(--text);
  font-weight: 500;
  transition: all 0.2s;
  min-height: 48px;
}
.upload-btn:hover {
  border-color: var(--primary-light);
  border-style: solid;
  background: var(--primary-soft);
  color: var(--primary);
  transform: translateY(-1px);
}
.upload-btn:active { transform: translateY(0); }
.upload-icon { font-size: 1.8rem; }

/* Progress bar */
.progress-bar-container {
  margin-bottom: 1.25rem;
  padding: 0.85rem 1rem;
  background: var(--primary-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.progress-text {
  font-size: 0.85rem;
  color: var(--text);
  margin-bottom: 0.5rem;
  font-weight: 500;
}
.progress-track {
  height: 6px;
  background: var(--border);
  border-radius: 3px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.text-input-area {
  margin-bottom: 1.25rem;
}
.text-input {
  width: 100%;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  padding: 0.85rem;
  font-size: 1rem;
  font-family: inherit;
  resize: vertical;
  outline: none;
  margin-bottom: 0.75rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.text-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.add-text-btn { width: 100%; }

.items-list h3 {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}
.item-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  margin-bottom: 0.5rem;
  transition: border-color 0.15s;
}
.item-row:hover { border-color: var(--primary-light); }
.item-row.item-error {
  border-color: #FFB3B3;
  background: #FFF8F8;
}
.item-thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 8px;
}
.video-thumb-wrap {
  position: relative;
  display: inline-block;
}
.duration-badge {
  position: absolute;
  bottom: 2px;
  right: 2px;
  background: rgba(0,0,0,0.7);
  color: white;
  font-size: 0.65rem;
  padding: 1px 4px;
  border-radius: 4px;
  line-height: 1.3;
}
.item-text-icon { font-size: 2rem; width: 48px; text-align: center; }
.item-info { flex: 1; min-width: 0; }
.item-name { display: block; font-size: 0.9rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.item-type { font-size: 0.78rem; color: var(--text-muted); text-transform: capitalize; }
.item-error-text { display: block; font-size: 0.78rem; color: #CC0000; margin-top: 2px; }

.use-toggle {
  flex-shrink: 0;
  background: var(--success);
  color: white;
  border: none;
  border-radius: 20px;
  padding: 0.35rem 0.75rem;
  font-size: 0.75rem;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
  min-height: 32px;
}
.use-toggle:hover { opacity: 0.85; }
.use-toggle.content-only {
  background: transparent;
  color: var(--text-muted);
  border: 1.5px solid var(--border);
}
.use-toggle.content-only:hover { border-color: var(--success); color: var(--success); }

.remove-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 1rem;
  padding: 0.25rem;
  flex-shrink: 0;
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.15s;
}
.remove-btn:hover { color: #CC0000; background: #FFF0F0; }

.empty-hint {
  text-align: center;
  padding: 2.5rem 1.5rem;
  color: var(--text-muted);
  background: var(--surface);
  border: 2px dashed var(--border);
  border-radius: var(--radius);
  line-height: 1.6;
}
.empty-icon {
  font-size: 2.5rem;
  display: block;
  margin-bottom: 0.75rem;
}

@media (max-width: 600px) {
  .upload-buttons { grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .upload-btn { padding: 1rem 0.5rem; font-size: 0.85rem; }
  .upload-icon { font-size: 1.4rem; }
  .item-row { gap: 0.5rem; padding: 0.5rem 0.6rem; }
  .item-thumb { width: 40px; height: 40px; }
  .item-text-icon { font-size: 1.6rem; width: 40px; }
  .item-name { font-size: 0.85rem; }
  .use-toggle { font-size: 0.7rem; padding: 0.3rem 0.6rem; }
  .text-input { font-size: 1rem; } /* 16px prevents iOS zoom */
}
@media (max-width: 360px) {
  .upload-buttons { grid-template-columns: 1fr; }
}
</style>
