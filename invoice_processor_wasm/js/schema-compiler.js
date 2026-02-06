/**
 * Schema Compiler — generates AILANG validation modules from schema definitions.
 *
 * Given a schema like:
 *   { name: "Receipt", fields: [{ name: "vendor", type: "string", required: true, constraints: ['!= ""'] }] }
 *
 * Produces a complete AILANG module with:
 *   - Record type definition
 *   - AI extraction function (! {AI} effect)
 *   - JSON parse function using std/json
 *   - Validation function with requires/ensures contracts
 *   - Export functions: processDocument (effectful) and validateOnly (pure)
 */

export class SchemaCompiler {
  /**
   * Compile a schema into a complete AILANG module
   * @param {Object} schema - { name: string, fields: Array<{ name, type, required, constraints }> }
   * @returns {string} AILANG source code
   */
  compile(schema) {
    const parts = [
      this._moduleHeader(),
      this._typeDefinition(schema),
      this._jintHelper(),
      this._aiExtractionFunction(schema),
      this._parseFunction(schema),
      this._validateFunction(schema),
      this._resultEncoder(schema),
      this._exportFunctions(schema),
    ];
    return parts.join('\n');
  }

  _moduleHeader() {
    return `-- Auto-generated AILANG extraction & validation module
-- Uses: std/ai (AI effect), std/json, std/option, std/string, std/math

module extractor

import std/ai (call)
import std/json (Json, decode, encode, jo, ja, kv, js, jnum, jb, getString, getInt, getArray)
import std/option (Option, Some, None)
import std/string (trim, length)
import std/math (intToFloat)

`;
  }

  _typeDefinition(schema) {
    const fields = schema.fields
      .map(f => `  ${f.name}: ${this._ailangType(f.type)}`)
      .join(',\n');
    return `-- Extraction result type
type ${schema.name} = {
${fields}
}

`;
  }

  _jintHelper() {
    return `-- Helper: output int as JSON number
pure func jint(n: int) -> Json = jnum(intToFloat(n))

`;
  }

  /**
   * Generate the AI extraction function that calls std/ai.call()
   * This function has the ! {AI} effect annotation
   */
  _aiExtractionFunction(schema) {
    const fieldList = schema.fields
      .map(f => `--   ${f.name} (${f.type}${f.required ? ', required' : ''})`)
      .join('\\n');

    return `-- Effectful: calls AI oracle for field extraction
-- The AI effect is host-granted (Gemini Flash via JS handler)
func extractFields(document: string) -> string ! {AI} {
  let prompt = "Extract these fields as JSON from the document below.\\nFields:\\n${fieldList}\\nFor int fields, return integer values (e.g. monetary amounts in cents).\\nReturn ONLY a JSON object with these exact field names.\\n\\nDocument:\\n" ++ document in
  call(prompt)
}

`;
  }

  /**
   * Generate the parse function using nested match expressions.
   * Follows the exact pattern from invoice_processor.ail
   */
  _parseFunction(schema) {
    const typeName = schema.name;
    const funcName = `parse${typeName}`;

    // Build nested match expression
    const fields = schema.fields;
    const recordFields = fields
      .map(f => `${f.name}: f_${f.name}`)
      .join(', ');

    // Build the nested match from innermost to outermost
    let innerExpr = `Some({${recordFields}})`;

    // Wrap from last field to first
    for (let i = fields.length - 1; i >= 0; i--) {
      const f = fields[i];
      const getter = this._jsonGetter(f.type);
      const varName = `f_${f.name}`;
      const indent = '  '.repeat(i + 1);

      innerExpr =
        `${indent}match ${getter}(j, "${f.name}") {\n` +
        `${indent}  None => None,\n` +
        `${indent}  Some(${varName}) =>\n` +
        `${indent}    ${innerExpr}\n` +
        `${indent}}`;
    }

    return `-- Parse extraction result from JSON using std/json
pure func ${funcName}(j: Json) -> Option[${typeName}] =
${innerExpr}

`;
  }

  /**
   * Generate the validation function with guard chain from constraints.
   * Uses if/then/else guards (same pattern as invoice_processor.ail validateLineItem)
   */
  _validateFunction(schema) {
    const typeName = schema.name;

    // Collect all validation checks
    const checks = [];

    for (const f of schema.fields) {
      if (f.required && f.type === 'string') {
        checks.push({
          condition: `r.${f.name} == ""`,
          message: `${f.name} is required and cannot be empty`
        });
      }

      for (const constraint of (f.constraints || [])) {
        const { condition, message } = this._constraintToGuard(f.name, f.type, constraint);
        checks.push({ condition, message });
      }
    }

    if (checks.length === 0) {
      return `-- Validate extraction result (no constraints defined)
pure func validateFields(r: ${typeName}) -> Option[string] = None

`;
    }

    // Build if/else chain
    let code = `-- Validate extraction result with constraints
pure func validateFields(r: ${typeName}) -> Option[string] =\n`;

    for (let i = 0; i < checks.length; i++) {
      const c = checks[i];
      const keyword = i === 0 ? '  if' : '  else if';
      code += `${keyword} ${c.condition} then\n`;
      code += `    Some("${this._escapeAilangString(c.message)}")\n`;
    }

    code += `  else\n    None\n\n`;
    return code;
  }

