# 3) Runtime & Integration Details

## 3.1 Processes & Boundaries

- **web (SvelteKit + Agent, v0 monolith)** — UI, `/api/*` endpoints, LangGraph graph, `MCPAdapter`.
- **Ollama** — model server on the host (default model `qwen3`); reached at `OLLAMA_HOST`. Not managed by Compose.
- **mcp-memory / mcp-fetch** — MCP tool servers. Under `pnpm dev` they are stdio child processes of the web process; under Docker Compose they are separate containers behind an HTTP proxy.
- **persistence** — SQLite at `data/db/sophos.db` (conversations, runs, LangGraph checkpoints) and `data/memory/` (Memory MCP knowledge graph); both host-mounted under Docker.

## 3.2 Public HTTP API (thin surface)

- **POST `/api/chat`** — start a run: `{message}` (new conversation), `{message, conversation}` (next turn) or `{resume: true, conversation}` (continue an unfinished run). Returns `{conversation, run}`; `400` invalid input, `404` unknown conversation, `409` run already active (`SESSION_IN_PROGRESS`) or nothing to resume (`RUN_NOT_RESUMABLE`).
- **GET `/api/chat?conversation=...`** — **SSE** stream of the active run: `token`, `trace`, `end`, `chat-error`, `ping`. With no active run it answers once with `end` (and the last run's status) or `chat-error`.
- **GET `/api/conversations`** — conversation metadata from SQLite: `id`, `title`, `createdAt`, `updatedAt`, `messageCount`, `status` (latest run).
- **GET `/api/conversations/:conversationId`** — metadata + `messages` read from the LangGraph thread + `resumable`. Ids must be UUIDs (`400` otherwise, `404` if unknown).
- **GET `/api/conversations/:conversationId/export`** — generated Markdown transcript; `?format=jsonl` for the checkpoint history.
- **GET `/api/healthz`** — liveness (`{"status":"ok"}`).
- **GET `/api/readyz`** — readiness: Ollama reachable and `OLLAMA_MODEL` pulled; `503` otherwise. MCP servers are not checked.
  Keep endpoints minimal; move complexity into the agent engine for teachability.

## 3.3 Message Contracts (shared types)

Defined in `src/lib/chat.ts`. LangChain message objects never reach the UI; `src/lib/agent/messages.ts` converts thread messages to `MessageDto`:

```text
LangGraph thread (LangChain messages)  →  toMessageDto()  →  MessageDto (JSON)  →  Svelte UI
```

```ts
export type RunStatus = 'running' | 'interrupted' | 'completed' | 'failed';

export interface MessageDto {
	id: string; // LangChain message id (stable)
	role: 'user' | 'assistant' | 'tool';
	content: string;
	toolCalls?: { id?: string; name: string; args: Record<string, unknown> }[]; // assistant
	name?: string; // tool
	toolCallId?: string; // tool
	status?: 'success' | 'error'; // tool
}

export interface ConversationSummary {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
	messageCount: number;
	status: RunStatus | null;
	error?: ChatError;
}

export interface TraceNote {
	node: string;
	name: string;
	step: number; // langgraph_step
	event: 'enter' | 'leave' | 'call' | 'result';
	data?: Record<string, unknown>;
}

export type AgentEvent =
	| { type: 'trace'; data: TraceNote }
	| { type: 'token'; data: string }
	| { type: 'end' };
```

## 3.4 Streaming Protocol

**SSE** for simplicity. `POST /api/chat` starts the run and returns the conversation ID; the UI then opens an `EventSource` on `GET /api/chat`. Every event carries an incrementing `id`, and the server buffers the active run's events in memory, so a late or reconnecting browser (`Last-Event-ID`) receives only what it missed. The buffer is transport state only: when the run ends the UI reloads the conversation from durable storage, and after a restart the run shows up as `interrupted`. There is no non-streaming JSON fallback. _Learn:_ [04 — Streaming is not persistence](../runtime/04-streaming-is-not-persistence.md).

## 3.5 Unified Error Envelope

```ts
type ErrorCode =
	| 'BAD_REQUEST'
	| 'NOT_FOUND'
	| 'SESSION_IN_PROGRESS'
	| 'RUN_NOT_RESUMABLE'
	| 'MODEL_UNAVAILABLE'
	| 'RECURSION_LIMIT'
	| 'AGENT_FAILURE'
	| 'UNKNOWN_ERROR';

interface ChatError {
	code: ErrorCode;
	message: string;
	conversation?: UUID;
}
```

Standard handler on both sides.

## 3.6 Persistence

Conversations, runs and LangGraph checkpoints live in one SQLite file (`data/db/sophos.db`). See **[3a) Durable Execution & Persistence](./3a-durable-execution-persistence.md)** for the model (conversation, thread, run, checkpoint), restart/resume behaviour and what stays in memory. Markdown is generated on demand by the export endpoint.

