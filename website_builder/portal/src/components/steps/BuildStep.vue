<template>
  <div class="step">
    <h1>Building your website...</h1>
    <p class="subtitle">{{ statusMessage }}</p>

    <!-- Progress steps -->
    <div class="progress-list">
      <div
        v-for="step in buildSteps"
        :key="step.id"
        class="progress-item"
        :class="step.status"
      >
        <span class="progress-icon">
          <span v-if="step.status === 'done'">✅</span>
          <span v-else-if="step.status === 'active'" class="spinner">⟳</span>
          <span v-else>○</span>
        </span>
        <span class="progress-label">{{ step.label }}</span>
      </div>
    </div>

    <!-- Error state -->
    <div v-if="error" class="error-box">
      <p><strong>Something went wrong</strong></p>
      <p>{{ error }}</p>
      <div class="btn-row">
        <button class="btn-secondary" @click="$emit('back')">← Go back</button>
        <button class="btn-primary" @click="startBuild">Try again</button>
      </div>
    </div>

    <!-- Back button only shown if not actively building -->
    <div v-if="!building && !error" class="nav-btns">
      <button class="btn-secondary" @click="$emit('back')">← Back</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import JSZip from 'jszip';
import { initAilang, callPure, callAI, callPureModule, describeImageWithGemini, isReady, getApiKey, DOCPARSE_MODULE } from '../../ailang.js';
import { parseDocumentFile } from '../../../../../invoice_processor_wasm/js/docparse-utils.js';
import { createThumbnail } from '../../media.js';
import { saveSite, getRepoConfig } from '../../api.js';

const props = defineProps({
  data: { type: Object, required: true }
});
const emit = defineEmits(['done', 'back']);

const statusMessage = ref('Getting started...');
const error = ref('');
const building = ref(false);

const buildSteps = ref([
  { id: 'init',      label: 'Loading AI engine',      status: 'pending' },
  { id: 'upload',    label: 'Uploading media files',   status: 'pending' },
  { id: 'describe',  label: 'Describing images',       status: 'pending' },
  { id: 'structure', label: 'Planning your website',   status: 'pending' },
  { id: 'pages',     label: 'Writing page content',    status: 'pending' },
  { id: 'css',       label: 'Designing the look',      status: 'pending' },
  { id: 'save',      label: 'Saving your website',     status: 'pending' },
]);

function setStep(id, status, message) {
  const s = buildSteps.value.find(s => s.id === id);
  if (s) s.status = status;
  if (message) statusMessage.value = message;
}

onMounted(() => startBuild());

// Sidecar upload: POST files in batches via multipart FormData
const SIDECAR_BASE = '/api';
const UPLOAD_BATCH_SIZE = 5;

async function uploadFilesToSidecar(mediaItems, user, site) {
  const results = [];
  for (let i = 0; i < mediaItems.length; i += UPLOAD_BATCH_SIZE) {
    const batch = mediaItems.slice(i, i + UPLOAD_BATCH_SIZE);
    const form = new FormData();
    for (const item of batch) {
      form.append('files', item.file, item.filename);
    }
    const resp = await fetch(
      `${SIDECAR_BASE}/upload?user=${encodeURIComponent(user)}&site=${encodeURIComponent(site)}`,
      { method: 'POST', body: form }
    );
    if (!resp.ok) throw new Error(`Upload failed (${resp.status}): ${await resp.text()}`);
    const batchResults = await resp.json();
    results.push(...batchResults);
    setStep('upload', 'active', `Uploading files... ${Math.min(i + UPLOAD_BATCH_SIZE, mediaItems.length)}/${mediaItems.length}`);
  }
  return results;
}

// Parallel Gemini image descriptions with concurrency limit
async function describeImagesParallel(imageItems, concurrency = 3) {
  const descriptions = new Map();
  let completed = 0;

  async function describeOne(item) {
    // Read the resized file as base64 for Gemini (small after resize: ~100-300KB)
    const base64 = await blobToBase64Raw(item.file);
    const mimeType = item.mimeType || 'image/jpeg';
    const desc = await describeImageWithGemini(base64, mimeType);
    completed++;
    setStep('describe', 'active', `Describing images... ${completed}/${imageItems.length}`);
    descriptions.set(item.filename, desc);
  }

  // Worker pool: run up to `concurrency` at a time
  const queue = [...imageItems];
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
    workers.push((async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        await describeOne(item);
      }
    })());
  }
  await Promise.all(workers);
  return descriptions;
}

