/**
 * DocParse Utilities — shared document parsing logic
 *
 * Used by:
 *   - invoice_processor_wasm/js/docparse-app.js   (global JSZip, engine.callFunction)
 *   - website_builder/portal/src/ailang.js        (npm JSZip, callPureModule)
 *
 * Main export:
 *   parseDocumentFile(file, { callFn, apiKey, onProgress, JSZip })
 *     -> { blocks: Block[], metadata: DocMetadata }
 *
 * callFn(funcName, ...args) must return { success: bool, result: string, error?: string }
 * matching the engine.callFunction / repl.call interface.
 */

export const MIME_TYPES = {
  pdf: 'application/pdf',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', tiff: 'image/tiff',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  mp4: 'video/mp4', webm: 'video/webm',
};

export function getMimeType(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Parse any supported document file into blocks + metadata.
 *
 * @param {File} file
 * @param {object} opts
 * @param {function} opts.callFn       - callFn(funcName, ...args) -> {success, result}
 * @param {string}   opts.apiKey       - Gemini API key (needed for PDF / AI formats)
 * @param {function} [opts.onProgress] - optional (message: string) => void
 * @param {object}   opts.JSZip        - JSZip class (pass global or npm import)
 * @param {string}   [opts.geminiModel] - override Gemini model (default: gemini-2.5-flash)
 * @returns {Promise<{blocks: object[], metadata: object}>}
 */
export async function parseDocumentFile(file, { callFn, apiKey, onProgress, JSZip, geminiModel }) {
  const progress = onProgress || (() => {});
  const model = geminiModel || 'gemini-2.5-flash';

  // Detect format via AILANG
  const fmtResult = callFn('getFormatInfo', file.name);
  if (!fmtResult.success) throw new Error('Format detection failed: ' + fmtResult.error);
  const formatInfo = JSON.parse(fmtResult.result);

  if (formatInfo.format === 'zip-office') {
    return parseOfficeDocument(file, formatInfo, callFn, progress, JSZip, apiKey, model);
  } else if (formatInfo.needsAI) {
    return parseWithAI(file, formatInfo, apiKey, progress, model);
  } else if (formatInfo.format === 'text') {
    const text = await file.text();
    return {
      blocks: [{ type: 'text', text, style: 'Normal', level: 0 }],
      metadata: emptyMeta()
    };
  } else {
    throw new Error(`Unsupported format: ${formatInfo.extension}`);
  }
}

// ── Office ZIP documents (DOCX, PPTX, XLSX) ─────────────────────

async function parseOfficeDocument(file, formatInfo, callFn, progress, JSZip, apiKey, model) {
  progress(`Extracting ${file.name}...`);

  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.keys(zip.files);
  const allBlocks = [];

  // Metadata from docProps/core.xml (shared across all Office types)
  let metadata = emptyMeta();
  const coreXml = await readZipEntry(zip, 'docProps/core.xml');
  if (coreXml) {
    const r = callFn('parseMetadataXml', coreXml);
    if (r.success) metadata = JSON.parse(r.result);
  }

  const officeType = formatInfo.officeType;
  if (officeType === 'word') {
    await parseDocx(zip, entries, allBlocks, callFn, progress);
  } else if (officeType === 'powerpoint') {
    await parsePptx(zip, entries, allBlocks, callFn, progress);
  } else if (officeType === 'excel') {
    await parseXlsx(zip, entries, allBlocks, callFn, progress);
  }

  // Extract embedded images from word/media/, ppt/media/, xl/media/
  await injectMediaFromZip(zip, entries, allBlocks, officeType, progress);

  // Describe embedded images with Gemini Vision
  if (apiKey) {
    await describeImagesWithAI(allBlocks, apiKey, model, progress);
  }

  return { blocks: allBlocks, metadata };
}

async function parseDocx(zip, entries, allBlocks, callFn, progress) {
  // 1. Comments
  const commentsXml = await readZipEntry(zip, 'word/comments.xml');
  const commentBlocksById = {};
  if (commentsXml) {
    progress('Parsing DOCX comments...');
    const r = callFn('parseDocxComments', commentsXml);
    if (r.success) {
      const commentBlocks = JSON.parse(r.result);
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(commentsXml, 'text/xml');
        doc.querySelectorAll('comment').forEach((el, i) => {
          const id = el.getAttribute('w:id');
          if (id && commentBlocks[i]) commentBlocksById[id] = commentBlocks[i];
        });
      } catch (_) {}
    }
  }

  // 2. Body
  const bodyXml = await readZipEntry(zip, 'word/document.xml');
  if (bodyXml) {
    progress('Parsing DOCX body...');
    const r = callFn('parseDocxBody', bodyXml);
    if (r.success) {
      const bodyBlocks = JSON.parse(r.result);
      if (Object.keys(commentBlocksById).length > 0) {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(bodyXml, 'text/xml');
          const body = doc.querySelector('body');
          if (body) {
            const topNodes = Array.from(body.children);
            let blockIdx = 0;
            const insertions = [];
            for (const node of topNodes) {
              if (node.localName === 'p') {
                const txbxCount = node.querySelectorAll('txbxContent').length;
                blockIdx += 1 + txbxCount;
                node.querySelectorAll('commentReference').forEach(ref => {
                  const id = ref.getAttribute('w:id');
                  if (id && commentBlocksById[id]) {
                    insertions.push({ afterIdx: blockIdx - 1, block: commentBlocksById[id] });
                    delete commentBlocksById[id];
                  }
                });
              } else if (node.localName === 'tbl') {
                blockIdx += 1;
              }
            }
            insertions.sort((a, b) => b.afterIdx - a.afterIdx);
            for (const ins of insertions) {
              bodyBlocks.splice(ins.afterIdx + 1, 0, ins.block);
            }
          }
        } catch (_) {}
        for (const block of Object.values(commentBlocksById)) bodyBlocks.push(block);
      }
      allBlocks.push(...bodyBlocks);
    }
  }

  // 3. Headers, footers, footnotes, endnotes
  for (const entry of entries.filter(e => e.startsWith('word/header') && e.endsWith('.xml'))) {
    const xml = await readZipEntry(zip, entry);
    if (xml) { const r = callFn('parseDocxSection', xml, 'header'); if (r.success) allBlocks.push(...JSON.parse(r.result)); }
  }
  for (const entry of entries.filter(e => e.startsWith('word/footer') && e.endsWith('.xml'))) {
    const xml = await readZipEntry(zip, entry);
    if (xml) { const r = callFn('parseDocxSection', xml, 'footer'); if (r.success) allBlocks.push(...JSON.parse(r.result)); }
  }
  const footnoteXml = await readZipEntry(zip, 'word/footnotes.xml');
  if (footnoteXml) { const r = callFn('parseDocxSection', footnoteXml, 'footnote'); if (r.success) allBlocks.push(...JSON.parse(r.result)); }
  const endnoteXml = await readZipEntry(zip, 'word/endnotes.xml');
  if (endnoteXml) { const r = callFn('parseDocxSection', endnoteXml, 'endnote'); if (r.success) allBlocks.push(...JSON.parse(r.result)); }

  progress(`Parsed ${allBlocks.length} blocks from DOCX`);
}

