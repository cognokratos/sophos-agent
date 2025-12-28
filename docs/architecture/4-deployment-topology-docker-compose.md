# 4) Deployment Topology (Docker Compose)

## **Services (v0, monolith):**

- `web` (SvelteKit + Agent), `mcp-memory`, `mcp-fetch`.

## **Profiles:**

- `warmup` (pre-pull images + model)
- `test` (web, mcp-memory, mcp-fetch).

## **Healthchecks:**

- `/healthz`
- `/readyz` (validates Ollama & default model).

---
