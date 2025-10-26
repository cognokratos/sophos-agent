# syntax=docker/dockerfile:1
FROM node:24-alpine

# Install deps
WORKDIR /app
# Keep versions in one place if you like; using latest here for brevity
RUN npm i -g mcp-proxy

# Non-root for safety
RUN adduser -D mcp && chown -R mcp:mcp /app
USER mcp

# Expose proxy port
EXPOSE 8080

# Start the HTTP proxy which spawns the stdio Memory server.
# Endpoints:
#   - /mcp (Streamable HTTP)
#   - /sse (Server-Sent Events)
# Flags: --shell lets it run through a shell; `--` passes args to the child cmd
CMD ["sh","-lc","mcp-proxy npx @modelcontextprotocol/server-memory"]
