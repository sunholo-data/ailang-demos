/**
 * Office Document Rich Preview
 * Renders visual previews of DOCX (mammoth.js), XLSX (table grid), and PPTX (thumbnails/slide cards).
 */

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Render a DOCX file as styled HTML using mammoth.js.
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string>} HTML string
 */
export async function renderDocxPreview(buffer) {
  if (typeof mammoth === 'undefined') {
    return '<div class="office-preview-fallback">mammoth.js not loaded — DOCX preview unavailable</div>';
  }
  try {
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    const warnings = result.messages.filter(m => m.type === 'warning').length;
    let html = '<div class="office-preview office-preview-docx">';
    html += '<div class="office-preview-page">' + result.value + '</div>';
    if (warnings > 0) {
      html += `<div class="office-preview-note">${warnings} conversion warning${warnings > 1 ? 's' : ''} (minor formatting differences)</div>`;
    }
    html += '</div>';
    return html;
  } catch (err) {
    return `<div class="office-preview-fallback">DOCX preview failed: ${escapeHtml(err.message)}</div>`;
  }
}

/**
 * Render an XLSX file as HTML table(s) using JSZip + AILANG parsing.
 * @param {ArrayBuffer} buffer
 * @param {object} engine - AILANG engine instance (optional)
 * @param {string} docparseModule - Module name for callFunction (optional)
 * @returns {Promise<string>} HTML string
 */