async function parsePptx(zip, entries, allBlocks, callFn, progress) {
  const slideEntries = entries
    .filter(e => e.startsWith('ppt/slides/slide') && e.endsWith('.xml') && !e.includes('_rels'))
    .sort();
  for (let i = 0; i < slideEntries.length; i++) {
    progress(`Parsing slide ${i + 1}/${slideEntries.length}...`);
    const xml = await readZipEntry(zip, slideEntries[i]);
    if (xml) { const r = callFn('parsePptxSlide', xml); if (r.success) allBlocks.push(...JSON.parse(r.result)); }
  }
  progress(`Parsed ${slideEntries.length} slides, ${allBlocks.length} blocks`);
}

async function parseXlsx(zip, entries, allBlocks, callFn, progress) {
  const sharedStringsXml = await readZipEntry(zip, 'xl/sharedStrings.xml') || '';
  const sheetEntries = entries
    .filter(e => e.startsWith('xl/worksheets/sheet') && e.endsWith('.xml'))
    .sort();
  for (let i = 0; i < sheetEntries.length; i++) {
    progress(`Parsing sheet ${i + 1}/${sheetEntries.length}...`);
    const xml = await readZipEntry(zip, sheetEntries[i]);
    if (xml) { const r = callFn('parseXlsxSheet', xml, sharedStringsXml, sheetEntries[i]); if (r.success) allBlocks.push(...JSON.parse(r.result)); }
  }
  progress(`Parsed ${sheetEntries.length} sheets, ${allBlocks.length} blocks`);
}

