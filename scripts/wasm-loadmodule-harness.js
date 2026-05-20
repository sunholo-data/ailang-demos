// scripts/wasm-loadmodule-harness.js
//
// Headless WASM loadModule smoke test. Runs the actual wasm/ailang.wasm
// that the browser uses in a Node host, calls ailangLoadModule for each
// .ail file the demo loads at boot, times each call, reports which one
// (if any) hangs or fails.
//
// History: written 2026-05-20 after burning an afternoon on the WASM
// type-checker stack overflow in cognitive_commons/services/citizen.ail.
// See debug-notes/wasm-citizen-stack-overflow.md for the postmortem.
//
// Usage:
//   node scripts/wasm-loadmodule-harness.js
//
// Exit codes:
//   0  all modules loaded cleanly
//   2  a module hung past the 15s per-module budget
//   3  a module threw (likely "Maximum call stack size exceeded" in WASM)
//   4  a module returned success: false from ailangLoadModule
//
// Suitable for CI: gates the demo on every .ail change preventing silent
// browser hangs.

const fs = require("fs");
const path = require("path");

// 1. Bring in Go's wasm_exec.js (browser variant, NOT the _node one which is
// a runner script and exits immediately). We provide Node-side polyfills
// for the globals wasm_exec.js expects.
globalThis.fs = require("fs");
globalThis.path = require("path");
globalThis.TextEncoder = require("util").TextEncoder;
globalThis.TextDecoder = require("util").TextDecoder;
globalThis.performance ??= require("performance");
globalThis.crypto ??= require("crypto");

const child = require("child_process");
function findWasmExecJs() {
  const candidates = [];
  try {
    const toolchain = child.execSync("ls /Users/mark/go/pkg/mod/golang.org/", {stdio: ["ignore", "pipe", "ignore"]})
      .toString().trim().split("\n").filter(x => x.startsWith("toolchain@"));
    for (const t of toolchain) candidates.push(`/Users/mark/go/pkg/mod/golang.org/${t}/lib/wasm/wasm_exec.js`);
  } catch (_) {}
  candidates.push(child.execSync("go env GOROOT").toString().trim() + "/lib/wasm/wasm_exec.js");
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error("wasm_exec.js not found");
}
const wasmExecSrc = fs.readFileSync(findWasmExecJs(), "utf8");
// eval into the global scope so the `Go` class becomes globally available
(0, eval)(wasmExecSrc);

// 2. Load the WASM binary the browser would use
const WASM_PATH = "/Users/mark/dev/sunholo/demos/wasm/ailang.wasm";
const wasmBytes = fs.readFileSync(WASM_PATH);

// 3. Set up a Go runtime, start WASM
const go = new Go();

(async () => {
  console.log(`[harness] WASM size: ${wasmBytes.length} bytes`);
  const result = await WebAssembly.instantiate(wasmBytes, go.importObject);

  // go.run is a Promise that resolves when the WASM exits.
  // We don't await it — we want the WASM to keep running so we can call its globals.
  const runPromise = go.run(result.instance);
  runPromise.catch((e) => console.error("[harness] go.run rejected:", e));

  // Give Go time to register the globals.
  await new Promise((r) => setTimeout(r, 100));

  console.log("[harness] WASM started. Available globals:",
    Object.keys(globalThis).filter(k => k.startsWith("ailang")).join(", "));

  if (typeof globalThis.ailangLoadModule !== "function") {
    console.error("[harness] FAIL: ailangLoadModule is not registered.");
    process.exit(1);
  }

  // 4. Import stdlib modules into the REPL session (matches what initAilang does).
  if (typeof globalThis.ailangEval === "function") {
    for (const lib of ["std/json", "std/option", "std/result", "std/string", "std/math", "std/ai", "std/dom", "std/cognition", "std/io"]) {
      const r = globalThis.ailangEval(`:import ${lib}`);
      console.log(`[harness] :import ${lib} →`, typeof r === "string" ? r.slice(0, 80) : r);
    }
  }

  // 5. Load each .ail file IN ORDER and time it.
  // Resolve demos dir relative to this script so the harness works wherever
  // the repo is checked out.
  const REPO_ROOT = path.resolve(__dirname, "..");
  const demos = path.join(REPO_ROOT, "cognitive_commons");
  const modules = [
    { name: "cognitive_commons/types/personas",          file: path.join(demos, "types/personas.ail") },
    { name: "cognitive_commons/services/consensus",      file: path.join(demos, "services/consensus.ail") },
    { name: "cognitive_commons/services/persuasion",     file: path.join(demos, "services/persuasion.ail") },
    { name: "cognitive_commons/services/citizen",        file: path.join(demos, "services/citizen.ail") },
    { name: "cognitive_commons/services/commons_browser", file: path.join(demos, "services/commons_browser.ail") },
  ];

  for (const m of modules) {
    const src = fs.readFileSync(m.file, "utf8");
    console.log(`\n[harness] → loadModule ${m.name} (${src.length} bytes)`);
    const t0 = Date.now();

    // Run loadModule with a 15-second timeout on a parallel timer.
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        const dt = Date.now() - t0;
        console.error(`[harness] ✗ HANG after ${dt}ms on ${m.name}`);
        console.error(`[harness]   File: ${m.file}`);
        console.error(`[harness]   First 5 lines:\n    ${src.split("\n").slice(0, 5).join("\n    ")}`);
        process.exit(2);  // exit 2 = hang detected
      }
    }, 15000);

    let res;
    try {
      res = globalThis.ailangLoadModule(m.name, src);
    } catch (e) {
      done = true;
      clearTimeout(timer);
      const dt = Date.now() - t0;
      console.error(`[harness] ✗ THREW after ${dt}ms on ${m.name}:`, e.message || e);
      process.exit(3);
    }
    done = true;
    clearTimeout(timer);
    const dt = Date.now() - t0;

    if (res && res.success) {
      console.log(`[harness] ✓ ${m.name} loaded in ${dt}ms (exports: ${(res.exports || []).length})`);
    } else {
      console.error(`[harness] ✗ loadModule returned success=false in ${dt}ms`);
      console.error(`[harness]   error: ${res && res.error}`);
      process.exit(4);
    }
  }

  console.log("\n[harness] ✓ all 5 modules loaded cleanly. No hang reproduced.");
  process.exit(0);
})();
