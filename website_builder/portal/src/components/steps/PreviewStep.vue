<template>
  <div class="preview-step" :class="{ 'is-fullscreen': isFullscreen }">
    <!-- Page tabs -->
    <div class="page-tabs">
      <button class="tab-back" title="Back to My Websites" @click="$emit('dashboard')">
        &larr;
      </button>
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
        <p v-if="loadingFromSidecar">Loading your website...</p>
        <p v-else>Generating preview...</p>
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
                    v-if="(item.type === 'image' || item.type === 'video') && (item.preview || item.base64)"
                    :src="item.preview || `data:${item.mimeType || 'image/jpeg'};base64,${item.base64}`"
                    class="history-thumb"
                    :alt="item.filename || item.label"
                  />
                  <div v-else-if="item.type === 'video'" class="history-file-icon">🎬</div>
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
import { initAilang, isReady, callAI, callPure, describeImageWithGemini, extractDocumentContent } from '../../ailang.js';
import { saveSite, getRepoConfig } from '../../api.js';
import { normalizeNavLinks, buildSelfContainedHtml } from '../../nav-utils.js';

const props = defineProps({
  generated: { type: Object, required: true },
  description: { type: String, default: '' },
  siteJson: { type: String, default: '' },
  items: { type: Array, default: () => [] },
});
const emit = defineEmits(['publish', 'rebuild', 'update-generated', 'dashboard']);

const slugs = computed(() => {
  const raw = props.generated?.slugs || [];
  // Always show index/home first, then alphabetical
  return [...raw].sort((a, b) => {
    if (a === 'index' || a === 'home') return -1;
    if (b === 'index' || b === 'home') return 1;
    return a.localeCompare(b);
  });
});
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

// Object URLs created from File objects — tracked for cleanup
const objectURLs = ref([]);

function createObjectURLTracked(blob) {
  const url = URL.createObjectURL(blob);
  objectURLs.value.push(url);
  return url;
}

// Build filename→URI map from original uploaded items + pending + persisted post-build additions
const imageMap = computed(() => {
  const map = {};
  for (const item of props.items) {
    if (item.type === 'image' && item.filename) {
      if (item.base64) {
        map[item.filename] = `data:${item.mimeType || 'image/jpeg'};base64,${item.base64}`;
      } else if (item.file) {
        map[item.filename] = createObjectURLTracked(item.file);
      } else if (item.preview) {
        map[item.filename] = item.preview;
      }
    }
    // Video files: use blob URL for the actual video, poster thumbnail for poster image
    if (item.type === 'video' && item.filename) {
      if (item.file) {
        map[item.filename] = createObjectURLTracked(item.file);
      } else if (item.stagingPath) {
        // Staged on sidecar — serve from staging URL
        map[item.filename] = `/api/staging/${item.stagingPath.replace(/^staging\//, '')}`;
      }
      // Poster thumbnail (separate filename)
      if (item.preview) {
        const posterName = item.filename.replace(/\.[^.]+$/, '-poster.jpg');
        map[posterName] = item.preview;
      }
    }
  }
  for (const item of persistedImages.value) {
    if (item.base64 && item.label) {
      map[item.label] = `data:${item.mimeType || 'image/jpeg'};base64,${item.base64}`;
    }
  }
  for (const item of pendingItems.value) {
    if (item.type === 'image' && item.label) {
      if (item.base64) {
        map[item.label] = `data:${item.mimeType || 'image/jpeg'};base64,${item.base64}`;
      } else if (item.file) {
        map[item.label] = createObjectURLTracked(item.file);
      }
    }
  }
  return map;
});

