# 7) Developer Experience (DX)

## 7.1 Repository Layout

```
src/        (SvelteKit + Agent)
config/     (mcp.json + system.md for `pnpm dev`)
infra/      (compose, Dockerfiles, container config)
data/       (db/sophos.db and memory/ — local state, git-ignored)
scripts/    (Compose smoke test)
docs/       (Documentation)
```

**Why:** simple onboarding; one package, no workspace packages.

## 7.2 Setup

Prerequisites: Node 24, Docker, and [Ollama](https://ollama.com) with the model pulled (`ollama pull qwen3`). `pnpm dev` additionally needs `npx` and [`uv`](https://docs.astral.sh/uv/) for the stdio MCP servers.

```sh
corepack enable                 # uses pnpm@<version> from package.json#packageManager
pnpm install --frozen-lockfile

cp .env.example .env            # local: pnpm dev
pnpm dev

cp infra/.env.example infra/.env
make start                      # Docker: http://127.0.0.1:5173
make inspector                  # + MCP Inspector on http://127.0.0.1:6274
make stop
```

## 7.3 Testing & QA

- **Unit:** Vitest — `server` project (durable graph behaviour with a scripted model and a real SQLite file, persistence, runs, API, MCP service and config loader) and `client` project (Svelte components in Chromium). `pnpm test:unit --run`.
- **Integration:** Playwright against `pnpm preview` with real Ollama + MCP servers. `pnpm test:e2e`.
- **Compose smoke:** `scripts/test.sh` — builds the stack, waits for all healthchecks, asserts the MCP services publish no host ports, then waits for `/api/readyz`.
- **Static:** `pnpm check` (svelte-check, TS strict), `pnpm lint` (Prettier + ESLint).

There is no CI pipeline in the repository yet; run these locally (`make test` runs unit, e2e and smoke).

---
