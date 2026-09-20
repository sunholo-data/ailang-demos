# Public release — direct browser transport

The integration branch includes both sessions' social, inventory, artwork,
branding and custom-character work. The public page now uses the visitor's key
in direct browser requests to OpenRouter, with no private Studio API dependency.
WASM still owns typed request preparation, parsing, sampling, world policy and
bank replay; JavaScript is transport/presentation and a per-tab spending guard.

## Deployment

GitHub Pages includes decisions/** in its trigger paths. The dedicated
`test-decisions` job resolves registry `sunholo/decisions@0.4.0`, installs the pinned
v0.40.2 CLI, builds a standalone artifact with hash-verified v0.40.2 WASM, and runs
native, transport, real WASM and static-browser checks. Deployment includes that
exact artifact at `/decisions/`; the hub links to it. Other demos retain the old
shared runtime. Non-main workflow dispatches run tests but cannot deploy.

The Co-Presenter source-directory typo that broke the previous deployment is
fixed (public URL unchanged). No Python service or native CLI is shipped in the
public artifact. Keys are neither bundled nor sent to Sunholo.

## Local evidence before CI

- 71 native package tests passed, zero failures/skips; package compile passed.
- Released v0.40.2 WASM runs legacy, social, inventory and custom-profile replay.
- Public static-browser flow: direct request; world continues while response is
  held; real WASM parsing/sampling; bank replay; budget stop; zero local API calls.
- Real Chrome CORS/auth probes: decisions endpoint returned 401, images endpoint
  returned 400 using an intentionally invalid key. No paid model request was made.
- Desktop/mobile UI checks pass with explicitly synthetic provider responses.
- Nine browser-transport unit tests cover credentials, billing, concurrency,
  unknown costs, malformed/large responses and cancellation.

A successful invalid-key CORS check proves browser reachability, not successful
paid provider output. User key access, provider availability and credit still
apply. Spending is guarded per tab at $0.10 of reported usage; it is not an
account-level cap and the final call may cross the threshold.