// Describe a video by its poster thumbnail
async function describeVideoThumbnail(item) {
  // item.preview is a data URL of the poster frame
  if (!item.preview) return 'A video uploaded by the user.';
  const base64 = item.preview.split(',')[1];
  if (!base64) return 'A video uploaded by the user.';
  return describeImageWithGemini(base64, 'image/jpeg');
}

async function startBuild() {
  error.value = '';
  building.value = true;
  buildSteps.value.forEach(s => s.status = 'pending');

  try {
    // 1. Initialize AILANG WASM
    setStep('init', 'active', 'Loading AI engine...');
    if (!isReady()) {
      await initAilang((step, msg) => { statusMessage.value = msg; });
    }
    setStep('init', 'done', 'AI engine ready');

    // Categorise items
    const imageItems = props.data.items.filter(i => i.type === 'image' && i.file);
    const videoItems = props.data.items.filter(i => i.type === 'video' && i.file);
    const docItems = props.data.items.filter(i => i.type === 'document');
    const textItems = props.data.items.filter(i => i.type === 'text');
    const mediaItems = [...imageItems, ...videoItems];

    // 2. Upload media files to sidecar (if sidecar is available)
    let uploadResults = [];
    const hasSidecar = await checkSidecar();
    if (hasSidecar && mediaItems.length > 0) {
      setStep('upload', 'active', `Uploading ${mediaItems.length} files...`);
      const user = 'default'; // TODO: pass from auth
      const site = slugify(props.data.description);
      uploadResults = await uploadFilesToSidecar(mediaItems, user, site);
      setStep('upload', 'done', `${mediaItems.length} files uploaded`);
    } else if (mediaItems.length > 0) {
      // No sidecar — skip upload, will use base64 fallback for images
      setStep('upload', 'done', 'Skipped (no sidecar)');
    } else {
      setStep('upload', 'done', 'No media files');
    }

    // Build a lookup: originalName → uploadResult
    const uploadMap = new Map();
    for (const r of uploadResults) {
      uploadMap.set(r.originalName, r);
    }

    // 3. Describe images (parallel) + videos (poster thumbnails)
    setStep('describe', 'active', 'Describing your images...');
    const imageDescriptions = await describeImagesParallel(imageItems);

    // Describe videos by their poster thumbnails
    const videoDescriptions = new Map();
    for (const item of videoItems) {
      statusMessage.value = `Describing ${item.filename}...`;
      const desc = await describeVideoThumbnail(item);
      videoDescriptions.set(item.filename, desc);
    }
    setStep('describe', 'done', 'Content described');

    // 4. Wrap items for AILANG — use file paths (not base64) when available
    const wrappedItems = [];

    for (const item of imageItems) {
      const desc = imageDescriptions.get(item.filename) || 'An uploaded image.';
      const uploaded = uploadMap.get(item.filename);

      if (item.useOnSite === false) {
        const wrappedJson = callPure('parseAndWrapText', desc, `Photo: ${item.filename}`);
        wrappedItems.push(JSON.parse(wrappedJson));
      } else {
        const wrappedJson = callPure('parseAndWrapImage', '', item.mimeType, item.filename, desc);
        const wrapped = JSON.parse(wrappedJson);
        if (uploaded) wrapped.stagingPath = uploaded.stagingPath;
        wrappedItems.push(wrapped);
      }
    }

    for (const item of videoItems) {
      const desc = videoDescriptions.get(item.filename) || 'A video.';
      const uploaded = uploadMap.get(item.filename);

      // Videos: include as a content item with video metadata
      // Claude Code decides how to embed (poster, <video>, link, etc.)
      const videoMeta = {
        type: 'video',
        filename: item.filename,
        mimeType: item.mimeType,
        description: desc,
        duration: item.duration,
        width: item.width,
        height: item.height,
        useOnSite: item.useOnSite !== false,
      };
      if (uploaded) videoMeta.stagingPath = uploaded.stagingPath;

      // Save poster thumbnail to staging too
      if (uploaded && item.preview) {
        const posterName = item.filename.replace(/\.[^.]+$/, '-poster.jpg');
        videoMeta.posterFilename = posterName;
        // Upload poster as a separate small file
        try {
          const posterBlob = dataURLToBlob(item.preview);
          const posterForm = new FormData();
          posterForm.append('files', posterBlob, posterName);
          const user = 'default';
          const site = slugify(props.data.description);
          const resp = await fetch(
            `${SIDECAR_BASE}/upload?user=${encodeURIComponent(user)}&site=${encodeURIComponent(site)}`,
            { method: 'POST', body: posterForm }
          );
          if (resp.ok) {
            const [posterResult] = await resp.json();
            videoMeta.posterStagingPath = posterResult.stagingPath;
          }
        } catch (e) {
          console.warn('Failed to upload video poster:', e);
        }
      }

      wrappedItems.push(videoMeta);
    }

    // Parse documents via JSZip + AILANG DocParse
    for (const item of docItems) {
      statusMessage.value = `Reading ${item.filename}...`;
      const blocksJson = await parseDocumentItem(item);
      const wrappedJson = callPure('parseAndWrapDocument', blocksJson, item.filename, item.format || 'docx');
      wrappedItems.push(JSON.parse(wrappedJson));
    }

    // Wrap text items
    for (const item of textItems) {
      const wrappedJson = callPure('parseAndWrapText', item.text, item.label || 'User note');
      wrappedItems.push(JSON.parse(wrappedJson));
    }

    const contentJson = JSON.stringify(wrappedItems);
    console.log('[WB] Items wrapped:', wrappedItems.length, 'items');

    // 5. Get style direction
    const stylePrompt = getStylePrompt(props.data.styleId, props.data.customNotes);

    // 6. Structure the site
    setStep('structure', 'active', 'Planning your website structure...');
    const siteJson = await callAI('buildSiteStructure', contentJson, props.data.description, stylePrompt);
    setStep('structure', 'done', 'Structure planned');

    // 7. Get page slugs
    console.log('[WB] siteJson type:', typeof siteJson, 'length:', String(siteJson).length);
    const slugsJson = callPure('getPageSlugs', siteJson);
    let slugs = JSON.parse(slugsJson);

    // Fallback: JS extraction if AILANG returned empty
    if (!slugs || slugs.length === 0) {
      console.warn('[WB] AILANG getPageSlugs returned empty — trying JS fallback');
      try {
        const site = JSON.parse(String(siteJson));
        slugs = (site.pages || []).map(p => p.slug).filter(Boolean);
      } catch (jsErr) {
        console.error('[WB] JS slug fallback failed:', jsErr.message);
      }
    }

    if (!slugs || slugs.length === 0) {
      throw new Error('No pages found in site structure — check console logs for siteJson content.');
    }

    // 8. Generate HTML for each page (parallel)
    let pagesWritten = 0;
    setStep('pages', 'active', `Writing ${slugs.length} pages...`);
    const pageEntries = await Promise.all(
      slugs.map(slug =>
        callAI('renderPage', siteJson, slug).then(html => {
          pagesWritten++;
          setStep('pages', 'active', `Writing pages... ${pagesWritten}/${slugs.length} done`);
          return [slug, html];
        })
      )
    );
    const pages = Object.fromEntries(pageEntries);
    setStep('pages', 'done', 'Pages written');

    // 9. Generate CSS
    setStep('css', 'active', 'Designing the look...');
    const css = await callAI('renderCss', siteJson);
    setStep('css', 'done', 'Design complete!');

    // 10. Auto-save to sidecar (silent, best-effort)
    let saveResult = null;
    setStep('save', 'active', 'Saving your website...');
    try {
      const imagePayload = [];
      for (const item of imageItems) {
        const uploaded = uploadMap.get(item.filename);
        if (uploaded) {
          imagePayload.push({ filename: item.filename, stagingPath: uploaded.stagingPath });
        } else if (item.file) {
          // No sidecar upload — send as base64
          const b64 = await blobToBase64Raw(item.file);
          imagePayload.push({ filename: item.filename, base64: b64 });
        }
      }
      saveResult = await saveSite({
        user: 'default', // TODO: pass from auth
        siteName: slugify(props.data.description),
        pages,
        css,
        images: imagePayload.length > 0 ? imagePayload : undefined,
        siteJson,
        description: props.data.description,
        repoConfig: getRepoConfig(),
      });
      setStep('save', 'done', 'Saved!');
      console.log('[WB] Site saved:', saveResult);
    } catch (saveErr) {
      // Save failure is non-blocking — site works in memory
      console.warn('[WB] Auto-save failed (site works in memory):', saveErr.message);
      setStep('save', 'done', 'Save skipped');
    }

    statusMessage.value = 'Your website is ready! 🎉';
    building.value = false;

    // Include save info in generated data so PreviewStep knows the site is persisted
    const generated = { siteJson, pages, css, slugs };
    if (saveResult) {
      generated.userId = saveResult.userId;
      generated.siteSlug = saveResult.siteSlug;
    }
    emit('done', generated);

  } catch (err) {
    error.value = err.message;
    building.value = false;
    buildSteps.value.forEach(s => { if (s.status === 'active') s.status = 'pending'; });
  }
}

