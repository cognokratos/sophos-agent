# Софос Agent — Source Tree (monorepo)

```
sofos-agent/
├── apps/
│   └── web/                         # SvelteKit + Agent (v0 monolith)
│       ├── src/
│       │   ├── lib/
│       │   │   ├── agent/           # LangGraph.js graphs, nodes, policies
│       │   │   ├── mcp/             # MCP adapters (Memory, Fetch)
│       │   │   ├── persistence/     # Markdown + trace.jsonl writers/readers
│       │   │   ├── error/           # ApiError helpers, guards, mappers
│       │   │   └── metrics/         # in-process counters/histograms
│       │   └── routes/
│       │       └── api/
│       │           ├── chat/+server.ts   # POST /api/chat (SSE + fallback)
│       │           ├── models/+server.ts # GET /api/models (Ollama proxy)
│       │           ├── logs/[sessionId]/+server.ts # GET logs
│       │           ├── healthz/+server.ts # liveness
│       │           └── readyz/+server.ts  # readiness (ollama + model)
│       ├── app.d.ts                   # SvelteKit ambient types
│       ├── hooks.server.ts            # requestId, error normalization
│       └── app.html                   # base template
│
├── packages/
│   └── shared/                        # Reusable types & contracts
│       ├── chat.ts                    # Message, ToolCall, ChatRequest, TraceNote
│       ├── error.ts                   # ApiError envelope
│       └── index.ts
│
├── infra/
│   ├── docker-compose.yml             # web, ollama, mcp-memory, mcp-fetch
│   ├── Dockerfile.web                 # Node 20, pnpm, build, run
│   ├── Dockerfile.mcp                 # base MCP image
│   └── profiles/
│       ├── compose.warmup.yml         # pre-pull images + model
│       ├── compose.publish.yml        # bind to 0.0.0.0 for demos
│       └── compose.split.yml          # optional agent split-service
│
├── data/
│   └── logs/                          # Markdown turns + trace.jsonl (bind-mounted)
│
├── scripts/
│   ├── setup.sh                       # warmup images & model, sanity checks
│   ├── start.sh                       # compose up with profiles
│   ├── clean.sh                       # purge logs/cache
│   └── test.sh                        # smoke tests (health, models)
│
├── docs/
│   ├── architecture.md                # canonical architecture
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

* `apps/web/src/lib/agent/` — Graph orchestration with LangGraph.js; nodes emit TraceNotes.
* `apps/web/src/lib/mcp/` — MCP bridge via adapters; register tools here.
* `apps/web/src/lib/persistence/` — Markdown + JSONL writers; abstracted behind a small interface to allow SQLite later.
* `packages/shared/` — The source of truth for contracts (`Message`, `ChatRequest`, `ApiError`, `TraceNote`).

## Compose profiles

* `warmup` — pre-pull `ollama` and the default model (e.g., `mistral`).
* `publish` — opt-in; binds services to `0.0.0.0` for demos.
* `split` — runs a separate `agent` container; same HTTP contracts.

## Environment variables (mirrored in `.env.example`)

```
OLLAMA_HOST=http://ollama:11434
OLLAMA_MODEL=mistral
LOG_DIR=/data/logs
AGENT_PROFILE=monolith        # or: split
PORT=5173
PUBLIC_MODE=false             # true => publish profile
```
