<template>
  <div class="step">
    <!-- API key prompt (shown before build starts if key is missing) -->
    <template v-if="needsApiKey">
      <h1>Almost there!</h1>
      <p class="subtitle">To create your website, we need to connect to Google's AI. You'll need a free API key — it only takes a moment.</p>

      <div class="api-key-card">
        <div class="api-key-card-step">
          <span class="step-number">1</span>
          <div>
            <p>Get a free API key from Google:</p>
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" class="get-key-link">
              Get your free key (opens Google) &rarr;
            </a>
          </div>
        </div>
        <div class="api-key-card-step">
          <span class="step-number">2</span>
          <div>
            <p>Paste your key here:</p>
            <input
              v-model="inlineApiKey"
              type="text"
              inputmode="text"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              placeholder="AIza..."
              class="api-key-input api-key-masked"
              @keydown.enter="saveKeyAndBuild"
            />
            <p class="key-reassurance">Your key stays on your device and is never shared with us.</p>
          </div>
        </div>
      </div>

      <div class="nav-btns">
        <button class="btn-secondary" @click="$emit('back')">&larr; Back</button>
        <button class="btn-primary" :disabled="!inlineApiKey.trim()" @click="saveKeyAndBuild">
          Save &amp; Build
        </button>
      </div>
    </template>

    <!-- Build in progress / complete -->
    <template v-else>
      <div class="build-header">
        <img v-if="personaAvatar" :src="personaAvatar" :alt="builderName" class="build-persona-avatar" />
        <div>
          <h1>Building your website...</h1>
          <p class="subtitle">{{ statusMessage }}</p>
        </div>
      </div>

      <!-- Time estimate -->
      <div v-if="building" class="time-estimate">
        <span>This usually takes about 1–2 minutes</span>
      </div>

      <!-- Progress steps -->
      <div class="progress-list">
        <div
          v-for="step in buildSteps"
          :key="step.id"
          class="progress-item"
          :class="step.status"
        >
          <span class="progress-icon">
            <SvgIcon v-if="step.status === 'done'" name="check-circle" :size="18" class="icon-done" />
            <SvgIcon v-else-if="step.status === 'active'" name="loader" :size="18" class="spinner" />
            <SvgIcon v-else name="circle" :size="18" class="icon-pending" />
          </span>
          <span class="progress-label">{{ step.label }}</span>
        </div>
      </div>

      <!-- Live activity panel (AILANG Cloud builds) -->
      <div v-if="buildMode === 'messages' && activityLog.length > 0" class="activity-panel">
        <div class="activity-header" @click="activityExpanded = !activityExpanded">
          <SvgIcon name="terminal" :size="16" />
          <span>Live Activity</span>
          <span class="ws-dot" :class="{ connected: wsConnected }"></span>
          <SvgIcon :name="activityExpanded ? 'chevron-up' : 'chevron-down'" :size="16" class="activity-toggle" />
        </div>
        <div v-if="activityExpanded" class="activity-log" ref="activityLogEl">
          <div v-for="(entry, i) in activityLog" :key="i" class="activity-entry" :class="entry.type">
            <SvgIcon v-if="entry.type === 'tool'" name="pencil" :size="14" />
            <SvgIcon v-else-if="entry.type === 'error'" name="x" :size="14" />
            <SvgIcon v-else-if="entry.type === 'status'" name="check-circle" :size="14" />
            <span v-else class="dot-text">&middot;</span>
            <span class="activity-text">{{ entry.text }}</span>
          </div>
        </div>
      </div>

      <!-- Error state: API key specific -->
      <div v-if="error && isApiKeyError" class="error-box api-key-error">
        <p><strong>API key problem</strong></p>
        <p>Your key may be missing or invalid. Paste a new one below:</p>
        <input
          v-model="inlineApiKey"
          type="text"
          inputmode="text"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="AIza..."
          class="api-key-input api-key-masked"
          @keydown.enter="saveKeyAndBuild"
        />
        <p class="hint">Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com</a></p>
        <div class="btn-row">
          <button class="btn-secondary" @click="$emit('back')">&larr; Go back</button>
          <button class="btn-primary" :disabled="!inlineApiKey.trim()" @click="saveKeyAndBuild">Save &amp; Retry</button>
        </div>
      </div>

      <!-- Error state: generic -->
      <div v-else-if="error" class="error-box">
        <p><strong>Something went wrong</strong></p>
        <p>{{ error }}</p>
        <div class="btn-row">
          <button class="btn-secondary" @click="$emit('back')">&larr; Go back</button>
          <button class="btn-primary" @click="startBuild">Try again</button>
        </div>
      </div>

      <!-- Back button only shown if not actively building -->
      <div v-if="!building && !error" class="nav-btns">
        <button class="btn-secondary" @click="$emit('back')">&larr; Back</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import SvgIcon from '../SvgIcon.vue';
