# 9) Security Posture

**Local inference and local state by default, with explicit network access through configured tools.** This is a secure _local-development_ default, not a hardened multi-user deployment. There is no authentication.

## Network exposure

| Listener             | Bound to                                          | Notes                                                              |
| -------------------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| Web app (Docker)     | `127.0.0.1:5173`                                  | Not reachable from the LAN.                                        |
| Web app (`pnpm dev`) | Vite default (`localhost`)                        | Passing `--host` would expose it; don't.                           |
| Memory / Fetch MCP   | internal Compose network only                     | No host ports. Reachable from other containers on that network.    |
| MCP Inspector        | `127.0.0.1:6274`, only with `--profile inspector` | Its backend can spawn processes; never publish it beyond loopback. |

The agent endpoints (`/api/chat` etc.) are unauthenticated. Anyone who can reach the port can read every conversation and drive the agent, including its tools. Keep the loopback bind; to share a demo, put an authenticating reverse proxy or an SSH tunnel in front.

## Data

- Conversations, runs and checkpoints: `data/db/sophos.db` (SQLite, not encrypted). Knowledge graph: `data/memory/memory.jsonl`. Both are git-ignored and stay on the machine. Tool results (e.g. fetched pages) are stored in the checkpoints.
- Prompts go only to the configured `OLLAMA_HOST`. Pointing it at a remote Ollama sends conversation content there.
- No telemetry.

## Explicit egress: the Fetch MCP

The Fetch MCP server makes **outbound HTTP requests to URLs chosen by the model**. That is the system's deliberate internet access, and it is the main attack surface:

- **Prompt injection:** fetched pages become model input and can steer subsequent tool calls (e.g. writing to Memory).
- **SSRF:** the server does **not** block private or loopback addresses. Under Docker it can reach `mcp-memory:8080` and the host via `host.docker.internal` (including Ollama); under `pnpm dev` it can reach anything on your machine and LAN.
- It honours `robots.txt` for autonomous fetches; that is a courtesy, not a security control.

Remove `fetch` from `mcp.json` to run with no tool-initiated network access.

## Supply chain

- App dependencies install from `pnpm-lock.yaml` with `--frozen-lockfile`; pnpm itself is pinned via `packageManager` + Corepack.
- MCP containers install from lockfiles (`package-lock.json`, `requirements.txt`); the Inspector image is pinned by tag.
- Local stdio servers are pinned by version in `config/mcp.json`, but `npx`/`uvx` still resolve their transitive dependencies at first run.
- Base images use major-version tags (not digests).

## Containers

- MCP containers run as a non-root user. The `web` container currently runs as root (roadmap).
- `infra/app/config` is mounted read-only into `web`.

---
