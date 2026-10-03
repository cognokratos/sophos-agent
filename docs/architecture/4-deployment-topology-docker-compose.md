# 4) Deployment Topology (Docker Compose)

Defined in `infra/compose.yml`; started with `make start` (or `make inspector`).

## Services

| Service         | Image / build                                  | Published to host         | Reached by the app at        | Volumes                               |
| --------------- | ---------------------------------------------- | ------------------------- | ---------------------------- | ------------------------------------- |
| `web`           | `infra/app/Dockerfile` (SvelteKit + agent)     | `127.0.0.1:5173`          | —                            | `infra/app/config` (ro), `data/chat/` |
| `mcp-memory`    | `infra/mcp/memory/Dockerfile`                  | **not published**         | `http://mcp-memory:8080/mcp` | `data/memory/` → `/data/memory`       |
| `mcp-fetch`     | `infra/mcp/fetch/Dockerfile`                   | **not published**         | `http://mcp-fetch:8080/mcp`  | —                                     |
| `mcp-inspector` | `ghcr.io/modelcontextprotocol/inspector:2.9.0` | `127.0.0.1:6274` (opt-in) | —                            | —                                     |

- Ollama is **not** a Compose service. The app reaches the host's Ollama through `OLLAMA_HOST` (default `http://host.docker.internal:11434` in `infra/.env.example`).
- Each MCP server is a stdio server wrapped by `mcp-proxy`, which serves Streamable HTTP on `/mcp` (and legacy SSE on `/sse`) inside the container.
- The Memory server writes to `MEMORY_FILE_PATH=/data/memory/memory.jsonl`, set in `compose.yml` next to the volume, so the knowledge graph persists in the repository's `data/memory/`.
- `web` reads `CONFIG_DIR=config` and `CHAT_DIR=data/chat` from `compose.yml`; `infra/.env` holds only Ollama and UI settings.

## Profiles

- _(default)_ — `web`, `mcp-memory`, `mcp-fetch`.
- `inspector` — adds the MCP Inspector (`make inspector`). Its backend runs on the Compose network, so in its UI connect to `http://mcp-memory:8080/mcp` or `http://mcp-fetch:8080/mcp`; the MCP ports never need to be published. The API token is printed in the container logs.

To debug an MCP server from the host without the Inspector, add a temporary port mapping that keeps the loopback prefix (e.g. `127.0.0.1:8081:8080`).

## Healthchecks

| Service      | Probe (inside the container)            |
| ------------ | --------------------------------------- |
| `web`        | `wget` → `/api/healthz`                 |
| `mcp-memory` | `wget` → `mcp-proxy` `/ping`            |
| `mcp-fetch`  | Python `urllib` → `mcp-proxy` `/status` |

`web` starts only after both MCP services are healthy. `make start` and `scripts/test.sh` use `docker compose up --wait`. `/api/readyz` (Ollama + model) is checked by `scripts/test.sh`, not by a Compose healthcheck, so the stack starts even while the model is still being pulled.

## Version pinning

| Component             | Pinned in                                                                        |
| --------------------- | -------------------------------------------------------------------------------- |
| JS dependencies (app) | `pnpm-lock.yaml` (authoritative), installed with `--frozen-lockfile`             |
| pnpm                  | `package.json#packageManager`, activated with Corepack                           |
| Memory MCP container  | `infra/mcp/memory/package.json` + `package-lock.json` (`npm ci`)                 |
| Fetch MCP container   | `infra/mcp/fetch/requirements.in` → locked `requirements.txt` (`uv pip compile`) |
| MCP Inspector         | image tag `2.9.0`                                                                |
| Local stdio servers   | exact versions in `config/mcp.json` (`npx …@2026.8.31`, `uvx …@2026.8.18`)       |
| Base images           | major-version tags (`node:24-alpine`, `python:3.12-slim`), not digests           |

---
