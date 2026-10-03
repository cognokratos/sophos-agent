# 8) Monitoring & NFR Hooks (zero-SaaS)

## Implemented

- **Health:** `GET /api/healthz` (liveness), `GET /api/readyz` (Ollama reachable + `OLLAMA_MODEL` present; `503` otherwise).
- **Compose healthchecks:** all three services, used by `docker compose up --wait` (see [4)](./4-deployment-topology-docker-compose.md)).
- **Traces:** graph steps and tool calls/results stream to the UI's reasoning trace (not stored separately). The durable record is the checkpoint history, exported per conversation with `GET /api/conversations/:id/export?format=jsonl`; run outcomes are in the `runs` table.
- **Logs:** stdout/stderr of the Node process (and of each container).

## Roadmap (not implemented)

- Local metrics endpoint with p50/p90 latency and error counts by `ChatError.code`.
- Optional local dashboard rendering those metrics.
- OpenTelemetry tracing of graph and tool spans.

No telemetry is sent anywhere.

---