import JSZip from 'jszip';
import { initAilang, callPure, callAI, callPureModule, describeImageWithGemini, isReady, getApiKey, saveApiKey, DOCPARSE_MODULE } from '../../ailang.js';
import { parseDocumentFile } from '../../../../../invoice_processor_wasm/js/docparse-utils.js';
import { saveSite, sendBuild, pollStatus, uploadMedia, getRepoConfig, getFormSheetId, getRepoFile, listRepoFiles, API_BASE } from '../../api.js';
import { normalizeNavLinks } from '../../nav-utils.js';
import { saveUserSettings } from '../../firebase.js';

const props = defineProps({
  data: { type: Object, required: true },
  buildMode: { type: String, default: 'wasm' },
  userId: { type: String, default: 'default' },
  anthropicApiKey: { type: String, default: '' },
  personaName: { type: String, default: '' },
  personaAvatar: { type: String, default: '' },
});
const emit = defineEmits(['done', 'back']);

const statusMessage = ref('Hang tight — we\'re creating your website!');
const error = ref('');
const building = ref(false);
const inlineApiKey = ref('');
const needsApiKey = ref(!getApiKey());

const isApiKeyError = computed(() =>
  error.value && /api.?key/i.test(error.value)
);

// ── Live activity streaming (AILANG Cloud builds) ──
const activityLog = ref([]);
const activityExpanded = ref(true);
const wsConnected = ref(false);
const completedViaWs = ref(false);
const activityLogEl = ref(null);
let ws = null;

function addActivity(type, text) {
  activityLog.value.push({ type, text, time: Date.now() });
  // Keep last 30 entries
  if (activityLog.value.length > 30) activityLog.value.shift();
  // Auto-scroll
  nextTick(() => {
    if (activityLogEl.value) activityLogEl.value.scrollTop = activityLogEl.value.scrollHeight;
  });
}

const FRIENDLY_TOOL = {
  Write: 'Writing file', Edit: 'Editing file', Read: 'Reading file',
  Bash: 'Running command', Glob: 'Searching files', Grep: 'Searching code',
};

function connectTaskStream(taskId) {
  // Derive WebSocket URL from API_BASE (same sidecar, not the static site host)
  let wsUrl;
  try {
    if (API_BASE.startsWith('http')) {
      const url = new URL(API_BASE);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.pathname = url.pathname.replace(/\/?$/, '/ws');
      wsUrl = url.toString();
    } else {
      // Relative path (local dev) — use location.host
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${proto}//${location.host}${API_BASE}/ws`;
    }
    ws = new WebSocket(wsUrl);
  } catch (e) {
    console.log('[WB] WebSocket connect failed:', e.message);
    return;
  }

  ws.onopen = () => {
    wsConnected.value = true;
    console.log('[WB] WebSocket connected, watching task:', taskId);
  };
  ws.onclose = () => { wsConnected.value = false; };
  ws.onerror = () => { wsConnected.value = false; };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type !== 'task_stream') return;
      if (msg.data.task_id !== taskId) return;

      const { stream_type, text, tool_name, status, error_msg } = msg.data;

      switch (stream_type) {
        case 'text':
          if (text) addActivity('text', text.substring(0, 200));
          break;
        case 'tool_use':
          addActivity('tool', `${FRIENDLY_TOOL[tool_name] || tool_name}...`);
          break;
        case 'status':
          if (status === 'completed' || status === 'failed') {
            addActivity('status', status === 'completed' ? 'Build complete' : 'Build failed');
            completedViaWs.value = true;
          }
          break;
        case 'error':
          if (error_msg) addActivity('error', error_msg);
          break;
      }
    } catch {}
  };
}

