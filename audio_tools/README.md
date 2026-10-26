# Audio quick demo and Loop Lab showcase

Sprint implementation for the on-page Tone/Pluck/Noise → optional echo → WAV
example. Loop Lab remains the main application in its own repository.

**Current acceptance: blocked by released v0.54.18 WASM module loading.** Native
processing, strict quality, independent reference, worker ownership and the UI
with a generated native-fixture worker pass. Real WASM and real-browser boot fail
on package relative imports; a diagnostic explicit-import run also fails on
imported derived Eq. See [VALIDATION.md](VALIDATION.md) and the upstream message.
This is not a working public deployment yet. CI/Pages gates preserve that distinction.

## Native and artifact checks

Requires AILANG v0.54.18, Python 3, Node 26 for tests, Z3 and curl. No provider key,
microphone, package source sibling or local core checkout is required.

```sh
cd audio_tools
ailang lock
ailang test --strict-bytecode --package .
ailang pkg quality --strict .
cd ..
python3 audio_tools/test/reference.py
node --test audio_tools/test/controller.test.mjs
scripts/build-audio-tools.sh .audio-tools-site/audio-tools
AUDIO_ARTIFACT="$PWD/.audio-tools-site/audio-tools" node audio_tools/test/wasm.cjs
```

The final command is an actual released-runtime acceptance gate and currently
fails; it does not patch package source or replace DSP with JavaScript. The build
pins the WASM archive SHA-256, verifies its registry lock, copies original modules
and emits module/binary hashes. Public artifact includes the package Apache license
and local licensed branding. Generated runtime, large fixture transport and screenshots
are ignored in source control.

## Browser tests

```sh
npm ci --prefix scripts/smoke
scripts/smoke/node_modules/.bin/playwright install chromium
python3 -m http.server 8984 --bind 127.0.0.1 --directory .audio-tools-site
# in another terminal
AUDIO_UI_FIXTURES=1 node audio_tools/test/browser.cjs
node audio_tools/test/browser.cjs
```

The first browser test explicitly intercepts the worker with native-generated
fixture outputs. It tests UI/lifecycle/export behavior, not WASM processing. The
second never substitutes a worker and remains the public-readiness gate. Both
check local asset requests and deployment-base behavior. Fixture audio is original
synthesis; no real microphone recordings or model responses are committed.

The Pages workflow consumes only the artifact that passes the real runtime job.
Do not merge/deploy around that failure. After core releases matching fixed
CLI/WASM artifacts, update the dedicated pin and checksum, rerun the minimal
repros and full artifact/browser tests, and then complete the sprint status.
