# syntax=docker/dockerfile:1
#
# Fetch MCP server (stdio) exposed over Streamable HTTP by mcp-proxy.
# Versions are pinned in requirements.in and locked in requirements.txt.
# Reachable only on the internal Compose network as http://mcp-fetch:8080/mcp.
#
# Note: this server makes outbound HTTP requests to arbitrary URLs chosen by the model.
FROM python:3.12-slim

WORKDIR /srv/app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Non-root user
RUN useradd --create-home mcp
USER mcp

EXPOSE 8080

# Endpoints: /mcp (Streamable HTTP), /sse (legacy SSE), /status (health).
CMD ["mcp-proxy", "--host", "0.0.0.0", "--port", "8080", "mcp-server-fetch"]
