/**
 * DocParse WASM App
 * Orchestrates file upload -> JSZip extraction -> AILANG XML parsing -> output rendering
 * Supports embedded image extraction and Gemini AI for PDF/image parsing.
 */

import AilangEngine from './ailang-wrapper.js';
import { renderBlocks, renderMarkdown, renderJson, blockToMarkdown } from './docparse-output.js';
import { GeminiClient, loadApiKey, saveApiKey, clearApiKey } from './gemini-client.js';
import { loadDocParseModules, DOCPARSE_MODULE, DOCPARSE_MODULES } from './docparse-loader.js';
import { renderDocxPreview, renderXlsxPreview, renderPptxPreview, renderPdfPreview, renderImagePreview, renderTextPreview } from './office-preview.js';
import { parseDocumentFile } from './docparse-utils.js';

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
  updateStatus('Processing ' + file.name + '...', 'processing');
  updateFileInfo(file.name, file.size);

  try {
    // callFn bridge: wraps engine.callFunction to match parseDocumentFile interface
    const callFn = (funcName, ...args) => engine.callFunction(DOCPARSE_MODULE, funcName, ...args);

    const { blocks, metadata } = await parseDocumentFile(file, {
      callFn,
      apiKey: loadApiKey(),
      onProgress: (msg) => updatePipeline('parse', msg),
      JSZip,       // global from CDN in index.html
    });

    // Capture file buffer for preview panel
    if (file.size > 0) {
      lastFileBuffer = await file.arrayBuffer();
      const fmtResult = callFn('getFormatInfo', file.name);
      const formatInfo = fmtResult.success ? JSON.parse(fmtResult.result) : {};
      lastFileInfo = { name: file.name, mimeType: file.type, officeType: formatInfo.officeType, format: formatInfo.format };
    }

    const fmtResult = callFn('getFormatInfo', file.name);
    const formatInfo = fmtResult.success ? JSON.parse(fmtResult.result) : { extension: file.name.split('.').pop(), officeType: 'unknown' };

    renderOutput({
      filename: file.name,
      format: formatInfo.extension || file.name.split('.').pop(),
      officeType: formatInfo.officeType || 'unknown',
      metadata,
      blocks,
      entryCount: 0
    });

    updateStatus('Done', 'ready');
  } catch (err) {
    // PDF/AI-required case: show hint rather than error
    if (err.message.includes('Gemini API key')) {
      const fmtResult = engine.callFunction(DOCPARSE_MODULE, 'getFormatInfo', file.name);
      const formatInfo = fmtResult.success ? JSON.parse(fmtResult.result) : { extension: 'file', strategy: 'AI' };
      showAIRequired(formatInfo);
    } else {
      updateStatus('Error: ' + err.message, 'error');
      console.error('Parse error:', err);
      showError(err.message);
    }
  }
}

function getMimeType(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const mimes = {
    pdf: 'application/pdf',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', tiff: 'image/tiff',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
    mp4: 'video/mp4', webm: 'video/webm',
  };
  return mimes[ext] || 'application/octet-stream';
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
  if (jsonPanel) {
    jsonPanel.innerHTML = renderJson(output);
    addCopyButton(jsonPanel, () => JSON.stringify(output, null, 2));
  }

  const markdownPanel = document.getElementById('markdownPanel');
  if (markdownPanel) {
    markdownPanel.innerHTML = renderMarkdown(output);
    addCopyButton(markdownPanel, () => {
      const { metadata, blocks } = output;
      let md = '';
      if (metadata.title) md += `# ${metadata.title}\n\n`;
      if (metadata.author) md += `**Author:** ${metadata.author}\n\n`;
      for (const block of blocks) md += blockToMarkdown(block);
      return md;
    });
  }

  // Render preview panel
  renderPreviewPanel();

  const results = document.getElementById('results');
  if (results) results.style.display = 'block';
  const placeholder = document.getElementById('resultsPlaceholder');
  if (placeholder) placeholder.style.display = 'none';

  const firstTab = document.querySelector('.output-tab');
  if (firstTab) firstTab.click();
}

function addCopyButton(panel, getText) {
  const btn = document.createElement('button');
  btn.className = 'btn-copy';
  btn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M5 11H3.5A1.5 1.5 0 0 1 2 9.5v-7A1.5 1.5 0 0 1 3.5 1h7A1.5 1.5 0 0 1 12 2.5V5"/></svg> Copy`;
  btn.style.position = 'sticky';
  btn.style.top = '0';
  btn.style.float = 'right';
  btn.style.zIndex = '1';
  btn.addEventListener('click', () => {
    navigator.clipboard.writeText(getText()).then(() => {
      btn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3 3 7-7"/></svg> Copied!`;
      btn.classList.add('copied');
      setTimeout(() => {
        btn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M5 11H3.5A1.5 1.5 0 0 1 2 9.5v-7A1.5 1.5 0 0 1 3.5 1h7A1.5 1.5 0 0 1 12 2.5V5"/></svg> Copy`;
        btn.classList.remove('copied');
      }, 2000);
    });
  });
  panel.prepend(btn);
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