function closeTaskStream() {
  if (ws) { ws.close(); ws = null; }
}

onUnmounted(() => closeTaskStream());

async function saveKeyAndBuild() {
  const key = inlineApiKey.value.trim();
  if (!key) return;
  saveApiKey(key);
  // Sync to Firestore (best-effort)
  if (props.userId && props.userId !== 'default') {
    saveUserSettings(props.userId, { geminiApiKey: key }).catch(() => {});
  }
  needsApiKey.value = false;
  error.value = '';
  startBuild();
}

const WASM_STEPS = [
  { id: 'init',      label: 'Starting up...',              status: 'pending' },
  { id: 'upload',    label: 'Sending your photos',         status: 'pending' },
  { id: 'describe',  label: 'Understanding your photos',   status: 'pending' },
  { id: 'structure', label: 'Planning your pages',         status: 'pending' },
  { id: 'pages',     label: 'Writing your website',        status: 'pending' },
  { id: 'css',       label: 'Making it beautiful',         status: 'pending' },
  { id: 'save',      label: 'Saving everything',           status: 'pending' },
];

const MESSAGES_STEPS = [
  { id: 'upload', label: 'Uploading your files',           status: 'pending' },
  { id: 'send',   label: 'Sending to AILANG Cloud',         status: 'pending' },
  { id: 'build',  label: 'Building your website',          status: 'pending' },
  { id: 'load',   label: 'Loading your website',           status: 'pending' },
];

const buildSteps = ref([]);

function setStep(id, status, message) {
  const s = buildSteps.value.find(s => s.id === id);
  if (s) s.status = status;
  if (message) statusMessage.value = message;
}

onMounted(() => {
  buildSteps.value = props.buildMode === 'messages'
    ? MESSAGES_STEPS.map(s => ({ ...s }))
    : WASM_STEPS.map(s => ({ ...s }));
  if (!needsApiKey.value) {
    startBuild();
  }
});

// ── Shared helpers ──

function categoriseItems(items) {
  const imageItems = items.filter(i => i.type === 'image' && i.file);
  const videoItems = items.filter(i => i.type === 'video' && i.file);
  const docItems   = items.filter(i => i.type === 'document');
  const textItems  = items.filter(i => i.type === 'text');
  const mediaItems = [...imageItems, ...videoItems];
  return { imageItems, videoItems, docItems, textItems, mediaItems };
}

