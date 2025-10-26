# Софос Agent — Coding Standard

## Language & Type System

* **TypeScript everywhere** (strict mode on).
* No `any` unless isolated with `// TODO(any): justification`.
* Public functions/interfaces must be typed; prefer discriminated unions for variants (e.g., events).

## Project Structure & Imports

* Keep feature code close to usage:

  * `lib/agent/` (graph, nodes, policies)
  * `lib/mcp/` (tool adapters/clients)
  * `lib/persistence/` (storage)
  * `lib/error/` (error envelope, mappers)
* Use path aliases only if necessary; avoid deep relative import chains.

## Naming

* Files: `kebab-case.ts`; components: `PascalCase.svelte`; classes/types: `PascalCase`; functions/vars: `camelCase`.
* Graph nodes: prefix with domain (`plannerNode`, `toolNode`, `finalizeNode`).
* Event names: `token`, `trace`, `tool`, `done` (canonical).

## Error Handling (authoritative)

* **Single envelope** across all layers:

  ```ts
  export interface ApiError {
    error: {
      code: 'BAD_REQUEST' | 'MODEL_UNAVAILABLE' | 'TOOL_FAILURE' | 'ENGINE_FAILURE' | 'INTERNAL_ERROR';
      message: string;
      details?: Record<string, unknown>;
      timestamp: string;
      requestId: string;
    };
  }
  ```
* Never throw raw errors from endpoints; always map to `ApiError` with stable `code`.
* Include `requestId` (attach in `hooks.server.ts`), log server-side with context.
* UI must render friendly copy and keep the conversation usable on `TOOL_FAILURE`.

## Streaming Protocol

* Default transport is **SSE**. Emit canonical events:

  * `token` → `{ text: string }`
  * `trace` → `TraceNote`
  * `tool`  → `{ id, name, status }`
  * `done`  → `{ messageId, usage? }`
* On `EventSource.onerror`, **downgrade** to non-stream JSON once.

## Logging & Tracing

* Write **Markdown** files per turn plus `trace.jsonl` with compact objects:

  ```json
  {"ts":"2025-10-25T10:00:00Z","node":"planner","event":"enter","data":{"goal":"..."}}
  ```
* Do not log secrets or full request bodies; redact URLs in `fetch.post` traces if they contain tokens.

## MCP Tool Adapters

* Adapters must conform to a thin interface and surface safe errors:

  ```ts
  export interface McpTool<TArgs, TResult> {
    name: string;
    call(args: TArgs): Promise<TResult>;
  }
  export type MemoryWriteArgs = { key: string; value: string; meta?: Record<string, unknown> };
  export type MemoryWriteResult = { ok: true };
  ```
* Wrap remote errors and map to `TOOL_FAILURE` with `{ tool: name, cause }` in `details`.

## Access & Security

* Default binding `127.0.0.1`; “publish” profile is an explicit opt-in.
* Validate inputs at the edge (SvelteKit endpoint) with a light schema (e.g., Zod).
* CORS disabled by default; only enable for demos with explicit origins.
* No telemetry. All artifacts remain local.

## Testing Requirements

* **Unit:** ≥ 80% coverage on `lib/agent/` nodes and `lib/mcp/` adapters.
* **Integration:** Chat happy path + one tool error path; assert SSE downgrade works.
* **Smoke:** `/healthz`, `/readyz`, `/api/models` green in CI.
* Tests must be deterministic and run offline.

## Performance & NFRs

* Aim for ~2 s p50 latency (baseline model). Expose `/metrics.json` with p50/p90.
* Compose healthchecks required for “99% startup success”.
* Warmup script must pre-pull default model (`OLLAMA_MODEL`).

## Documentation & Comments

* Each graph node file begins with a short “Teaching Note” explaining intent and trade-offs.
* Public functions include JSDoc with parameter/return types and side-effect notes.
* Keep README snippets runnable; prefer small, self-contained examples.

## Commit, PR, and CI Conventions

* **Conventional Commits:** `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`.
* PR checklist:

  * [ ] Endpoint returns `ApiError` on failure
  * [ ] SSE events follow canonical schema
  * [ ] Logs/trace redact sensitive data
  * [ ] Added/updated tests, docs, and types in `packages/shared/`
* CI blocks on lint, typecheck, tests; green only with healthchecks passing.

## Code Style

* ESLint (TS strict) + Prettier; run `pnpm lint` and `pnpm format` on pre-commit.
* No dead code. Remove `console.*` except in development guarded blocks.
* Keep functions small; prefer pure helpers; avoid shared mutable state between graph nodes.

## Context Retrieval Standard (Context7)

All BMAD Dev agents **must** use Context7 as the authoritative source of documentation.

**Rules:**
1. Before writing or refactoring any code, invoke:
   - `use context7`
   - or `use library /<context7-id>@<version>`
2. When implementing a story, load all relevant docs from Context7
   (frameworks, APIs, libraries, and internal SDKs).
3. If local or cached docs differ from Context7’s latest version,
   prefer the **latest version** unless the story explicitly pins one.
4. Always include a “Context7 confirmation” step in your reasoning summary.
   Example:
   > “Verified React Query v5 via Context7 (latest patch 5.51.3).”
5. If Context7 is unreachable, halt and escalate to the Scrum Master agent.
