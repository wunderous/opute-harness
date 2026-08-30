# syntax=docker/dockerfile:1
# Loopback-only DSH. Publish via Cloudflare Tunnel to 127.0.0.1:3080.
FROM node:22-bookworm-slim
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile || pnpm install
ENV OPUTE_HARNESS_PRESET_ROOT=/app/packages/bundle-opute-web/presets
ENV OPUTE_MCP_ENDPOINT=https://mcp.opute.io/mcp
EXPOSE 3080
# Install DSH CLI in the image or bind-mount it. The process must remain on loopback.
CMD ["node", "scripts/launch-opute-web.js"]
