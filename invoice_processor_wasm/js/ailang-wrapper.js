/**
 * AILANG WASM Wrapper
 * Handles loading and interaction with the AILANG WebAssembly module
 */

class InvoiceProcessor {
  constructor() {
    this.ready = false;
    this.loading = false;
    this.error = null;
  }

  /**
   * Initialize the WASM module and load the invoice processor
   * @returns {Promise<void>}
   */
  async init() {
    if (this.ready) {
      return;
    }

    if (this.loading) {
      // Wait for existing initialization
      while (this.loading) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    this.loading = true;

    try {
      // Load WASM module using the Go WASM runtime
      const go = new Go();

      // Fetch and instantiate the WASM module
      const result = await WebAssembly.instantiateStreaming(
        fetch('wasm/ailang.wasm'),
        go.importObject
      );

      // Run the Go instance (starts the AILANG REPL)
      go.run(result.instance);

      // Wait for AILANG to be ready
      await this.waitForAilang();

      // Load the invoice processor module
      await this.loadModule('wasm/invoice_processor.ail');

      this.ready = true;
      this.loading = false;
    } catch (err) {
      this.error = err.message;
      this.loading = false;
      throw new Error(`Failed to initialize AILANG: ${err.message}`);
    }
  }

  /**
   * Wait for the AILANG global to be available
   * @returns {Promise<void>}
   */
  async waitForAilang() {
    let attempts = 0;
    const maxAttempts = 50;

    while (typeof window.ailangEval === 'undefined' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    if (typeof window.ailangEval === 'undefined') {
      throw new Error('AILANG WASM failed to initialize');
    }
  }

  /**
   * Load an AILANG module from a file
   * @param {string} path - Path to the .ail file
   * @returns {Promise<void>}
   */
  async loadModule(path) {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to load module: ${response.statusText}`);
      }

      const code = await response.text();

      // Load the module into AILANG
      const result = window.ailangEval(code);

      // Check if there was an error
      if (result && result.includes('Error')) {
        throw new Error(result);
      }
    } catch (err) {
      throw new Error(`Failed to load AILANG module: ${err.message}`);
    }
  }

  /**
   * Process an invoice using the AILANG function
   * @param {Object} invoiceData - The invoice data to process
   * @returns {Promise<Object>} - The processing result
   */
  async processInvoice(invoiceData) {
    if (!this.ready) {
      throw new Error('Invoice processor not initialized. Call init() first.');
    }

    try {
      // Convert invoice data to JSON string
      const jsonInput = JSON.stringify(invoiceData);

      // Escape the JSON string for AILANG
      const escapedJson = this.escapeForAilang(jsonInput);

      // Call the AILANG function
      const ailangCall = `wasm/invoice_processor.processInvoice("${escapedJson}")`;
      const resultString = window.ailangEval(ailangCall);

      // Debug: log what AILANG returned
      console.log('AILANG response:', resultString);

      // Check if AILANG returned an error
      if (!resultString || resultString.trim() === '') {
        return {
          valid: false,
          error: 'AILANG returned empty response',
          errorType: 'wrapper'
        };
      }

      // Parse the result
      let result;
      try {
        result = JSON.parse(resultString);
      } catch (parseErr) {
        return {
          valid: false,
          error: `Failed to parse AILANG response: ${parseErr.message}`,
          errorType: 'wrapper',
          rawResponse: resultString.substring(0, 200) // First 200 chars for debugging
        };
      }

      // Add errorType to distinguish AILANG validation errors
      if (result && !result.valid) {
        result.errorType = 'ailang';
      }

      return result;
    } catch (err) {
      return {
        valid: false,
        error: `WASM execution error: ${err.message}`,
        errorType: 'wrapper'
      };
    }
  }

  /**
   * Escape a JSON string for use in AILANG code
   * @param {string} jsonStr - JSON string to escape
   * @returns {string} - Escaped string
   */
  escapeForAilang(jsonStr) {
    return jsonStr
      .replace(/\\/g, '\\\\')  // Escape backslashes
      .replace(/"/g, '\\"')    // Escape double quotes
      .replace(/\n/g, '\\n')   // Escape newlines
      .replace(/\r/g, '\\r')   // Escape carriage returns
      .replace(/\t/g, '\\t');  // Escape tabs
  }

  /**
   * Get the status of the processor
   * @returns {Object} - Status information
   */
  getStatus() {
    return {
      ready: this.ready,
      loading: this.loading,
      error: this.error
    };
  }
}

// Export for use in other modules
export default InvoiceProcessor;