The Memory MCP server stores its knowledge graph separately, in `memory.jsonl` at `MEMORY_FILE_PATH` (`data/memory/memory.jsonl` locally; `/data/memory/memory.jsonl` in the container, bind-mounted from `data/memory/`).

## 3.7 MCP Integration

All MCP code lives in `src/lib/agent/mcp/` (two small files):

- **`config.ts`** reads `$CONFIG_DIR/mcp.json`, a map of server name → connection. It checks only the JSON shape; `MCPAdapter` validates the full schema with Zod when constructed. `${MEMORY_FILE_PATH}` inside a stdio server's `env` is replaced with an absolute path, because a stdio child does not inherit arbitrary environment variables.
- **`client.ts`** (`MCPClientService`) owns one `MCPAdapter` for the whole process: `initialize()` constructs it with `{ servers, prefixToolNameWithServerName: true }` and calls `listTools()` (which connects and caches discovery); `listTools()` returns the cached LangChain tools; `dispose()` calls `adapter.close()`.

Two configurations ship with the repository:

| File                        | Used by        | Transport                                                                  |
| --------------------------- | -------------- | -------------------------------------------------------------------------- |
| `config/mcp.json`           | `pnpm dev`     | stdio: `npx` / `uvx` with pinned package versions                          |
| `infra/app/config/mcp.json` | Docker Compose | Streamable HTTP: `http://mcp-memory:8080/mcp`, `http://mcp-fetch:8080/mcp` |

**Tool names are prefixed with the server name**, e.g. `memory__create_entities` and `fetch__fetch`. Two servers can therefore expose a tool with the same name without colliding; with prefixing disabled the adapter would throw on duplicates.

**Lifecycle.** Tools are resolved when a node runs, not when the graph is built, so reading a conversation never connects to MCP. The first run connects (`loadTools()` shares one connection attempt between concurrent runs); if discovery fails, the adapter is closed and the next run retries, re-reading `mcp.json`. A connection lost **after** a successful discovery (e.g. a stdio server that exits) is not re-established: every later run fails with `AGENT_FAILURE` until the process restarts. On shutdown, adapter-node emits `sveltekit:shutdown` once the HTTP server has closed (open SSE connections hold it open for up to `SHUTDOWN_TIMEOUT`); `src/hooks.server.ts` calls `closeAgent()`, which closes all MCP connections and stops stdio child processes, then closes SQLite. Sophos has no explicit run-drain or cancellation policy: what happens to an in-flight run depends on timing (it may finish first, fail against the closed MCP connections or database, or be cut off before its outcome is recorded); see [3a](./3a-durable-execution-persistence.md#restart-failure-and-resume). `vite dev` does not emit this event. _Learn:_ [01 — Own the process](../runtime/01-own-the-process.md).

**Not used yet.** The adapter's per-server protocol negotiation is left at the default (`mode: "auto"`). MCP elicitation (servers asking the user for input) is delivered as a LangGraph interrupt; the checkpointer it needs now exists, but resuming interrupts with a user decision is not implemented yet, and neither reference server uses elicitation.

---
