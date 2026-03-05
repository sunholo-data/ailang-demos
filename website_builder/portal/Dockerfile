FROM node:20-alpine

WORKDIR /app

# Copy package files and install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy server (sidecar only — Vue SPA is served from GitHub Pages)
COPY server.js ./

# Cloud Run sets PORT env var
ENV PORT=8080
EXPOSE 8080

# The sidecar reads SIDECAR_PORT but Cloud Run sets PORT
CMD ["sh", "-c", "SIDECAR_PORT=$PORT node server.js"]
