/**
 * Gemini Flash 3 REST API client for document field extraction.
 * Supports text documents and multimodal input (images, PDFs) via inlineData.
 * Calls the generativelanguage.googleapis.com endpoint directly from browser.
 * API key stored in localStorage, never sent to any server except Google.
 */

export class GeminiClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.model = 'gemini-2.5-flash';
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  }

  /**
   * Extract fields from a document according to a schema definition
   * @param {string} documentText - The raw document text (can be empty for binary files)
   * @param {Object} schema - { name, fields: [{ name, type, required, constraints }] }
   * @param {Object|null} binaryData - { base64: string, mimeType: string } for file uploads
   * @returns {Promise<Object>} Extracted fields as a JSON object
   */
  async extractFields(documentText, schema, binaryData = null) {
    const prompt = this._buildPrompt(documentText, schema, binaryData);
    const responseSchema = this._buildResponseSchema(schema);

    const parts = [{ text: prompt }];
    if (binaryData) {
      parts.push({
        inlineData: {
          mimeType: binaryData.mimeType,
          data: binaryData.base64
        }
      });
    }

    const response = await fetch(
      `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: responseSchema,
            temperature: 0.1
          }
        })
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${body.substring(0, 200)}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No content in Gemini response');

    return JSON.parse(text);
  }

  _buildPrompt(documentText, schema, binaryData = null) {
    const fieldDescriptions = schema.fields
      .map(f => {
        let desc = `- "${f.name}" (${f.type}`;
        if (f.required) desc += ', required';
        if (f.constraints?.length) desc += `, constraints: ${f.constraints.join(', ')}`;
        desc += ')';
        return desc;
      })
      .join('\n');

    const rules =
      `Important rules:\n` +
      `- For "int" type fields, return integer values (e.g., monetary amounts in cents: $25.00 = 2500)\n` +
      `- For "string" type fields, return clean text values\n` +
      `- If a required field cannot be found, make your best guess from context\n` +
      `- If an optional field cannot be found, use a sensible default (0 for int, "" for string)`;

    // Build file metadata context line if available
    let metaLine = '';
    if (binaryData?.fileName) {
      const sizePart = binaryData.fileSize
        ? `, ${this._formatSize(binaryData.fileSize)}`
        : '';
      metaLine = `Source file: ${binaryData.fileName} (${binaryData.mimeType || 'unknown'}${sizePart})\n\n`;
    }

    if (binaryData) {
      return (
        `${metaLine}Extract the following fields from the attached document.\n\n` +
        `Fields to extract:\n${fieldDescriptions}\n\n` +
        `${rules}\n\n` +
        `Return a JSON object with exactly these field names.`
      );
    }

    return (
      `Extract the following fields from this document.\n\n` +
      `Fields to extract:\n${fieldDescriptions}\n\n` +
      `${rules}\n\n` +
      `Document:\n---\n${documentText}\n---\n\n` +
      `Return a JSON object with exactly these field names.`
    );
  }

  _formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  _buildResponseSchema(schema) {
    const properties = {};
    const required = [];

    for (const f of schema.fields) {
      properties[f.name] = { type: this._geminiType(f.type) };
      if (f.required) required.push(f.name);
    }

    return { type: 'OBJECT', properties, required };
  }

  _geminiType(ailangType) {
    const map = { string: 'STRING', int: 'INTEGER', float: 'NUMBER', bool: 'BOOLEAN' };
    return map[ailangType] || 'STRING';
  }

  /**
   * Auto-detect a schema from a document — asks Gemini to suggest fields
   * @param {string} documentText - The document text (can be empty for binary)
   * @param {Object|null} binaryData - { base64: string, mimeType: string } for file uploads
   * @returns {Promise<{ name: string, fields: Array<{ name: string, type: string, required: boolean, constraints: string[] }> }>}
   */
  async detectSchema(documentText, binaryData = null) {
    const prompt = `Analyze this document and suggest a structured extraction schema.

For each field you identify:
- Use snake_case names (e.g., "invoice_number", "total_cents")
- Use type "string" for text fields, "int" for numeric fields
- For monetary amounts, use cents (e.g., $25.00 → field name ending in _cents, integer 2500)
- Mark fields as required if they are clearly present and important
- Add constraints where appropriate: ">= 0" for amounts, '!= ""' for required strings

Return a JSON object with:
- "name": a PascalCase name for this schema (e.g., "InvoiceExtraction")
- "fields": array of { "name": string, "type": "string"|"int", "required": boolean, "constraints": string[] }

Suggest 5-10 fields that best represent the key data in this document.` +
      (binaryData?.fileName ? `\n\nSource file: ${binaryData.fileName} (${binaryData.mimeType || 'unknown'})` : '') +
      (documentText ? `\n\nDocument:\n---\n${documentText}\n---` : '\n\nAnalyze the attached document.');

    const parts = [{ text: prompt }];
    if (binaryData) {
      parts.push({
        inlineData: {
          mimeType: binaryData.mimeType,
          data: binaryData.base64
        }
      });
    }

    const responseSchema = {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING' },
        fields: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              name: { type: 'STRING' },
              type: { type: 'STRING' },
              required: { type: 'BOOLEAN' },
              constraints: { type: 'ARRAY', items: { type: 'STRING' } }
            },
            required: ['name', 'type', 'required', 'constraints']
          }
        }
      },
      required: ['name', 'fields']
    };

    const response = await fetch(
      `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema,
            temperature: 0.2
          }
        })
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${body.substring(0, 200)}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No content in Gemini response');

    const result = JSON.parse(text);

    // Normalize field types to only string/int
    for (const f of result.fields) {
      if (f.type !== 'string' && f.type !== 'int') {
        f.type = 'string';
      }
      if (!Array.isArray(f.constraints)) {
        f.constraints = [];
      }
    }

    return result;
  }
}

// API key management helpers
export function saveApiKey(key) {
  localStorage.setItem('gemini-api-key', key);
}

export function loadApiKey() {
  return localStorage.getItem('gemini-api-key');
}

export function clearApiKey() {
  localStorage.removeItem('gemini-api-key');
}

export default GeminiClient;
