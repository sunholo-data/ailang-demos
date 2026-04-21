/**
 * DocParse Module Loader
 * Shared between invoice processor (app.js) and docparse standalone (docparse-app.js).
 * Loads AILANG modules in dependency order from the sunholo/ailang_parse registry package.
 */

// Source files come from the vendored sunholo/ailang_parse registry package.
// Module names stay bare (docparse/...) because the package declares
// module_prefix = "docparse" in its ailang.toml and its internal imports
// reference modules under that bare prefix.
const SRC = 'ailang/pkg/sunholo/ailang_parse/docparse';

// Module name used for callFunction (the browser adapter)
export const DOCPARSE_MODULE = 'docparse/services/docparse_browser';

// Modules to load in dependency order (published registry package v0.12.1)
export const DOCPARSE_MODULES = [
  { name: 'pkg/sunholo/a2ui/components',           path: 'ailang/pkg/sunholo/a2ui/components.ail' },
  { name: 'docparse/types/document',              path: `${SRC}/types/document.ail` },
  { name: 'docparse/services/format_router',       path: `${SRC}/services/format_router.ail` },
  { name: 'docparse/services/zip_extract',         path: `${SRC}/services/zip_extract.ail` },
  { name: 'docparse/services/html_parser',         path: `${SRC}/services/html_parser.ail` },
  { name: 'docparse/services/csv_parser',          path: `${SRC}/services/csv_parser.ail` },
  { name: 'docparse/services/markdown_parser',     path: `${SRC}/services/markdown_parser.ail` },
  { name: 'docparse/services/docx_parser',         path: `${SRC}/services/docx_parser.ail` },
  { name: 'docparse/services/pptx_parser',         path: `${SRC}/services/pptx_parser.ail` },
  { name: 'docparse/services/xlsx_parser',         path: `${SRC}/services/xlsx_parser.ail` },
  { name: 'docparse/services/odt_parser',          path: `${SRC}/services/odt_parser.ail` },
  { name: 'docparse/services/odp_parser',          path: `${SRC}/services/odp_parser.ail` },
  { name: 'docparse/services/ods_parser',          path: `${SRC}/services/ods_parser.ail` },
  { name: 'docparse/services/epub_parser',         path: `${SRC}/services/epub_parser.ail` },
  { name: 'docparse/services/tex_parser',          path: `${SRC}/services/tex_parser.ail` },
  { name: 'docparse/services/eml_parser',          path: `${SRC}/services/eml_parser.ail` },
  { name: 'docparse/services/output_formatter',    path: `${SRC}/services/output_formatter.ail` },
  { name: 'docparse/services/a2ui_formatter',      path: `${SRC}/services/a2ui_formatter.ail` },
  { name: 'docparse/services/docparse_browser',    path: `${SRC}/services/docparse_browser.ail` },
];

// Extra stdlib modules DocParse needs beyond what AilangEngine.init() provides
const EXTRA_STDLIBS = ['std/xml', 'std/list', 'std/io', 'std/map', 'std/bytes', 'std/zip', 'std/gzip', 'std/tar', 'std/ai', 'std/fs', 'std/env'];

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