function handleBuildError(err) {
  closeTaskStream();
  error.value = err.message;
  building.value = false;
  buildSteps.value.forEach(s => { if (s.status === 'active') s.status = 'pending'; });
  if (/api.?key/i.test(err.message)) {
    inlineApiKey.value = '';
  }
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

const builderName = computed(() => props.personaName || (props.buildMode === 'messages' ? 'Sir Claude Fixalot' : 'Gemma Builder'));

async function startBuild() {
  error.value = '';
  building.value = true;
  statusMessage.value = `${builderName.value} is getting ready...`;
  buildSteps.value.forEach(s => s.status = 'pending');

  if (props.buildMode === 'messages') {
    await buildViaMessages();
    return;
  }

  // ── WASM build path (Gemma Builder) ──
  try {
    // 1. Initialize AILANG WASM
    setStep('init', 'active', `${builderName.value} is loading...`);
    if (!isReady()) {
      await initAilang((step, msg) => { statusMessage.value = msg; });
    }
    setStep('init', 'done', 'AI engine ready');

    const { imageItems, videoItems, docItems, textItems, mediaItems } = categoriseItems(props.data.items);

    // 2. Upload media files to sidecar (if sidecar is available)
    const uploadMap = new Map();
    const hasSidecar = await checkSidecar();
    if (hasSidecar && mediaItems.length > 0) {
      setStep('upload', 'active', `Uploading ${mediaItems.length} files...`);
      const user = props.userId || 'default';
      const site = slugify(props.data.description);
      const uploadResults = await uploadMedia(mediaItems, user, site, (done, total) => {
        setStep('upload', 'active', `Uploading files... ${done}/${total}`);
      });
      for (const r of uploadResults) uploadMap.set(r.originalName, r);
      setStep('upload', 'done', `${mediaItems.length} files uploaded`);
    } else if (mediaItems.length > 0) {
      setStep('upload', 'done', 'Skipped (no sidecar)');
    } else {
      setStep('upload', 'done', 'No media files');
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
      // AILANG Cloud decides how to embed (poster, <video>, link, etc.)
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
          const user = props.userId || 'default';
          const site = slugify(props.data.description);
          const resp = await fetch(
            `${API_BASE}/upload?user=${encodeURIComponent(user)}&site=${encodeURIComponent(site)}`,
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
          return [slug, normalizeNavLinks(html, slugs)];
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
      const mediaPayload = [];
      for (const item of [...imageItems, ...videoItems]) {
        const uploaded = uploadMap.get(item.filename);
        if (uploaded) {
          mediaPayload.push({ filename: item.filename, stagingPath: uploaded.stagingPath });
        } else if (item.file) {
          // No sidecar upload — send as base64
          const b64 = await blobToBase64Raw(item.file);
          mediaPayload.push({ filename: item.filename, base64: b64 });
        }
      }
      // Use the AI-generated title so each build gets a unique slug
      let siteName = slugify(props.data.description);
      try {
        const parsed = JSON.parse(String(siteJson));
        if (parsed.title) siteName = parsed.title;
      } catch {}
      const formSheet = getFormSheetId();
      saveResult = await saveSite({
        user: 'default', // TODO: pass from auth
        siteName,
        pages,
        css,
        images: mediaPayload.length > 0 ? mediaPayload : undefined,
        siteJson,
        description: props.data.description,
        repoConfig: getRepoConfig(),
        ...(formSheet ? { formSheetId: formSheet } : {}),
      });
      setStep('save', 'done', 'Saved!');
      console.log('[WB] Site saved:', saveResult);
    } catch (saveErr) {
      // Save failure is non-blocking — site works in memory
      console.warn('[WB] Auto-save failed (site works in memory):', saveErr.message);
      setStep('save', 'done', 'Save skipped');
    }

    statusMessage.value = 'Your website is ready!';
    building.value = false;

    // Include save info in generated data so PreviewStep/PublishStep know the site is persisted
    const generated = { siteJson, pages, css, slugs };
    if (saveResult) {
      generated.userId = saveResult.userId;
      generated.siteSlug = saveResult.siteSlug;
      generated.liveUrl = saveResult.liveUrl || '';
    }
    emit('done', generated);

  } catch (err) {
    handleBuildError(err);
  }
}

// ── Messages (AILANG Cloud) build path ──

async function buildViaMessages() {
  try {
    const { imageItems, videoItems, docItems, textItems, mediaItems } = categoriseItems(props.data.items);
    const siteSlug = slugify(props.data.description);

    // 1. Upload media files to sidecar staging
    const uploadMap = new Map();
    if (mediaItems.length > 0) {
      setStep('upload', 'active', `Uploading ${mediaItems.length} files...`);
      const results = await uploadMedia(mediaItems, props.userId, siteSlug, (done, total) => {
        setStep('upload', 'active', `Uploading files... ${done}/${total}`);
      });
      for (const r of results) uploadMap.set(r.originalName, r);
      setStep('upload', 'done', `${mediaItems.length} files uploaded`);
    } else {
      setStep('upload', 'done', 'No media files');
    }

    // 2. Package brief for AILANG Cloud agent (no WASM, no Gemini key needed)
    setStep('send', 'active', 'Preparing your brief...');
    const stylePrompt = getStylePrompt(props.data.styleId, props.data.customNotes);

    const brief = {
      user: props.userId,
      siteName: siteSlug,
      description: props.data.description,
      style: {
        id: props.data.styleId,
        direction: stylePrompt,
        customNotes: props.data.customNotes || '',
      },
      content: {
        text: textItems.map(i => ({ label: i.label || 'User note', text: i.text })),
        images: imageItems.map(i => {
          const uploaded = uploadMap.get(i.filename);
          return {
            filename: i.filename,
            stagingPath: uploaded?.stagingPath || '',
            useOnSite: i.useOnSite !== false,
            width: i.width,
            height: i.height,
          };
        }),
        videos: videoItems.map(i => {
          const uploaded = uploadMap.get(i.filename);
          return {
            filename: i.filename,
            stagingPath: uploaded?.stagingPath || '',
            useOnSite: i.useOnSite !== false,
            duration: i.duration,
            width: i.width,
            height: i.height,
          };
        }),
        documents: docItems.map(i => ({
          filename: i.filename,
          format: i.format,
          base64: i.base64, // sidecar saves to staging and strips base64
        })),
      },
      repoConfig: getRepoConfig(),
      formSheetId: getFormSheetId(),
      branch: 'main',
      anthropicApiKey: props.anthropicApiKey?.trim() || undefined,
    };

    // 3. Send to sidecar → coordinator → agent
    statusMessage.value = 'Sending to AILANG Cloud...';
    const { briefId, messageId } = await sendBuild(brief);
    console.log('[WB] Messages build sent, briefId:', briefId, 'messageId:', messageId);
    setStep('send', 'done', 'Brief sent');

    // 3b. Connect live activity stream (best-effort — build works without it)
    const taskId = 'task-' + (messageId || '').substring(0, 8);
    connectTaskStream(taskId);

    // 4. Poll for completion (match by coordinator's correlationID = messageId)
    setStep('build', 'active', `${builderName.value} is building your website...`);
    const startTime = Date.now();
    const completion = await pollForCompletion(messageId || briefId, startTime);
    console.log('[WB] Messages build complete:', completion);
    setStep('build', 'done', 'Build complete!');

    // 5. Load generated site from repo
    setStep('load', 'active', 'Loading your website...');
    const generated = await loadGeneratedSite(completion, props.userId, siteSlug);
    setStep('load', 'done', 'Loaded!');

    closeTaskStream();
    statusMessage.value = 'Your website is ready!';
    building.value = false;
    emit('done', generated);

  } catch (err) {
    handleBuildError(err);
  }
}

async function pollForCompletion(correlationId, startTime) {
  const POLL_INTERVAL = 5000;
  const MAX_WAIT = 10 * 60 * 1000; // 10 minutes

  while (Date.now() - startTime < MAX_WAIT) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    statusMessage.value = `${builderName.value} is building your website... (${timeStr})`;

    const messages = await pollStatus();

    for (const msg of messages) {
      try {
        // Skip messages older than this build
        const msgTime = msg.created_at ? new Date(msg.created_at).getTime() : 0;
        if (msgTime && msgTime < startTime) continue;

        const payload = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : (msg.payload || {});
        // Match by correlation_id (primary) or by briefId in payload (fallback)
        // Completion messages have message_type: "completion" per coordinator spec
        const isMatch = (correlationId && msg.correlation_id === correlationId)
          || (correlationId && payload.briefId === correlationId)
          || (msg.message_type === 'completion' && payload.agent_id === 'website-builder' && msgTime > startTime);
        if (isMatch) {
          if (payload.status === 'complete' || payload.status === 'completed') {
            return payload;
          } else if (payload.status === 'failed' || payload.status === 'error') {
            throw new Error(payload.error || payload.errorMsg || payload.error_msg || 'Build failed on the server');
          }
        }
      } catch (e) {
        if (e.message.includes('Build failed') || e.message.includes('server')) throw e;
        // JSON parse error — skip this message
      }
    }

    // Early exit if WebSocket reported completion (poll next iteration will find it)
    if (completedViaWs.value) {
      // One more poll to get the actual completion payload
      const final = await pollStatus();
      for (const msg of final) {
        try {
          const msgTime = msg.created_at ? new Date(msg.created_at).getTime() : 0;
          if (msgTime && msgTime < startTime) continue;
          const payload = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : (msg.payload || {});
          if (payload.status === 'complete' || payload.status === 'completed') return payload;
        } catch {}
      }
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }

  throw new Error('Build timed out after 10 minutes. The build may still complete — check your sites list later.');
}

async function loadGeneratedSite(completion, userId, siteSlug) {
  let files = completion.files || [];
  const rc = getRepoConfig();
  const baseUrl = `https://${rc.owner}.github.io/${rc.repo}/sites/${userId}/${siteSlug}`;

  // If agent didn't return a files list, discover from GitHub repo
  if (files.length === 0) {
    try {
      statusMessage.value = 'Discovering pages...';
      files = await listRepoFiles(userId, siteSlug);
      console.log('[WB] Discovered site files from repo:', files);
    } catch (e) {
      console.warn('[WB] Could not list site files:', e.message);
    }
  }

  // Fetch files from GitHub repo via sidecar proxy (avoids CORS issues with GitHub Pages)
  statusMessage.value = 'Loading your website...';
  const pages = {};
  const slugs = [];
  let css = '';

  for (const file of files) {
    try {
      if (file.endsWith('.html')) {
        const slug = file.replace('.html', '');
        slugs.push(slug);
        statusMessage.value = `Loading ${file}...`;
        pages[slug] = await getRepoFile(userId, siteSlug, file);
      } else if (file.endsWith('.css')) {
        css = await getRepoFile(userId, siteSlug, file);
      }
    } catch (e) {
      console.warn(`[WB] Failed to fetch ${file}:`, e.message);
    }
  }

  // Final fallback: try fetching index.html + style.css directly
  if (slugs.length === 0) {
    try {
      pages['index'] = await getRepoFile(userId, siteSlug, 'index.html');
      slugs.push('index');
    } catch { /* no index.html available */ }
    try {
      css = await getRepoFile(userId, siteSlug, 'style.css');
    } catch { /* no style.css */ }
  }

  if (slugs.length === 0) {
    throw new Error('Could not load the generated website. It may still be deploying — try refreshing your sites list.');
  }

  return {
    pages,
    css,
    slugs,
    siteJson: '',
    userId,
    siteSlug,
    liveUrl: `${baseUrl}/`,
  };
}

// ── WASM build helpers ──

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
    const resp = await fetch(`${API_BASE}/status`, { signal: AbortSignal.timeout(2000) });
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
/* Build header with persona avatar */
.build-header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.5rem;
}
.build-header h1 { margin-bottom: 0.3rem; }
.build-header .subtitle { margin-bottom: 0; }
.build-persona-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  margin-top: 0.15rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

/* Time estimate */
.time-estimate {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--primary-soft);
  border-radius: var(--radius);
  margin-bottom: 1rem;
  font-size: 0.9rem;
  color: var(--primary);
  font-weight: 500;
}

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
  padding: 0.65rem 0;
  color: var(--text-muted);
  font-size: 0.95rem;
  border-bottom: 1px solid var(--border);
  transition: color 0.2s;
}
.progress-item:last-child { border-bottom: none; }
.progress-item.done { color: var(--success); }
.progress-item.active { color: var(--primary); font-weight: 600; }

