# Deploying the Discord browser demo

The demo is one process: `discord/ailang-discord-server` serves the browser page,
the WASM runtime and the renderer at `/`, streams AG-UI events at `POST /run`,
and applies draft-review actions at `POST /action`. Put it on a host that has
the Daneel bot credentials and a public port (behind a TLS proxy), and a visitor
can watch a real AILANG agent run end to end in their browser.

## What a visitor sees

1. They open the server's page (`GET /`) and type a reply text.
2. **Run** streams the agent step live: `▶ run …` → the echoed user message →
   `⚙ discord_draft` → a review card rendered **in their browser by the AILANG
   WASM runtime** (`renderer.ail`), with a submit button.
3. **Submit** posts the A2UI draft-review action back to `/action`.
4. With writes enabled, the action result contains the message link
   (`https://discord.com/channels/<guild>/<channel>/<message>`) — clicking it
   opens the real message Daneel posted in the sunholo server's `#daneel`
   channel. That link is the "Discord working" moment.
5. With writes disabled (public-demo default), the action ends at the structured
   policy gate and the page shows it — the round-trip is real, the send is not.

## Runbook (Daneel account)

```sh
# 1. Host prerequisites: the ailang binary on PATH (v0.39+), python3, this repo
#    checked out (discord/), and the wasm/ directory from the same commit
#    (the server serves ../wasm relative to its parent).

# 2. Credentials on the host — token file outside the repo, 0600, never logged.
install -m 600 /dev/null /etc/daneel/discord-bot.token   # paste the token once
export DISCORD_TOKEN_FILE=/etc/daneel/discord-bot.token

# 3. Policy config (IDs only; writes deliberately scoped to #daneel):
#    discord/config.json with
#      channels: ["1549868288002236417"], write_channels: ["1549868288002236417"],
#      enable_writes: true   ← flip on only for live mode (see modes below)

# 4. Serve (loopback by default; expose via reverse proxy):
DISCORD_SSE_HOST=0.0.0.0 DISCORD_SSE_PORT=8089 ./ailang-discord-server
```

Environment knobs:

| Variable | Default | Meaning |
|---|---|---|
| `DISCORD_SSE_HOST` | `127.0.0.1` | bind address; `0.0.0.0` only behind TLS |
| `DISCORD_SSE_PORT` | `8089` | listen port |
| `DISCORD_SSE_ORIGIN` | closed | site origin allowed to call cross-origin; empty = same-origin only |
| `DISCORD_SSE_MAX_BODY` | 65536 | request body cap (bytes) |
| `DISCORD_TOKEN_FILE` | — | 0600 token file; never logged |
| `DISCORD_CONFIG` | `discord/config.json` | policy: readable/writable channels |
| `DISCORD_STATE_DIR` | `~/.ailang/discord` | drafts, cursors, writer lock (0700) |

systemd unit sketch:

```ini
[Unit]
Description=AILANG Discord AG-UI SSE demo
After=network.target

[Service]
User=daneel
WorkingDirectory=/srv/ailang-demos/discord
Environment=DISCORD_SSE_HOST=0.0.0.0
Environment=DISCORD_SSE_PORT=8089
Environment=DISCORD_TOKEN_FILE=/etc/daneel/discord-bot.token
ExecStart=/usr/bin/python3 ailang-discord-server
Restart=on-failure
NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=%h/.ailang/discord
```

(Terminate the TLS proxy in front — Caddy/nginx — or put Cloud Run/IAP in
front; the server speaks plain HTTP on the loopback/internal network.)

## Modes

| Mode | `enable_writes` | Visitor action result | Use |
|---|---|---|---|
| Public demo (default) | `false` | structured `policy` response; page explains the gate | open showcase, no live posts |
| Live (Daneel-managed) | `true`, `write_channels` = #daneel only | real send + Discord message link | the full story |

Flip between modes by editing `config.json` and restarting; the policy gate in
AILANG (not the web layer) is what actually permits or blocks sends.

## Tailscale (this machine's visitor access)

The Studio exposes the demo on the tailnet via `tailscale serve` (HTTPS at the
MagicDNS name) alongside the existing site:

```
https://voights-mac-studio.tail97eda0.ts.net/          → 127.0.0.1:8941  (existing site)
https://voights-mac-studio.tail97eda0.ts.net/discord/  → 127.0.0.1:8089  (this demo)
https://voights-mac-studio.tail97eda0.ts.net/wasm/     → 127.0.0.1:8090  (wasm/ static dir)
```

