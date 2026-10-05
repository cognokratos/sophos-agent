# Runtime learning path: from agent to runtime

> [`simple-agent-template`](https://github.com/cognokratos/simple-agent-template) teaches how to build a production agent.
>
> Sophos teaches how an agent becomes durable software: how executions survive failures, how state is modeled, where persistence belongs, how streaming differs from truth, how memory is separated, and how local infrastructure is owned.

The question this path answers:

> **Once you have an agent, how do you make it a durable, stateful, resumable, locally owned software system?**

It is written for experienced software engineers. It assumes you know HTTP, databases and transactions, Docker, service lifecycles, concurrency and the basics of distributed systems, and that you already know what an agent loop, a tool call and an MCP server are. If you don't, start upstream:

> **Prerequisite:** [simple-agent-template — Learning path](https://github.com/cognokratos/simple-agent-template/blob/main/docs/LEARNING-PATH.md), at least stages 0–3 (the LLM as a probabilistic component, the agent loop, tool calling, MCP and capability boundaries).

Sophos does not re-teach those. Where a lesson depends on one, it links upstream and moves on to the runtime question.

## Where this fits

```text
simple-agent-template      Production Agent Engineering
    "How do I build a production AI agent?"
        ↓
sophos-agent               Durable Agent Runtime Engineering
    "How does that agent actually live as durable software?"
        ↓
etf-research-agent         Governed Decision Engineering
    "How do I govern its decisions in a consequential domain?"
```

You don't need to finish one before starting the next; the arrows show which questions build on which. [etf-research-agent](https://github.com/cognokratos/etf-research-agent) is an example of putting agent infrastructure into a domain where decisions have consequences; Sophos does not cover that.

## What Sophos is, precisely

One Node process (SvelteKit) contains the UI, the HTTP API and an explicit single-agent LangGraph `StateGraph` with two nodes, `agent` and `tools`. The model runs in Ollama. Tools come from two MCP servers (Memory and Fetch). Conversations, runs and LangGraph checkpoints live in one SQLite file; the Memory server keeps its own knowledge graph in `memory.jsonl`. Live output reaches the browser over SSE.

That is a small system, and that is the point: every runtime concern in this path can be pointed at in a few hundred lines of code and observed on your machine.

It is **not** a multi-agent system, and it has **no** human-in-the-loop approval, OpenTelemetry tracing, evaluation framework, guardrails, run cancellation or WebSocket streaming. Those are on the [roadmap](architecture/11-roadmap-from-prd.md). Where they appear in this path, they are labelled as challenges or future design.

## The path at a glance

| Stage | Question                           | Core lesson                                         | Lesson                                                                                    |
| ----- | ---------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| R1    | What actually runs?                | Process and resource ownership                      | [01 — Own the process](runtime/01-own-the-process.md)                                     |
| R2    | What is an execution?              | Conversation vs thread vs run vs checkpoint         | [02 — Model execution state](runtime/02-model-execution-state.md)                         |
| R3    | What must survive?                 | Durable vs ephemeral state                          | [03 — Design durability boundaries](runtime/03-design-durability-boundaries.md)           |
| R4    | How do users see live execution?   | Streaming transport vs persistent truth             | [04 — Streaming is not persistence](runtime/04-streaming-is-not-persistence.md)           |
| R5    | What does "memory" mean?           | Context, history, execution state, long-term memory | [05 — Memory is not one thing](runtime/05-memory-is-not-one-thing.md)                     |
| R6    | What happens when things fail?     | Crash, restart and resume semantics                 | [06 — Failure, restart and resume](runtime/06-failure-restart-and-resume.md)              |
| R7    | What does checkpointing not solve? | Side effects, replay and idempotency                | [07 — Side effects and idempotency](runtime/07-side-effects-and-idempotency.md)           |
| R8    | What does local-first really mean? | Infrastructure and data-flow ownership              | [08 — Local-first and runtime ownership](runtime/08-local-first-and-runtime-ownership.md) |

Then follow one run end to end in the [run lifecycle walkthrough](runtime/RUN-LIFECYCLE-WALKTHROUGH.md), read how the architecture got here in the [case studies](runtime/CASE-STUDIES.md), and test yourself with the [challenges](runtime/CHALLENGES.md).

## How long things take

| In            | You can                                                                    | Read                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5 minutes     | Name what is durable, what is in memory, and who owns each                 | This page, [durable vs ephemeral](runtime/03-design-durability-boundaries.md#mental-model)                                                          |
| 30 minutes    | Explain how one run moves through HTTP, LangGraph, SQLite, MCP and SSE     | [Run lifecycle walkthrough](runtime/RUN-LIFECYCLE-WALKTHROUGH.md)                                                                                   |
| A few hours   | Break the runtime on purpose and predict what survives                     | Lessons [01](runtime/01-own-the-process.md)–[06](runtime/06-failure-restart-and-resume.md) with their labs                                          |
| The full path | Design cancellation, durable approval, replay-safe tools or a worker split | Lessons [07](runtime/07-side-effects-and-idempotency.md)–[08](runtime/08-local-first-and-runtime-ownership.md), [challenges](runtime/CHALLENGES.md) |

## Recurring ideas

Each of these is demonstrated with code and an experiment somewhere in the path, not just asserted:

- **An agent run is a workflow, not a request.** The HTTP request that starts a run returns before the run does ([R1](runtime/01-own-the-process.md), [walkthrough](runtime/RUN-LIFECYCLE-WALKTHROUGH.md)).
- **Framework state and application state are different abstractions.** LangGraph has threads and checkpoints; Sophos needed runs ([R2](runtime/02-model-execution-state.md)).
- **Streaming is transport; checkpoints are state** ([R4](runtime/04-streaming-is-not-persistence.md)).
- **Memory is several different responsibilities, not one feature** ([R5](runtime/05-memory-is-not-one-thing.md)).
- **Durable execution makes replay possible; it does not make side effects magically safe** ([R7](runtime/07-side-effects-and-idempotency.md)).
- **Local-first means owning the important data flows and runtime dependencies** ([R8](runtime/08-local-first-and-runtime-ownership.md)).
- **The runtime is part of the agent architecture.** Every lesson finds a property of the agent (what it remembers, whether it finishes, where its data goes) decided by the runtime, not the model.

## Lab environment

Every lesson has a lab. The labs run Sophos as a production build against **disposable state** under `data/lab/`, so they never touch the conversations and memory you keep under `data/db/` and `data/memory/`.

**Prerequisites:** Node 24, [Ollama](https://ollama.com) with the configured model (`ollama pull qwen3`), `npx` and [`uv`](https://docs.astral.sh/uv/) for the stdio MCP servers, and these command-line tools:

| Tool              | Used for                                                               | Notes                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `curl`            | every lab: the HTTP API and SSE streams                                |                                                                                                                                     |
| `jq`              | reading API responses and exports                                      |                                                                                                                                     |
| `sqlite3`         | reading the `runs`, `conversations`, `checkpoints` and `writes` tables | the SQLite command-line shell; often a separate package (`sqlite3` on Debian/Ubuntu)                                                |
| `lsof`            | finding the lab server's PID and its sockets (lessons 03, 04, 06, 08)  | not installed by default on many Linux distributions. To kill the lab server without it: `pkill -9 -f 'node --env-file=.env build'` |
| `pgrep` / `pkill` | finding and killing MCP child processes (lesson 01)                    | on Linux, `pgrep -fl` prints only process names; use `pgrep -af` to see full command lines                                          |
| `docker`          | reading the Compose configuration (lesson 08)                          | Docker Compose v2 (`docker compose`)                                                                                                |

The commands were written and run in `zsh` on macOS; they are plain POSIX shell otherwise.

Once:

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
```

After every source change:

```sh
pnpm build
```

**Terminal 1 — the lab server.** Lessons refer to this as _start the lab server_; some add a variable in front of it (for example `OLLAMA_HOST=…`).

```sh
HOST=127.0.0.1 PORT=5174 \
DATABASE_PATH=data/lab/db/sophos.db \
MEMORY_FILE_PATH=data/lab/memory/memory.jsonl \
node --env-file=.env build
```

**Terminal 2 — the client.** Set these once per shell:

```sh
B=http://127.0.0.1:5174
DB=data/lab/db/sophos.db
```

Start a run in a new conversation and keep its id in `C`; then stream it:

```sh
C=$(curl -s -X POST $B/api/chat -H 'content-type: application/json' \
  -d '{"message":"Name one prime number. Answer in one word."}' | jq -r .conversation)
curl -N "$B/api/chat?conversation=$C"
```

You can also open <http://127.0.0.1:5174> in a browser and watch the same conversations in the UI.

**Reset the lab:** stop the lab server, then `rm -rf data/lab`. (`make clean-db` and `make clean-memory` delete the _default_ paths under `data/db/` and `data/memory/`; the labs never need them.)

Why a production build and not `pnpm dev`:

- `node build` is the same server that runs in the container (`infra/app/Dockerfile`), including adapter-node's graceful shutdown and the `sveltekit:shutdown` hook in `src/hooks.server.ts`. `vite dev` never emits that event.
- It is one process you can signal, kill and restart, with no hot module reloading re-creating module state underneath you.
- `HOST=127.0.0.1` matters: adapter-node listens on all interfaces by default. Lesson 08 comes back to this.

**Model behaviour is observed, not guaranteed.** Labs that involve the model show what one run looked like with `qwen3` (8B). Your model may pick different tools, skip a tool or phrase things differently. The runtime behaviour (what is persisted, what survives a restart, what a resume does) does not depend on the model, and that is what the labs ask you to check.

---

## Stage R1: What actually runs?

**Question.** Which processes, connections and in-memory structures exist while Sophos serves a run, and who creates, shares and closes each?

**Why it matters.** An agent is a long-running service with expensive, failure-prone dependencies: a model server, tool servers (some of them child processes), a database connection, open streams. If nobody clearly owns a resource, its failure and shutdown semantics are accidental.

**Code.** `src/lib/agent/index.ts` (`getGraph`, `loadTools`, `closeAgent`), `src/lib/agent/mcp/client.ts` (`MCPClientService`), `src/lib/agent/persistence/database.ts` (`getDatabase`, `closeDatabase`), `src/lib/agent/runs.ts` (`activeRuns`), `src/hooks.server.ts`.

**Lab.** Make an MCP server unavailable on first use; watch the first run fail, the other server's child process get cleaned up, and the next attempt recover without a restart. Then shut the server down mid-run and see what nobody owns.

**Failure it prevents.** Leaked child processes, a dependency that never reconnects, shutdown that pulls the database out from under a running workflow.

**Reference.** [3.1 Processes & Boundaries](architecture/3-runtime-integration-details.md#31-processes--boundaries), [3.7 MCP Integration](architecture/3-runtime-integration-details.md#37-mcp-integration).

**Upstream prerequisite.** [Tools and MCP](https://github.com/cognokratos/simple-agent-template/blob/main/docs/concepts/02-tools-and-mcp.md) (what an MCP server is and why tools sit behind a protocol).

→ [Lesson 01 — Own the process](runtime/01-own-the-process.md)

## Stage R2: What is an execution?

**Question.** When a user sends a message, what is the unit of work, what identifies it, and what records its outcome?

**Why it matters.** "Conversation", "thread", "run" and "checkpoint" are four different things with four different lifetimes. Conflating them leads to APIs that can't say whether something finished, resumes that target the wrong state and UIs that lie.

**Code.** `src/lib/agent/graph.ts` (`threadConfig`), `src/lib/agent/persistence/database.ts` (the `conversations` and `runs` schema), `src/lib/agent/persistence/conversations.ts`, `src/lib/agent/runs.ts`.

**Lab.** Build one conversation with two completed runs, a failed run and a resumed run, then read the `conversations` and `runs` tables, the checkpoint history and the UI side by side.

**Failure it prevents.** Using a framework's identifier for a product concept it doesn't model.

**Reference.** [3a Terminology](architecture/3a-durable-execution-persistence.md#terminology).

→ [Lesson 02 — Model execution state](runtime/02-model-execution-state.md)

## Stage R3: What must survive?

**Question.** Which state must outlive the process, and which must not?

**Why it matters.** Persisting too little loses work; persisting too much turns transport details into data you must migrate, secure and keep consistent.

**Code.** `src/lib/agent/persistence/database.ts`, `src/lib/agent/runs.ts` (the comment at the top names the split), `infra/compose.yml` (which directories are volumes).

**Lab.** Classify every piece of runtime state, predict what survives a graceful stop and a `kill -9`, then do both.

**Failure it prevents.** Losing conversations on restart; resurrecting dead connections from disk.

**Reference.** [3a What is durable, what is in memory](architecture/3a-durable-execution-persistence.md#what-is-durable-what-is-in-memory).

→ [Lesson 03 — Design durability boundaries](runtime/03-design-durability-boundaries.md)

## Stage R4: How do users see live execution?

**Question.** How does the browser see tokens and tool calls as they happen, and what happens to that view when the connection or the process goes away?

**Why it matters.** A stream is the most visible part of an agent and the least durable. If the UI treats it as the record, a reconnect or restart corrupts what the user believes happened.

**Code.** `src/routes/api/chat/+server.ts` (`GET`), `src/lib/agent/runs.ts` (`publish`, `subscribe`), `src/routes/+page.svelte` (`startSse`, `finishStream`).

**Lab.** Disconnect mid-run and reconnect with `Last-Event-ID`; then kill the server mid-stream and compare what the stream showed with what the checkpoints hold.

**Failure it prevents.** Treating presentation transport as the source of truth.

**Reference.** [3.4 Streaming Protocol](architecture/3-runtime-integration-details.md#34-streaming-protocol).

→ [Lesson 04 — Streaming is not persistence](runtime/04-streaming-is-not-persistence.md)

## Stage R5: What does "memory" mean?

**Question.** When someone says the agent "remembers", which of six different mechanisms do they mean?

**Why it matters.** Prompt context, conversation history, execution state, checkpoint history, application metadata and long-term knowledge have different owners, lifetimes and deletion semantics. Conflating them is how a "delete my conversation" request leaves the user's facts behind.

**Code.** `src/lib/agent/graph.ts` (`agentNode`), `config/system.md`, `src/lib/agent/mcp/config.ts` (`MEMORY_FILE_PATH`), `src/lib/agent/export.ts`.

**Lab.** Teach the agent a fact, retrieve it from a new conversation, delete all conversations, and see which "memory" survives; then delete the knowledge graph and see the other half.

**Failure it prevents.** Incomplete deletion, unbounded context, and memory nobody can explain.

**Upstream prerequisite.** [Grounding and authoritative state](https://github.com/cognokratos/simple-agent-template/blob/main/docs/concepts/03-grounding-and-authoritative-state.md) (why the model's own memory is not a system of record).

→ [Lesson 05 — Memory is not one thing](runtime/05-memory-is-not-one-thing.md)

## Stage R6: What happens when things fail?

**Question.** When the model, a tool server or the process fails mid-run, what state is left, what does the application record, and how does work continue?

**Why it matters.** A durable agent is a workflow that can continue after process failure. That only works if recovery is part of the application model.

**Code.** `src/lib/agent/index.ts` (`runAgent`: `durability: 'sync'`, `null` input on resume), `src/lib/agent/persistence/conversations.ts` (`recoverInterruptedRuns`), `src/routes/api/chat/+server.ts` (`RUN_NOT_RESUMABLE`).

**Lab.** Make the model unreachable, kill the process after a tool result, and shut down gracefully mid-run. Predict the run status and the pending node each time, then resume.

**Failure it prevents.** Lost work, phantom `running` runs, and recovery that only an operator can perform.

**Reference.** [3a Restart, failure and resume](architecture/3a-durable-execution-persistence.md#restart-failure-and-resume), [6.2 Failure Paths](architecture/6-core-workflows.md#62-failure-paths-sketches).

→ [Lesson 06 — Failure, restart and resume](runtime/06-failure-restart-and-resume.md)

## Stage R7: What does checkpointing not solve?

**Question.** If a step that changed the outside world is replayed after a crash, does the change happen twice?

**Why it matters.** Checkpointing makes workflow state resumable. External side effects still need their own replay and idempotency semantics.

**Code.** `src/lib/agent/graph.ts` (`toolsNode`: one graph task for all tool calls of a turn), the Memory MCP server's write semantics.

**Lab.** A design lab: find the failure window in Sophos, show which of today's tools are replay-safe and why, and design a `create_task` tool that is.

**Failure it prevents.** Duplicate side effects after resume; "exactly-once" claims that don't hold.

**Upstream prerequisite.** [Human-in-the-loop and controlled mutation](https://github.com/cognokratos/simple-agent-template/blob/main/docs/concepts/08-human-in-the-loop.md) and [lab 08 — Add a state-changing action](https://github.com/cognokratos/simple-agent-template/blob/main/docs/tutorials/08-add-a-state-changing-action.md) (who may authorize a mutation). Sophos focuses on what happens to that mutation when the workflow is replayed.

→ [Lesson 07 — Side effects and idempotency](runtime/07-side-effects-and-idempotency.md)

## Stage R8: What does local-first really mean?

**Question.** Which data flows and dependencies stay on your machine, which leave it, and which of those are enforced rather than merely configured?

**Why it matters.** A local model is not a local system. Ownership is a property of data flows, dependencies and control boundaries, not of where the weights run.

**Code.** `src/lib/agent/config.ts` (`OLLAMA_HOST`), `config/mcp.json`, `infra/app/config/mcp.json`, `infra/compose.yml`.

**Lab.** Remove the Fetch MCP and enumerate the network paths that remain, from configuration, listening sockets and the Compose topology.

**Failure it prevents.** "Local" claims that don't survive a look at the topology.

**Reference.** [9) Security Posture](architecture/9-security-posture.md), [4) Deployment Topology](architecture/4-deployment-topology-docker-compose.md).

**Upstream prerequisite.** [Security and trust boundaries](https://github.com/cognokratos/simple-agent-template/blob/main/docs/concepts/07-security-and-trust-boundaries.md) (identity, segmentation and why network isolation is not authentication).

→ [Lesson 08 — Local-first and runtime ownership](runtime/08-local-first-and-runtime-ownership.md)

---

## After the path

You should be able to answer, for every major resource and piece of state in Sophos:

```text
What starts this?           What persists this?        What owns this?
What happens when it crashes?   What happens on retry?   Who closes it?
```

If you can, try the [challenges](runtime/CHALLENGES.md). If you can't, the [run lifecycle walkthrough](runtime/RUN-LIFECYCLE-WALKTHROUGH.md) puts every answer in one place.