// Script injected into preview iframe for link interception + element hover/selection.
// Uses capture phase for nav so preventDefault fires before any other handler.
// Links are normalized to slug.html format by normalizeNavLinks() before injection,
// but the script also handles #slug and /slug as a safety net.
const SELECTION_SCRIPT = `<style>
[data-wb-h]{outline:2px dashed rgba(124,92,191,0.35)!important;outline-offset:3px!important;cursor:crosshair!important}
[data-wb-s]{outline:2px solid rgba(124,92,191,0.85)!important;outline-offset:3px!important;box-shadow:0 0 0 4px rgba(124,92,191,0.1)!important}
</style><script>
function _wbInit(){
// Link interception (capture phase — fires before any inline onclick or other listeners)
document.addEventListener('click',function(e){
  var a=e.target.closest('a[href]');
  if(!a)return;
  var href=a.getAttribute('href')||'';
  // Skip external links, bare #, and empty hrefs
  if(!href||href==='#'||/^(https?:|mailto:|tel:|javascript:|data:)/i.test(href))return;
  e.preventDefault();
  e.stopPropagation();
  // Normalize any remaining non-standard formats (safety net)
  if(href.startsWith('#')){href=href.substring(1)+'.html';}
  else if(href.startsWith('/')&&!href.startsWith('//')){href=href.substring(1);if(!href.endsWith('.html'))href+='.html';}
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
}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',_wbInit)}else{_wbInit()}
\x3c/script>`;

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
    .replace(/poster=["']([^"']+)["']/g, (match, poster) => {
      const uri = resolve(poster);
      return uri ? `poster="${uri}"` : match;
    })
    .replace(/data-ref=["']([^"']+)["']/g, (match, ref) => {
      const uri = resolve(ref);
      return uri ? `${match} src="${uri}"` : match;
    });
}

