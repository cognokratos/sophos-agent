# 11) Roadmap

## Current implementation (Phase 1 baseline)

- Monolith (SvelteKit + explicit LangGraph `StateGraph`), SSE streaming, Markdown/JSONL persistence.
- Memory & Fetch MCP servers through one `@langchain/mcp-adapters` 2.x `MCPAdapter`, configuration-driven (`mcp.json`), stdio locally and Streamable HTTP in Docker, server-prefixed tool names, clean shutdown.
- Docker Compose with loopback-only publishing, internal-only MCP services, optional Inspector profile.
- Pinned/locked dependencies; health and readiness endpoints; Compose smoke test.

## Planned (not implemented)

- SQLite persistence adapter.
- LangGraph checkpointing (durable runs; prerequisite for MCP elicitation).
- Human-in-the-loop approval for tool calls.
- OpenTelemetry tracing; local metrics endpoint and dashboard.
- Evaluation framework.
- Model-provider abstraction.
- Guardrails (input/output policies, tool allow-lists, egress restrictions for Fetch).
- CI pipeline (lint → typecheck → test → build).
- WebSocket streaming, additional MCP servers, UI improvements.

---
