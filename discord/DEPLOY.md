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

## Health and checks

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

## Registering on the demo hub

Once the instance is reachable, add the nav link in `site/index.html`
(`Discord → https://<deployment>/`) and redeploy the static site. The link is
added at deploy time so the hub never points at a dead origin.