.progress-icon { width: 1.5rem; display: flex; align-items: center; justify-content: center; }
.icon-done { color: var(--success); }
.icon-pending { color: var(--border); }

.spinner {
  display: inline-block;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* API key card */
.api-key-card {
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.api-key-card-step {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
}
.step-number {
  flex-shrink: 0;
  width: 1.75rem;
  height: 1.75rem;
  background: var(--primary);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 700;
  margin-top: 0.1rem;
}
.api-key-card-step p {
  font-size: 0.95rem;
  margin-bottom: 0.5rem;
  color: var(--text);
}
.get-key-link {
  display: inline-block;
  color: var(--primary);
  font-weight: 600;
  font-size: 0.95rem;
  text-decoration: none;
  padding: 0.6rem 1.2rem;
  border: 1.5px solid var(--primary);
  border-radius: 10px;
  transition: background 0.15s, color 0.15s;
  min-height: 48px;
  display: inline-flex;
  align-items: center;
}
.get-key-link:hover { background: var(--primary); color: white; }
.api-key-input {
  width: 100%;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  padding: 0.75rem;
  font-size: 1rem;
  outline: none;
  font-family: inherit;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.api-key-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.api-key-masked {
  -webkit-text-security: disc;
  text-security: disc;
}
.key-reassurance {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 0.5rem;
}

/* Error boxes */
.error-box {
  background: #FFF0F0;
  border: 1px solid #FFB3B3;
  border-radius: var(--radius);
  padding: 1.25rem;
  margin-bottom: 1rem;
}
.error-box p { margin-bottom: 0.5rem; font-size: 0.95rem; }
.error-box .api-key-input { margin: 0.75rem 0 0.25rem; }
.error-box .hint { font-size: 0.8rem; color: var(--text-muted); margin: 0.25rem 0 0.5rem; }
.error-box .hint a { color: var(--primary); }

/* Activity panel (live streaming) */
.activity-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 1.5rem;
  overflow: hidden;
}
.activity-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
  user-select: none;
  border-bottom: 1px solid var(--border);
}
.activity-header:hover { background: rgba(0,0,0,0.02); }
.activity-toggle { margin-left: auto; }
.ws-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
  transition: background 0.3s;
}
.ws-dot.connected { background: #22c55e; }
.activity-log {
  max-height: 200px;
  overflow-y: auto;
  padding: 0.5rem 0;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, monospace;
  font-size: 0.8rem;
  line-height: 1.5;
}
.activity-entry {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.15rem 1rem;
  color: var(--text-muted);
}
.activity-entry.tool { color: var(--primary); }
.activity-entry.error { color: #ef4444; }
.activity-entry.status { color: var(--success); font-weight: 600; }
.dot-text { width: 14px; text-align: center; flex-shrink: 0; font-weight: bold; }
.activity-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

@media (max-width: 600px) {
  .time-estimate { font-size: 0.85rem; padding: 0.65rem 0.85rem; }
  .progress-list { padding: 0.75rem; }
  .progress-item { font-size: 0.9rem; gap: 0.5rem; padding: 0.5rem 0; }
  .progress-icon { width: 1.25rem; }
  .api-key-card { padding: 1rem; }
  .api-key-card-step p { font-size: 0.9rem; }
  .api-key-input { font-size: 1rem; } /* 16px prevents iOS zoom */
  .build-persona-avatar { width: 40px; height: 40px; }
  .build-header { gap: 0.75rem; }
  .activity-log { max-height: 150px; font-size: 0.75rem; }
}
</style>
