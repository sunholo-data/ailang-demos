# AILANG Discord AG-UI SSE demo — server image.
# Python 3.12 + the ailang binary + the demo tree + the AILANG WASM runtime.
#
# Staging layout (build context):
#   staging/discord/**    (this demo directory, incl. this Dockerfile)
#   staging/wasm/**       (ailang.wasm, wasm_exec.js, ailang-repl.js)
#   staging/ailang-bin    (the ailang binary, pinned at build time)
#
#   docker build -t ailang-discord-demo staging/
#   docker run --rm -p 8089:8089 -e DISCORD_SSE_HOST=0.0.0.0 \
#     -v /secrets/discord-bot.token:/token/discord-bot.token:ro \
#     -v /secrets/discord-config.json:/app/config.json:ro \
#     ailang-discord-demo
#
# The token file and policy config are runtime mounts; they are never baked in.
FROM python:3.12-slim

WORKDIR /app

COPY ailang-bin /usr/local/bin/ailang
RUN chmod +x /usr/local/bin/ailang

COPY ailang.toml ailang.lock ./
COPY main.ail api.ail service.ail protocol.ail renderer.ail config.example.json ./
COPY ailang-discord ailang-discord-server ./
COPY site ./site
COPY wasm ./wasm

# Writable state (drafts, cursors, writer lock); no credentials in the image.
RUN mkdir -p /state && chmod 700 /state
ENV DISCORD_STATE_DIR=/state
ENV DISCORD_SSE_HOST=0.0.0.0
ENV DISCORD_SSE_PORT=8089

EXPOSE 8089
CMD ["python3", "ailang-discord-server"]