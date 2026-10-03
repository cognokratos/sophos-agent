# Σοφός Agent — Tech Stack

## Overview

Local-first, teaching-focused stack with transparent reasoning, one-command Docker startup, and inspectable persistence.

## Frontend

- **Framework:** SvelteKit (Node 24), SSR + endpoints
- **Styling:** Tailwind CSS
- **Streaming:** Server-Sent Events (SSE) from `/api/chat`; reconnect replays by `Last-Event-ID`
- **State:** Lightweight store per session; no heavy client state libs

## Agent & Orchestration

- **Engine:** LangGraph.js (TypeScript)
- **Pattern:** Explicit `StateGraph` (`agent` ⇄ `tools` via `ToolNode`); emits `TraceNote` events
- **Contracts:** `src/lib/chat.ts`

## LLM Runtime

- **Provider:** Ollama
- **Default model:** `Qwen3` (baseline); profiles for tiny models on modest hardware
- **Transport:** HTTP to `OLLAMA_HOST` (runs on the host, outside Compose)

## Tools (MCP)

- **Servers:** Memory MCP (`@modelcontextprotocol/server-memory`), Fetch MCP (`mcp-server-fetch`); stdio under `pnpm dev`, containers behind `mcp-proxy` (Streamable HTTP) under Compose
- **Bridge:** `@langchain/mcp-adapters` 2.x — one `MCPAdapter`, `servers` config, `listTools()`, `close()`
- **Tools:** server-prefixed names (`memory__read_graph`); results are `ToolMessage`s, surfaced as `trace` events

## Persistence

- **Primary:** Markdown files per turn + `trace.jsonl`
- **Path:** `data/chat/{conversationId}/`; Memory MCP graph in `data/memory/memory.jsonl`
- **Future (roadmap):** SQLite adapter

## Observability (zero-SaaS)

- **Health:** `/api/healthz` (liveness), `/api/readyz` (Ollama reachable + model present)
- **Metrics / dashboard / OpenTelemetry:** roadmap, not implemented

## Testing & QA

- **Unit:** Vitest (graph node, MCP service + config, persistence, API, components)
- **E2E:** Playwright (chat, MCP examples, persistence) against real Ollama + MCP
- **Smoke:** `scripts/test.sh` (Compose healthchecks, no published MCP ports, readiness)
- **Lint/Format:** ESLint (TS strict), Prettier

## CI/CD

- **Not implemented yet.** There is no CI workflow in the repository; checks run locally (see [7.3](./7-developer-experience-dx.md#73-testing-qa)).
- **Versioning:** Conventional commits; locked dependencies to reduce drift

## Security posture

- **Default:** only the web app is published, on `127.0.0.1`; MCP servers are internal; the Fetch MCP is the explicit egress (see [9)](./9-security-posture.md))
- **Secrets:** Minimal; no telemetry; no authentication

## Versions

Exact versions live in `package.json` / `pnpm-lock.yaml` and the MCP container lockfiles (see [4) Version pinning](./4-deployment-topology-docker-compose.md#version-pinning)).

- Node 24 (`engines`), pnpm 10.34.6 (`packageManager`, via Corepack)
- SvelteKit 2, Svelte 5, Vite 7, Tailwind 4
- `@langchain/langgraph` 1.4, `@langchain/core` 1.2, `@langchain/mcp-adapters` 2.0, `@langchain/ollama` 1.1, Zod 4
- `@modelcontextprotocol/server-memory` 2026.8.31, `mcp-server-fetch` 2026.8.18, MCP Inspector 2.9.0
- Ollama: installed on the host, not pinned by this repository
- Vitest 3, Playwright 1.57, ESLint 9, TypeScript 5.9, Prettier 3