export async function renderXlsxPreview(buffer, engine, docparseModule) {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const entries = Object.keys(zip.files);

    // Try AILANG parsing if engine is available
    if (engine && docparseModule) {
      const sharedStringsXml = await readEntry(zip, 'xl/sharedStrings.xml') || '';
      const sheetEntries = entries
        .filter(e => e.startsWith('xl/worksheets/sheet') && e.endsWith('.xml'))
        .sort();

      if (sheetEntries.length === 0) {
        return '<div class="office-preview-fallback">No sheets found in XLSX file</div>';
      }

      const sheets = [];
      for (const entry of sheetEntries) {
        const xml = await readEntry(zip, entry);
        if (xml) {
          const result = engine.callFunction(docparseModule, 'parseXlsxSheet', xml, sharedStringsXml, entry);
          if (result.success) {
            const blocks = JSON.parse(result.result);
            sheets.push({ name: entry.replace(/.*\//, '').replace('.xml', ''), blocks });
          }
        }
      }

      return renderSheetTabs(sheets);
    }

    return '<div class="office-preview-fallback">XLSX preview requires AILANG engine</div>';
  } catch (err) {
    return `<div class="office-preview-fallback">XLSX preview failed: ${escapeHtml(err.message)}</div>`;
  }
}

/**
 * Render a PPTX file as slide cards (thumbnail or parsed text).
 * @param {ArrayBuffer} buffer
 * @param {object} engine - AILANG engine instance (optional)
 * @param {string} docparseModule - Module name for callFunction (optional)
 * @returns {Promise<string>} HTML string
 */
export async function renderPptxPreview(buffer, engine, docparseModule) {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const entries = Object.keys(zip.files);

    // Try extracting thumbnail
    let thumbnailHtml = '';
    const thumbFile = zip.file('docProps/thumbnail.jpeg') || zip.file('docProps/thumbnail.png');
    if (thumbFile) {
      const ext = thumbFile.name.endsWith('.png') ? 'png' : 'jpeg';
      const b64 = await thumbFile.async('base64');
      thumbnailHtml = `<div class="office-preview-thumb"><img src="data:image/${ext};base64,${b64}" alt="Presentation thumbnail"></div>`;
    }

    // Parse slides with AILANG if available
    if (engine && docparseModule) {
      const slideEntries = entries
        .filter(e => e.startsWith('ppt/slides/slide') && e.endsWith('.xml') && !e.includes('_rels'))
        .sort();

      const slides = [];
      for (const entry of slideEntries) {
        const xml = await readEntry(zip, entry);
        if (xml) {
          const result = engine.callFunction(docparseModule, 'parsePptxSlide', xml);
          if (result.success) {
            slides.push(JSON.parse(result.result));
          }
        }
      }

      // Extract embedded images for slides
      const mediaFiles = entries.filter(e => e.startsWith('ppt/media/'));
      const mediaMap = {};
      for (const mf of mediaFiles) {
        const file = zip.file(mf);
        if (file) {
          const b64 = await file.async('base64');
          const ext = mf.split('.').pop().toLowerCase();
          const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml' }[ext] || 'image/png';
          mediaMap[mf] = `data:${mime};base64,${b64}`;
        }
      }

      return renderSlideCards(slides, thumbnailHtml, mediaMap);
    }

    // Fallback: just show thumbnail
    if (thumbnailHtml) {
      return `<div class="office-preview office-preview-pptx">${thumbnailHtml}</div>`;
    }

    return '<div class="office-preview-fallback">PPTX preview requires AILANG engine</div>';
  } catch (err) {
    return `<div class="office-preview-fallback">PPTX preview failed: ${escapeHtml(err.message)}</div>`;
  }
}

/**
 * Render a PDF preview using blob URL.
 * @param {ArrayBuffer} buffer
 * @returns {string} HTML string
 */
export function renderPdfPreview(buffer) {
  const blob = new Blob([buffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  return `<div class="office-preview office-preview-pdf">
    <object data="${url}" type="application/pdf" width="100%" height="600">
      <div class="office-preview-fallback">PDF preview not available in this browser</div>
    </object>
  </div>`;
}

/**
 * Render an image preview.
 * @param {ArrayBuffer} buffer
 * @param {string} mimeType
 * @returns {string} HTML string
 */
export function renderImagePreview(buffer, mimeType) {
  const blob = new Blob([buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  return `<div class="office-preview office-preview-image">
    <img src="${url}" alt="Image preview">
  </div>`;
}

/**
 * Render a text file preview.
 * @param {string} text
 * @returns {string} HTML string
 */
export function renderTextPreview(text) {
  return `<div class="office-preview office-preview-text"><pre>${escapeHtml(text)}</pre></div>`;
}

// ── Helpers ──────────────────────────────────────────────────

async function readEntry(zip, path) {
  const file = zip.file(path);
  if (!file) return null;
  try { return await file.async('string'); } catch { return null; }
}

function renderSheetTabs(sheets) {
  let html = '<div class="office-preview office-preview-xlsx">';

  if (sheets.length > 1) {
    html += '<div class="xlsx-sheet-tabs">';
    sheets.forEach((s, i) => {
      html += `<button class="xlsx-sheet-tab${i === 0 ? ' active' : ''}" data-sheet="${i}">${escapeHtml(s.name)}</button>`;
    });
    html += '</div>';
  }

  sheets.forEach((sheet, i) => {
    html += `<div class="xlsx-sheet-content${i === 0 ? ' active' : ''}" data-sheet="${i}">`;
    for (const block of sheet.blocks) {
      if (block.type === 'table') {
        html += renderTableHtml(block);
      } else if (block.type === 'section' && block.blocks) {
        for (const b of block.blocks) {
          if (b.type === 'table') html += renderTableHtml(b);
          else if (b.type === 'heading') html += `<div class="xlsx-sheet-name">${escapeHtml(b.text)}</div>`;
        }
      }
    }
    html += '</div>';
  });

  html += '</div>';
  return html;
}

function renderTableHtml(block) {
  const headers = block.headers || [];
  const rows = block.rows || [];

  let html = '<div class="xlsx-table-wrap"><table class="xlsx-table">';
  if (headers.length > 0) {
    html += '<thead><tr>';
    for (const cell of headers) {
      const text = typeof cell === 'string' ? cell : (cell.text || '');
      const colspan = (typeof cell === 'object' && cell.colSpan > 1) ? ` colspan="${cell.colSpan}"` : '';
      html += `<th${colspan}>${escapeHtml(text)}</th>`;
    }
    html += '</tr></thead>';
  }
  if (rows.length > 0) {
    html += '<tbody>';
    for (const row of rows) {
      const cells = Array.isArray(row) ? row : [];
      html += '<tr>';
      for (const cell of cells) {
        const text = typeof cell === 'string' ? cell : (cell.text || '');
        const colspan = (typeof cell === 'object' && cell.colSpan > 1) ? ` colspan="${cell.colSpan}"` : '';
        html += `<td${colspan}>${escapeHtml(text)}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody>';
  }
  html += '</table></div>';
  return html;
}

function renderSlideCards(slides, thumbnailHtml, mediaMap) {
  let html = '<div class="office-preview office-preview-pptx">';

  if (thumbnailHtml) {
    html += thumbnailHtml;
  }

  html += '<div class="pptx-slides">';
  slides.forEach((slideBlocks, i) => {
    html += `<div class="pptx-slide">`;
    html += `<div class="pptx-slide-number">Slide ${i + 1}</div>`;
    html += '<div class="pptx-slide-content">';

    // slideBlocks may be a section with sub-blocks, or flat blocks
    const blocks = Array.isArray(slideBlocks) ? slideBlocks : [slideBlocks];
    for (const block of blocks) {
      const innerBlocks = (block.type === 'section' && block.blocks) ? block.blocks : [block];
      for (const b of innerBlocks) {
        if (b.type === 'heading') {
          const level = Math.min(b.level || 2, 4);
          html += `<h${level}>${escapeHtml(b.text)}</h${level}>`;
        } else if (b.type === 'text' && b.text?.trim()) {
          html += `<p>${escapeHtml(b.text)}</p>`;
        } else if (b.type === 'list') {
          const tag = b.ordered ? 'ol' : 'ul';
          html += `<${tag}>` + (b.items || []).map(it => `<li>${escapeHtml(it)}</li>`).join('') + `</${tag}>`;
        } else if (b.type === 'table') {
          html += renderTableHtml(b);
        } else if (b.type === 'image' && b.dataUrl) {
          html += `<img src="${b.dataUrl}" alt="${escapeHtml(b.description || '')}" class="pptx-slide-img">`;
        }
      }
    }

    html += '</div></div>';
  });
  html += '</div></div>';
  return html;
}
