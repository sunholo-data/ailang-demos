/**
 * DocParse WASM App
 * Orchestrates file upload -> JSZip extraction -> AILANG XML parsing -> output rendering
 * Supports embedded image extraction and Gemini AI for PDF/image parsing.
 */

import AilangEngine from './ailang-wrapper.js';
import { renderBlocks, renderMarkdown, renderJson } from './docparse-output.js';
import { GeminiClient, loadApiKey, saveApiKey, clearApiKey } from './gemini-client.js';
import { loadDocParseModules, DOCPARSE_MODULE, DOCPARSE_MODULES } from './docparse-loader.js';
import { renderDocxPreview, renderXlsxPreview, renderPptxPreview, renderPdfPreview, renderImagePreview, renderTextPreview } from './office-preview.js';

// ── State ───────────────────────────────────────────────────────
let engine = null;
let moduleLoaded = false;
let lastFileBuffer = null;   // ArrayBuffer of last uploaded file
let lastFileInfo = null;     // { name, mimeType, officeType, format, text }

// ── Initialization ──────────────────────────────────────────────

async function init() {
  updateStatus('Loading WASM runtime...', 'loading');
  setupApiKeyPanel();

  try {
    engine = new AilangEngine();
    await engine.init();

    await loadDocParseModules(engine, (i, total, name) => {
      updateStatus(`Loading module ${i + 1}/${total}: ${name}...`, 'loading');
    });

    moduleLoaded = true;
    updateStatus('Ready', 'ready');
    enableUI();
    console.log('DocParse WASM initialized with', DOCPARSE_MODULES.length, 'modules');
  } catch (err) {
    updateStatus('Error: ' + err.message, 'error');
    console.error('DocParse init failed:', err);
  }
}

// ── API Key ─────────────────────────────────────────────────────

function setupApiKeyPanel() {
  const panel = document.getElementById('apiKeyPanel');
  const toggle = document.getElementById('apiKeyToggle');
  const input = document.getElementById('apiKeyInput');
  const saveBtn = document.getElementById('saveKeyBtn');
  const clearBtn = document.getElementById('clearKeyBtn');

  if (toggle && panel) {
    toggle.addEventListener('click', () => {
      panel.classList.toggle('open');
    });
  }

  if (saveBtn && input) {
    saveBtn.addEventListener('click', () => {
      const key = input.value.trim();
      if (key) {
        saveApiKey(key);
        input.value = '';
        updateApiKeyBadge();
      }
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') saveBtn.click();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearApiKey();
      updateApiKeyBadge();
    });
  }

  updateApiKeyBadge();
}

function updateApiKeyBadge() {
  const badge = document.getElementById('demoBadge');
  const hasKey = !!loadApiKey();
  if (badge) {
    badge.textContent = hasKey ? 'Live Mode' : 'Demo Mode';
    badge.className = 'demo-badge' + (hasKey ? ' live' : '');
  }
}

// ── File Handling ───────────────────────────────────────────────

async function handleFile(file) {
  if (!moduleLoaded) return;

  clearOutput();
  const filename = file.name;
  updateStatus('Processing ' + filename + '...', 'processing');
  updateFileInfo(filename, file.size);

  try {
    // Step 1: Get format info from AILANG
    const formatResult = engine.callFunction(DOCPARSE_MODULE, 'getFormatInfo', filename);
    if (!formatResult.success) throw new Error('Format detection failed: ' + formatResult.error);

    const formatInfo = JSON.parse(formatResult.result);
    updatePipeline('format', formatInfo);

    // Step 2: Parse based on format
    if (formatInfo.format === 'zip-office') {
      await parseOfficeDocument(file, formatInfo);
    } else if (formatInfo.needsAI) {
      await parseWithAI(file, formatInfo);
    } else if (formatInfo.format === 'text') {
      await parseTextDocument(file, formatInfo);
    } else {
      showUnsupported(formatInfo);
    }

    updateStatus('Done', 'ready');
  } catch (err) {
    updateStatus('Error: ' + err.message, 'error');
    console.error('Parse error:', err);
    showError(err.message);
  }
}