async function parseDocumentItem(item) {
  const bytes = atob(item.base64);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
  const blob = new Blob([array], { type: item.mimeType || 'application/octet-stream' });
  const file = new File([blob], item.filename, { type: blob.type });

  const callFn = (funcName, ...args) => {
    try {
      const result = callPureModule(DOCPARSE_MODULE, funcName, ...args);
      return { success: true, result };
    } catch (err) {
      return { success: false, error: err.message, result: '' };
    }
  };

  const { blocks } = await parseDocumentFile(file, {
    callFn,
    apiKey: getApiKey(),
    onProgress: (msg) => { statusMessage.value = msg; },
    JSZip,
  });

  return JSON.stringify(blocks);
}

const STYLE_PROMPTS = {
  warm: 'Warm and friendly — soft earth tones, rounded corners, generous spacing, inviting feel',
  clean: 'Clean and modern — lots of white space, sharp geometric lines, minimal decoration, crisp and professional',
  bold: 'Bold and vibrant — strong saturated colours, large impactful typography, energetic layout with visual punch',
  elegant: 'Elegant and refined — muted palette, serif headings, sophisticated spacing, premium feel with subtle details',
  fun: 'Fun and playful — bright cheerful colours, rounded friendly shapes, casual tone, playful layout with personality',
  auto: 'Analyse the uploaded content — the type of business, the tone of the text, the style of the images — and choose the most appropriate design direction.'
};

