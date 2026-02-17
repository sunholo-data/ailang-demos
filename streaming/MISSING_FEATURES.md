# Missing AILANG Features for Streaming Demos

Discovered while building 6 streaming demos against `std/stream` v0.8.0.
Each item includes the workaround currently used and the ideal AILANG improvement.

## Type Checker Bugs (reported via ailang messages)

### 1. ~~Result type leak: Ok type leaks into Err parameter~~ FIXED
**Status**: Fixed in v0.8.0-30 (3-line change in iface/builder.go — `*ast.TypeVar` case).
**Was**: When matching `Result[A, B]` and returning `Result[A, C]`, the type checker constrained Err's type to match Ok's type.
**Workarounds still in demos**: Helper extraction pattern. Can be simplified now that the bug is fixed.

### 2. map() over ADT-wrapped records — field access fails in lambda
**Status**: PARTIALLY FIXED. Plain record aliases (`type Item = {name: string}`) work. ADT-wrapped records (`type Item = Item({name: string})`) still fail with `i.name` in lambda.
**Bug**: `map(\t. t.name, items)` fails when `type Item = Item({name: string})`. Field access opens the type as an open record, which can't unify with the ADT constructor type.
**Workaround**: Use pattern match in lambda: `map(\t. match t { ToolDecl({name, description, parameters}) => ... }, items)`
**Repro**: `streaming/bug_repros/bug3_map_polymorphism.ail`

### 3. ~~Num[string] leak from match scrutinee~~ FIXED
**Status**: Fixed (same root cause as bug 1).
**Was**: `match op { "add" => Ok(a + b) }` produced "No instance for Num[string]".
**Workarounds still in demos**: Separate opCode() from arithmetic. Can be simplified now.

### 4. Record type leak across record literal fields
**Status**: FIXED for plain record aliases. Not tested for ADT-wrapped.
**Was**: Constructing a record with both `tools: [ToolDecl]` (list of records) and `responseModalities: [string]` caused cross-field type leak.
**Workarounds still in demos**: Two-stage construction with record update syntax `{rec | field: value}`.

### 5. withStream/withSSE runtime crash
**Status**: OPEN (runtime bug, not type checker).
**Bug**: `withStream` crashes at runtime with "failed to resolve global $adt.make_Result_Ok: constructor Result.Ok not found in scope". The function connects and receives events correctly, but crashes when trying to return the Result.
**Workaround**: Use `connect` + `onEvent` + `runEventLoop` directly (lower-level API).
**Impact**: The high-level helpers `withStream`/`withSSE` are unusable at runtime.

## std/bytes — Available but limited

**Status**: `std/bytes` EXISTS with: `fromString`, `toString`, `toBase64`, `fromBase64`, `length`.
**Missing**: `slice(b, start, len) -> bytes` for chunking binary data (needed for PCM audio streaming).
**Note**: `readFileBytes` in `std/fs` currently returns `Result[string, string]` not `Result[bytes, string]`. Once it returns actual `bytes`, demos should switch to `std/bytes.length` and `slice` for audio chunking.
**Current workaround**: Demos use `string` type for audio data, `substring` for chunking.

## Missing stdlib functions

### zipWith in std/list
**Need**: `zipWith(\col val. col ++ ": " ++ val, schema, row)` to pair column names with values.
**Available**: `zip` returns `[(a, b)]` tuples.
**Workaround**: `map(\pair. match pair { (col, val) => col ++ ": " ++ val }, zip(schema, row))`
**Impact**: bq_voice_tools.ail (voice_analytics demo)

### charAt in std/string
**Need**: Get a single character at an index.
**Available**: `substring(s, i, i+1)` or `nth(chars(s), i)`.
**Workaround**: Using `substring(s, i, 1)`.
**Impact**: text_processor.ail (voice_pipeline demo)

### ~~take/drop in std/list~~ ALREADY EXISTS
**Status**: `take` and `drop` both exist in `std/list`. Use `ailang docs std/list` to check.

## DX Improvements

### intToString vs intToStr naming
**Issue**: Natural name `intToString` doesn't exist; actual name is `intToStr` in std/string. Every AI agent writes `intToString` first.
**Suggestion**: Either add `intToString` as an alias, or add it to prelude (like `show` but type-specific).
**Also**: `floatToString` → `floatToStr` has the same discoverability issue.

### show() vs typed conversion
**Observation**: `show` (prelude, works on any type) is almost always sufficient for int→string and float→string conversion. Consider documenting `show` as the primary way to convert to string, with `intToStr`/`floatToStr` for specific formatting needs.

### std/stream config as typed record
**Current**: Config is a JSON string — `encode(jo([kv("headers", ja([...]))]))`.
**Ideal**: Typed config record — `{headers: [{name: string, value: string}]}`.
**Impact**: Every streaming demo builds config via JSON encoding, which is verbose and error-prone.

### SSEData event import
**Issue**: The SSEData constructor from StreamEvent is importable but not well-documented. Users need to match on it for SSE streaming but may not know it exists.
**Suggestion**: Add SSEData to the std/stream docs "Usage" section with an example.

### SSE POST support (ssePost)
**Need**: Claude, OpenAI, Google all use POST+SSE for streaming AI responses. `sseConnect` only supports GET.
**Workaround**: `sseConnect(url, config)` + `transmit(conn, body)` — fragile, may not work since POST body needs to be in the HTTP request, not after connection.
**Ideal**: `ssePost(url: string, body: string, config: string) -> Result[StreamConn, StreamErrorKind]`
**Impact**: claude_chat demo — likely the cause of connection failures.

## Feature Requests (would enhance demos)

### Concurrent stream connections
**Need**: Open two WebSocket connections simultaneously (STT + TTS in voice_pipeline).
**Current**: Sequential — open STT, then TTS, run one event loop.
**Ideal**: `runEventLoops([sttConn, ttsConn])` or similar concurrent dispatch.

### Stream budget subdivision
**Need**: `Stream @limit=2000` shared across two connections.
**Ideal**: Per-connection budgets: `Stream.connect @limit=2, Stream.send @limit=500`.

### Binary transmit
**Need**: `transmit(conn, binaryData: bytes)` for PCM audio.
**Current**: `transmit` only accepts `string`.
**Workaround**: Base64-encode audio and send as string (3x bandwidth overhead).
**Ideal**: Overloaded `transmit` or separate `transmitBinary` that accepts `bytes`.
