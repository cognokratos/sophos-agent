# 3) Runtime & Integration Details

## 3.1 Processes & Boundaries

- **web (SvelteKit + Agent, v0 monolith)** — UI, `/api/*` endpoints, LangGraph graph, `MCPAdapter`.
- **Ollama** — model server on the host (default model `qwen3`); reached at `OLLAMA_HOST`. Not managed by Compose.
- **mcp-memory / mcp-fetch** — MCP tool servers. Under `pnpm dev` they are stdio child processes of the web process; under Docker Compose they are separate containers behind an HTTP proxy.
- **persistence** — host-mounted `data/chat/` (conversations) and `data/memory/` (knowledge graph).

## 3.2 Public HTTP API (thin surface)

- **POST `/api/chat`** — submit a turn.
- **GET `/api/chat?conversation=...`** — subscribe to a chat session. **SSE** stream events: `token`, `trace`, `end`, `chat-error`, `ping`.
- **GET `/api/conversations`** — list all conversations + metadata.
- **GET `/api/conversations/:conversationId`** — fetch Markdown transcript + trace refs.
- **GET `/api/healthz`** — liveness (`{"status":"ok"}`).
- **GET `/api/readyz`** — readiness: Ollama reachable and `OLLAMA_MODEL` pulled; `503` otherwise. MCP servers are not checked.
  Keep endpoints minimal; move complexity into the agent engine for teachability.

## 3.3 Message Contracts (shared types)

```ts
export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
	conversation: UUID;
	id: UUID;
	role: ChatRole;
	content: string;
}

export interface TraceNote {
	node: string;
	name: string;
	turn: number;
	event: 'enter' | 'leave' | 'call' | 'result';
	data?: Record<string, unknown>;
}

export type AgentEvent =
	| { type: 'trace'; data: TraceNote }
	| { type: 'token'; data: string }
	| { type: 'end' };
```

## 3.4 Streaming Protocol

**SSE** for simplicity. `POST /api/chat` starts the run and returns the conversation ID; the UI then opens an `EventSource` on `GET /api/chat`. Every event carries an incrementing `id`, and the server buffers a session's events in memory, so a reconnecting browser (`Last-Event-ID`) receives only what it missed. There is no non-streaming JSON fallback; sessions live in process memory and are lost on restart.

## 3.5 Unified Error Envelope

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

Standard handler on both sides.

## 3.6 Markdown Persistence Layout

```
/data/chat/{conversationId}/
  0001.user.md
  0002.assistant.md
  trace.jsonl     # stream of TraceNote events
```

Inspectable artifacts preferred for labs; a database remains a roadmap item.

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

**Lifecycle.** The graph is compiled lazily on the first chat request (`getGraph()` caches the promise, so concurrent first requests share one build and one set of connections). If discovery fails, the adapter is closed and the next request retries. On shutdown, adapter-node emits `sveltekit:shutdown`; `src/hooks.server.ts` calls `closeAgent()`, which closes all MCP connections and stops stdio child processes. `vite dev` does not emit this event.

**Not used yet.** The adapter's per-server protocol negotiation is left at the default (`mode: "auto"`). MCP elicitation (servers asking the user for input) is delivered as a LangGraph interrupt and needs a checkpointer, which this graph does not have yet; neither reference server uses it.

---