function getStylePrompt(id, notes) {
  const base = STYLE_PROMPTS[id] || STYLE_PROMPTS.warm;
  return notes ? `${base}. Additional direction: ${notes}` : base;
}

async function checkSidecar() {
  try {
    const resp = await fetch(`${SIDECAR_BASE}/status`, { signal: AbortSignal.timeout(2000) });
    return resp.ok;
  } catch {
    return false;
  }
}

function slugify(text) {
  return (text || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60) || 'site';
}

function blobToBase64Raw(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      resolve(dataUrl.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function dataURLToBlob(dataURL) {
  const [header, data] = dataURL.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const bytes = atob(data);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
  return new Blob([array], { type: mime });
}
</script>

<style scoped>
.progress-list {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
  margin-bottom: 1.5rem;
}

.progress-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0;
  color: var(--text-muted);
  font-size: 0.95rem;
  border-bottom: 1px solid var(--border);
}
.progress-item:last-child { border-bottom: none; }
.progress-item.done { color: var(--text); }
.progress-item.active { color: var(--primary); font-weight: 500; }

.progress-icon { font-size: 1.1rem; width: 1.5rem; text-align: center; }

.spinner {
  display: inline-block;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.error-box {
  background: #FFF0F0;
  border: 1px solid #FFB3B3;
  border-radius: var(--radius);
  padding: 1.25rem;
  margin-bottom: 1rem;
}
.error-box p { margin-bottom: 0.5rem; font-size: 0.95rem; }
</style>