async function parseOfficeDocument(file, formatInfo) {
  updatePipeline('extract', 'Extracting ZIP entries...');

  // Read file as ArrayBuffer
  const buffer = await file.arrayBuffer();
  lastFileBuffer = buffer;
  lastFileInfo = { name: file.name, mimeType: file.type, officeType: formatInfo.officeType, format: formatInfo.format };

  // Extract XML using JSZip
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.keys(zip.files);

  updatePipeline('extract', `Found ${entries.length} entries`);

  const allBlocks = [];
  let metadata = null;

  // Extract and parse metadata (shared across all Office formats)
  const coreXml = await readZipEntry(zip, 'docProps/core.xml');
  if (coreXml) {
    updatePipeline('parse', 'Parsing metadata...');
    const metaResult = engine.callFunction(DOCPARSE_MODULE, 'parseMetadataXml', coreXml);
    if (metaResult.success) {
      metadata = JSON.parse(metaResult.result);
    }
  }

  // Format-specific parsing
  const officeType = formatInfo.officeType;
  if (officeType === 'word') {
    await parseDocx(zip, entries, allBlocks);
  } else if (officeType === 'powerpoint') {
    await parsePptx(zip, entries, allBlocks);
  } else if (officeType === 'excel') {
    await parseXlsx(zip, entries, allBlocks);
  }

  // Extract embedded images and inject into blocks
  await injectMediaFromZip(zip, entries, allBlocks, officeType);

  // Describe images with AI if API key is available
  await describeImagesWithAI(allBlocks);

  // Render output
  const output = {
    filename: file.name,
    format: formatInfo.extension,
    officeType: officeType,
    metadata: metadata || { title: '', author: '', created: '', modified: '', pageCount: 0 },
    blocks: allBlocks,
    entryCount: entries.length
  };

  renderOutput(output);
}

async function parseDocx(zip, entries, allBlocks) {
  const bodyXml = await readZipEntry(zip, 'word/document.xml');
  if (bodyXml) {
    updatePipeline('parse', 'Parsing DOCX body...');
    const result = engine.callFunction(DOCPARSE_MODULE, 'parseDocxBody', bodyXml);
    if (result.success) {
      allBlocks.push(...JSON.parse(result.result));
    }
  }

  for (const entry of entries.filter(e => e.startsWith('word/header') && e.endsWith('.xml'))) {
    const xml = await readZipEntry(zip, entry);
    if (xml) {
      const result = engine.callFunction(DOCPARSE_MODULE, 'parseDocxSection', xml, 'header');
      if (result.success) allBlocks.push(...JSON.parse(result.result));
    }
  }

  for (const entry of entries.filter(e => e.startsWith('word/footer') && e.endsWith('.xml'))) {
    const xml = await readZipEntry(zip, entry);
    if (xml) {
      const result = engine.callFunction(DOCPARSE_MODULE, 'parseDocxSection', xml, 'footer');
      if (result.success) allBlocks.push(...JSON.parse(result.result));
    }
  }

  const footnoteXml = await readZipEntry(zip, 'word/footnotes.xml');
  if (footnoteXml) {
    const result = engine.callFunction(DOCPARSE_MODULE, 'parseDocxSection', footnoteXml, 'footnote');
    if (result.success) allBlocks.push(...JSON.parse(result.result));
  }

  updatePipeline('parse', `Parsed ${allBlocks.length} blocks from DOCX`);
}

async function parsePptx(zip, entries, allBlocks) {
  const slideEntries = entries
    .filter(e => e.startsWith('ppt/slides/slide') && e.endsWith('.xml') && !e.includes('_rels'))
    .sort();

  for (let i = 0; i < slideEntries.length; i++) {
    updatePipeline('parse', `Parsing slide ${i + 1}/${slideEntries.length}...`);
    const xml = await readZipEntry(zip, slideEntries[i]);
    if (xml) {
      const result = engine.callFunction(DOCPARSE_MODULE, 'parsePptxSlide', xml);
      if (result.success) allBlocks.push(...JSON.parse(result.result));
    }
  }

  updatePipeline('parse', `Parsed ${slideEntries.length} slides, ${allBlocks.length} blocks`);
}