Setup (the GUI app's CLI; the homebrew `tailscale` errors on this Mac):

```sh
TS=/Applications/Tailscale.app/Contents/MacOS/Tailscale
"$TS" serve --bg --set-path /discord http://127.0.0.1:8089
"$TS" serve --bg --set-path /wasm   http://127.0.0.1:8090   # python3 -m http.server --directory ../wasm 8090
```

Notes: `serve --set-path` STRIPS the prefix before proxying, so the demo server
runs prefix-agnostic (its relative-URL page works at both / and /discord/);
the server also accepts a `DISCORD_SSE_PATH_PREFIX` strip for proxies that keep
it. The static hub copy (site/discord/) uses the same relative asset paths so
the CI-hosted page works unchanged. Self-connect to the raw tailnet IP hangs
on macOS (utun routing) — always test via the ts.net HTTPS name or loopback.

## Health and checks

Self-connect quirk: `curl http://<tailscale-ip>:8089` from the host itself
hangs — macOS routes self-traffic on the utun interface into the tunnel.
Test locally via `127.0.0.1:8089`; other tailnet devices reach the same
wildcard listener normally (`http://<machine-tailscale-ip>:8089/`).

- `GET /healthz` → `ok`
- The page's renderer status line shows whether the AILANG WASM runtime loaded
  (or the JS fallback engaged).
- `npm test` in `discord/` runs all seven offline integration groups, including
  the SSE stream validated against `@ag-ui/core` and the WASM asset checks.

## Docker (optional)

`discord/Dockerfile` builds a slim image (Python + the ailang binary + the demo
tree). Build with the ailang binary available in the context:

```sh
cp "$(command -v ailang)" discord/ailang-bin
docker build -t ailang-discord-demo discord/
docker run --rm -p 8089:8089 -e DISCORD_SSE_HOST=0.0.0.0 \
  -v /etc/daneel/discord-bot.token:/token/discord-bot.token:ro \
  -e DISCORD_TOKEN_FILE=/token/discord-bot.token \
  ailang-discord-demo
```

## Cloud Run variant (Daneel's usual shape)

The server is a plain HTTP container, so Cloud Run works directly. Two
adjustments from the bare-metal runbook:

1. **Token via Secret Manager, not a file.** The AILANG code accepts
   `DISCORD_BOT_TOKEN` as an env var, so bind the secret at deploy time:

   ```sh
   echo -n "$DISCORD_BOT_TOKEN" | gcloud secrets create discord-bot-token --data-file=-

   gcloud run deploy discord-demo \
     --source discord/ \
     --set-env-vars DISCORD_SSE_HOST=0.0.0.0,DISCORD_SSE_ORIGIN=https://www.sunholo.com \
     --set-secrets DISCORD_BOT_TOKEN=discord-bot-token:latest \
     --min-instances=1 --max-instances=1 \
     --no-allow-unauthenticated=false
   ```

   (`token()` in `service.ail` reads `DISCORD_BOT_TOKEN` first, then
   `DISCORD_TOKEN_FILE` — the container never touches a token file.)

2. **Draft state must survive between requests.** The review round-trip keeps
   drafts, cursors and the writer lock in `DISCORD_STATE_DIR`. Cloud Run scales
   to zero by default and has an ephemeral filesystem, so either pin
   `--min-instances=1 --max-instances=1` with a mounted volume for `/state`
   (second-gen runtimes support volume mounts), or run the container on a small
   always-on VM. Losing the state dir mid-review is not fatal — the visitor's
   action ends at a structured `state` error and they re-run — but the
   durability keeps the round-trip smooth.

3. **TLS is free**: Cloud Run terminates HTTPS at the URL it issues
   (`https://discord-demo-<hash>.run.app`); set that origin as `LIVE_URL` in
   `site/discord/index.html` (or point the hub's `Discord` card at the
   server's own page, which serves the same experience same-origin).

Keep `--max-instances=1`: the writer flock is in-process, so a single instance
is the concurrency model (all requests serialize; the queue absorbs bursts).
Public access plus one instance plus the 64KB body cap is the intended
public-demo posture; enable writes in `config.json` only when Daneel accepts
that anyone reaching the URL can post to the configured channel.

## Registering on the demo hub (two lines)

The hub's static page (`site/discord/`) replays a recorded run through the WASM
renderer with no server. To make it **fully interactive** — visitors typing on
www.sunholo.com driving the real instance — set two things:

1. On the Daneel server host: `DISCORD_SSE_ORIGIN=https://www.sunholo.com`
   (the CORS opt-in; the token stays server-side regardless).
2. In `site/discord/index.html`: set `const LIVE_URL = 'https://<daneel-host>'`.
   The page then shows the live controls ("Run your own"), streams the real
   run cross-origin, and the review card's Submit posts the action — the
   policy gate on the server decides the send and returns the message link.

Until `LIVE_URL` is set, the published page ships as the replay showcase and
the action button explains the gate. The server's own page (`GET /`) is always
the same experience same-origin. Redeploy the static site after setting the
constant so the hub never points at a dead origin.