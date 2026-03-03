/**
 * AILANG WASM module loader for Website Builder.
 * Loads website_builder .ail modules and registers Gemini as the AI handler.
 * Pattern: same as invoice_processor_wasm/js/docparse-loader.js
 */

// Module name used for callFunction (the WASM adapter entry point)
export const WB_MODULE = 'website_builder/services/website_builder_browser';
export const DOCPARSE_MODULE = 'docparse/services/docparse_browser';

// Website builder AILANG modules in dependency order
const WB_MODULES = [
  { name: 'website_builder/types/content',                   path: 'ailang/website_builder/types/content.ail' },
  { name: 'website_builder/services/content_extractor',      path: 'ailang/website_builder/services/content_extractor.ail' },
  { name: 'website_builder/services/site_structurer',        path: 'ailang/website_builder/services/site_structurer.ail' },
  { name: 'website_builder/services/html_generator',         path: 'ailang/website_builder/services/html_generator.ail' },
  { name: 'website_builder/services/validator',              path: 'ailang/website_builder/services/validator.ail' },
  { name: 'website_builder/services/website_builder_browser', path: 'ailang/website_builder/services/website_builder_browser.ail' },
];

// DocParse AILANG modules in dependency order (for document parsing)
const DOCPARSE_MODULES = [
  { name: 'docparse/types/document',          path: 'ailang/docparse/types/document.ail' },
  { name: 'docparse/services/format_router',  path: 'ailang/docparse/services/format_router.ail' },
  { name: 'docparse/services/zip_extract',    path: 'ailang/docparse/services/zip_extract.ail' },
  { name: 'docparse/services/docx_parser',    path: 'ailang/docparse/services/docx_parser.ail' },
  { name: 'docparse/services/pptx_parser',    path: 'ailang/docparse/services/pptx_parser.ail' },
  { name: 'docparse/services/xlsx_parser',    path: 'ailang/docparse/services/xlsx_parser.ail' },
  { name: 'docparse/services/output_formatter', path: 'ailang/docparse/services/output_formatter.ail' },
  { name: 'docparse/services/docparse_browser', path: 'ailang/docparse/services/docparse_browser.ail' },
];

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

let engine = null;
let ready = false;
let loadingPromise = null;

/**
 * Initialize AILANG WASM engine and load all website builder modules.
 * @param {Function} [onProgress] - Optional callback(step, message)
 */
export async function initAilang(onProgress) {
  if (ready) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = _doInit(onProgress);
  return loadingPromise;
}

async function _doInit(onProgress) {
  report(onProgress, 'init', 'Loading AILANG runtime...');

  if (typeof AilangREPL === 'undefined') {
    throw new Error('AilangREPL not found — make sure wasm_exec.js and ailang-repl.js are loaded in index.html');
  }

  const repl = new AilangREPL();
  await repl.init('./wasm/ailang.wasm');
  console.log('AILANG version:', repl.getVersion());

  // Wrapper around the REPL (same pattern as ailang-wrapper.js)
  engine = { repl };

  // Import stdlib modules needed by website builder + docparse
  for (const lib of ['std/json', 'std/option', 'std/result', 'std/string', 'std/list', 'std/math', 'std/ai', 'std/xml']) {
    const r = repl.importModule(lib);
    console.log(`Import ${lib}:`, r);
  }

  // Register Gemini as the AI handler
  report(onProgress, 'ai', 'Registering AI handler...');
  const aiResult = repl.setAIHandler(geminiHandler);
  console.log('AI handler registered:', aiResult);

  // Grant AI capability
  repl.grantCapability('AI');

  // Load all .ail modules (website builder + docparse)
  const ALL_MODULES = [...DOCPARSE_MODULES, ...WB_MODULES];
  for (let i = 0; i < ALL_MODULES.length; i++) {
    const mod = ALL_MODULES[i];
    report(onProgress, 'module', `Loading module ${i + 1}/${ALL_MODULES.length}: ${mod.name}`);

    const resp = await fetch(mod.path + '?v=' + Date.now());
    if (!resp.ok) throw new Error(`Failed to fetch ${mod.path}: ${resp.status}`);
    const code = await resp.text();

    const result = repl.loadModule(mod.name, code);
    if (!result.success) {
      throw new Error(`Module ${mod.name} failed: ${result.error}`);
    }
    console.log(`Loaded ${mod.name} (${(result.exports || []).length} exports)`);
  }

  ready = true;
  report(onProgress, 'ready', 'Ready');
}

/**
 * Call a pure (synchronous) AILANG function in the website builder module.
 * @param {string} funcName
 * @param {...string} args
 * @returns {string} Result string
 */
export function callPure(funcName, ...args) {
  if (!ready) throw new Error('AILANG not initialized');
  const result = engine.repl.call(WB_MODULE, funcName, ...args);
  if (!result.success) throw new Error(`${funcName} failed: ${result.error}`);
  return parseResult(result.result);
}