// When loaded from sidecar (MySites), rewrite relative asset paths to sidecar URLs
// so they resolve inside srcdoc (which has no base URL).
function rewriteRelativePaths(html) {
  const { userId, siteSlug } = props.generated || {};
  if (!userId || !siteSlug) return html;
  const base = `/api/sites/${encodeURIComponent(userId)}/${encodeURIComponent(siteSlug)}`;
  // Rewrite src=, poster=, and CSS url() with relative paths to sidecar URLs
  const rewriteAttr = (m, pre, path, post) => {
    const clean = path.replace(/^\.\//, '');
    return `${pre}${base}/${clean}${post}`;
  };
  return html
    .replace(/(src=["'])(?!https?:\/\/|data:|blob:|\/\/|#)([^"']+)(["'])/gi, rewriteAttr)
    .replace(/(poster=["'])(?!https?:\/\/|data:|blob:|\/\/|#)([^"']+)(["'])/gi, rewriteAttr)
    .replace(/(url\(["']?)(?!https?:\/\/|data:|blob:|\/\/|#)([^"')]+)(["']?\))/gi, rewriteAttr);
}

// Form handler script — injected into preview iframe so contact forms work.
// Uses relative /api/form-submit (hits local sidecar via Vite proxy or same-origin).
function buildFormScript(endpoint, siteSlug) {
  return `<meta name="wb-site" content="${siteSlug || 'preview'}"><script data-wb-form>
(function(){var EP='${endpoint}';if(!EP)return;
document.addEventListener('submit',function(e){
var f=e.target;if(!f||f.tagName!=='FORM')return;e.preventDefault();
var fd=new FormData(f),fields={};fd.forEach(function(v,k){fields[k]=v;});
var hp=f.querySelector('input[name="_hp"]');if(hp&&hp.value){fields._hp=hp.value;}
var page='unknown';try{var p=location.pathname.split('/').pop().replace('.html','');if(p)page=p;if(page==='index')page='home';}catch(x){}
var site='${siteSlug || 'preview'}';
var btn=f.querySelector('[type="submit"]'),orig=btn?btn.textContent:'';
if(btn){btn.disabled=true;btn.textContent='Sending...';}
var prev=f.querySelector('.wb-form-status');if(prev)prev.remove();
fetch(EP,{method:'POST',headers:{'Content-Type':'application/json'},
body:JSON.stringify({site:site,page:page,fields:fields,submittedAt:new Date().toISOString()})
}).then(function(r){return r.json()}).then(function(d){
var el=document.createElement('div');el.className='wb-form-status';
el.style.cssText='padding:1rem;margin-top:1rem;border-radius:8px;text-align:center;font-weight:600;';
if(d.ok){el.style.background='#E8F5E9';el.style.color='#2E7D32';el.style.border='1px solid #A5D6A7';
el.textContent=d.message||'Thank you!';f.reset();}
else{el.style.background='#FFF3E0';el.style.color='#E65100';el.style.border='1px solid #FFCC80';
el.textContent=d.message||'Something went wrong.';}
f.appendChild(el);if(btn){btn.disabled=false;btn.textContent=orig;}
}).catch(function(){
var el=document.createElement('div');el.className='wb-form-status';
el.style.cssText='padding:1rem;margin-top:1rem;border-radius:8px;text-align:center;font-weight:600;background:#FFF3E0;color:#E65100;border:1px solid #FFCC80;';
el.textContent='Could not submit form. Is the server running?';
f.appendChild(el);if(btn){btn.disabled=false;btn.textContent=orig;}});
},true);})();
\\x3c/script>`;
}

const htmlWithImages = computed(() => {
  let html = resolveImages(currentHtml.value);
  if (!html) return html;
  html = rewriteRelativePaths(html);
  // Inject element selection + nav interception + form handler scripts before </body>
  const siteSlug = props.generated?.siteSlug || 'preview';
  const formScript = buildFormScript('/api/form-submit', siteSlug);
  const combined = SELECTION_SCRIPT + formScript;
  const insertAt = html.lastIndexOf('</body>');
  return insertAt >= 0
    ? html.slice(0, insertAt) + combined + html.slice(insertAt)
    : html + combined;
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
const loadingFromSidecar = ref(false);

onMounted(async () => {
  window.addEventListener('message', onIframeMessage);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (lightboxItem.value) lightboxItem.value = null;
      else isFullscreen.value = false;
    }
  });

  // If we have sidecar info but no pages in memory, load from sidecar
  if (props.generated?.userId && props.generated?.siteSlug && !props.generated?.pages) {
    await loadSiteFromSidecar(props.generated.userId, props.generated.siteSlug);
  }

  // Log initial build
  let siteTitle = 'Website';
  try { siteTitle = JSON.parse(props.generated?.siteJson || '{}')?.title || 'Website'; } catch {}
  const pageList = (props.generated?.slugs || []).map(s => slugLabel(s)).join(', ');
  pushHistory('🏗️', `Built "${siteTitle}"`,
    `${(props.generated?.slugs || []).length} pages (${pageList}) · ${props.items.length} item${props.items.length !== 1 ? 's' : ''}`,
    props.items
  );
});

