/**
 * DocParse Output Renderer
 * Renders parsed document blocks as HTML for the browser UI.
 */

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Blocks View ─────────────────────────────────────────────────

export function renderBlocks(output) {
  const { filename, format, metadata, blocks } = output;

  let html = '<div class="docparse-blocks">';

  // Document info header
  html += '<div class="doc-info">';
  html += `<div class="doc-info-row"><span class="doc-label">File:</span> <span>${escapeHtml(filename)}</span></div>`;
  html += `<div class="doc-info-row"><span class="doc-label">Format:</span> <span class="format-badge">${escapeHtml(format.toUpperCase())}</span></div>`;

  if (metadata.title) {
    html += `<div class="doc-info-row"><span class="doc-label">Title:</span> <span>${escapeHtml(metadata.title)}</span></div>`;
  }
  if (metadata.author) {
    html += `<div class="doc-info-row"><span class="doc-label">Author:</span> <span>${escapeHtml(metadata.author)}</span></div>`;
  }

  // Summary stats
  const headings = blocks.filter(b => b.type === 'heading').length;
  const tables = countTables(blocks);
  const images = countImages(blocks);
  html += `<div class="doc-stats">`;
  html += `<span class="stat">${blocks.length} blocks</span>`;
  if (headings > 0) html += `<span class="stat">${headings} headings</span>`;
  if (tables > 0) html += `<span class="stat">${tables} tables</span>`;
  if (images > 0) html += `<span class="stat">${images} images</span>`;
  html += `</div>`;
  html += '</div>';

  // Render each block
  html += '<div class="blocks-list">';
  for (const block of blocks) {
    html += renderBlock(block);
  }
  html += '</div>';
  html += '</div>';

  return html;
}

function renderBlock(block) {
  switch (block.type) {
    case 'heading':
      return renderHeading(block);
    case 'text':
      return renderText(block);
    case 'table':
      return renderTable(block);
    case 'list':
      return renderList(block);
    case 'image':
      return renderImage(block);
    case 'audio':
      return renderAudio(block);
    case 'video':
      return renderVideo(block);
    case 'section':
      return renderSection(block);
    case 'error':
      return `<div class="block block-error">${escapeHtml(block.text)}</div>`;
    default:
      return `<div class="block block-unknown">[${escapeHtml(block.type)}]</div>`;
  }
}

function renderHeading(block) {
  const level = Math.min(block.level || 1, 6);
  return `<h${level} class="block block-heading">${escapeHtml(block.text)}</h${level}>`;
}

function renderText(block) {
  const text = block.text || '';
  if (!text.trim()) return '';
  const style = block.style && block.style !== 'Normal' ? ` <span class="text-style">${escapeHtml(block.style)}</span>` : '';
  return `<div class="block block-text">${escapeHtml(text)}${style}</div>`;
}