async function parseXlsx(zip, entries, allBlocks) {
  const sharedStringsXml = await readZipEntry(zip, 'xl/sharedStrings.xml') || '';
  const sheetEntries = entries
    .filter(e => e.startsWith('xl/worksheets/sheet') && e.endsWith('.xml'))
    .sort();

  for (let i = 0; i < sheetEntries.length; i++) {
    updatePipeline('parse', `Parsing sheet ${i + 1}/${sheetEntries.length}...`);
    const xml = await readZipEntry(zip, sheetEntries[i]);
    if (xml) {
      const result = engine.callFunction(DOCPARSE_MODULE, 'parseXlsxSheet', xml, sharedStringsXml, sheetEntries[i]);
      if (result.success) allBlocks.push(...JSON.parse(result.result));
    }
  }

  updatePipeline('parse', `Parsed ${sheetEntries.length} sheets, ${allBlocks.length} blocks`);
}

async function parseTextDocument(file, formatInfo) {
  const text = await file.text();
  lastFileBuffer = null;
  lastFileInfo = { name: file.name, mimeType: 'text/plain', officeType: 'text', format: 'text', text };
  renderOutput({
    filename: file.name,
    format: formatInfo.extension,
    officeType: 'text',
    metadata: { title: '', author: '', created: '', modified: '', pageCount: 0 },
    blocks: [{ type: 'text', text: text, style: 'Normal', level: 0 }],
    entryCount: 0
  });
}

// ── AI Parsing (PDF, images, audio, video) ──────────────────────