// ── Embedded image extraction ────────────────────────────────────

async function injectMediaFromZip(zip, entries, allBlocks, officeType, progress) {
  const mediaPrefix = officeType === 'word' ? 'word/media/'
    : officeType === 'powerpoint' ? 'ppt/media/'
    : officeType === 'excel' ? 'xl/media/'
    : null;
  if (!mediaPrefix) return;

  const mediaEntries = entries.filter(e => e.startsWith(mediaPrefix) && !zip.files[e].dir);
  if (mediaEntries.length === 0) return;
  progress(`Extracting ${mediaEntries.length} embedded media files...`);

  const mediaList = [];
  for (const entry of mediaEntries) {
    try {
      const data = await zip.files[entry].async('base64');
      const filename = entry.split('/').pop();
      const mime = getMimeType(filename);
      mediaList.push({ dataUrl: `data:${mime};base64,${data}`, mime, filename });
    } catch (e) {
      console.warn('Failed to extract media:', entry, e);
    }
  }

  let mediaIdx = 0;
  function injectIntoBlocks(blocks) {
    for (const block of blocks) {
      if (block.type === 'image' && !block.dataUrl && mediaIdx < mediaList.length) {
        const m = mediaList[mediaIdx++];
        block.dataUrl = m.dataUrl;
        block.mime = m.mime;
      }
      if (block.type === 'section' && block.blocks) injectIntoBlocks(block.blocks);
    }
  }
  injectIntoBlocks(allBlocks);

  // Append remaining unmatched images as new blocks
  for (let i = mediaIdx; i < mediaList.length; i++) {
    const m = mediaList[i];
    if (m.mime.startsWith('image/')) {
      allBlocks.push({ type: 'image', description: m.filename, mime: m.mime, dataUrl: m.dataUrl, dataLength: 0 });
    }
  }
}

// ── AI image description ─────────────────────────────────────────

async function describeImagesWithAI(allBlocks, apiKey, model, progress) {
  const imageBlocks = collectImageBlocks(allBlocks);
  if (imageBlocks.length === 0) return;
  progress(`Describing ${imageBlocks.length} embedded images with AI...`);

  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  let described = 0;

  for (let i = 0; i < imageBlocks.length; i++) {
    const block = imageBlocks[i];
    if (!block.dataUrl) continue;
    progress(`Describing image ${i + 1}/${imageBlocks.length}...`);
    try {
      const [header, base64] = block.dataUrl.split(',');
      const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/png';
      const resp = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: 'Describe this image concisely in 1-2 sentences. Focus on the key content and purpose.' },
            { inlineData: { mimeType, data: base64 } }
          ]}],
          generationConfig: { temperature: 0.1 }
        })
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) { block.description = text.trim(); described++; }
    } catch (e) {
      console.warn('Failed to describe image:', e);
    }
  }
  progress(`Described ${described}/${imageBlocks.length} embedded images`);
}

function collectImageBlocks(blocks) {
  const result = [];
  for (const block of blocks) {
    if (block.type === 'image' && block.dataUrl) result.push(block);
    if (block.type === 'section' && block.blocks) result.push(...collectImageBlocks(block.blocks));
  }
  return result;
}

// ── PDF and AI-parsed formats ────────────────────────────────────

async function parseWithAI(file, formatInfo, apiKey, progress, model) {
  if (!apiKey) throw new Error(`${formatInfo.extension.toUpperCase()} files require a Gemini API key`);

  progress(`Sending ${formatInfo.extension.toUpperCase()} to Gemini AI...`);
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
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

  const resp = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
    })
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Gemini API error (${resp.status}): ${body.substring(0, 200)}`);
  }

  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No content in Gemini response for document');
  const parsed = JSON.parse(text);
  progress(`AI extracted ${(parsed.blocks || []).length} blocks from ${formatInfo.extension.toUpperCase()}`);
  return { blocks: parsed.blocks || [], metadata: parsed.metadata || emptyMeta() };
}

// ── Helpers ──────────────────────────────────────────────────────

async function readZipEntry(zip, path) {
  const file = zip.file(path);
  if (!file) return null;
  try { return await file.async('string'); } catch { return null; }
}

function emptyMeta() {
  return { title: '', author: '', created: '', modified: '', pageCount: 0 };
}
