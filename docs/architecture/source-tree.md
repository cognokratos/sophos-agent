# Софос Agent — Source Tree (monorepo)

```
sofos-agent/
│
├── src/                              # SvelteKit + Agent (v0 monolith)
│   ├── lib/
│   │   ├── agent/                    # LangGraph.js graphs, nodes, policies
│   │   │   ├── mcp/                  # Agent-specific MCP tool integration (e.g., how the agent uses the tools)
│   │   │   ├── persistence/          # Markdown + trace.jsonl writers/readers
│   │   │   ├── error/                # ApiError helpers, guards, mappers
│   │   │   └── metrics/              # in-process counters/histograms
│   │   ├── chat.ts                   # Message, ToolCall, ChatRequest, TraceNote
│   │   ├── error.ts                  # ApiError envelope
│   │   └── index.ts
│   └── routes/
│   │   └── api/
│   │       ├── chat/+server.ts   # POST /api/chat (SSE + fallback)
│   │       ├── conversations/[conversationId]/+server.ts # GET conversations
│   │       ├── healthz/+server.ts # liveness
│   │       └── readyz/+server.ts # readiness (ollama + model)
│   ├── app.css                       # tailwind css
│   ├── app.html                      # base template
│   ├── app.d.ts                      # SvelteKit ambient types
│   └── hooks.server.ts               # requestId, error normalization
│
├── infra/
│   ├── compose.yml                    # web, ollama, mcp-memory, mcp-fetch
│   ├── Dockerfile                     # Node 24, pnpm, build, run
│   └── profiles/
│       ├── compose.warmup.yml         # pre-pull images + model
│       ├── compose.publish.yml        # bind to 0.0.0.0 for demos
│       └── compose.split.yml          # optional agent split-service
│
├── data/
│   ├── memory/                        # Memory MCP data
│   ├── fetch/                         # Fetch MCP data
│   └── chat/                          # Markdown turns + trace.jsonl (bind-mounted)
│
├── scripts/
│   ├── setup.sh                       # warmup images & model, sanity checks
│   ├── start.sh                       # compose up with profiles
│   ├── clean.sh                       # purge logs/cache
│   └── test.sh                        # smoke tests (health, models)
│
├── docs/
│   ├── stories                        # User Stories
│   ├── prd                            # Product Requirements & Epics
│   └── architecture
│       ├── source-tree.md             # (this file)
│       ├── tech-stack.md
│       └── coding-standard.md
│
├── .env.example                       # mirrored by runtime env
├── .github/workflows/ci.yml           # build, lint, test, tag
├── Makefile                           # make setup/start/clean/test
├── package.json                       # workspace, scripts, pins
└── pnpm-workspace.yaml
```

## Notable directories

- `src/lib/agent/` — Graph orchestration with LangGraph.js; nodes emit TraceNotes.
- `src/lib/mcp/` — `MultiServerMCPClient` and core MCP adapter logic; responsible for connecting to and retrieving tools from MCP servers.
- `src/lib/persistence/` — Markdown + JSONL writers; abstracted behind a small interface to allow SQLite later.
