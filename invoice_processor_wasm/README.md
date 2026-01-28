# AILANG Invoice Processor Demo

A production-ready invoice validation and processing application powered by AILANG WebAssembly.

## 🎯 Live Demo

**[Try it now →](https://sunholo-data.github.io/ailang-demos/)**

## What This Demonstrates

- **Type Safety**: AILANG's type system catches errors at parse time
- **Business Logic**: Complex calculations with pattern matching and recursion
- **WebAssembly**: Full AILANG interpreter running in the browser
- **Zero Server**: Entire application runs client-side
- **Pure Functions**: Predictable, testable business logic

## Features

This demo showcases how AILANG handles real-world business logic:

- ✅ Invoice validation with detailed error messages
- ✅ Line item calculations (subtotal, tax, totals)
- ✅ Discount application
- ✅ Type-safe arithmetic operations
- ✅ Pattern matching for data processing
- ✅ Algebraic data types for result handling

## How It Works

1. **User pastes JSON invoice** into the web interface
2. **AILANG validates structure** using type system - catches missing fields, wrong types, invalid data
3. **Calculates totals** with type-safe arithmetic across all line items
4. **Returns results** with detailed error messages or calculated invoice totals

All processing happens entirely in the browser via WebAssembly - no server required!

## Local Development

### Prerequisites

- A local web server (Python, Node.js, or any HTTP server)
- AILANG WASM files (see below)

### Setup

1. **Clone or download this demo**:
   ```bash
   git clone https://github.com/sunholo-data/ailang-demos.git
   cd ailang-demos
   ```

2. **Get AILANG WASM files**:

   You need two files in the `wasm/` directory:
   - `ailang.wasm` - The AILANG interpreter
   - `wasm_exec.js` - Go WebAssembly runtime

   **Option A: Download from releases** (Recommended):
   ```bash
   # Download and extract latest AILANG WASM release
   wget https://github.com/sunholo-data/ailang/releases/latest/download/ailang-wasm.tar.gz
   tar -xzf ailang-wasm.tar.gz
   mv ailang.wasm wasm/
   mv wasm_exec.js wasm/
   rm ailang-wasm.tar.gz
   ```

   **Option B: Build from source**:
   ```bash
   # Clone AILANG repo and build WASM
   git clone https://github.com/sunholo-data/ailang.git
   cd ailang
   make build-wasm
   # Copy files to your demo directory
   cp ailang.wasm ../demos/invoice_processor_wasm/wasm/
   cp wasm_exec.js ../demos/invoice_processor_wasm/wasm/
   ```

3. **Start a local web server**:

   **Python 3**:
   ```bash
   python3 -m http.server 8000
   ```

   **Python 2**:
   ```bash
   python -m SimpleHTTPServer 8000
   ```

   **Node.js** (using `http-server`):
   ```bash
   npx http-server -p 8000
   ```

   **PHP**:
   ```bash
   php -S localhost:8000
   ```

4. **Open in browser**:
   ```
   http://localhost:8000
   ```

## Project Structure

```
invoice_processor_wasm/
├── index.html                 # Main demo page
├── css/
│   └── styles.css            # UI styling
├── js/
│   ├── app.js                # Main application logic
│   ├── ailang-wrapper.js     # WASM integration layer
│   └── examples.js           # Sample invoice data
├── wasm/
│   ├── ailang.wasm           # AILANG interpreter (download separately)
│   ├── wasm_exec.js          # Go WASM runtime (download separately)
│   └── invoice_processor.ail # Business logic in AILANG
├── README.md                 # This file
└── ailang-demo-invoice-processor.md  # Design document
```

## The AILANG Code

The core business logic is in [`wasm/invoice_processor.ail`](wasm/invoice_processor.ail) (~200 lines):

### Type Definitions

```ailang
-- Invoice line item type
type LineItem = {
  description: string,
  quantity: int,
  unit_price: float,
  tax_rate: float
}

-- Invoice type
type Invoice = {
  invoice_number: string,
  customer_name: string,
  date: string,
  line_items: [LineItem],
  discount_percent: float
}

-- Result type for validation
type ValidationResult =
  | Valid(Invoice)
  | Invalid(string)
```

### Core Functions

```ailang
-- Calculate line item total (quantity * price + tax)
pure func lineItemTotal(item: LineItem) -> float {
  let subtotal = intToFloat(item.quantity) * item.unit_price;
  let tax = subtotal * item.tax_rate;
  subtotal + tax
}

-- Validate invoice structure and data
pure func validateInvoice(invoice: Invoice) -> ValidationResult =
  if invoice.invoice_number == "" then
    Invalid("Missing invoice_number")
  else if invoice.customer_name == "" then
    Invalid("Missing customer_name")
  else if invoice.discount_percent < 0.0 || invoice.discount_percent > 100.0 then
    Invalid("Discount must be between 0 and 100")
  else match invoice.line_items {
    [] => Invalid("Invoice must have at least one line item"),
    _ => match validateLineItems(invoice.line_items, 1) {
      Some(err) => Invalid(err),
      None => Valid(invoice)
    }
  }
```

## Testing the Demo

The demo includes several example invoices:

- ✅ **Valid Invoice** - Properly formatted invoice with multiple line items
- ❌ **Missing Field** - Empty required field (invoice_number)
- ❌ **No Items** - Invoice with no line items
- ❌ **Negative Price** - Line item with negative unit price
- ❌ **Zero Quantity** - Line item with zero quantity
- ❌ **Invalid Discount** - Discount percentage > 100%
- ❌ **Invalid Tax Rate** - Tax rate > 1.0

Click any example button to load it into the editor, then click "Process Invoice" to see the results.

## Why AILANG?

### Type Safety

AILANG catches errors **before** they cause problems:

```
❌ JavaScript/Python:
- Missing fields → runtime crash (undefined)
- Wrong types → NaN, silent failures
- Invalid data → incorrect calculations

✅ AILANG:
- Missing fields → caught at parse time
- Wrong types → compile error
- Invalid data → validation error with message
```

### Clear Error Messages

When validation fails, AILANG provides specific, actionable error messages:

```
"Line 2: quantity must be positive"
"Discount must be between 0 and 100"
"Missing invoice_number"
```

### Maintainable Code

AILANG's declarative style makes code easy to understand:

- Pattern matching for control flow
- Pure functions for predictable behavior
- Type annotations for documentation
- No side effects or hidden state

## Key AILANG Features Used

1. **Algebraic Data Types (ADTs)**: `ValidationResult` type with `Valid` and `Invalid` constructors
2. **Pattern Matching**: Recursive processing of line items
3. **Pure Functions**: All business logic is side-effect free
4. **Type Safety**: Record types ensure data structure correctness
5. **Effect System**: Clear separation of pure and effectful code
6. **Recursion**: Processing lists without loops

## Troubleshooting

### WASM files not found

Make sure you've downloaded `ailang.wasm` and `wasm_exec.js` into the `wasm/` directory:

```bash
ls wasm/
# Should show: ailang.wasm  invoice_processor.ail  wasm_exec.js
```

### CORS errors

You must serve the files through a web server (not `file://` protocol). Use one of the server options in the Setup section above.

### Module not loading

Check the browser console for errors. The AILANG module path must match the file structure. Our module is declared as:

```ailang
module wasm/invoice_processor
```

This matches the file location: `wasm/invoice_processor.ail`

### WASM initialization timeout

If the WASM module takes too long to initialize, try:
1. Refresh the page
2. Check your internet connection (if loading from CDN)
3. Verify the WASM file is not corrupted
4. Check browser console for specific errors

## Learn More

- **AILANG GitHub**: https://github.com/sunholo-data/ailang
- **Documentation**: https://ailang-docs.com
- **WASM Integration Guide**: https://ailang-docs.com/docs/guides/wasm-integration
- **AILANG Releases**: https://github.com/sunholo-data/ailang/releases

## Contributing

Found a bug or want to add a feature? Contributions are welcome!

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This demo is part of the AILANG project and follows the same license.

## About AILANG

AILANG is an AI-first programming language with:
- Hindley-Milner type inference
- Algebraic effects
- Pattern matching
- Pure functional programming
- WebAssembly compilation
- Built-in AI capabilities

Perfect for building reliable, maintainable business logic that runs anywhere.

---

**Built with AILANG - The AI-First Programming Language**
