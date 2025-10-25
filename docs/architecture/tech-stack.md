# Софос Agent — Tech Stack

## Overview

Local-first, teaching-focused stack with transparent reasoning, one-command Docker startup, and inspectable persistence.

## Frontend

* **Framework:** SvelteKit (Node 20), SSR + endpoints
* **Styling:** Tailwind CSS
* **Streaming:** Server-Sent Events (SSE) from `/api/chat`; JSON fallback
* **State:** Lightweight store per session; no heavy client state libs

## Agent & Orchestration

* **Engine:** LangGraph.js (TypeScript)
* **Pattern:** Node-based graph; policies for tool-calling; emits `TraceNote` events
* **Contracts:** `packages/shared/chat.ts` & `error.ts`

## LLM Runtime

* **Provider:** Ollama (containerized)
* **Default model:** `mistral` (baseline); profiles for tiny models on modest hardware
* **Transport:** Local HTTP (`/api/generate`, `/api/tags`)

## Tools (MCP)

* **Servers:** Memory MCP, Fetch MCP (containers)
* **Bridge:** `@langchain/mcp-adapters` (JS)
* **Tool calls:** Represented as `ToolCall` in messages; surfaced as `trace` events

## Persistence

* **Primary:** Markdown files per turn + `trace.jsonl`
* **Path:** `/data/logs/{sessionId}/`
* **Future:** Pluggable adapter → SQLite (Phase 2) without contract changes

## Observability (zero-SaaS)

* **Health:** `/healthz` (liveness), `/readyz` (Ollama reachable + model present)
* **Metrics:** `/metrics.json` (p50/p90 latency, request count, error counts)
* **Dashboard:** `/metrics` renders JSON (optional)

## Testing & QA

* **Unit:** Vitest (graph nodes, adapters)
* **E2E:** Playwright (chat happy path, SSE fallback)
* **Smoke:** `scripts/test.sh` (health, models)
* **Lint/Format:** ESLint (TS strict), Prettier

## CI/CD

* **Runner:** GitHub Actions
* **Jobs:** Lint → Typecheck → Test → Build → Tag
* **Versioning:** Semantic commits; pinned deps to reduce drift

## Security posture

* **Default:** Local-only binds (127.0.0.1)
* **Profiles:** `publish` to expose ports deliberately
* **Secrets:** Minimal; no telemetry

## Version pins (suggested minimums)

* Node 20.x LTS
* pnpm 9.x
* SvelteKit ^2
* LangGraph.js: current stable (pin in `package.json`)
* Ollama: pinned image tag
* MCP servers: pinned image tags
* Vitest ^2, Playwright ^1.47
* ESLint ^9, TypeScript ^5.6, Prettier ^3
