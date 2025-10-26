# syntax=docker/dockerfile:1
FROM python:3.12-slim AS base

# Install uvx (for running Python modules nicely) and the fetch server
RUN pip install --no-cache-dir uv

WORKDIR /srv/app
RUN useradd -m mcp && chown -R mcp:mcp /srv/app
USER mcp

EXPOSE 8080

# Use uvx to launch the fetch server through mcp-proxy
CMD ["sh","-lc","uvx mcp-proxy --host 0.0.0.0 --port=8080 uvx mcp-server-fetch"]