/**
 * Call a pure (synchronous) AILANG function in any module.
 * @param {string} module - Full module name (e.g. 'docparse/services/docparse_browser')
 * @param {string} funcName
 * @param {...string} args
 * @returns {string} Result string
 */
export function callPureModule(module, funcName, ...args) {
  if (!ready) throw new Error('AILANG not initialized');
  const result = engine.repl.call(module, funcName, ...args);
  if (!result.success) throw new Error(`${module}.${funcName} failed: ${result.error}`);
  return parseResult(result.result);
}

/**
 * Extract text content from a document using Gemini Vision API.
 * Supports PDF and any format Gemini can read via inlineData.
 * @param {string} base64 - Raw base64 data (no data URL prefix)
 * @param {string} mimeType - e.g. 'application/pdf'
 * @param {string} filename - Original filename for context in the prompt
 * @returns {Promise<string>} Extracted text content
 */
export async function extractDocumentContent(base64, mimeType, filename) {
  const apiKey = localStorage.getItem('gemini-api-key');
  if (!apiKey) throw new Error('Gemini API key not set — open Settings to add it');

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: `Extract all the text content from "${filename}". Return as plain text, preserving structure with headings and paragraphs. Be comprehensive and include all important information.` }
        ]
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini error (${response.status}): ${body.substring(0, 200)}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Describe an image using Gemini Vision API.
 * Returns a 1-2 sentence description — avoids passing raw base64 to AILANG WASM.
 * @param {string} base64 - Raw base64 image data (no data URL prefix)
 * @param {string} mimeType - e.g. 'image/jpeg'
 * @returns {Promise<string>} Description text
 */
export async function describeImageWithGemini(base64, mimeType) {
  const apiKey = localStorage.getItem('gemini-api-key');
  if (!apiKey) throw new Error('Gemini API key not set — open Settings to add it');

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: 'Describe this image in 1-2 sentences, focusing on what it shows and how it could be used on a business website. Be specific and practical.' }
        ]
      }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 200 }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini vision error (${response.status}): ${body.substring(0, 200)}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'An image uploaded by the user.';
}

/**
 * Call an AI-effectful AILANG function asynchronously.
 * @param {string} funcName
 * @param {...string} args
 * @returns {Promise<string>} Result string
 */
export async function callAI(funcName, ...args) {
  if (!ready) throw new Error('AILANG not initialized');
  const result = await engine.repl.callAsync(WB_MODULE, funcName, ...args);
  if (!result.success) throw new Error(`${funcName} failed: ${result.error}`);
  return parseResult(result.result);
}

/**
 * Gemini REST API handler — called by AILANG when AI effect is triggered.
 * Uses JSON response mode to prevent markdown-fenced output and ensure
 * valid JSON for all website builder AI calls (buildSiteStructure,
 * renderPage, renderCss all return JSON).
 * Reads API key from localStorage.
 */
async function geminiHandler(prompt) {
  const apiKey = localStorage.getItem('gemini-api-key');
  if (!apiKey) throw new Error('Gemini API key not set — open Settings to add it');

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 32768,
        // Force JSON output — prevents markdown code fences wrapping the response.
        // All website builder AI functions use callJsonSimple and expect JSON back.
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini error (${response.status}): ${body.substring(0, 200)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No content in Gemini response');
  return text;
}

/**
 * Parse AILANG result string (strip type annotation, unwrap quotes).
 */
function parseResult(raw) {
  if (!raw) return raw;
  // Strip " :: Type" annotation
  const typeMatch = raw.match(/^(.+) :: \w+$/s);
  const cleaned = typeMatch ? typeMatch[1] : raw;
  // Unwrap quoted strings
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    try { return JSON.parse(cleaned); } catch { /* fall through */ }
  }
  return cleaned;
}

function report(onProgress, step, message) {
  if (onProgress) onProgress(step, message);
  console.log(`[AILANG] ${message}`);
}

export function isReady() { return ready; }

// Gemini API key helpers — uses same localStorage key as invoice_processor_wasm demos
export function getApiKey() { return localStorage.getItem('gemini-api-key') || ''; }
export function saveApiKey(key) { localStorage.setItem('gemini-api-key', key.trim()); }
export function clearApiKey() { localStorage.removeItem('gemini-api-key'); }

/**
 * On first load, check URL hash for #apikey=XXX injected by the launch script.
 * Saves to localStorage and removes from hash so the key isn't visible in the URL bar.
 * Allows: GOOGLE_API_KEY=xxx ./portal/serve  to pre-populate the key.
 */
export function loadApiKeyFromHash() {
  const hash = window.location.hash;
  const match = hash.match(/[#&]apikey=([^&]+)/);
  if (match) {
    saveApiKey(decodeURIComponent(match[1]));
    // Remove #apikey=... from the URL without triggering a reload
    const cleaned = hash.replace(/[#&]?apikey=[^&]+/, '').replace(/^#$/, '');
    history.replaceState(null, '', window.location.pathname + window.location.search + (cleaned || ''));
    console.log('[AILANG] API key loaded from URL hash');
  }
}
