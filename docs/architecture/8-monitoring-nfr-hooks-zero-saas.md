# 8) Monitoring & NFR Hooks (zero-SaaS)

- **Health:** `GET /healthz`, `GET /readyz` (ensures Ollama + model).
- **Metrics (local):** `GET /metrics.json` with p50/p90 latency, request & error counts by `ChatError.code`.
- **Dashboard (optional):** `/metrics` renders gauges/sparklines from JSON; no external deps.
- **Compose healthchecks:** verify services, support the **99% startup** goal.

---
