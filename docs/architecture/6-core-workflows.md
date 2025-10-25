# 6) Core Workflows

## 6.1 Happy Path — Chat → LLM → Tools → Response

```mermaid
sequenceDiagram
autonumber
actor U as User
participant FE as SvelteKit UI
participant API as /api/chat (SSE)
participant LG as LangGraph.js Engine
participant LLM as Ollama (mistral)
participant MCP as MCP: Memory & Fetch
participant LOG as Markdown/JSONL

U->>FE: Type message
FE->>API: POST /api/chat {sessionId, messages}
API->>LG: invoke(graph,input)
LG->>LLM: generate(prompt, params)
LLM-->>LG: tokens (stream)
LG->>MCP: tool.call(memory.write|fetch.get)
MCP-->>LG: tool result
LG->>LOG: append message + trace
LG-->>API: tokens + trace events
API-->>FE: SSE: token/trace/done
FE-->>U: Render response + reasoning trace
```

Transparent reasoning and tool use are explicit PRD goals.

## 6.2 Failure Paths (sketches)

* **Tool error (MCP):** bounded retry → degrade → `ApiError{code:"TOOL_FAILURE"}` surfaced to UI.
* **Model unavailable:** warmup suggests pulling default model; return `MODEL_UNAVAILABLE`.

---
