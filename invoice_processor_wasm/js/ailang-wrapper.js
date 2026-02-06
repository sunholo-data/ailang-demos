/**
 * AILANG WASM Engine
 * Wraps the AILANG WASM REPL with support for dynamic module loading,
 * AI handler registration, and generic function calls.
 */

class AilangEngine {
  constructor() {
    this.ready = false;
    this.loading = false;
    this.error = null;
    this.repl = null;
    this.loadedModules = new Map(); // name -> { exports }
    this._aiHandler = null;
    this._hasNativeAI = false;
  }

  /**
   * Initialize the WASM module and import stdlib
   */
  async init() {
    if (this.ready) return;
    if (this.loading) {
      while (this.loading) await new Promise(r => setTimeout(r, 100));
      return;
    }

    this.loading = true;
    try {
      if (typeof AilangREPL === 'undefined') {
        throw new Error('AilangREPL class not found. Make sure ailang-repl.js is loaded.');
      }

      this.repl = new AilangREPL();
      await this.repl.init('wasm/ailang.wasm');

      console.log('AILANG REPL initialized, version:', this.repl.getVersion());

      // Import core stdlib modules
      const stdlibs = ['std/json', 'std/option', 'std/result', 'std/string', 'std/math', 'std/ai'];
      for (const lib of stdlibs) {
        const result = this.repl.importModule(lib);
        console.log(`Import ${lib}:`, result);
      }

      // Check if native AI handler support exists (REPL method or global function)
      this._hasNativeAI = typeof this.repl.setAIHandler === 'function'
        || typeof window.ailangSetAIHandler === 'function';
      this._hasAsyncCall = typeof this.repl.callAsync === 'function';
      console.log('Native AI handler support:', this._hasNativeAI);
      console.log('Async call support:', this._hasAsyncCall);

      this.ready = true;
    } catch (err) {
      this.error = err.message;
      throw new Error(`Failed to initialize AILANG: ${err.message}`);
    } finally {
      this.loading = false;
    }
  }

  /**
   * Register an AI handler callback.
   * If native WASM AI handler support exists, registers it with the runtime.
   * Otherwise stores for JS-side fallback.
   * @param {Function} handler - async (input: string) => string
   */
  setAIHandler(handler) {
    this._aiHandler = handler;
    if (this._hasNativeAI) {
      // Prefer REPL method, fall back to global function
      if (typeof this.repl.setAIHandler === 'function') {
        this.repl.setAIHandler(handler);
      } else {
        window.ailangSetAIHandler(handler);
      }
      console.log('Registered native AI handler');
    } else {
      console.log('Stored AI handler for JS-side fallback (no native WASM AI support)');
    }
  }

  /**
   * Whether WASM-native AI handler interop is available
   */
  hasNativeAI() {
    return this._hasNativeAI;
  }

  /**
   * Get the stored AI handler for JS-side fallback
   */
  getAIHandler() {
    return this._aiHandler;
  }

  /**
   * Load an AILANG module from source code at runtime
   * @param {string} name - Module name
   * @param {string} ailangSource - AILANG source code
   * @returns {{ success: boolean, exports?: string[], error?: string }}
   */
  loadDynamicModule(name, ailangSource) {
    if (!this.ready) throw new Error('Engine not initialized');

    const result = this.repl.loadModule(name, ailangSource);

    if (result.success) {
      this.loadedModules.set(name, { exports: result.exports || [] });
      console.log(`Module '${name}' loaded. Exports:`, result.exports);
    } else {
      console.error(`Failed to load module '${name}':`, result.error);
    }

    return result;
  }

  /**
   * Call a function on a loaded module
   * @param {string} moduleName - Module name
   * @param {string} funcName - Function name
   * @param {...string} args - String arguments
   * @returns {{ success: boolean, result?: any, error?: string, errorType?: string }}
   */
  callFunction(moduleName, funcName, ...args) {
    if (!this.ready) throw new Error('Engine not initialized');

    try {
      const callResult = this.repl.call(moduleName, funcName, ...args);

      if (!callResult.success) {
        return {
          success: false,
          error: callResult.error,
          errorType: 'ailang'
        };
      }

      // Parse the result
      const parsed = this._parseResult(callResult.result);
      return {
        success: true,
        result: parsed,
        raw: callResult.result
      };
    } catch (err) {
      return {
        success: false,
        error: `WASM execution error: ${err.message}`,
        errorType: 'wrapper'
      };
    }
  }

