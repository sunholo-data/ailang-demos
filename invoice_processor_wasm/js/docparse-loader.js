/**
 * DocParse Module Loader
 * Shared between invoice processor (app.js) and docparse standalone (docparse-app.js).
 * Loads 8 AILANG modules in dependency order for Office document parsing.
 */

// Module name used for callFunction (the browser adapter)
export const DOCPARSE_MODULE = 'docparse/services/docparse_browser';

// Modules to load in dependency order (original source of truth)
export const DOCPARSE_MODULES = [
  { name: 'docparse/types/document',           path: 'ailang/docparse/types/document.ail' },
  { name: 'docparse/services/format_router',    path: 'ailang/docparse/services/format_router.ail' },
  { name: 'docparse/services/zip_extract',      path: 'ailang/docparse/services/zip_extract.ail' },
  { name: 'docparse/services/docx_parser',      path: 'ailang/docparse/services/docx_parser.ail' },
  { name: 'docparse/services/pptx_parser',      path: 'ailang/docparse/services/pptx_parser.ail' },
  { name: 'docparse/services/xlsx_parser',      path: 'ailang/docparse/services/xlsx_parser.ail' },
  { name: 'docparse/services/output_formatter', path: 'ailang/docparse/services/output_formatter.ail' },
  { name: 'docparse/services/docparse_browser', path: 'ailang/docparse/services/docparse_browser.ail' },
];

// Extra stdlib modules DocParse needs beyond what AilangEngine.init() provides
const EXTRA_STDLIBS = ['std/xml', 'std/list', 'std/io'];

/**
 * Load all DocParse AILANG modules into an AilangEngine instance.
 * @param {AilangEngine} engine - Initialized engine instance
 * @param {Function} [onProgress] - Optional callback(index, total, moduleName)
 * @returns {Promise<void>}
 */
export async function loadDocParseModules(engine, onProgress) {
  for (const lib of EXTRA_STDLIBS) {
    const r = engine.repl.importModule(lib);
    console.log(`Import ${lib}:`, r);
  }

  for (let i = 0; i < DOCPARSE_MODULES.length; i++) {
    const mod = DOCPARSE_MODULES[i];
    if (onProgress) onProgress(i, DOCPARSE_MODULES.length, mod.name);

    const resp = await fetch(mod.path + '?v=' + Date.now());
    if (!resp.ok) throw new Error(`Failed to fetch ${mod.path}`);
    const code = await resp.text();

    const result = engine.loadDynamicModule(mod.name, code);
    if (!result.success) {
      throw new Error(`Module ${mod.name} load failed: ${result.error}`);
    }
    console.log(`Loaded ${mod.name}: ${(result.exports || []).length} exports`);
  }
}
