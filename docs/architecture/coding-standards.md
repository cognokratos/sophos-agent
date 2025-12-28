# Софос Agent — Coding Standard

## Language & Type System

- **TypeScript everywhere** (strict mode on).
- No `any` unless isolated with `// TODO(any): justification`.
- Public functions/interfaces must be typed; prefer discriminated unions for variants (e.g., events).

## Project Structure & Imports

- Keep feature code close to usage:
  - `lib/agent/` (graph, nodes, policies)
  - `lib/mcp/` (tool adapters/clients)
  - `lib/persistence/` (storage)

- Use path aliases only if necessary; avoid deep relative import chains.

## Naming

- Files: `kebab-case.ts`; components: `PascalCase.svelte`; classes/types: `PascalCase`; functions/vars: `camelCase`.
- Graph nodes: prefix with domain (`plannerNode`, `toolNode`, `finalizeNode`).
- Event names: `token`, `trace`, `tool`, `done` (canonical).

## Error Handling (authoritative)

- **Single envelope** across all layers:

  ```ts
  type ErrorCode =
  	| 'BAD_REQUEST'
  	| 'NOT_FOUND'
  	| 'SESSION_IN_PROGRESS'
  	| 'MODEL_UNAVAILABLE'
  	| 'AGENT_FAILURE'
  	| 'UNKNOWN_ERROR';

  interface ChatError {
  	code: ErrorCode;
  	message: string;
  	conversation?: UUID;
  }
  ```

- Never throw raw errors from endpoints; always map to `ChatError` with stable `code`.
- Include `conversationId`, log server-side with context.
- UI must render friendly copy and keep the conversation usable on `AGENT_FAILURE`.

## Streaming Protocol

- Default transport is **SSE**. Emit canonical events:
  - `token` → `string`
  - `trace` → `TraceNote`
  - `done` → `ChatSession`

- On `EventSource.onerror`, **downgrade** to non-stream JSON once.

## Logging & Tracing

- Write **Markdown** files per turn plus `trace.jsonl` with compact objects:

  ```json
  {
  	"ts": "2025-12-27T22:57:34.907Z",
  	"turn": 4,
  	"name": "fetch",
  	"node": "tools",
  	"event": "result",
  	"data": {}
  }
  ```

- Do not log secrets or full request bodies; redact URLs in `fetch.post` traces if they contain tokens.

## MCP Tool Adapters

- The agent will consume MCP tools primarily through the `@langchain/mcp-adapters` library.
- Tools retrieved from `MultiServerMCPClient` will be adapted to the agent's internal tool representation as necessary.
- When adapting, ensure that the tool's functionality (name, description, schema, and call mechanism) is preserved.

## Access & Security

- Default binding `127.0.0.1`; “publish” profile is an explicit opt-in.
- Validate inputs at the edge (SvelteKit endpoint) with a light schema (e.g., Zod).
- CORS disabled by default; only enable for demos with explicit origins.
- No telemetry. All artifacts remain local.

## Testing Requirements

- **Unit:** ≥ 80% coverage on `lib/agent/` nodes and `lib/mcp/` adapters.
- **Integration:** Chat happy path + one tool error path; assert SSE downgrade works.
- **Smoke:** `/healthz`, `/readyz` green in CI.
- Tests must be deterministic and run offline.

## Performance & NFRs

- Aim for ~5 s p50 latency (baseline model). Expose `/metrics.json` with p50/p90.
- Compose healthchecks required for “99% startup success”.
- Warmup script must pre-pull default model (`OLLAMA_MODEL`).

## Documentation & Comments

- Each graph node file begins with a short “Teaching Note” explaining intent and trade-offs.
- Public functions include JSDoc with parameter/return types and side-effect notes.
- Keep README snippets runnable; prefer small, self-contained examples.

## Commit, PR, and CI Conventions

- **Conventional Commits:** `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`.
- PR checklist:
  - [ ] Endpoint returns `ChatError` on failure
  - [ ] SSE events follow canonical schema
  - [ ] Logs/trace redact sensitive data
  - [ ] Added/updated tests, docs, and types

- CI blocks on lint, typecheck, tests; green only with healthchecks passing.

## Code Style

- ESLint (TS strict) + Prettier; run `pnpm lint` and `pnpm format` on pre-commit.
- No dead code. Remove `console.*` except in development guarded blocks.
- Keep functions small; prefer pure helpers; avoid shared mutable state between graph nodes.
