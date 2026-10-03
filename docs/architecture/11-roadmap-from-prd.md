# 11) Roadmap

## Current implementation

- Monolith (SvelteKit + explicit LangGraph `StateGraph`), SSE streaming.
- Durable execution (Phase 2): SQLite checkpointer, conversation = thread, `runs` table with `running/interrupted/completed/failed`, resume after crash or failure, recursion limit, Markdown/JSONL exports.
- Memory & Fetch MCP servers through one `@langchain/mcp-adapters` 2.x `MCPAdapter`, configuration-driven (`mcp.json`), stdio locally and Streamable HTTP in Docker, server-prefixed tool names, clean shutdown.
- Docker Compose with loopback-only publishing, internal-only MCP services, optional Inspector profile.
- Pinned/locked dependencies; health and readiness endpoints; Compose smoke test.

## Planned (not implemented)

- Human-in-the-loop approval for tool calls (LangGraph interrupts on the existing checkpointer); MCP elicitation.
- Run cancellation.
- OpenTelemetry tracing; local metrics endpoint and dashboard.
- Evaluation framework.
- Model-provider abstraction.
- Guardrails (input/output policies, tool allow-lists, egress restrictions for Fetch).
- CI pipeline (lint → typecheck → test → build).
- WebSocket streaming, additional MCP servers, UI improvements.

---
