# Σοφός Agent — Coding Standard

## Language & Type System

- **TypeScript everywhere** (strict mode on).
- No `any` unless isolated with `// TODO(any): justification`.
- Public functions/interfaces must be typed; prefer discriminated unions for variants (e.g., events).

## Project Structure & Imports

- Keep feature code close to usage:
  - `lib/agent/` (graph, nodes)
  - `lib/agent/mcp/` (MCP configuration and client)
  - `lib/agent/persistence/` (storage)

- Use path aliases only if necessary; avoid deep relative import chains.

## Naming

- Files: `kebab-case.ts`; components: `PascalCase.svelte`; classes/types: `PascalCase`; functions/vars: `camelCase`.
- Graph nodes: prefix with domain (`plannerNode`, `toolNode`, `finalizeNode`).
- SSE event names: `token`, `trace`, `end`, `chat-error`, `ping` (canonical).

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
  - `end` → `ChatSession`
  - `chat-error` → `ChatError`

- Every event carries an `id`; reconnecting clients resume with `Last-Event-ID`.

## Logging & Tracing

- Conversation state is persisted by the LangGraph checkpointer; do not write per-message files. Human-readable output belongs in the export endpoint (`src/lib/agent/export.ts`).
- Trace events streamed to the UI use compact objects:

  ```json
  {
  	"step": 4,
  	"name": "fetch__fetch",
  	"node": "tools",
  	"event": "result",
  	"data": {}
  }
  ```

- Do not log secrets or full request bodies; redact URLs in `fetch.post` traces if they contain tokens.

## MCP Tool Adapters

- The agent consumes MCP tools through `@langchain/mcp-adapters` 2.x: one `MCPAdapter` (`{ servers }` config, `listTools()`, `close()`), owned by `MCPClientService`.
- Add servers in `mcp.json`, not in code. Keep `prefixToolNameWithServerName: true` so tool names stay unambiguous across servers.
- Do not wrap or re-describe adapter tools; the model should see the server's own name, description and schema.
- Pin every MCP server version (`npx pkg@x.y.z`, `uvx pkg@x.y.z`, container lockfiles).

## Access & Security

- Publish ports only on `127.0.0.1`; MCP services stay on the internal Compose network. Debug tooling lives behind an opt-in profile (`inspector`).
- Validate inputs at the edge (SvelteKit endpoint) with a light schema (e.g., Zod).
- CORS disabled by default; only enable for demos with explicit origins.
- No telemetry. All artifacts remain local.

## Testing Requirements

- **Unit:** ≥ 80% coverage on `lib/agent/` nodes and `lib/mcp/` adapters.
- **Integration:** Chat happy path + one tool error path; assert SSE downgrade works.
- **Smoke:** `/api/healthz`, `/api/readyz` green (`scripts/test.sh`).
- Unit tests must be deterministic and run offline; e2e and smoke tests need Ollama (and network for Fetch).

## Performance & NFRs

- Aim for ~5 s p50 latency (baseline model). A local metrics endpoint is on the roadmap.
- Compose healthchecks required for “99% startup success”.
- Pull the default model (`ollama pull $OLLAMA_MODEL`) before starting; a warmup step is on the roadmap.

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

- Before merging: `pnpm lint`, `pnpm check`, `pnpm test:unit --run`, `pnpm build` (no CI pipeline yet).

## Code Style

- ESLint (TS strict) + Prettier; run `pnpm lint` and `pnpm format` on pre-commit.
- No dead code. Remove `console.*` except in development guarded blocks.
- Keep functions small; prefer pure helpers; avoid shared mutable state between graph nodes.