// Load a site's pages from the sidecar API (same logic as MySites.viewSite)
async function loadSiteFromSidecar(userId, siteSlug) {
  loadingFromSidecar.value = true;
  try {
    const base = `/api/sites/${encodeURIComponent(userId)}/${encodeURIComponent(siteSlug)}`;
    const filesRes = await fetch(`/api/files/${encodeURIComponent(userId)}/${encodeURIComponent(siteSlug)}`);
    const { files } = await filesRes.json();
    const htmlFiles = files.filter(f => f.ext === '.html').map(f => f.name.replace('.html', ''));

    // Fetch all pages
    const pageEntries = await Promise.all(
      htmlFiles.map(async (page) => {
        const r = await fetch(`${base}/${page}.html`);
        if (!r.ok) return null;
        return [page, await r.text()];
      })
    );
    const validPages = pageEntries.filter(Boolean);

    // Inline local CSS
    const cssCache = {};
    const localCssPattern = /<link[^>]+href=["']([^"']+\.css)["'][^>]*\/?>/gi;
    const allHrefs = new Set();
    for (const [, html] of validPages) {
      let m;
      while ((m = localCssPattern.exec(html)) !== null) {
        const href = m[1];
        if (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('//')) {
          allHrefs.add(href);
        }
      }
    }
    await Promise.all([...allHrefs].map(async (href) => {
      try {
        const r = await fetch(`${base}/${href}`);
        if (r.ok) cssCache[href] = await r.text();
      } catch {}
    }));

    const newPages = {};
    for (const [page, html] of validPages) {
      newPages[page] = html.replace(
        /<link([^>]+)href=["']([^"']+\.css)["']([^>]*)\/?>/gi,
        (match, before, href) => {
          if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) return match;
          const content = cssCache[href];
          return content ? `<style>/* ${href} */\n${content}</style>` : match;
        }
      );
    }

    const newSlugs = [...htmlFiles].sort((a, b) => {
      if (a === 'index' || a === 'home') return -1;
      if (b === 'index' || b === 'home') return 1;
      return a.localeCompare(b);
    });

    emit('update-generated', {
      siteJson: props.generated?.siteJson || '{}',
      pages: newPages,
      css: Object.values(cssCache).join('\n'),
      slugs: newSlugs,
      userId,
      siteSlug,
    });
  } catch (err) {
    console.error('[Preview] Failed to load from sidecar:', err);
  } finally {
    loadingFromSidecar.value = false;
  }
}
onUnmounted(() => {
  window.removeEventListener('message', onIframeMessage);
  // Clean up Object URLs to prevent memory leaks
  for (const url of objectURLs.value) {
    URL.revokeObjectURL(url);
  }
  objectURLs.value = [];
});

function slugLabel(slug) {
  if (slug === 'index') return 'Home';
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value;
}

function openInTab() {
  const { userId, siteSlug } = props.generated || {};
  if (userId && siteSlug) {
    // Saved site: open sidecar URL where relative slug.html links work natively
    const page = currentSlug.value === 'home' ? 'index' : currentSlug.value;
    window.open(`/api/sites/${encodeURIComponent(userId)}/${encodeURIComponent(siteSlug)}/${page}.html`, '_blank');
    return;
  }
  // Unsaved: build self-contained HTML with embedded multi-page navigation
  const allPages = {};
  for (const slug of slugs.value) {
    allPages[slug] = resolveImages(props.generated?.pages?.[slug] || '');
  }
  const wrapper = buildSelfContainedHtml(allPages, currentSlug.value);
  const blob = new Blob([wrapper], { type: 'text/html' });
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

  const isTargeted = !!selectedElement.value && pendingItems.value.length === 0;
  const msgPreview = msg.length > 300 ? msg.substring(0, 300) + '…' : msg;

  // Log to history immediately so the user sees it right away
  const addedItems = pendingItems.value.filter(i => i.type === 'image' || i.type === 'document' || i.type === 'text');
  pushHistory('✏️', `"${msgPreview}"`, isTargeted ? `Editing ${slugLabel(currentSlug.value)} page` : 'Editing all pages', addedItems.length > 0 ? [...addedItems] : null);

  // Route through Claude Code (local sidecar only) or WASM
  // Cloud Run has no ailang CLI, so always use WASM when API is remote
  const useSidecar = !import.meta.env.VITE_API_URL && !!(props.generated?.userId && props.generated?.siteSlug);

  try {
    if (useSidecar) {
      await sendFeedbackViaSidecar(msg, isTargeted);
    } else {
      await sendFeedbackViaWasm(msg, isTargeted);
    }
  } catch (err) {
    refineError.value = err.message;
  } finally {
    refining.value = false;
    refineStatus.value = '';
  }
}

// --- Claude Code path: send feedback → coordinator → Claude Code edits files → reload ---

