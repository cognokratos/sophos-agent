# Софос Agent — Source Tree (monorepo)

```
sofos-agent/
│
├── src/                              # SvelteKit + Agent (v0 monolith)
│   ├── lib/
│   │   ├── agent/                    # LangGraph.js graphs, nodes, policies
│   │   │   ├── mcp/                  # Agent-specific MCP tool integration (e.g., how the agent uses the tools)
│   │   │   ├── persistence/          # Markdown + trace.jsonl writers/readers
│   │   │   ├── config.ts             # Agent-specific config
│   │   │   └── index.ts              # Agent-specific API
│   │   ├── chat.ts                   # Message, Events, Session, TraceNote
│   │   └── utils.ts                  # Utils (e.g., uuid)
│   └── routes/
│   │   └── api/
│   │       ├── chat/                 # POST /api/chat (SSE + fallback)
│   │       ├── conversations/        # GET conversations
│   │       │   └── [conversationId]/ # GET conversation by ID
│   │       ├── healthz/              # liveness
│   │       └── readyz/               # readiness (ollama + model)
│   ├── app.css                       # tailwind css
│   ├── app.html                      # base template
│   └── app.d.ts                      # SvelteKit ambient types
│
├── infra/
│   ├── .env.example                   # environment variables for docker-compose
│   ├── compose.yml                    # web, ollama, mcp-memory, mcp-fetch
│   ├── app/
│   │   ├── config                     # config files for docker-compose
│   │   └── Dockerfile                 # Dockerfile for web app
│   └── mcp/
│       ├── fetch/Dockerfile           # Dockerfile for fetch MCP server
│       └── memory/Dockerfile          # Dockerfile for memory MCP server
│
├── data/
│   ├── memory/                        # Memory MCP data
│   └── chat/                          # Markdown turns + trace.jsonl (bind-mounted)
│
├── scripts/
│   ├── setup.sh                       # warmup images & model, sanity checks
│   └── test.sh                        # smoke tests (health, models)
│
├── docs/
│   ├── stories                        # User Stories
│   ├── prd                            # Product Requirements & Epics
│   └── architecture                   # Architecture & Design
│       ├── source-tree.md             # (this file)
│       ├── tech-stack.md              # Tech Stack
│       └── coding-standards.md        # Coding Standards
│
├── .env.example                       # example .env file
├── .github/workflows/ci.yml           # build, lint, test, tag
├── Makefile                           # make dev/start/stop/clean/test
├── package.json                       # workspace, scripts, pins
└── pnpm-workspace.yaml
```

## Notable directories

- `src/lib/agent/` — Graph orchestration with LangGraph.js; nodes emit TraceNotes.
- `src/lib/agent/mcp/` — `MultiServerMCPClient` and core MCP adapter logic; responsible for connecting to and retrieving tools from MCP servers.
- `src/lib/agent/persistence/` — Markdown + JSONL writers; abstracted behind a small interface to allow SQLite later.