async function parseWithAI(file, formatInfo) {
  const apiKey = loadApiKey();
  if (!apiKey) {
    showAIRequired(formatInfo);
    return;
  }

  updatePipeline('ai', `Sending ${formatInfo.extension.toUpperCase()} to Gemini for extraction...`);

  const gemini = new GeminiClient(apiKey);
  const buffer = await file.arrayBuffer();
  lastFileBuffer = buffer;
  lastFileInfo = { name: file.name, mimeType: getMimeType(file.name), officeType: 'ai', format: formatInfo.format };
  const base64 = arrayBufferToBase64(buffer);
  const mimeType = getMimeType(file.name);

  const prompt = `Parse this document and extract all content as structured JSON.
Return a JSON object with:
- "blocks": array of content blocks, each with:
  - "type": one of "heading", "text", "table", "list", "image"
  - For heading: { "type": "heading", "text": "...", "level": 1-6 }
  - For text: { "type": "text", "text": "...", "style": "Normal", "level": 0 }
  - For table: { "type": "table", "headers": ["col1",...], "rows": [["cell1",...]] }
  - For list: { "type": "list", "items": ["item1",...], "ordered": false }
  - For image: { "type": "image", "description": "what you see", "mime": "image/png" }
- "metadata": { "title": "", "author": "" }

Extract ALL text content, tables, lists. For images, describe what you see.`;

  try {
    const response = await fetch(
      `${gemini.baseUrl}/models/${gemini.model}:generateContent?key=${gemini.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: base64 } }
            ]
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1
          }
        })
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${body.substring(0, 200)}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No content in Gemini response');

    const parsed = JSON.parse(text);
    updatePipeline('ai', `AI extracted ${(parsed.blocks || []).length} blocks`);

    const output = {
      filename: file.name,
      format: formatInfo.extension,
      officeType: 'ai',
      metadata: parsed.metadata || { title: '', author: '', created: '', modified: '', pageCount: 0 },
      blocks: parsed.blocks || [],
      entryCount: 0
    };

    // For image files, include the image itself as a displayable block
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(formatInfo.extension)) {
      output.blocks.unshift({
        type: 'image',
        description: 'Uploaded image',
        mime: mimeType,
        dataUrl: `data:${mimeType};base64,${base64}`
      });
    }

    renderOutput(output);
  } catch (err) {
    if (err.message.includes('API error (40')) {
      showError('Gemini API key error: ' + err.message);
    } else {
      showError('AI parsing failed: ' + err.message);
    }
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function getMimeType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const mimes = {
    pdf: 'application/pdf',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', tiff: 'image/tiff',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
    mp4: 'video/mp4', webm: 'video/webm',
  };
  return mimes[ext] || 'application/octet-stream';
}

// ── Embedded Image Extraction ───────────────────────────────────

async function injectMediaFromZip(zip, entries, allBlocks, officeType) {
  const mediaPrefix = officeType === 'word' ? 'word/media/'
    : officeType === 'powerpoint' ? 'ppt/media/'
    : officeType === 'excel' ? 'xl/media/'
    : null;

  if (!mediaPrefix) return;

  const mediaEntries = entries.filter(e => e.startsWith(mediaPrefix) && !zip.files[e].dir);
  if (mediaEntries.length === 0) return;

  updatePipeline('media', `Extracting ${mediaEntries.length} embedded media files...`);

  // Extract all media files as base64
  const mediaList = [];
  for (const entry of mediaEntries) {
    try {
      const data = await zip.files[entry].async('base64');
      const filename = entry.split('/').pop();
      const mime = getMimeType(filename);
      mediaList.push({
        dataUrl: `data:${mime};base64,${data}`,
        mime,
        filename
      });
    } catch (e) {
      console.warn('Failed to extract media:', entry, e);
    }
  }

  // Match image blocks to extracted media (by order)
  let mediaIdx = 0;
  function injectIntoBlocks(blocks) {
    for (const block of blocks) {
      if (block.type === 'image' && !block.dataUrl && mediaIdx < mediaList.length) {
        const media = mediaList[mediaIdx++];
        block.dataUrl = media.dataUrl;
        block.mime = media.mime;
      }
      if (block.type === 'section' && block.blocks) {
        injectIntoBlocks(block.blocks);
      }
    }
  }
  injectIntoBlocks(allBlocks);

  // Add remaining unmatched media as new image blocks
  for (let i = mediaIdx; i < mediaList.length; i++) {
    const media = mediaList[i];
    if (media.mime.startsWith('image/')) {
      allBlocks.push({
        type: 'image',
        description: media.filename,
        mime: media.mime,
        dataUrl: media.dataUrl,
        dataLength: 0
      });
    }
  }

  updatePipeline('media', `${mediaList.length} media files, ${mediaIdx} matched to blocks`);
}

// ── AI Image Description ────────────────────────────────────────

async function describeImagesWithAI(allBlocks) {
  const apiKey = loadApiKey();
  if (!apiKey) return;

  const imageBlocks = collectImageBlocks(allBlocks);
  if (imageBlocks.length === 0) return;

  updatePipeline('ai', `Describing ${imageBlocks.length} images with AI...`);

  const gemini = new GeminiClient(apiKey);
  let described = 0;

  for (let i = 0; i < imageBlocks.length; i++) {
    const block = imageBlocks[i];
    if (!block.dataUrl) continue;

    updatePipeline('ai', `Describing image ${i + 1}/${imageBlocks.length}...`);

    try {
      const [header, base64] = block.dataUrl.split(',');
      const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/png';

      const response = await fetch(
        `${gemini.baseUrl}/models/${gemini.model}:generateContent?key=${gemini.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: 'Describe this image concisely in 1-2 sentences. Focus on the key content and purpose of the image.' },
                { inlineData: { mimeType, data: base64 } }
              ]
            }],
            generationConfig: { temperature: 0.1 }
          })
        }
      );

      if (!response.ok) continue;

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        block.description = text.trim();
        described++;
      }
    } catch (e) {
      console.warn('Failed to describe image:', e);
    }
  }

  updatePipeline('ai', `Described ${described}/${imageBlocks.length} images`);
}

