// Emit a representative `extractor.ail` from invoice_processor_wasm's
// SchemaCompiler so `ailang check` can guard against AILANG syntax drift.
//
// Used by scripts/check_demos.sh — writes to stdout, exits non-zero on
// generator failure. Schema covers string + int fields, required flags, and
// equality / numeric constraints so most codegen branches are exercised.
import { SchemaCompiler } from '../../invoice_processor_wasm/js/schema-compiler.js';

const compiler = new SchemaCompiler();
const schema = {
  name: 'Receipt',
  fields: [
    { name: 'vendor', type: 'string', required: true,  constraints: ['!= ""'] },
    { name: 'total',  type: 'int',    required: true,  constraints: ['> 0'] },
    { name: 'date',   type: 'string', required: false, constraints: [] },
  ],
};
process.stdout.write(compiler.compile(schema));
