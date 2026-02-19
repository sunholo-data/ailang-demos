# Missing AILANG Features for Streaming Demos

Discovered while building 6 streaming demos against `std/stream`.
Last audited: 2026-02-19 against AILANG dev build.

## Type Checker Bugs — ALL FIXED

### 1. ~~Result type leak: Ok type leaks into Err parameter~~ FIXED
**Status**: Fixed in v0.8.0-30.

### 2. ~~map() over ADT-wrapped records — field access fails in lambda~~ FIXED
**Status**: Fixed. All `bug_repros/test_map_record*.ail` and `bug3_map_polymorphism.ail` now type-check clean.
**Workaround still in demos**: Pattern match in lambda. Can be simplified now.

### 3. ~~Num[string] leak from match scrutinee~~ FIXED
**Status**: Fixed (same root cause as bug 1).

### 4. ~~Record type leak across record literal fields~~ FIXED
**Status**: Fixed. `bug4_result_record_leak.ail` now type-checks clean.

### 5. ~~Result type leak with ADT-wrapped types~~ FIXED
**Status**: Fixed. Updated `bug5_result_adt_leak.ail` with typed record config — type-checks clean.

### 6. withStream/withSSE runtime crash
**Status**: UNKNOWN. The runtime "failed to resolve global $adt.make_Result_Ok" error needs a runtime test to confirm fix. `test_stream_basic.ail` compiles and uses `withStream` — run it to check.

## Resolved Feature Requests

These were previously listed as missing and are now available:

- **`ssePost`** in `std/stream` — POST+SSE for streaming AI responses ✓
- **`transmitBinary`** in `std/stream` — binary WebSocket frames ✓
- **`zipWith`** in `std/list` — pair-wise mapping ✓
- **`slice`** in `std/bytes` — binary data chunking ✓
- **`concat`**, **`concatList`**, **`fromInts`** in `std/bytes` — binary construction ✓
- **Typed config record** for `std/stream` — `{headers: [{name: string, value: string}]}` ✓

## Still Missing

### charAt in std/string
**Need**: Get a single character at an index.
**Workaround**: `substring(s, i, 1)`.

### Concurrent stream connections
**Need**: Open two WebSocket connections simultaneously (STT + TTS in voice_pipeline).
**Current**: Sequential — open STT, then TTS, run one event loop.
**Ideal**: `runEventLoops([sttConn, ttsConn])` or similar concurrent dispatch.

### Stream budget subdivision
**Need**: Per-connection budgets: `Stream.connect @limit=2, Stream.send @limit=500`.
**Current**: `Stream @limit=2000` shared across all connections.

## DX Improvements (still relevant)

### intToString vs intToStr naming
**Issue**: Natural name `intToString` doesn't exist; actual name is `intToStr` in std/string.
**Note**: `show` (prelude) works on any type and is usually sufficient.

### SSEData event import
**Issue**: The SSEData constructor from StreamEvent is importable but not well-documented.
