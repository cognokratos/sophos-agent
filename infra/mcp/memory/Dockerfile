# syntax=docker/dockerfile:1
#
# Memory MCP server (stdio) exposed over Streamable HTTP by mcp-proxy.
# Versions are pinned in package.json and locked in package-lock.json.
# Reachable only on the internal Compose network as http://mcp-memory:8080/mcp.
FROM node:24-alpine

WORKDIR /srv/app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

# Non-root user; the knowledge graph is written to the mounted /data/memory volume.
RUN adduser -D mcp && mkdir -p /data/memory && chown mcp:mcp /data/memory
USER mcp

# MEMORY_FILE_PATH (read by server-memory) is set in infra/compose.yml next to the volume.
ENV PATH=/srv/app/node_modules/.bin:$PATH

EXPOSE 8080

# Endpoints: /mcp (Streamable HTTP), /sse (legacy SSE), /ping (health).
CMD ["mcp-proxy", "--host", "0.0.0.0", "--port", "8080", "mcp-server-memory"]