async function sendFeedbackViaSidecar(msg, isTargeted) {
  const { userId, siteSlug } = props.generated;

  // 1. Describe any pending images via Gemini before sending (WASM still used for content extraction)
  if (pendingItems.value.some(i => i.type === 'image' && !i.description)) {
    refineStatus.value = 'Describing new images...';
    for (const item of pendingItems.value) {
      if (item.type === 'image' && !item.description && item.base64) {
        item.description = await describeImageWithGemini(item.base64, item.mimeType);
      }
    }
  }

  // 2. POST feedback to sidecar
  refineStatus.value = 'Sending changes to Claude Code...';
  const feedbackBody = {
    user: userId,
    siteName: siteSlug,
    feedback: msg,
    targetPage: isTargeted ? currentSlug.value : null,
    targetElement: selectedElement.value || null,
    addedContent: pendingItems.value.map(item => ({
      type: item.type,
      filename: item.label,
      description: item.description || item.text || '',
      base64: item.base64 || undefined,
      mimeType: item.mimeType || undefined,
      useOnSite: item.useOnSite,
    })),
    outputDir: `sites/${userId}/${siteSlug}`
  };

  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedback: JSON.stringify(feedbackBody) })
  });
  if (!res.ok) throw new Error(`Failed to send feedback: HTTP ${res.status}`);

  // 3. Poll for completion (check for response message from Claude Code)
  refineStatus.value = 'Claude Code is editing your website...';
  const startTime = Date.now();
  const TIMEOUT = 5 * 60 * 1000; // 5 minutes
  const POLL_INTERVAL = 3000;

  let complete = false;
  while (!complete && (Date.now() - startTime) < TIMEOUT) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    refineStatus.value = `Claude Code is editing your website... (${elapsed}s)`;

    try {
      const statusRes = await fetch('/api/status');
      if (statusRes.ok) {
        const { messages } = await statusRes.json();
        // Look for a response about this site
        const response = messages.find(m => {
          try {
            const body = JSON.parse(m.body || '{}');
            return body.status === 'complete' || body.type === 'feedback-complete';
          } catch { return false; }
        });
        if (response) complete = true;
      }
    } catch {}
  }

  if (!complete) {
    throw new Error('Timed out waiting for Claude Code to finish. Check the coordinator status.');
  }

  // 4. Re-fetch updated pages from sidecar
  refineStatus.value = 'Loading updated pages...';
  const base = `/api/sites/${encodeURIComponent(userId)}/${encodeURIComponent(siteSlug)}`;

  // Get file list first (pages may have changed)
  const filesRes = await fetch(`/api/files/${encodeURIComponent(userId)}/${encodeURIComponent(siteSlug)}`);
  const { files } = await filesRes.json();
  const htmlFiles = files.filter(f => f.ext === '.html').map(f => f.name.replace('.html', ''));

  // Fetch all pages
  const pageEntries = await Promise.all(
    htmlFiles.map(async (page) => {
      const r = await fetch(`${base}/${page}.html`);
      if (!r.ok) return null;
      return [page, await r.text()];
    })
  );

  // Fetch CSS
  const cssCache = {};
  const validPages = pageEntries.filter(Boolean);

  // Inline local CSS (same logic as MySites)
  const localCssPattern = /<link[^>]+href=["']([^"']+\.css)["'][^>]*\/?>/gi;
  const allHrefs = new Set();
  for (const [, html] of validPages) {
    let m;
    while ((m = localCssPattern.exec(html)) !== null) {
      const href = m[1];
      if (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('//')) {
        allHrefs.add(href);
      }
    }
  }
  await Promise.all([...allHrefs].map(async (href) => {
    try {
      const r = await fetch(`${base}/${href}`);
      if (r.ok) cssCache[href] = await r.text();
    } catch {}
  }));

  const newPages = {};
  for (const [page, html] of validPages) {
    newPages[page] = html.replace(
      /<link([^>]+)href=["']([^"']+\.css)["']([^>]*)\/?>/gi,
      (match, before, href) => {
        if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) return match;
        const content = cssCache[href];
        return content ? `<style>/* ${href} */\n${content}</style>` : match;
      }
    );
  }

  const newSlugs = [...htmlFiles].sort((a, b) => {
    if (a === 'index' || a === 'home') return -1;
    if (b === 'index' || b === 'home') return 1;
    return a.localeCompare(b);
  });

  const combinedCss = Object.values(cssCache).join('\n');

  pendingItems.value = [];
  if (!isTargeted) selectedElement.value = null;

  emit('update-generated', {
    siteJson: props.generated.siteJson,
    pages: newPages,
    css: combinedCss,
    slugs: newSlugs,
    userId,
    siteSlug
  });
}

