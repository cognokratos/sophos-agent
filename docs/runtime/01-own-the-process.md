# 01 — Own the process

> Agents own resources just like any other long-running service.

**Stage R1 · What actually runs?** · [Learning path](../RUNTIME-LEARNING-PATH.md#stage-r1-what-actually-runs) · Next: [02 — Model execution state](02-model-execution-state.md)

> **Prerequisite:** you know what an MCP server is, what stdio and Streamable HTTP transports are, and why tools sit behind a protocol. If not: [simple-agent-template — Tools and MCP](https://github.com/cognokratos/simple-agent-template/blob/main/docs/concepts/02-tools-and-mcp.md).

## Objective

For every resource Sophos uses while serving a run, be able to say who creates it, who owns it, whether it is shared, when it is initialized, what happens when initialization fails, who closes it, and what happens on shutdown.

## Why it matters

The agent loop is a few dozen lines. Around it sit a model server, tool servers (two of them are child processes under `pnpm dev`), a database connection, open HTTP streams and background work. Each of those can fail to start, die later, or be left behind on shutdown. An agent framework doesn't decide those semantics for you; your process does, explicitly or by accident.

## Mental model

```text
                          one Node process (SvelteKit + agent)
┌──────────────────────────────────────────────────────────────────────────┐
│ HTTP server (adapter-node / vite)                                         │
│   ├─ POST /api/chat ──► startRun() ──► execute()   ◄── background promise │
│   └─ GET  /api/chat ──► SSE stream (subscriber + 15 s ping)               │
│                                                                           │
│ module-level singletons, created lazily, shared by every request          │
│   graph          compiled StateGraph            src/lib/agent/index.ts    │
│   mcpReady       one discovery attempt          src/lib/agent/index.ts    │
│   MCPAdapter     all MCP connections            src/lib/agent/mcp/client.ts│
│   database       one better-sqlite3 handle      persistence/database.ts   │
│   activeRuns     Map<conversationId, ActiveRun> src/lib/agent/runs.ts     │
└───────┬───────────────────────┬───────────────────────────┬──────────────┘
        │ HTTP per call         │ stdio pipes or HTTP       │ file
        ▼                       ▼                           ▼
     Ollama               MCP servers                data/db/sophos.db
  (yours, outside)   (children or containers)
```

Three ideas carry the lesson:

1. **Lazy, shared initialization.** Nothing expensive happens at start-up. The database opens on first access; the graph compiles on first use; MCP connects when a graph node first needs tools.
2. **Explicit cleanup on one path.** `src/hooks.server.ts` closes MCP and SQLite on `sveltekit:shutdown`. That event exists only under adapter-node.
3. **One resource has no owner.** The run itself. `startRun()` fires `execute()` and returns; the HTTP request that created the run is already finished.

## Where it lives in Sophos

| Resource                          | Created by / when                                                                                      | Shared?                                                 | Init failure                                                                                                                      | Closed by                                   | On shutdown                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Node process / HTTP server        | `node build` (container `CMD`), or `vite dev`                                                          | —                                                       | port in use: process exits                                                                                                        | the signal                                  | adapter-node stops accepting, waits for open connections up to `SHUTDOWN_TIMEOUT` (30 s), then emits the hook |
| SQLite handle (`database`)        | `getDatabase()` on first access; runs migrations and `recoverInterruptedRuns()`                        | one per process; app tables and `SqliteSaver` share it  | the request that triggered it fails with 500                                                                                      | `closeDatabase()` in `src/hooks.server.ts`  | closed; anything that touches it afterwards **reopens it lazily**                                             |
| Compiled graph (`graph`)          | `getGraph()` on first use                                                                              | one per process                                         | —                                                                                                                                 | `closeAgent()` sets it to `null`            | rebuilt on the next `getGraph()`                                                                              |
| `ChatOllama` client               | inside `getGraph()`; reads `OLLAMA_*` **once**                                                         | shared by every run                                     | none at construction; every model call can fail (`fetch failed`, `model … not found`)                                             | nothing to close: one HTTP request per call | — (changing `OLLAMA_HOST` or `OLLAMA_MODEL` needs a restart)                                                  |
| Ollama server                     | you, outside Sophos (not a Compose service)                                                            | shared by everything on the host                        | `/api/readyz` reports 503; runs fail                                                                                              | you                                         | unaffected                                                                                                    |
| `MCPClientService` + `MCPAdapter` | `loadTools()` → `initialize()`, the first time a graph node resolves tools; reads `mcp.json` each time | one per process; concurrent first runs share `mcpReady` | adapter closed (children stopped), `mcpReady` reset, run fails with `AGENT_FAILURE`; the next run retries and re-reads `mcp.json` | `dispose()` via `closeAgent()`              | connections closed, stdio children stopped                                                                    |
| stdio MCP children (`npx`, `uvx`) | the adapter, during discovery (`config/mcp.json`)                                                      | one per server, shared by all runs                      | as above                                                                                                                          | `adapter.close()`                           | stopped by the hook; they also exit when their parent dies (stdin closes)                                     |
| HTTP MCP sessions (Compose)       | the adapter, during discovery (`infra/app/config/mcp.json`)                                            | one per server                                          | as above                                                                                                                          | `adapter.close()` releases the sessions     | the **containers** belong to Docker Compose (`make stop`)                                                     |
| `activeRuns` entry                | `startRun()` on `POST /api/chat`                                                                       | one per conversation (the 409 guard)                    | —                                                                                                                                 | `execute()` deletes it when the run ends    | **nothing**: lost with the process                                                                            |
| SSE subscriber + ping interval    | `GET /api/chat`                                                                                        | one per browser connection                              | —                                                                                                                                 | `end`, `chat-error` or client abort         | holds the HTTP server open until `SHUTDOWN_TIMEOUT`                                                           |
| The run (`execute()` promise)     | `startRun()`, as `void execute(run, input)`                                                            | —                                                       | becomes a `failed` run                                                                                                            | itself, when the graph stops                | **not awaited, not cancelled, not marked**                                                                    |

Read the last row twice. It is the most important line in this lesson, and [Lab part 4](#part-4-shut-down-while-a-run-is-in-flight) shows why.

`pnpm dev` versus containers:

| Lifecycle event                | `pnpm dev` (`vite dev`)                                   | `node build` / Docker Compose                                                                   |
| ------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| MCP transport                  | stdio children of the web process (`config/mcp.json`)     | Compose: Streamable HTTP to `mcp-memory` / `mcp-fetch` containers (`infra/app/config/mcp.json`) |
| `sveltekit:shutdown` hook      | never emitted                                             | emitted after the HTTP server has closed                                                        |
| Who restarts a dead MCP server | nobody (it is a child of a process you restart)           | nobody: `infra/compose.yml` sets no `restart:` policy                                           |
| Stop                           | Ctrl+C kills the process; children exit with their parent | `docker compose stop` sends SIGTERM, then SIGKILL after the grace period (10 s by default)      |

## Experiment

Use the [lab environment](../RUNTIME-LEARNING-PATH.md#lab-environment). Start from a clean lab: `rm -rf data/lab`.

### Part 1: Observe lazy initialization

Start the lab server. In terminal 2:

```sh
ls data/lab 2>/dev/null || echo "no lab state yet"
curl -s $B/api/healthz
curl -s $B/api/readyz
pgrep -fl mcp-server || echo "no MCP processes"
```

**Predict:** after `healthz` and `readyz`, does the database file exist? Are any MCP servers running?

Now touch the conversation list, and check again:

```sh
curl -s $B/api/conversations
ls data/lab/db
pgrep -fl mcp-server || echo "no MCP processes"
```

**Observed:** the database appears on the first request that needs it; MCP processes still don't exist. `readyz` checks only Ollama (`src/routes/api/readyz/+server.ts`). Reading conversations never connects to MCP, because tools are resolved when a node runs, not when the graph is built (`AgentGraphOptions.tools` in `src/lib/agent/graph.ts`).

### Part 2: Make one MCP server unavailable on first use

Stop the lab server (Ctrl+C). Create a temporary configuration directory in which the Fetch server points at a port where nothing listens:

```sh
mkdir -p data/lab/config
cp config/system.md data/lab/config/
cat > data/lab/config/mcp.json <<'EOF'
{
    "memory": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-memory@2026.8.31"],
        "env": { "MEMORY_FILE_PATH": "${MEMORY_FILE_PATH}" }
    },
    "fetch": { "url": "http://127.0.0.1:59999/mcp" }
}
EOF
```

Start the lab server with `CONFIG_DIR=data/lab/config` in front of the usual command. Then start a run:

```sh
curl -s $B/api/readyz
C=$(curl -s -X POST $B/api/chat -H 'content-type: application/json' \
  -d '{"message":"What is 2+2? Answer briefly."}' | jq -r .conversation)
curl -N "$B/api/chat?conversation=$C"
```

**Predict:** does the server start? Does `readyz` notice? Does a prompt that needs no tools still fail? What happens to the Memory server, which _did_ start?

**Inspect:**

```sh
pgrep -fl mcp-server || echo "no MCP processes"
curl -s $B/api/conversations/$C | jq '{status: .conversation.status, error: .conversation.error, resumable}'
sqlite3 $DB "SELECT status, error_code FROM runs WHERE conversation_id = '$C'"
```

**Observed** (one run): `readyz` returned `ok`. The stream delivered one `chat-error` with `AGENT_FAILURE` and `Failed to connect to streamable HTTP server "fetch, …"`. No MCP process was left running: the Memory child had started, and `MCPClientService.initialize()` closed the adapter, which stopped it. The run is `failed`, and the conversation is `resumable: true`.

The prompt needed no tools and still failed. The `agent` node resolves the full tool list before every model call (`agentNode` in `src/lib/agent/graph.ts`), so an unreachable server fails every run, not only the runs that would call it.

### Part 3: Restore the dependency and recover, without a restart

```sh
cp config/mcp.json data/lab/config/mcp.json
curl -s -X POST $B/api/chat -H 'content-type: application/json' \
  -d "{\"resume\": true, \"conversation\": \"$C\"}"
curl -N "$B/api/chat?conversation=$C"
pgrep -fl mcp-server
```

**Observed:** the resume completed and both MCP servers are now running as children. Nothing was restarted. `loadTools()` (`src/lib/agent/index.ts`) reset `mcpReady` after the failure, and `initialize()` reads `mcp.json` again on each attempt.

### Part 4: Shut down while a run is in flight

Start a long run, and **don't** attach a stream:

```sh
C=$(curl -s -X POST $B/api/chat -H 'content-type: application/json' \
  -d '{"message":"Write a detailed 600-word essay about the history of B-trees."}' | jq -r .conversation)
```

Within a few seconds, press Ctrl+C in terminal 1 (SIGINT; adapter-node treats it like SIGTERM). Watch terminal 1.

**Predict:** does the server wait for the run? What status does the run end with?

**Observed** (one run): the server closed immediately (no connections were open), the hook closed MCP and SQLite, and the process then **kept running** until the model call returned. The next checkpoint write failed with `The database connection is not open`. The run was recorded as `failed` with that message: `execute()` reopened the database lazily to record the outcome.

Start the lab server again and look:

```sh
sqlite3 $DB "SELECT status, error_code, error_message FROM runs WHERE conversation_id = '$C'"
curl -s $B/api/conversations/$C | jq .resumable
```

In this experiment the thread was still resumable: the last checkpoint written before shutdown was intact and `next` was `["agent"]`. Durability held; the _recorded outcome_ is misleading.

Now repeat with a stream attached (`curl -N "$B/api/chat?conversation=$C"` in a third terminal) before Ctrl+C. **Observed:** the open SSE connection kept `server.close()` waiting; the run finished, the stream received `end`, and only then did the hook run. That is not a drain policy. It is an accident of an open connection, and it ends at `SHUTDOWN_TIMEOUT`.

### Part 5 (optional): A dependency that dies after discovery

With the lab server running and a completed run behind you (both MCP children up), kill the Fetch child:

```sh
pkill -f mcp-server-fetch
```

Start two new runs, any prompt. **Observed:** both fail with `Failed to load tools from server "fetch": Error: Not connected`, and so does every run after them, until the process restarts. Part 3's retry covers a failed _first_ discovery only. Once `initialize()` has succeeded, `MCPClientService` stays initialized and never reconnects.

## Why the system behaves this way

- **Lazy initialization keeps start-up cheap and reads independent of tools.** You can browse conversations with Ollama and every MCP server down. The cost is that the first run pays for discovery, and that the health endpoints can't tell you whether tools work.
- **One shared adapter** means one set of child processes, one discovery, one place to close. `mcpReady` makes concurrent first runs share one connection attempt instead of spawning duplicate children.
- **Failure cleanup is local to `initialize()`**: if discovery throws, the half-built adapter is closed right there, so a failed attempt leaks nothing.
- **Shutdown is ordered for the HTTP server, not for runs.** adapter-node closes the listener, waits for connections, then emits `sveltekit:shutdown`. Runs are not connections. Nothing in Sophos tracks them for shutdown.

## What this does NOT guarantee

- **No drain, cancel or mark on shutdown.** Sophos has no run-drain or cancellation policy. Depending on timing and on whether a browser is connected, an in-flight run can finish before the hook runs (`completed`), fail against a closed dependency (`failed`, as in Part 4), or die with the process before its outcome is recorded (left `running`, later `interrupted`). Part 4 observed the first two (with and without a stream attached); none of them is guaranteed.
- **No reconnection after discovery.** A tool server that dies after the first successful discovery makes every subsequent run fail until restart. (Part 5 used stdio. What a Streamable HTTP client does after a `mcp-fetch` container restart is a good thing to test yourself under `make start`.)
- **No dependency health in `readyz`.** It checks Ollama and the model only.
- **No supervision.** Neither Sophos nor `infra/compose.yml` restarts a dead MCP server.

## Takeaway

> If nobody clearly owns a resource, failure and shutdown semantics will eventually own you.

Sophos owns its connections well: lazy, shared, cleaned up on failure and on shutdown. It does not own its runs at shutdown. The [cancellation](CHALLENGES.md#challenge-1--cancellation-semantics) and [worker process](CHALLENGES.md#challenge-4--separate-worker-process) challenges start from that gap.

## Go deeper

- Reference: [3.1 Processes & Boundaries](../architecture/3-runtime-integration-details.md#31-processes--boundaries), [3.7 MCP Integration](../architecture/3-runtime-integration-details.md#37-mcp-integration), [4) Deployment Topology](../architecture/4-deployment-topology-docker-compose.md).
- Code: `src/lib/agent/index.ts`, `src/lib/agent/mcp/client.ts`, `src/hooks.server.ts`, `src/lib/agent/mcp/index.spec.ts` (cleanup on failed discovery, re-initialization after `dispose`).
- What happens to the graph state in Part 4 is the subject of [06 — Failure, restart and resume](06-failure-restart-and-resume.md).
