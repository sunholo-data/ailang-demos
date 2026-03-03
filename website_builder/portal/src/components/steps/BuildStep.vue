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

const props = defineProps({
  data: { type: Object, required: true }
});
const emit = defineEmits(['done', 'back']);

const statusMessage = ref('Getting started...');
const error = ref('');
const building = ref(false);

const buildSteps = ref([
  { id: 'init',      label: 'Loading AI engine',      status: 'pending' },
  { id: 'describe',  label: 'Describing images',       status: 'pending' },
  { id: 'structure', label: 'Planning your website',   status: 'pending' },
  { id: 'pages',     label: 'Writing page content',    status: 'pending' },
  { id: 'css',       label: 'Designing the look',      status: 'pending' },
]);

function setStep(id, status, message) {
  const s = buildSteps.value.find(s => s.id === id);
  if (s) s.status = status;
  if (message) statusMessage.value = message;
}

onMounted(() => startBuild());

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

    // 2. Prepare content — describe images + parse documents, then wrap for AILANG
    setStep('describe', 'active', 'Describing your images...');
    const wrappedItems = await wrapItems(props.data.items);
    const contentJson = JSON.stringify(wrappedItems);
    console.log('[WB] Items wrapped:', wrappedItems.length, 'items');
    console.log('[WB] contentJson (first 800):', contentJson.substring(0, 800));
    setStep('describe', 'done', 'Content prepared');

    // 3. Get style direction
    const stylePrompt = getStylePrompt(props.data.styleId, props.data.customNotes);

    // 4. Structure the site
    setStep('structure', 'active', 'Planning your website structure...');
    const siteJson = await callAI('buildSiteStructure', contentJson, props.data.description, stylePrompt);
    setStep('structure', 'done', 'Structure planned');

    // 5. Get page slugs
    console.log('[WB] siteJson type:', typeof siteJson, 'length:', String(siteJson).length);
    console.log('[WB] siteJson (first 600):', String(siteJson).substring(0, 600));

    // Primary: AILANG pure extraction (exercises AILANG code path)
    const slugsJson = callPure('getPageSlugs', siteJson);
    console.log('[WB] slugsJson from AILANG:', slugsJson, '| type:', typeof slugsJson);
    let slugs = JSON.parse(slugsJson);
    console.log('[WB] Page slugs (AILANG):', slugs);

    // Fallback: JS extraction if AILANG returned empty (catches format mismatches)
    if (!slugs || slugs.length === 0) {
      console.warn('[WB] AILANG getPageSlugs returned empty — trying JS fallback');
      try {
        const site = JSON.parse(String(siteJson));
        slugs = (site.pages || []).map(p => p.slug).filter(Boolean);
        console.log('[WB] Page slugs (JS fallback):', slugs);
      } catch (jsErr) {
        console.error('[WB] JS slug fallback failed:', jsErr.message);
      }
    }

    if (!slugs || slugs.length === 0) {
      throw new Error('No pages found in site structure — check console logs for siteJson content.');
    }

    // 6. Generate HTML for each page (parallel — each is an independent AI call)
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
    console.log('[WB] Pages generated:', Object.keys(pages), Object.fromEntries(Object.entries(pages).map(([k, v]) => [k, (v || '').length + ' chars'])));
    setStep('pages', 'done', 'Pages written');

    // 7. Generate CSS
    setStep('css', 'active', 'Designing the look...');
    const css = await callAI('renderCss', siteJson);
    setStep('css', 'done', 'Design complete!');

    statusMessage.value = 'Your website is ready! 🎉';
    building.value = false;

    console.log('[WB] Emitting done:', { slugs, pageKeys: Object.keys(pages), cssLength: css?.length });
    emit('done', { siteJson, pages, css, slugs });

  } catch (err) {
    error.value = err.message;
    building.value = false;
    // Mark current active step as failed
    buildSteps.value.forEach(s => { if (s.status === 'active') s.status = 'pending'; });
  }
}

async function wrapItems(items) {
  const wrapped = [];
  const imageItems = items.filter(i => i.type === 'image');
  const docItems = items.filter(i => i.type === 'document');
  const textItems = items.filter(i => i.type === 'text');

  // Describe images via Gemini Vision (avoids passing large base64 into AILANG WASM)
  for (const item of imageItems) {
    statusMessage.value = `Describing ${item.filename || 'image'}...`;
    const description = await describeImageWithGemini(item.base64, item.mimeType);
    if (item.useOnSite === false) {
      // Content-only: pass as text — AI reads the content but won't place an <img> on the site
      const wrappedJson = callPure('parseAndWrapText', description, `Photo: ${item.filename || 'image'}`);
      wrapped.push(JSON.parse(wrappedJson));
    } else {
      // Site image: keep filename so AI places an <img data-ref="filename"> placeholder
      const wrappedJson = callPure('parseAndWrapImage', '', item.mimeType, item.filename || 'image.jpg', description);
      wrapped.push(JSON.parse(wrappedJson));
    }
  }

  // Parse documents via JSZip + AILANG DocParse (full: DOCX/PPTX/XLSX/PDF + embedded images)
  for (const item of docItems) {
    statusMessage.value = `Reading ${item.filename}...`;
    const blocksJson = await parseDocumentItem(item);
    const wrappedJson = callPure('parseAndWrapDocument', blocksJson, item.filename, item.format || 'docx');
    wrapped.push(JSON.parse(wrappedJson));
  }

  // Wrap text items
  for (const item of textItems) {
    const wrappedJson = callPure('parseAndWrapText', item.text, item.label || 'User note');
    wrapped.push(JSON.parse(wrappedJson));
  }

  return wrapped;
}

async function parseDocumentItem(item) {
  // Convert base64 back to a File object so parseDocumentFile can use it
  const bytes = atob(item.base64);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
  const blob = new Blob([array], { type: item.mimeType || 'application/octet-stream' });
  const file = new File([blob], item.filename, { type: blob.type });

  // callFn bridge: matches engine.callFunction interface expected by parseDocumentFile
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