  /**
   * Call a function that may trigger async effect handlers (e.g. AI calls).
   * Uses the REPL's callAsync when available, falls back to synchronous call.
   * @param {string} moduleName - Module name
   * @param {string} funcName - Function name
   * @param {...string} args - String arguments
   * @returns {Promise<{ success: boolean, result?: any, error?: string, errorType?: string }>}
   */
  async callFunctionAsync(moduleName, funcName, ...args) {
    if (!this.ready) throw new Error('Engine not initialized');

    try {
      let callResult;
      if (this._hasAsyncCall) {
        callResult = await this.repl.callAsync(moduleName, funcName, ...args);
      } else {
        callResult = this.repl.call(moduleName, funcName, ...args);
      }

      if (!callResult.success) {
        return {
          success: false,
          error: callResult.error,
          errorType: 'ailang'
        };
      }

      const parsed = this._parseResult(callResult.result);
      return {
        success: true,
        result: parsed,
        raw: callResult.result
      };
    } catch (err) {
      return {
        success: false,
        error: `WASM execution error: ${err.message}`,
        errorType: 'wrapper'
      };
    }
  }

  /**
   * Reset the REPL and reimport stdlibs.
   * Clears all loaded modules.
   */
  async reset() {
    if (!this.ready) return;

    this.repl.reset();
    this.loadedModules.clear();

    // Reimport stdlibs
    const stdlibs = ['std/json', 'std/option', 'std/result', 'std/string', 'std/math', 'std/ai'];
    for (const lib of stdlibs) {
      this.repl.importModule(lib);
    }

    // Re-register AI handler if we have native support
    if (this._hasNativeAI && this._aiHandler) {
      if (typeof this.repl.setAIHandler === 'function') {
        this.repl.setAIHandler(this._aiHandler);
      } else {
        window.ailangSetAIHandler(this._aiHandler);
      }
    }
  }

  /**
   * Load the original invoice processor module (backward compat)
   */
  async loadInvoiceModule() {
    const response = await fetch('wasm/invoice_processor.ail?v=' + Date.now());
    if (!response.ok) throw new Error(`Failed to fetch module: ${response.statusText}`);
    const code = await response.text();
    return this.loadDynamicModule('invoice', code);
  }

  /**
   * Process an invoice using the legacy invoice module
   * @param {Object} invoiceData
   * @returns {Object} result
   */
  async processInvoice(invoiceData) {
    if (!this.loadedModules.has('invoice')) {
      await this.loadInvoiceModule();
    }

    const jsonInput = JSON.stringify(invoiceData);
    const result = this.callFunction('invoice', 'processInvoice', jsonInput);

    if (!result.success) {
      return { valid: false, error: result.error, errorType: result.errorType };
    }

    // Parse the JSON string result
    try {
      const parsed = typeof result.result === 'string' ? JSON.parse(result.result) : result.result;
      if (parsed && !parsed.valid) parsed.errorType = 'ailang';
      return parsed;
    } catch (e) {
      return { valid: false, error: `Failed to parse response: ${e.message}`, errorType: 'wrapper', rawResponse: result.raw };
    }
  }

  /**
   * Parse an AILANG result string.
   * Strips type annotations, unescapes quoted strings.
   * @param {string} resultString
   * @returns {string} Cleaned result
   */
  _parseResult(resultString) {
    if (!resultString) return resultString;

    let cleaned = resultString;

    // Strip type annotation " :: Type"
    const typeMatch = cleaned.match(/^(.+) :: \w+$/s);
    if (typeMatch) {
      cleaned = typeMatch[1];
    }

    // Unwrap quoted strings
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      try {
        cleaned = JSON.parse(cleaned);
      } catch {
        cleaned = cleaned.slice(1, -1)
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
          .replace(/\\n/g, '\n');
      }
    }

    return cleaned;
  }

  getStatus() {
    return {
      ready: this.ready,
      loading: this.loading,
      error: this.error,
      modules: Array.from(this.loadedModules.keys()),
      hasNativeAI: this._hasNativeAI,
      hasAIHandler: !!this._aiHandler
    };
  }
}

export default AilangEngine;
