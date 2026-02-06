/**
 * Schema Editor — visual form builder + AILANG type editor.
 * Two modes that stay in sync via a shared data model.
 */

export class SchemaEditor {
  constructor(containerEl) {
    this.container = containerEl;
    this.mode = 'form'; // 'form' or 'ailang'
    this.schemaName = 'ExtractionResult';
    this.fields = [];
    this.onChange = null; // callback when schema changes
    this._render();
  }

  /**
   * Load a schema from a structured object (for demo examples)
   */
  loadSchema(schema) {
    this.schemaName = schema.name;
    this.fields = schema.fields.map(f => ({ ...f, constraints: [...(f.constraints || [])] }));
    this._render();
    this._fireChange();
  }

  /**
   * Get the current schema as a structured object
   */
  getSchema() {
    if (this.mode === 'ailang') {
      this._syncFromAilang();
    }
    return {
      name: this.schemaName,
      fields: this.fields.filter(f => f.name.trim())
    };
  }

  _render() {
    this.container.innerHTML = '';

    // Mode tabs
    const tabs = document.createElement('div');
    tabs.className = 'schema-mode-tabs';
    tabs.innerHTML = `
      <button class="schema-tab ${this.mode === 'form' ? 'active' : ''}" data-mode="form">Visual Editor</button>
      <button class="schema-tab ${this.mode === 'ailang' ? 'active' : ''}" data-mode="ailang">AILANG Types</button>
    `;
    tabs.querySelectorAll('.schema-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.mode === 'ailang') this._syncFromAilang();
        this.mode = btn.dataset.mode;
        this._render();
      });
    });
    this.container.appendChild(tabs);

    if (this.mode === 'form') {
      this._renderForm();
    } else {
      this._renderAilangEditor();
    }
  }

  _renderForm() {
    const wrapper = document.createElement('div');
    wrapper.className = 'schema-form';

    // Schema name
    const nameRow = document.createElement('div');
    nameRow.className = 'schema-name-row';
    nameRow.innerHTML = `
      <label>Type Name</label>
      <input type="text" class="schema-name-input" value="${this._escapeAttr(this.schemaName)}" placeholder="ExtractionResult">
    `;
    const nameInput = nameRow.querySelector('input');
    nameInput.addEventListener('input', () => {
      this.schemaName = nameInput.value || 'ExtractionResult';
      this._fireChange();
    });
    wrapper.appendChild(nameRow);

    // Field header
    const header = document.createElement('div');
    header.className = 'schema-field-header';
    header.innerHTML = `
      <span class="col-name">Field Name</span>
      <span class="col-type">Type</span>
      <span class="col-req">Req</span>
      <span class="col-constraint">Constraint</span>
      <span class="col-action"></span>
    `;
    wrapper.appendChild(header);

    // Field rows
    this.fields.forEach((field, i) => {
      wrapper.appendChild(this._createFieldRow(field, i));
    });

    // Add field button
    const addBtn = document.createElement('button');
    addBtn.className = 'schema-add-btn';
    addBtn.textContent = '+ Add Field';
    addBtn.addEventListener('click', () => {
      this.fields.push({ name: '', type: 'string', required: false, constraints: [] });
      this._render();
    });
    wrapper.appendChild(addBtn);

    this.container.appendChild(wrapper);
  }

  _createFieldRow(field, index) {
    const row = document.createElement('div');
    row.className = 'schema-field-row';
    row.innerHTML = `
      <input type="text" class="field-name" value="${this._escapeAttr(field.name)}" placeholder="field_name">
      <select class="field-type">
        <option value="string" ${field.type === 'string' ? 'selected' : ''}>string</option>
        <option value="int" ${field.type === 'int' ? 'selected' : ''}>int</option>
      </select>
      <input type="checkbox" class="field-required" ${field.required ? 'checked' : ''}>
      <input type="text" class="field-constraint" value="${this._escapeAttr((field.constraints || []).join(', '))}" placeholder=">= 0">
      <button class="field-remove" title="Remove field">&times;</button>
    `;

    const nameInput = row.querySelector('.field-name');
    const typeSelect = row.querySelector('.field-type');
    const reqCheck = row.querySelector('.field-required');
    const constraintInput = row.querySelector('.field-constraint');
    const removeBtn = row.querySelector('.field-remove');

    nameInput.addEventListener('input', () => {
      this.fields[index].name = nameInput.value;
      this._fireChange();
    });

    typeSelect.addEventListener('change', () => {
      this.fields[index].type = typeSelect.value;
      this._fireChange();
    });

    reqCheck.addEventListener('change', () => {
      this.fields[index].required = reqCheck.checked;
      this._fireChange();
    });

    constraintInput.addEventListener('input', () => {
      const val = constraintInput.value.trim();
      this.fields[index].constraints = val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
      this._fireChange();
    });

    removeBtn.addEventListener('click', () => {
      this.fields.splice(index, 1);
      this._render();
      this._fireChange();
    });

    return row;
  }

  _renderAilangEditor() {
    const wrapper = document.createElement('div');
    wrapper.className = 'schema-ailang-editor';

    const ailangSource = this._fieldsToAilang();

    wrapper.innerHTML = `
      <div class="ailang-editor-hint">
        Define your schema using AILANG record type syntax.
        Fields: <code>name: type</code>. Types: <code>string</code>, <code>int</code>.
      </div>
      <textarea class="ailang-type-textarea" rows="10" spellcheck="false">${this._escapeHtml(ailangSource)}</textarea>
    `;

    this._ailangTextarea = wrapper.querySelector('.ailang-type-textarea');
    this._ailangTextarea.addEventListener('input', () => this._fireChange());

    this.container.appendChild(wrapper);
  }

  _fieldsToAilang() {
    const fields = this.fields
      .filter(f => f.name.trim())
      .map(f => {
        let line = `  ${f.name}: ${f.type}`;
        const meta = [];
        if (f.required) meta.push('required');
        if (f.constraints?.length) meta.push(f.constraints.join(', '));
        if (meta.length) line += `  -- ${meta.join('; ')}`;
        return line;
      })
      .join(',\n');

    return `type ${this.schemaName} = {\n${fields}\n}`;
  }

  _syncFromAilang() {
    if (!this._ailangTextarea) return;
    const src = this._ailangTextarea.value;

    // Parse type name
    const nameMatch = src.match(/type\s+(\w+)\s*=/);
    if (nameMatch) this.schemaName = nameMatch[1];

    // Parse fields
    const bodyMatch = src.match(/\{([^}]*)\}/s);
    if (!bodyMatch) return;

    const body = bodyMatch[1];
    const fieldLines = body.split(',').map(s => s.trim()).filter(Boolean);

    this.fields = fieldLines.map(line => {
      // Strip comment
      const commentIdx = line.indexOf('--');
      const codePart = commentIdx >= 0 ? line.substring(0, commentIdx).trim() : line.trim();
      const commentPart = commentIdx >= 0 ? line.substring(commentIdx + 2).trim() : '';

      const fieldMatch = codePart.match(/(\w+)\s*:\s*(\w+)/);
      if (!fieldMatch) return null;

      const name = fieldMatch[1];
      const type = fieldMatch[2];
      const required = commentPart.includes('required');

      // Parse constraints from comment
      const constraints = [];
      const constraintMatch = commentPart.match(/(>=|<=|>|<|!=)\s*\S+/g);
      if (constraintMatch) {
        constraints.push(...constraintMatch.map(s => s.trim()));
      }

      return { name, type, required, constraints };
    }).filter(Boolean);
  }

  _fireChange() {
    if (this.onChange) {
      this.onChange(this.getSchema());
    }
  }

  _escapeAttr(s) {
    return (s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  _escapeHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

export default SchemaEditor;