function collectImageBlocks(blocks) {
  const result = [];
  for (const block of blocks) {
    if (block.type === 'image' && block.dataUrl) result.push(block);
    if (block.type === 'section' && block.blocks) {
      result.push(...collectImageBlocks(block.blocks));
    }
  }
  return result;
}

// ── ZIP Helpers ─────────────────────────────────────────────────

async function readZipEntry(zip, path) {
  const file = zip.file(path);
  if (!file) return null;
  try {
    return await file.async('string');
  } catch {
    return null;
  }
}

// ── UI Updates ──────────────────────────────────────────────────

function updateStatus(msg, dotState) {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
  if (dotState) {
    const dot = document.getElementById('statusDot');
    if (dot) {
      dot.classList.remove('loading', 'ready', 'processing', 'error');
      dot.classList.add(dotState);
    }
  }
}

function enableUI() {
  const dropzone = document.getElementById('dropzone');
  if (dropzone) dropzone.classList.add('ready');
  const fileInput = document.getElementById('fileInput');
  if (fileInput) fileInput.disabled = false;
}

function updateFileInfo(name, size) {
  const el = document.getElementById('fileInfo');
  if (el) {
    const sizeStr = size > 1024 * 1024
      ? (size / (1024 * 1024)).toFixed(1) + ' MB'
      : (size / 1024).toFixed(1) + ' KB';
    el.textContent = `${name} (${sizeStr})`;
    el.style.display = 'block';
  }
}

