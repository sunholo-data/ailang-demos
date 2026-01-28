/**
 * Main application logic for the AILANG Invoice Processor Demo
 */

import InvoiceProcessor from './ailang-wrapper.js';
import { examples } from './examples.js';

// Global processor instance
let processor = null;

/**
 * Initialize the application
 */
async function initializeApp() {
  showLoading('Initializing AILANG WASM...');

  try {
    processor = new InvoiceProcessor();
    await processor.init();

    hideLoading();
    showSuccess('AILANG initialized successfully! Ready to process invoices.');

    // Set up event listeners
    setupEventListeners();

    // Load the first example by default
    loadExample('valid');
  } catch (err) {
    hideLoading();
    showError(`Failed to initialize: ${err.message}`);
  }
}

/**
 * Set up event listeners for UI interactions
 */
function setupEventListeners() {
  // Process button
  const processBtn = document.getElementById('processBtn');
  if (processBtn) {
    processBtn.addEventListener('click', processInvoice);
  }

  // Example buttons
  const exampleButtons = document.querySelectorAll('[data-example]');
  exampleButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      const exampleName = e.currentTarget.getAttribute('data-example');
      loadExample(exampleName);
    });
  });

  // Clear button
  const clearBtn = document.getElementById('clearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearInput);
  }
}

/**
 * Load an example invoice into the input textarea
 * @param {string} exampleName - Name of the example to load
 */
function loadExample(exampleName) {
  const textarea = document.getElementById('invoiceInput');
  if (!textarea) return;

  const example = examples[exampleName];
  if (!example) {
    console.error(`Example '${exampleName}' not found`);
    return;
  }

  textarea.value = JSON.stringify(example, null, 2);

  // Clear previous results
  clearResults();
}

/**
 * Clear the input textarea
 */
function clearInput() {
  const textarea = document.getElementById('invoiceInput');
  if (textarea) {
    textarea.value = '';
  }
  clearResults();
}

/**
 * Process the invoice from the input textarea
 */
async function processInvoice() {
  const textarea = document.getElementById('invoiceInput');
  if (!textarea) return;

  const input = textarea.value.trim();
  if (!input) {
    showError('Please enter invoice data');
    return;
  }

  showLoading('Processing invoice...');

  try {
    // Parse the input JSON
    let invoiceData;
    try {
      invoiceData = JSON.parse(input);
    } catch (parseErr) {
      throw new Error(`Invalid JSON: ${parseErr.message}`);
    }

    // Process with AILANG
    const result = await processor.processInvoice(invoiceData);

    hideLoading();

    // Display results
    if (result.valid) {
      displaySuccessResult(result);
    } else {
      displayErrorResult(result.error);
    }
  } catch (err) {
    hideLoading();
    showError(err.message);
  }
}

/**
 * Display successful processing result
 * @param {Object} result - The processing result
 */
function displaySuccessResult(result) {
  const resultsDiv = document.getElementById('results');
  if (!resultsDiv) return;

  let html = `
    <div class="result-success">
      <h3>✓ Valid Invoice</h3>

      <div class="invoice-info">
        <p><strong>Invoice #:</strong> ${escapeHtml(result.invoice_number)}</p>
        <p><strong>Customer:</strong> ${escapeHtml(result.customer_name)}</p>
        <p><strong>Date:</strong> ${escapeHtml(result.date)}</p>
      </div>

      <h4>Line Items</h4>
      <table class="line-items-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Tax Rate</th>
            <th>Subtotal</th>
            <th>Tax</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
  `;

  result.line_items.forEach(item => {
    html += `
      <tr>
        <td>${escapeHtml(item.description)}</td>
        <td>${item.quantity}</td>
        <td>$${item.unit_price.toFixed(2)}</td>
        <td>${(item.tax_rate * 100).toFixed(1)}%</td>
        <td>$${item.subtotal.toFixed(2)}</td>
        <td>$${item.tax.toFixed(2)}</td>
        <td>$${item.total.toFixed(2)}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>

      <div class="totals">
        <p><strong>Subtotal:</strong> $${result.subtotal.toFixed(2)}</p>
        <p><strong>Discount (${result.discount_percent}%):</strong> -$${result.discount_amount.toFixed(2)}</p>
        <p class="final-total"><strong>Total:</strong> $${result.total.toFixed(2)}</p>
      </div>
    </div>
  `;

  resultsDiv.innerHTML = html;
}

/**
 * Display error result
 * @param {string} errorMessage - The error message
 */
function displayErrorResult(errorMessage) {
  const resultsDiv = document.getElementById('results');
  if (!resultsDiv) return;

  resultsDiv.innerHTML = `
    <div class="result-error">
      <h3>✗ Validation Failed</h3>
      <p class="error-message">${escapeHtml(errorMessage)}</p>
      <div class="error-explanation">
        <h4>Why AILANG Caught This Error</h4>
        <p>
          AILANG's type system and validation logic detected this issue <strong>before</strong>
          any calculations were performed. In JavaScript or Python, this error might have caused:
        </p>
        <ul>
          <li>Runtime crashes (NaN, undefined, null pointer exceptions)</li>
          <li>Silent calculation errors producing incorrect totals</li>
          <li>Data corruption in your database</li>
        </ul>
        <p>
          With AILANG, errors are caught early and reported clearly, making your applications
          more reliable and easier to debug.
        </p>
      </div>
    </div>
  `;
}

/**
 * Show loading indicator
 * @param {string} message - Loading message
 */
function showLoading(message) {
  const resultsDiv = document.getElementById('results');
  if (!resultsDiv) return;

  resultsDiv.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

/**
 * Hide loading indicator
 */
function hideLoading() {
  // Loading will be replaced by results
}

/**
 * Show success message
 * @param {string} message - Success message
 */
function showSuccess(message) {
  const resultsDiv = document.getElementById('results');
  if (!resultsDiv) return;

  resultsDiv.innerHTML = `
    <div class="status-success">
      <p>✓ ${escapeHtml(message)}</p>
    </div>
  `;
}

/**
 * Show error message
 * @param {string} message - Error message
 */
function showError(message) {
  const resultsDiv = document.getElementById('results');
  if (!resultsDiv) return;

  resultsDiv.innerHTML = `
    <div class="status-error">
      <p>✗ ${escapeHtml(message)}</p>
    </div>
  `;
}

/**
 * Clear results display
 */
function clearResults() {
  const resultsDiv = document.getElementById('results');
  if (!resultsDiv) return;

  resultsDiv.innerHTML = `
    <p class="placeholder">Paste invoice data and click "Process Invoice"</p>
  `;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
