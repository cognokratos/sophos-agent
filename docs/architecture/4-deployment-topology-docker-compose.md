# 4) Deployment Topology (Docker Compose)

**Services (v0, monolith):**

* `web` (SvelteKit + Agent), `mcp-memory`, `mcp-fetch`.
  **Profiles:**
* `warmup` (pre-pull images + model), `publish` (bind to `0.0.0.0`), `split` (run agent separately).
  **Healthchecks:** `/healthz`, `/readyz` (validates Ollama & default model).

---
