# 3) Runtime & Integration Details

## 3.1 Processes & Boundaries

- **web (SvelteKit + Agent, v0 monolith)** — UI, `/api/*` endpoints, invokes graph.
- **ollama** — model server; default `Qwen3`.
- **mcp-memory / mcp-fetch** — tool servers.
- **persistence** — host-mounted `data/chat/`.
  All orchestrated via Compose profiles.

## 3.2 Public HTTP API (thin surface)

- **POST `/api/chat`** — submit a turn.
- **GET `/api/chat?conversation=...`** — fetch a chat session. **SSE** stream events: `token`, `trace`, `end`, `error`.
- **GET `/api/conversations`** — list all conversations + metadata.
- **GET `/api/conversations/:conversationId`** — fetch Markdown transcript + trace refs.
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

**SSE** for simplicity; UI auto-downgrades to non-stream JSON if SSE fails (proxy/OS quirks).

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

Inspectable artifacts preferred for labs; DB remains optional (Phase 2).

---