  /**
   * Generate the result encoder function that outputs validated data as JSON
   */
  _resultEncoder(schema) {
    const typeName = schema.name;
    const kvEntries = schema.fields.map(f => {
      if (f.type === 'int') {
        return `    kv("${f.name}", jint(r.${f.name}))`;
      } else {
        return `    kv("${f.name}", js(r.${f.name}))`;
      }
    }).join(',\n');

    return `-- Encode validated result as JSON
pure func encodeResult(r: ${typeName}) -> string =
  encode(jo([
    kv("valid", jb(true)),
${kvEntries}
  ]))

-- Encode error as JSON
pure func encodeError(msg: string) -> string =
  encode(jo([kv("valid", jb(false)), kv("error", js(msg))]))

`;
  }

  /**
   * Generate the two export functions:
   * - processDocument: effectful (AI extraction + validation)
   * - validateOnly: pure (validate pre-extracted JSON)
   */
  _exportFunctions(schema) {
    const typeName = schema.name;
    const parseFn = `parse${typeName}`;

    return `-- Main pipeline: AI extraction + AILANG validation (requires AI capability)
export func processDocument(document: string) -> string ! {AI} {
  let raw = extractFields(document) in
  validateOnly(raw)
}

-- Validate pre-extracted JSON data (pure, no effects)
export pure func validateOnly(jsonString: string) -> string =
  match decode(jsonString) {
    Err(e) => encodeError("Invalid JSON: " ++ e),
    Ok(jsonObj) =>
      match ${parseFn}(jsonObj) {
        None => encodeError("Failed to parse fields from extraction result"),
        Some(record) =>
          match validateFields(record) {
            Some(err) => encodeError(err),
            None => encodeResult(record)
          }
      }
  }
`;
  }

  // ── Helpers ──────────────────────────────────────────────

  _ailangType(jsType) {
    const map = { string: 'string', int: 'int', float: 'float', bool: 'bool' };
    return map[jsType] || 'string';
  }

  _jsonGetter(jsType) {
    const map = { string: 'getString', int: 'getInt' };
    return map[jsType] || 'getString';
  }

  /**
   * Convert a user constraint string to an AILANG guard condition.
   * Constraints are inverted: ">= 0" becomes "r.field < 0" for the guard check.
   */
  _constraintToGuard(fieldName, fieldType, constraint) {
    const trimmed = constraint.trim();

    // Pattern: >= N
    let m = trimmed.match(/^>=\s*(.+)$/);
    if (m) return {
      condition: `r.${fieldName} < ${m[1]}`,
      message: `${fieldName} must be >= ${m[1]}`
    };

    // Pattern: <= N
    m = trimmed.match(/^<=\s*(.+)$/);
    if (m) return {
      condition: `r.${fieldName} > ${m[1]}`,
      message: `${fieldName} must be <= ${m[1]}`
    };

    // Pattern: > N
    m = trimmed.match(/^>\s*(.+)$/);
    if (m) return {
      condition: `r.${fieldName} <= ${m[1]}`,
      message: `${fieldName} must be > ${m[1]}`
    };

    // Pattern: < N
    m = trimmed.match(/^<\s*(.+)$/);
    if (m) return {
      condition: `r.${fieldName} >= ${m[1]}`,
      message: `${fieldName} must be < ${m[1]}`
    };

    // Pattern: != ""
    m = trimmed.match(/^!=\s*"(.*)"$/);
    if (m) return {
      condition: `r.${fieldName} == "${m[1]}"`,
      message: `${fieldName} must not be "${m[1]}"`
    };

    // Pattern: != N (numeric)
    m = trimmed.match(/^!=\s*(.+)$/);
    if (m) return {
      condition: `r.${fieldName} == ${m[1]}`,
      message: `${fieldName} must not equal ${m[1]}`
    };

    // Fallback: treat as raw condition (advanced)
    return {
      condition: trimmed,
      message: `Constraint failed: ${trimmed}`
    };
  }

  _escapeAilangString(s) {
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }
}

export default SchemaCompiler;