function updatePipeline(stage, detail) {
  const el = document.getElementById('pipeline-log');
  if (el) {
    const line = document.createElement('div');
    line.className = 'pipeline-line';
    line.innerHTML = `<span class="pipeline-stage">${stage}</span> ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  }
}

function clearOutput() {
  const pipelineLog = document.getElementById('pipeline-log');
  if (pipelineLog) pipelineLog.innerHTML = '';

  const panels = ['blocksPanel', 'previewPanel', 'jsonPanel', 'markdownPanel'];
  panels.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });

  const fileInfo = document.getElementById('fileInfo');
  if (fileInfo) fileInfo.style.display = 'none';
}

function renderOutput(output) {
  updatePipeline('done', `${output.blocks.length} blocks extracted`);

  const blocksPanel = document.getElementById('blocksPanel');
  if (blocksPanel) blocksPanel.innerHTML = renderBlocks(output);

  const jsonPanel = document.getElementById('jsonPanel');
  if (jsonPanel) jsonPanel.innerHTML = renderJson(output);

  const markdownPanel = document.getElementById('markdownPanel');
  if (markdownPanel) markdownPanel.innerHTML = renderMarkdown(output);

  // Render preview panel
  renderPreviewPanel();

  const results = document.getElementById('results');
  if (results) results.style.display = 'block';
  const placeholder = document.getElementById('resultsPlaceholder');
  if (placeholder) placeholder.style.display = 'none';

  const firstTab = document.querySelector('.output-tab');
  if (firstTab) firstTab.click();
}

async function renderPreviewPanel() {
  const panel = document.getElementById('previewPanel');
  if (!panel) return;

  panel.innerHTML = '<div class="office-preview-loading">Generating preview...</div>';

  try {
    let html = '';
    if (!lastFileInfo) {
      html = '<div class="office-preview-fallback">No preview available</div>';
    } else if (lastFileInfo.officeType === 'word' && lastFileBuffer) {
      html = await renderDocxPreview(lastFileBuffer);
    } else if (lastFileInfo.officeType === 'excel' && lastFileBuffer) {
      html = await renderXlsxPreview(lastFileBuffer, engine, DOCPARSE_MODULE);
    } else if (lastFileInfo.officeType === 'powerpoint' && lastFileBuffer) {
      html = await renderPptxPreview(lastFileBuffer, engine, DOCPARSE_MODULE);
    } else if (lastFileInfo.mimeType === 'application/pdf' && lastFileBuffer) {
      html = renderPdfPreview(lastFileBuffer);
    } else if (lastFileInfo.mimeType?.startsWith('image/') && lastFileBuffer) {
      html = renderImagePreview(lastFileBuffer, lastFileInfo.mimeType);
    } else if (lastFileInfo.text) {
      html = renderTextPreview(lastFileInfo.text);
    } else {
      html = '<div class="office-preview-fallback">No preview available for this format</div>';
    }
    panel.innerHTML = html;

    // Wire up XLSX sheet tabs if present
    panel.querySelectorAll('.xlsx-sheet-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const sheetIdx = tab.dataset.sheet;
        panel.querySelectorAll('.xlsx-sheet-tab').forEach(t => t.classList.remove('active'));
        panel.querySelectorAll('.xlsx-sheet-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const content = panel.querySelector(`.xlsx-sheet-content[data-sheet="${sheetIdx}"]`);
        if (content) content.classList.add('active');
      });
    });
  } catch (err) {
    panel.innerHTML = `<div class="office-preview-fallback">Preview error: ${err.message}</div>`;
  }
}

function showError(msg) {
  const blocksPanel = document.getElementById('blocksPanel');
  if (blocksPanel) {
    blocksPanel.innerHTML = `<div class="error-msg"><strong>Error:</strong> ${escapeHtml(msg)}</div>`;
  }
  showResultsPanel();
}

function showAIRequired(formatInfo) {
  const blocksPanel = document.getElementById('blocksPanel');
  if (blocksPanel) {
    blocksPanel.innerHTML = `
      <div class="info-msg">
        <strong>${formatInfo.extension.toUpperCase()}</strong> files require AI extraction.
        <br>Strategy: ${formatInfo.strategy}
        <br><br>
        Add your Gemini API key above to enable AI-powered parsing for PDFs, images, audio, and video.
        <br><small>Or use the CLI: <code>ailang run --entry main --caps IO,FS,AI --ai gemini-3-flash-preview docparse/main.ail your-file.${formatInfo.extension}</code></small>
      </div>`;
  }
  updateStatus('AI required — add API key', 'error');
  showResultsPanel();
}

function showUnsupported(formatInfo) {
  const blocksPanel = document.getElementById('blocksPanel');
  if (blocksPanel) {
    blocksPanel.innerHTML = `<div class="info-msg">Format "${formatInfo.extension}" is not yet supported.</div>`;
  }
  showResultsPanel();
}

function showResultsPanel() {
  const results = document.getElementById('results');
  if (results) results.style.display = 'block';
  const placeholder = document.getElementById('resultsPlaceholder');
  if (placeholder) placeholder.style.display = 'none';
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Event Listeners ─────────────────────────────────────────────

function setupEventListeners() {
  const fileInput = document.getElementById('fileInput');
  if (fileInput) {
    fileInput.addEventListener('change', e => {
      if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });
  }

  const dropzone = document.getElementById('dropzone');
  if (dropzone) {
    dropzone.addEventListener('dragover', e => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });
    dropzone.addEventListener('click', () => {
      if (fileInput) fileInput.click();
    });
  }

  document.querySelectorAll('.output-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.output-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.output-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById(tab.dataset.panel);
      if (panel) panel.classList.add('active');
    });
  });

  document.querySelectorAll('.demo-file').forEach(btn => {
    btn.addEventListener('click', async () => {
      const path = btn.dataset.file;
      if (!path) return;
      updateStatus('Loading demo file...');
      try {
        const resp = await fetch(path);
        if (!resp.ok) throw new Error('Failed to fetch demo file');
        const blob = await resp.blob();
        const name = path.split('/').pop();
        const file = new File([blob], name);
        await handleFile(file);
      } catch (err) {
        showError('Failed to load demo: ' + err.message);
      }
    });
  });
}

// ── Boot ────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  init();
});
