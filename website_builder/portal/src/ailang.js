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
// Sourced from the vendored sunholo/ailang_parse registry package (v0.12.1).
// Module names stay bare (docparse/...) because the package uses module_prefix = "docparse".
const DOCPARSE_MODULES = [
  { name: 'pkg/sunholo/a2ui/components',         path: 'ailang/pkg/sunholo/a2ui/components.ail' },
  { name: 'docparse/types/document',            path: 'ailang/docparse/types/document.ail' },
  { name: 'docparse/services/format_router',     path: 'ailang/docparse/services/format_router.ail' },
  { name: 'docparse/services/zip_extract',       path: 'ailang/docparse/services/zip_extract.ail' },
  { name: 'docparse/services/html_parser',       path: 'ailang/docparse/services/html_parser.ail' },
  { name: 'docparse/services/csv_parser',        path: 'ailang/docparse/services/csv_parser.ail' },
  { name: 'docparse/services/markdown_parser',   path: 'ailang/docparse/services/markdown_parser.ail' },
  { name: 'docparse/services/docx_parser',       path: 'ailang/docparse/services/docx_parser.ail' },
  { name: 'docparse/services/pptx_parser',       path: 'ailang/docparse/services/pptx_parser.ail' },
  { name: 'docparse/services/xlsx_parser',       path: 'ailang/docparse/services/xlsx_parser.ail' },
  { name: 'docparse/services/odt_parser',        path: 'ailang/docparse/services/odt_parser.ail' },
  { name: 'docparse/services/odp_parser',        path: 'ailang/docparse/services/odp_parser.ail' },
  { name: 'docparse/services/ods_parser',        path: 'ailang/docparse/services/ods_parser.ail' },
  { name: 'docparse/services/epub_parser',       path: 'ailang/docparse/services/epub_parser.ail' },
  { name: 'docparse/services/tex_parser',        path: 'ailang/docparse/services/tex_parser.ail' },
  { name: 'docparse/services/eml_parser',        path: 'ailang/docparse/services/eml_parser.ail' },
  { name: 'docparse/services/output_formatter',  path: 'ailang/docparse/services/output_formatter.ail' },
  { name: 'docparse/services/a2ui_formatter',    path: 'ailang/docparse/services/a2ui_formatter.ail' },
  { name: 'docparse/services/docparse_browser',  path: 'ailang/docparse/services/docparse_browser.ail' },
];

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-5.4-mini';

let engine = null;
let ready = false;
let loadingPromise = null;
let activeProvider = 'gemini'; // 'gemini' | 'openai'

/**
 * Initialize AILANG WASM engine and load all website builder modules.
 * @param {Function} [onProgress] - Optional callback(step, message)
 * @param {string} [provider='gemini'] - AI provider: 'gemini' or 'openai'
 */
export async function initAilang(onProgress, provider = 'gemini') {
  activeProvider = provider;
  if (ready) {
    // Already initialized — just swap the AI handler for the new provider
    setProvider(provider);
    return;
  }
  if (loadingPromise) return loadingPromise;

  loadingPromise = _doInit(onProgress, provider);
  return loadingPromise;
}

