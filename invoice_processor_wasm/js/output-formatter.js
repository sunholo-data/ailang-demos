/**
 * Output Formatter — renders validated extraction results in multiple formats.
 * Supports: JSON (pretty-printed), Table, AILANG Record syntax.
 */

export class OutputFormatter {
  constructor() {
    this.format = 'json'; // 'json', 'table', 'ailang'
  }

  /**
   * Render the full result display including validation status and data
   * @param {Object} result - Parsed validation result from AILANG
   * @param {Object} schema - Schema definition
   * @param {HTMLElement} container - Target element
   */
  render(result, schema, container) {
    container.innerHTML = '';

    if (!result) {
      container.innerHTML = '<p class="placeholder">No results yet</p>';
      return;
    }

    // Validation status header
    const status = document.createElement('div');
    if (result.valid) {
      status.className = 'result-success';
      status.innerHTML = '<h3><span class="icon-pass"></span> Extraction Validated</h3>';
    } else {
      status.className = 'result-error';
      status.innerHTML = `
        <h3><span class="icon-fail"></span> Validation Failed</h3>
        <p class="error-message">${this._escapeHtml(result.error || 'Unknown error')}</p>
      `;
      container.appendChild(status);
      return;
    }
    container.appendChild(status);

    // Format tabs
    const tabs = document.createElement('div');
    tabs.className = 'output-format-tabs';
    ['json', 'table', 'ailang'].forEach(fmt => {
      const btn = document.createElement('button');
      btn.className = `output-tab ${this.format === fmt ? 'active' : ''}`;
      btn.textContent = { json: 'JSON', table: 'Table', ailang: 'AILANG Record' }[fmt];
      btn.addEventListener('click', () => {
        this.format = fmt;
        this.render(result, schema, container);
      });
      tabs.appendChild(btn);
    });
    container.appendChild(tabs);

    // Format-specific rendering
    const content = document.createElement('div');
    content.className = 'output-content';

    if (this.format === 'json') {
      this._renderJSON(result, schema, content);
    } else if (this.format === 'table') {
      this._renderTable(result, schema, content);
    } else {
      this._renderAilangRecord(result, schema, content);
    }

    container.appendChild(content);
  }

  _renderJSON(result, schema, container) {
    // Extract only the schema fields (not 'valid')
    const data = {};
    for (const f of schema.fields) {
      if (f.name in result) data[f.name] = result[f.name];
    }

    const pre = document.createElement('pre');
    pre.className = 'output-json';
    pre.innerHTML = `<code>${this._syntaxHighlightJSON(JSON.stringify(data, null, 2))}</code>`;
    container.appendChild(pre);
  }

  _renderTable(result, schema, container) {
    const table = document.createElement('table');
    table.className = 'line-items-table';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Field</th><th>Type</th><th>Value</th><th>Status</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const f of schema.fields) {
      const value = result[f.name];
      const displayValue = f.type === 'int' && typeof value === 'number'
        ? this._formatIntValue(f.name, value)
        : String(value ?? '');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${this._escapeHtml(f.name)}</strong></td>
        <td><code>${f.type}</code></td>
        <td>${this._escapeHtml(displayValue)}</td>
        <td>${value != null ? '<span class="icon-pass" style="width:16px;height:16px"></span>' : '<span class="icon-fail" style="width:16px;height:16px"></span>'}</td>
      `;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    container.appendChild(table);
  }

  _renderAilangRecord(result, schema, container) {
    const lines = schema.fields.map(f => {
      const val = result[f.name];
      if (f.type === 'string') {
        return `  ${f.name}: "${this._escapeHtml(String(val ?? ''))}"`;
      }
      return `  ${f.name}: ${val ?? 0}`;
    });

    const code = `{\n${lines.join(',\n')}\n}`;

    const pre = document.createElement('pre');
    pre.className = 'output-ailang';
    pre.innerHTML = `<code><span class="cm">-- AILANG record literal (type: ${this._escapeHtml(schema.name)})</span>\n${this._highlightAilangRecord(code)}</code>`;
    container.appendChild(pre);
  }

  _formatIntValue(fieldName, value) {
    if (fieldName.endsWith('_cents')) {
      return `${value} ($${(value / 100).toFixed(2)})`;
    }
    return String(value);
  }

  _syntaxHighlightJSON(json) {
    return this._escapeHtml(json)
      .replace(/"([^"]+)":/g, '<span class="fn">"$1"</span>:')
      .replace(/: "([^"]*)"/g, ': <span class="st">"$1"</span>')
      .replace(/: (\d+)/g, ': <span class="ct">$1</span>')
      .replace(/: (true|false)/g, ': <span class="kw">$1</span>')
      .replace(/: (null)/g, ': <span class="cm">$1</span>');
  }

  _highlightAilangRecord(code) {
    return this._escapeHtml(code)
      .replace(/(\w+):/g, '<span class="fn">$1</span>:')
      .replace(/: "([^"]*)"/g, ': <span class="st">"$1"</span>')
      .replace(/: (\d+)/g, ': <span class="ct">$1</span>');
  }

  _escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
}

export default OutputFormatter;