// --- WASM fallback: in-browser refinement via AILANG WASM + Gemini ---

async function sendFeedbackViaWasm(msg, isTargeted) {
  // Lazy-init AILANG WASM if not already loaded
  if (!isReady()) {
    refineStatus.value = 'Loading AI engine...';
    await initAilang((step, m) => { refineStatus.value = m; });
  }

  // 1. Refine site structure
  refineStatus.value = 'Applying your changes...';
  const updatedSiteJson = await callAI('refineStructure', props.generated.siteJson, msg);

  let newPages, newCss, newSlugs;

  if (isTargeted) {
    refineStatus.value = `Updating ${currentSlug.value} page...`;
    const updatedHtml = await callAI('renderPage', updatedSiteJson, currentSlug.value);
    newSlugs = props.generated.slugs;
    newPages = { ...props.generated.pages, [currentSlug.value]: normalizeNavLinks(updatedHtml, newSlugs) };
    newCss = props.generated.css;
  } else {
    const slugsJson = callPure('getPageSlugs', updatedSiteJson);
    newSlugs = JSON.parse(slugsJson);

    let done = 0;
    refineStatus.value = `Writing ${newSlugs.length} pages...`;
    const pageEntries = await Promise.all(
      newSlugs.map(slug =>
        callAI('renderPage', updatedSiteJson, slug).then(html => {
          done++;
          refineStatus.value = `Writing pages... ${done}/${newSlugs.length} done`;
          return [slug, normalizeNavLinks(html, newSlugs)];
        })
      )
    );
    newPages = Object.fromEntries(pageEntries);

    refineStatus.value = 'Finalising design...';
    newCss = await callAI('renderCss', updatedSiteJson);
  }

  // Persist on-site images
  for (const item of pendingItems.value) {
    if (item.type === 'image' && item.useOnSite !== false) {
      persistedImages.value.push({ label: item.label, base64: item.base64, mimeType: item.mimeType });
    }
  }

  // Prune persistedImages
  try {
    const siteStr = JSON.stringify(JSON.parse(updatedSiteJson));
    persistedImages.value = persistedImages.value.filter(img => siteStr.includes(img.label));
  } catch {}

  pendingItems.value = [];
  if (!isTargeted) selectedElement.value = null;

  const updated = {
    siteJson: updatedSiteJson,
    pages: newPages,
    css: newCss,
    slugs: newSlugs,
    // Preserve sidecar info if we have it
    userId: props.generated?.userId,
    siteSlug: props.generated?.siteSlug,
    liveUrl: props.generated?.liveUrl || '',
  };

  emit('update-generated', updated);

  // Auto-save to sidecar (silent, best-effort)
  if (updated.userId && updated.siteSlug) {
    try {
      await saveSite({
        user: updated.userId,
        siteName: updated.siteSlug,
        pages: newPages,
        css: newCss,
        siteJson: updatedSiteJson,
        description: props.description,
        repoConfig: getRepoConfig(),
      });
      console.log('[Preview] Auto-saved after refinement');
    } catch (err) {
      console.warn('[Preview] Auto-save failed:', err.message);
    }
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

.tab-back {
  flex-shrink: 0;
  background: none;
  border: 1.5px solid var(--border);
  border-radius: 20px;
  padding: 0.35rem 0.65rem;
  font-size: 0.9rem;
  line-height: 1;
  cursor: pointer;
  color: var(--text-muted);
  transition: all 0.15s;
  margin-right: 0.25rem;
}
.tab-back:hover { border-color: var(--primary); color: var(--primary); }

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