async function _doInit(onProgress, provider) {
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

  // Register AI handler based on provider
  const handler = provider === 'openai' ? openaiHandler : geminiHandler;
  const providerName = provider === 'openai' ? 'OpenAI' : 'Gemini';
  report(onProgress, 'ai', `Registering ${providerName} AI handler...`);
  const aiResult = repl.setAIHandler(handler);
  console.log(`${providerName} AI handler registered:`, aiResult);

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
 * Extract text content from a document using Vision API.
 * Provider-aware: dispatches to Gemini or OpenAI based on activeProvider.
 * @param {string} base64 - Raw base64 data (no data URL prefix)
 * @param {string} mimeType - e.g. 'application/pdf'
 * @param {string} filename - Original filename for context in the prompt
 * @returns {Promise<string>} Extracted text content
 */
export async function extractDocumentContent(base64, mimeType, filename) {
  if (activeProvider === 'openai') return extractDocumentWithOpenAI(base64, mimeType, filename);
  return extractDocumentWithGemini(base64, mimeType, filename);
}

async function extractDocumentWithGemini(base64, mimeType, filename) {
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
 * OpenAI Chat Completions handler — called by AILANG when AI effect is triggered.
 * Mirrors geminiHandler but uses OpenAI's API format.
 */
async function openaiHandler(prompt) {
  const apiKey = localStorage.getItem('openai-api-key');
  if (!apiKey) throw new Error('OpenAI API key not set — open Settings to add it');

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_completion_tokens: 32768,
      response_format: { type: 'json_object' },
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI error (${response.status}): ${body.substring(0, 200)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('No content in OpenAI response');
  return text;
}

/**
 * Extract text content from a document using OpenAI Vision.
 */
async function extractDocumentWithOpenAI(base64, mimeType, filename) {
  const apiKey = localStorage.getItem('openai-api-key');
  if (!apiKey) throw new Error('OpenAI API key not set — open Settings to add it');

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          { type: 'text', text: `Extract all the text content from "${filename}". Return as plain text, preserving structure with headings and paragraphs. Be comprehensive and include all important information.` }
        ]
      }],
      temperature: 0.1,
      max_completion_tokens: 8192,
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI error (${response.status}): ${body.substring(0, 200)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Describe an image using OpenAI Vision.
 */
async function describeImageWithOpenAI(base64, mimeType) {
  const apiKey = localStorage.getItem('openai-api-key');
  if (!apiKey) throw new Error('OpenAI API key not set — open Settings to add it');

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          { type: 'text', text: 'Describe this image in 1-2 sentences, focusing on what it shows and how it could be used on a business website. Be specific and practical.' }
        ]
      }],
      temperature: 0.3,
      max_completion_tokens: 200,
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI vision error (${response.status}): ${body.substring(0, 200)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'An image uploaded by the user.';
}

/**
 * Swap AI provider without full re-initialization.
 * Used when user switches persona between builds.
 */
export function setProvider(provider) {
  activeProvider = provider;
  if (engine) {
    const handler = provider === 'openai' ? openaiHandler : geminiHandler;
    engine.repl.setAIHandler(handler);
    console.log(`[AILANG] Switched AI provider to ${provider}`);
  }
}

/**
 * Provider-aware image description — dispatches to Gemini or OpenAI.
 */
export async function describeImage(base64, mimeType) {
  if (activeProvider === 'openai') return describeImageWithOpenAI(base64, mimeType);
  return describeImageWithGemini(base64, mimeType);
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
export function getActiveProvider() { return activeProvider; }

/**
 * Quick edit: send current HTML + instruction to AI, get back modified HTML.
 * Direct API call — no WASM, no AILANG pipeline. ~3-5 seconds for minor edits.
 * @param {string} currentHtml - The full HTML of the page being edited
 * @param {string} instruction - What the user wants to change
 * @param {string} [elementContext] - Optional: the selected element area/text
 * @returns {Promise<string>} Modified HTML
 */
export async function quickEditHtml(currentHtml, instruction, elementContext) {
  const sectionHint = elementContext
    ? `\nThe user selected this section: "${elementContext}"\nFocus your edit on this section.`
    : '';

  const prompt = `You are editing a website page. Here is the current HTML:

${currentHtml}
${sectionHint}
User instruction: ${instruction}

Return the COMPLETE modified HTML page with ONLY the requested change applied.
Do not add, remove, or restructure any other content unless specifically asked.
Do not change the overall layout or styling unless specifically asked.
Return ONLY the raw HTML — no explanation, no markdown fences, no wrapping.`;

  if (activeProvider === 'openai') {
    return quickEditWithOpenAI(prompt);
  }
  return quickEditWithGemini(prompt);
}

async function quickEditWithGemini(prompt) {
  const apiKey = localStorage.getItem('gemini-api-key');
  if (!apiKey) throw new Error('Gemini API key not set — open Settings to add it');

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 65536,
        // No responseMimeType — we want raw HTML, not JSON
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
  return stripMarkdownFences(text);
}

async function quickEditWithOpenAI(prompt) {
  const apiKey = localStorage.getItem('openai-api-key');
  if (!apiKey) throw new Error('OpenAI API key not set — open Settings to add it');

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_completion_tokens: 65536,
      // No response_format — we want raw HTML, not JSON
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI error (${response.status}): ${body.substring(0, 200)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('No content in OpenAI response');
  return stripMarkdownFences(text);
}

/** Strip markdown code fences if the AI wraps the HTML in them */
function stripMarkdownFences(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    const firstNewline = trimmed.indexOf('\n');
    const lastFence = trimmed.lastIndexOf('```');
    if (lastFence > firstNewline) {
      return trimmed.substring(firstNewline + 1, lastFence).trim();
    }
  }
  return trimmed;
}

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
