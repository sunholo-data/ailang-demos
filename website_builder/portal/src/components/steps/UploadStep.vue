<template>
  <div class="step">
    <h1>Add your content</h1>
    <p class="subtitle">Upload photos, or type some text. The more you share, the better your website will be.</p>

    <!-- Upload buttons -->
    <div class="upload-buttons">
      <button class="upload-btn" @click="triggerCamera">
        <span class="upload-icon">📷</span>
        <span>Take a photo</span>
      </button>
      <button class="upload-btn" @click="triggerFileUpload">
        <span class="upload-icon">🖼️</span>
        <span>Upload images</span>
      </button>
      <button class="upload-btn" @click="triggerDocUpload">
        <span class="upload-icon">📄</span>
        <span>Upload document</span>
      </button>
      <button class="upload-btn" @click="showTextInput = !showTextInput">
        <span class="upload-icon">✏️</span>
        <span>Add text</span>
      </button>
    </div>

    <!-- Hidden file inputs -->
    <input ref="cameraInput" type="file" accept="image/*" capture="environment" style="display:none" @change="handleImages" />
    <input ref="fileInput" type="file" accept="image/*" multiple style="display:none" @change="handleImages" />
    <input ref="docInput" type="file" accept=".docx,.pptx,.xlsx,.doc,.pdf" multiple style="display:none" @change="handleDocs" />

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
      <h3>Added content ({{ items.length }} item{{ items.length !== 1 ? 's' : '' }})</h3>
      <div v-for="(item, i) in items" :key="i" class="item-row">
        <div class="item-preview">
          <img v-if="item.type === 'image'" :src="item.preview" class="item-thumb" :alt="item.filename" />
          <span v-else-if="item.type === 'document'" class="item-text-icon">📄</span>
          <span v-else class="item-text-icon">📝</span>
        </div>
        <div class="item-info">
          <span class="item-name">{{ item.filename || 'Text note' }}</span>
          <span class="item-type">{{ item.formatLabel || item.type }}</span>
        </div>
        <button class="remove-btn" @click="removeItem(i)">✕</button>
      </div>
    </div>

    <div v-else class="empty-hint">
      <p>Add at least one photo or text note to get started.</p>
    </div>

    <div class="nav-btns">
      <button class="btn-secondary" @click="$emit('back')">← Back</button>
      <button
        class="btn-primary"
        :disabled="items.length === 0"
        @click="$emit('next', items)"
      >
        Continue →
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({ items: { type: Array, default: () => [] } });
defineEmits(['next', 'back']);

const items = ref([...props.items]);
const cameraInput = ref(null);
const fileInput = ref(null);
const docInput = ref(null);
const showTextInput = ref(false);
const textDraft = ref('');

function triggerCamera() { cameraInput.value?.click(); }
function triggerFileUpload() { fileInput.value?.click(); }
function triggerDocUpload() { docInput.value?.click(); }

async function handleImages(e) {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    const base64 = await fileToBase64(file);
    items.value.push({
      type: 'image',
      filename: file.name,
      mimeType: file.type,
      base64: base64.split(',')[1], // strip data URL prefix
      preview: base64,
      description: '' // filled in by AI during build step
    });
  }
  e.target.value = ''; // reset so same file can be re-added
}

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

async function handleDocs(e) {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    const base64Full = await fileToBase64(file);
    const base64 = base64Full.split(',')[1];
    const format = getDocFormat(file.name);
    items.value.push({
      type: 'document',
      filename: file.name,
      format,
      formatLabel: DOC_FORMATS[format] || 'Document',
      base64,
    });
  }
  e.target.value = '';
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
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}
@media (min-width: 400px) {
  .upload-buttons { grid-template-columns: repeat(4, 1fr); }
}

.upload-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.25rem 0.75rem;
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--primary);
  transition: all 0.15s;
}
.upload-btn:hover {
  border-color: var(--primary);
  background: var(--bg);
}
.upload-icon { font-size: 1.8rem; }

.text-input-area {
  margin-bottom: 1.25rem;
}
.text-input {
  width: 100%;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  padding: 0.85rem;
  font-size: 0.95rem;
  font-family: inherit;
  resize: vertical;
  outline: none;
  margin-bottom: 0.75rem;
}
.text-input:focus { border-color: var(--primary); }
.add-text-btn { width: 100%; }

.items-list h3 {
  font-size: 0.9rem;
  color: var(--text-muted);
  margin-bottom: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.item-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 0.5rem;
}
.item-thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 6px;
}
.item-text-icon { font-size: 2rem; width: 48px; text-align: center; }
.item-info { flex: 1; min-width: 0; }
.item-name { display: block; font-size: 0.9rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.item-type { font-size: 0.75rem; color: var(--text-muted); text-transform: capitalize; }
.remove-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 1rem;
  padding: 0.25rem;
}
.remove-btn:hover { color: #CC0000; }

.empty-hint {
  text-align: center;
  padding: 2rem 1rem;
  color: var(--text-muted);
  background: var(--surface);
  border: 1.5px dashed var(--border);
  border-radius: var(--radius);
}
</style>
