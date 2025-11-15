# 3) Runtime & Integration Details

## 3.1 Processes & Boundaries

- **web (SvelteKit + Agent, v0 monolith)** — UI, `/api/*` endpoints, invokes graph.
- **ollama** — model server; default `mistral`.
- **mcp-memory / mcp-fetch** — tool servers.
- **persistence** — host-mounted `data/logs/`.
  All orchestrated via Compose profiles.

## 3.2 Public HTTP API (thin surface)

- **POST `/api/chat`** — submit a turn.
- **GET `/api/chat?sessionId=...`** — fetch a chat session. **SSE** stream events: `token`, `trace`, `tool`, `done`.
- **GET `/api/models`** — list available Ollama models.
- **GET `/api/logs/:sessionId`** — fetch Markdown transcript + trace refs.
  Keep endpoints minimal; move complexity into the agent engine for teachability.

## 3.3 Message Contracts (shared types)

```ts
export type Role = 'user' | 'assistant' | 'system' | 'tool';
export interface Message {
	id: string;
	role: Role;
	content: string;
	toolCalls?: ToolCall[];
}
export interface ToolCall {
	id: string;
	name: string;
	args: Record<string, unknown>;
}

export interface ChatRequest {
	sessionId: string;
	messages: Message[];
	tools?: { name: string; required?: boolean; argsSchema?: Record<string, unknown> }[];
	params?: { temperature?: number; maxTokens?: number };
}

export interface TraceNote {
	node: string;
	event: string;
	data?: Record<string, unknown>;
}
```

## 3.4 Streaming Protocol

**SSE** for simplicity; UI auto-downgrades to non-stream JSON if SSE fails (proxy/OS quirks).

## 3.5 Unified Error Envelope

```ts
interface ApiError {
	error: {
		code: string;
		message: string;
		details?: Record<string, any>;
		timestamp: string;
		requestId: string;
	};
}
```

Standard handler on both sides; codes include `BAD_REQUEST`, `MODEL_UNAVAILABLE`, `TOOL_FAILURE`, `ENGINE_FAILURE`, `INTERNAL_ERROR`.

## 3.6 Markdown Persistence Layout

```
/data/logs/{sessionId}/
  0001.user.md
  0002.assistant.md
  trace.jsonl     # stream of TraceNote events
```

Inspectable artifacts preferred for labs; DB remains optional (Phase 2).

---
