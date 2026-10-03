# 8) Monitoring & NFR Hooks (zero-SaaS)

## Implemented

- **Health:** `GET /api/healthz` (liveness), `GET /api/readyz` (Ollama reachable + `OLLAMA_MODEL` present; `503` otherwise).
- **Compose healthchecks:** all three services, used by `docker compose up --wait` (see [4)](./4-deployment-topology-docker-compose.md)).
- **Traces:** every graph step and tool call/result is appended to `data/chat/{conversationId}/trace.jsonl`.
- **Logs:** stdout/stderr of the Node process (and of each container).

## Roadmap (not implemented)

- Local metrics endpoint with p50/p90 latency and error counts by `ChatError.code`.
- Optional local dashboard rendering those metrics.
- OpenTelemetry tracing of graph and tool spans.

No telemetry is sent anywhere.

---
