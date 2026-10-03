# Σοφός Agent — Source Tree

```
sophos-agent/
│
├── src/                              # SvelteKit + Agent (v0 monolith)
│   ├── hooks.server.ts               # closes MCP connections on server shutdown
│   ├── lib/
│   │   ├── agent/                    # LangGraph.js graph and nodes
│   │   │   ├── mcp/
│   │   │   │   ├── config.ts         # reads mcp.json (server name -> connection)
│   │   │   │   └── client.ts         # MCPClientService: one MCPAdapter, listTools, dispose
│   │   │   ├── persistence/          # Markdown + trace.jsonl writers/readers
│   │   │   ├── config.ts             # model config (Ollama) + system prompt
│   │   │   └── index.ts              # StateGraph, runAgent(), closeAgent()
│   │   ├── components/               # Svelte components
│   │   ├── chat.ts                   # Message, Events, Session, TraceNote
│   │   └── utils.ts                  # Utils (e.g., uuid)
│   └── routes/
│       ├── +page.svelte              # chat UI
│       └── api/
│           ├── chat/                 # POST /api/chat, GET /api/chat (SSE)
│           ├── conversations/        # GET conversations
│           │   └── [conversationId]/ # GET conversation by ID
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
│   ├── memory/                       # Memory MCP knowledge graph (memory.jsonl)
│   └── chat/                         # Markdown turns + trace.jsonl
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

- `src/lib/agent/` — Graph orchestration with LangGraph.js; nodes emit TraceNotes.
- `src/lib/agent/mcp/` — Configuration loading and the single `MCPAdapter` (`@langchain/mcp-adapters` 2.x) that connects to every configured MCP server and exposes its tools.
- `src/lib/agent/persistence/` — Markdown + JSONL writers and readers.
