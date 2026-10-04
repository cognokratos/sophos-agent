# Σοφός Agent — Source Tree

```
sophos-agent/
│
├── src/                              # SvelteKit + Agent (v0 monolith)
│   ├── hooks.server.ts               # closes MCP connections and SQLite on server shutdown
│   ├── lib/
│   │   ├── agent/
│   │   │   ├── graph.ts              # the StateGraph: agent ⇄ tools, threadConfig()
│   │   │   ├── index.ts              # runtime: getGraph(), runAgent(), getThreadState()
│   │   │   ├── runs.ts               # start/finish runs, active-run SSE registry
│   │   │   ├── messages.ts           # LangChain messages -> MessageDto
│   │   │   ├── export.ts             # Markdown / checkpoint JSONL exports
│   │   │   ├── config.ts             # Ollama config, system prompt, recursion limit
│   │   │   ├── mcp/
│   │   │   │   ├── config.ts         # reads mcp.json (server name -> connection)
│   │   │   │   └── client.ts         # MCPClientService: one MCPAdapter, listTools, dispose
│   │   │   └── persistence/
│   │   │       ├── database.ts       # SQLite connection, migrations, checkpointer
│   │   │       └── conversations.ts  # conversations + runs tables
│   │   ├── components/               # Svelte components
│   │   ├── chat.ts                   # API DTOs: MessageDto, ConversationSummary, RunStatus, TraceNote
│   │   └── utils.ts                  # Utils (e.g., uuid)
│   └── routes/
│       ├── +page.svelte              # chat UI
│       └── api/
│           ├── chat/                 # POST /api/chat, GET /api/chat (SSE)
│           ├── conversations/        # GET conversations
│           │   └── [conversationId]/ # GET conversation by ID
│           │       └── export/       # GET Markdown / checkpoint JSONL export
│           ├── healthz/              # liveness
│           └── readyz/               # readiness (ollama + model)
│
├── config/                           # pnpm dev: mcp.json (stdio servers) + system.md
│
├── infra/
│   ├── .env.example                  # Ollama/UI settings for docker compose (copy to infra/.env)
│   ├── compose.yml                   # web, mcp-memory, mcp-fetch, mcp-inspector (profile)
│   ├── app/
│   │   ├── config/                   # container mcp.json (HTTP servers) + system.md
│   │   └── Dockerfile                # web app (pnpm via Corepack, frozen lockfile)
│   └── mcp/
│       ├── fetch/                    # Dockerfile + requirements.in/.txt (locked)
│       └── memory/                   # Dockerfile + package.json/package-lock.json (locked)
│
├── data/                             # git-ignored local state
│   ├── db/                           # sophos.db: conversations, runs, LangGraph checkpoints
│   ├── memory/                       # Memory MCP knowledge graph (memory.jsonl)
│   └── chat/                         # legacy Markdown conversations (no longer used)
│
├── e2e/                              # Playwright tests
├── examples/                         # Memory / Fetch walkthroughs
├── scripts/
│   └── test.sh                       # Compose smoke test
│
├── docs/
│   ├── stories                       # User Stories
│   ├── prd                           # Product Requirements & Epics
│   └── architecture                  # Architecture & Design (this folder)
│
├── .env.example                      # pnpm dev settings (copy to .env)
├── Makefile                          # make dev/start/inspector/stop/clean/test
├── package.json                      # scripts, deps, packageManager (pnpm)
└── pnpm-workspace.yaml               # pnpm build-script allow-list
```

## Notable directories

- `src/lib/agent/` — Graph orchestration with LangGraph.js; durable runs (see [3a](./3a-durable-execution-persistence.md)).
- `src/lib/agent/mcp/` — Configuration loading and the single `MCPAdapter` (`@langchain/mcp-adapters` 2.x) that connects to every configured MCP server and exposes its tools.
- `src/lib/agent/persistence/` — the SQLite database: application tables and the LangGraph checkpointer.