function renderTable(block) {
  const headers = block.headers || [];
  const rows = block.rows || [];

  let html = '<div class="block block-table"><table>';

  // Headers
  if (headers.length > 0) {
    html += '<thead><tr>';
    for (const cell of headers) {
      const text = typeof cell === 'string' ? cell : (cell.text || '');
      const colspan = (typeof cell === 'object' && cell.colSpan > 1) ? ` colspan="${cell.colSpan}"` : '';
      const cls = (typeof cell === 'object' && cell.merged) ? ' class="merged"' : '';
      html += `<th${colspan}${cls}>${escapeHtml(text)}</th>`;
    }
    html += '</tr></thead>';
  }

  // Rows
  if (rows.length > 0) {
    html += '<tbody>';
    for (const row of rows) {
      const cells = Array.isArray(row) ? row : [];
      html += '<tr>';
      for (const cell of cells) {
        const text = typeof cell === 'string' ? cell : (cell.text || '');
        const colspan = (typeof cell === 'object' && cell.colSpan > 1) ? ` colspan="${cell.colSpan}"` : '';
        const cls = (typeof cell === 'object' && cell.merged) ? ' class="merged"' : '';
        html += `<td${colspan}${cls}>${escapeHtml(text)}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody>';
  }

  html += '</table></div>';
  return html;
}

function renderList(block) {
  const items = block.items || [];
  const tag = block.ordered ? 'ol' : 'ul';
  let html = `<div class="block block-list"><${tag}>`;
  for (const item of items) {
    html += `<li>${escapeHtml(item)}</li>`;
  }
  html += `</${tag}></div>`;
  return html;
}

function renderImage(block) {
  const desc = block.description || 'No description';
  let html = `<div class="block block-image">
    <span class="block-badge">IMAGE</span>
    <span class="block-mime">${escapeHtml(block.mime || '')}</span>
    <span>${escapeHtml(desc)}</span>`;
  if (block.dataUrl) {
    html += `<div class="block-image-preview"><img src="${block.dataUrl}" alt="${escapeHtml(desc)}" loading="lazy"></div>`;
  }
  html += `</div>`;
  return html;
}

function renderAudio(block) {
  return `<div class="block block-audio">
    <span class="block-badge">AUDIO</span>
    <span>${escapeHtml(block.transcription || 'No transcription')}</span>
  </div>`;
}

function renderVideo(block) {
  return `<div class="block block-video">
    <span class="block-badge">VIDEO</span>
    <span>${escapeHtml(block.description || 'No description')}</span>
  </div>`;
}

function renderSection(block) {
  const kind = block.kind || 'section';
  const blocks = block.blocks || [];
  let html = `<div class="block block-section">`;
  html += `<div class="section-label">${escapeHtml(kind)}</div>`;
  for (const b of blocks) {
    html += renderBlock(b);
  }
  html += '</div>';
  return html;
}

function countTables(blocks) {
  let count = 0;
  for (const b of blocks) {
    if (b.type === 'table') count++;
    if (b.type === 'section' && b.blocks) count += countTables(b.blocks);
  }
  return count;
}

function countImages(blocks) {
  let count = 0;
  for (const b of blocks) {
    if (b.type === 'image') count++;
    if (b.type === 'section' && b.blocks) count += countImages(b.blocks);
  }
  return count;
}

// ── JSON View ───────────────────────────────────────────────────

export function renderJson(output) {
  const json = JSON.stringify(output, null, 2);
  return `<pre class="json-output"><code>${escapeHtml(json)}</code></pre>`;
}

// ── Markdown View ───────────────────────────────────────────────

export function renderMarkdown(output) {
  const { metadata, blocks } = output;
  let md = '';

  // Metadata header
  if (metadata.title) md += `# ${metadata.title}\n\n`;
  if (metadata.author) md += `**Author:** ${metadata.author}\n\n`;

  // Render blocks to markdown
  for (const block of blocks) {
    md += blockToMarkdown(block);
  }

  return `<pre class="markdown-output"><code>${escapeHtml(md)}</code></pre>`;
}

export function blockToMarkdown(block) {
  switch (block.type) {
    case 'heading': {
      const prefix = '#'.repeat(Math.min(block.level || 1, 6));
      return `${prefix} ${block.text}\n\n`;
    }
    case 'text':
      return block.text ? block.text + '\n\n' : '';
    case 'table':
      return tableToMarkdown(block) + '\n';
    case 'list': {
      const items = block.items || [];
      return items.map((item, i) =>
        block.ordered ? `${i + 1}. ${item}` : `- ${item}`
      ).join('\n') + '\n\n';
    }
    case 'image':
      return block.description ? `[Image: ${block.description}]\n\n` : '[Image]\n\n';
    case 'audio':
      return block.transcription ? `[Audio: ${block.transcription}]\n\n` : '[Audio]\n\n';
    case 'video':
      return block.description ? `[Video: ${block.description}]\n\n` : '[Video]\n\n';
    case 'section': {
      let label = '';
      if (block.kind === 'slide') label = '---\n\n';
      else if (block.kind === 'sheet') label = '---\n\n### Sheet\n\n';
      else if (block.kind) label = `*${block.kind}:*\n`;
      return label + (block.blocks || []).map(blockToMarkdown).join('');
    }
    default:
      return '';
  }
}

function tableToMarkdown(block) {
  const headers = block.headers || [];
  const rows = block.rows || [];

  const cellText = c => typeof c === 'string' ? c : (c.text || '');

  let md = '| ' + headers.map(cellText).join(' | ') + ' |\n';
  md += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
  for (const row of rows) {
    const cells = Array.isArray(row) ? row : [];
    md += '| ' + cells.map(cellText).join(' | ') + ' |\n';
  }
  return md;
}
