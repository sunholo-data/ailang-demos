/**
 * Output Formatter — renders validated extraction results in multiple formats.
 * Supports: JSON (pretty-printed), Table, AILANG Record syntax.
 * Includes file metadata (_file_* fields) and copy-to-clipboard.
 */

export class OutputFormatter {
  constructor() {
    this.format = 'json'; // 'json', 'table', 'ailang'
  }

  /**
   * Build the full data object: schema fields + _file_* metadata
   */
  _buildData(result, schema) {
    const data = {};
    for (const f of schema.fields) {
      if (f.name in result) data[f.name] = result[f.name];
    }
    // Append file metadata under _file_* namespace
    for (const key of Object.keys(result)) {
      if (key.startsWith('_file_')) data[key] = result[key];
    }
    return data;
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

    // File metadata bar (if source file info is present)
    if (result._file_name) {
      const meta = document.createElement('div');
      meta.className = 'result-meta';
      const parts = [`Source: ${this._escapeHtml(result._file_name)}`];
      if (result._file_type) parts.push(result._file_type);
      if (result._file_size) parts.push(this._formatSize(result._file_size));
      if (result._file_modified) parts.push(`modified ${this._formatTimestamp(result._file_modified)}`);
      if (result._file_uploaded) parts.push(`uploaded ${this._formatTimestamp(result._file_uploaded)}`);
      meta.textContent = parts.join(' \u00b7 ');
      container.appendChild(meta);
    }

    // Toolbar: format tabs + copy button
    const toolbar = document.createElement('div');
    toolbar.className = 'output-toolbar';

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
    toolbar.appendChild(tabs);

    // Copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn-copy';
    copyBtn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M5 11H3.5A1.5 1.5 0 0 1 2 9.5v-7A1.5 1.5 0 0 1 3.5 1h7A1.5 1.5 0 0 1 12 2.5V5"/></svg> Copy`;
    copyBtn.title = 'Copy extracted data to clipboard';
    copyBtn.addEventListener('click', () => {
      const data = this._buildData(result, schema);
      const text = JSON.stringify(data, null, 2);
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3 3 7-7"/></svg> Copied!`;
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M5 11H3.5A1.5 1.5 0 0 1 2 9.5v-7A1.5 1.5 0 0 1 3.5 1h7A1.5 1.5 0 0 1 12 2.5V5"/></svg> Copy`;
          copyBtn.classList.remove('copied');
        }, 2000);
      });
    });
    toolbar.appendChild(copyBtn);

    container.appendChild(toolbar);

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
    const data = this._buildData(result, schema);

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

    // Schema fields
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

    // File metadata rows
    const metaFields = Object.keys(result).filter(k => k.startsWith('_file_'));
    if (metaFields.length > 0) {
      const sep = document.createElement('tr');
      sep.className = 'meta-separator';
      sep.innerHTML = '<td colspan="4" class="meta-label">File Metadata</td>';
      tbody.appendChild(sep);

      for (const key of metaFields) {
        const val = result[key];
        let display = String(val ?? '');
        if (key === '_file_size') display = this._formatSize(val);
        if (key === '_file_modified' || key === '_file_uploaded') display = this._formatTimestamp(val);
        const tr = document.createElement('tr');
        tr.className = 'meta-row';
        tr.innerHTML = `
          <td><strong>${this._escapeHtml(key)}</strong></td>
          <td><code>meta</code></td>
          <td>${this._escapeHtml(display)}</td>
          <td><span class="icon-pass" style="width:16px;height:16px"></span></td>
        `;
        tbody.appendChild(tr);
      }
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

    // Add file metadata as comments + fields
    const metaFields = Object.keys(result).filter(k => k.startsWith('_file_'));
    if (metaFields.length > 0) {
      lines.push('');
      lines.push('  -- file metadata');
      for (const key of metaFields) {
        const val = result[key];
        if (typeof val === 'string') {
          lines.push(`  ${key}: "${this._escapeHtml(val)}"`);
        } else {
          lines.push(`  ${key}: ${val ?? 0}`);
        }
      }
    }

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

  _formatTimestamp(ms) {
    const d = new Date(ms);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  _formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  _escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
}

export default OutputFormatter;
