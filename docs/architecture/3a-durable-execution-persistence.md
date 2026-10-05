# 3a) Durable Execution & Persistence

> _Learn:_ [02 — Model execution state](../runtime/02-model-execution-state.md), [03 — Design durability boundaries](../runtime/03-design-durability-boundaries.md), [06 — Failure, restart and resume](../runtime/06-failure-restart-and-resume.md), [run lifecycle walkthrough](../runtime/RUN-LIFECYCLE-WALKTHROUGH.md).

The agent's state lives in **one SQLite file** and survives restarts and crashes. LangGraph's checkpointer stores the execution state; a few application tables store metadata. Markdown is an export, not a database.

```text
SvelteKit  (/api/chat, /api/conversations)
    │
    ▼
LangGraph  StateGraph: START → agent ⇄ tools → END
    │            │
    │            └── MCP tools (Memory, Fetch), resolved when the tools node runs
    ▼
SqliteSaver  (official @langchain/langgraph-checkpoint-sqlite)
    │
    ▼
data/db/sophos.db
```

## Terminology

| Term             | What it is                                                                                               | Where it lives                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Conversation** | The chat the user sees in the sidebar: title, timestamps, message count.                                 | `conversations` table                                    |
| **Thread**       | LangGraph's persistent execution identity. Its state is the message list. `thread_id` = conversation id. | `checkpoints` / `writes` tables (owned by `SqliteSaver`) |
| **Run**          | One execution of the graph on a thread: from a new user message (or a resume) until the graph stops.     | `runs` table (status, error, timestamps)                 |
| **Checkpoint**   | A snapshot of the thread's state, saved after every step (super-step) of a run.                          | `checkpoints` table                                      |

```text
Conversation  (conversations.id)
     │
     └── thread_id  (same value)
            │
            ├── Run 1  (runs row: completed)
            │     └── checkpoints: input → agent → tools → agent
            │
            ├── Run 2  (runs row: failed / interrupted)
            │     └── checkpoints: input → agent → tools ✗   ← resume continues here
            │
            └── Run N
```

LangGraph itself has no "run" record in its checkpoints (their metadata is `source`, `step`, `parents`); the `runs` table is how this application gives runs an identity and an outcome.

## Storage layout

One file, `DATABASE_PATH` (default `data/db/sophos.db`, plus SQLite's `-wal`/`-shm` files), one `better-sqlite3` connection:

| Table           | Owner                                | Contents                                                                                      |
| --------------- | ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `conversations` | app (`persistence/conversations.ts`) | `id`, `title`, `created_at`, `updated_at`, `message_count`                                    |
| `runs`          | app                                  | `id`, `conversation_id`, `status`, `error_code`, `error_message`, `started_at`, `finished_at` |
| `checkpoints`   | `SqliteSaver`                        | serialized state per checkpoint (messages, including tool calls/results)                      |
| `writes`        | `SqliteSaver`                        | pending writes of steps that have not completed                                               |

**Why one file:** the checkpointer needs a `better-sqlite3` connection anyway, so the application tables reuse it. One file is one thing to back up, inspect (`sqlite3 data/db/sophos.db .tables`) or delete. Table names do not collide, and the application never reads the checkpoint tables directly; it goes through LangGraph (`getState`, `getStateHistory`).

**Messages are stored once**, in the thread. The `conversations` table holds only metadata; `message_count` is denormalized after each run so the sidebar does not deserialize every thread.

**Schema setup is automatic.** `openDatabase()` (`persistence/database.ts`) applies numbered migrations and records progress in `PRAGMA user_version`; `SqliteSaver` creates its tables on first use. Nothing needs to be run by hand.

## A run, step by step

```text
POST /api/chat {message, conversation?}
  │  validate id · create conversation (if new) · 409 if a run is active
  ▼
runs row: running ─────────────────────────────── (SQLite)
  │
  ▼
graph.stream({messages: [HumanMessage]}, {thread_id, durability: 'sync', recursionLimit})
  │   LangGraph loads the thread's last checkpoint, appends the message,
  │   and saves a checkpoint after every step
  ├── agent: system prompt + thread messages → Ollama → AIMessage
  ├── tools: ToolNode → MCP → ToolMessage(s)
  └── … until the model answers without tool calls
  │
  │   tokens / trace events ──► SSE subscribers (GET /api/chat)
  ▼
runs row: completed | failed, conversations.message_count updated
  │
  ▼
SSE `end` (or `chat-error`) → the UI reloads GET /api/conversations/:id
```

- **The caller sends only the new message.** History comes from the checkpoint; nothing is rebuilt from files.
- **The system prompt is not stored in the thread.** The agent node prepends `config/system.md` on every model call, so editing it affects existing conversations.
- **`durability: 'sync'`** writes each checkpoint before the next step starts, so a crash loses at most the step in progress.

## Restart, failure and resume

| Situation                          | What is persisted                                   | `runs.status`                                                        | What happens next                                                   |
| ---------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Run finished                       | final checkpoint, `next = []`                       | `completed`                                                          | next message starts a new run                                       |
| Error in a node (e.g. Ollama down) | checkpoints up to the failing step, `next = [node]` | `failed`                                                             | `POST {resume: true}` retries from that step, or send a new message |
| Process crash / restart mid-run    | same as above                                       | `running` → `interrupted` on the new process's first database access | `POST {resume: true}` continues                                     |
| Step limit reached                 | checkpoints so far                                  | `failed` (`RECURSION_LIMIT`)                                         | resume (with a fresh limit) or send a new message                   |

A resume calls `graph.stream(null, {thread_id})`: `null` input means "continue from the last checkpoint". Completed steps are not repeated (a tool that already ran is not called again). `GET /api/conversations/:id` reports `resumable: true` when the thread has pending steps and no run is active; the UI then shows a **Resume** button.

A graceful shutdown (SIGTERM/SIGINT) does not wait for runs: a run still executing when SQLite is closed fails its next checkpoint write and is recorded `failed` (`The database connection is not open`), with the thread still resumable.

These are the same states a future human-in-the-loop interrupt needs (`interrupted` → resume with a decision), so approval can be added on top of this model without changing persistence.

## Execution limits

`AGENT_RECURSION_LIMIT` (default 25) is passed as LangGraph's `recursionLimit`: the maximum number of steps per run. Each node execution is one step, so every agent → tools round trip costs two; 25 allows about 12 model calls. In this graph tool iterations are always one fewer than model iterations, so one limit covers both. Exceeding it raises `GraphRecursionError`, recorded as `RECURSION_LIMIT`.

## What is durable, what is in memory

| Durable (SQLite)                          | In memory only (lost on restart, by design)                          |
| ----------------------------------------- | -------------------------------------------------------------------- |
| conversations and their metadata          | `activeRuns`: the run currently executing per conversation           |
| every run and its outcome                 | its buffered SSE events (for `Last-Event-ID` replay) and subscribers |
| all messages, tool calls and tool results | the compiled graph and MCP connections (rebuilt on demand)           |
| checkpoints of every step                 |                                                                      |

After a restart a conversation is fully usable: its messages load from the thread, and an unfinished run shows up as `interrupted`.

## Markdown and JSONL: exports only

`GET /api/conversations/:id/export` generates a Markdown transcript (messages, tool calls, tool results) from the thread; `?format=jsonl` lists the thread's checkpoints, one JSON line each, oldest first. Both are generated on request and never read back: **deleting an export cannot lose conversation state.**

### Legacy `data/chat/`

Earlier versions stored conversations as `data/chat/{id}/0001.user.md … trace.jsonl` and rebuilt the history from those files. That directory is no longer read or written. Existing files are left in place (nothing deletes them) but do not appear in the UI; there is no importer. Delete the directory when you no longer need it.

## Code map

| File                                         | Responsibility                                                   |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `src/lib/agent/graph.ts`                     | the `StateGraph` (agent/tools nodes, routing), `threadConfig()`  |
| `src/lib/agent/index.ts`                     | runtime: builds the graph once, `runAgent()`, `getThreadState()` |
| `src/lib/agent/runs.ts`                      | starts runs, records outcomes, active-run SSE registry           |
| `src/lib/agent/persistence/database.ts`      | opens SQLite, migrations, `createCheckpointer()`                 |
| `src/lib/agent/persistence/conversations.ts` | `conversations` and `runs` tables                                |
| `src/lib/agent/messages.ts`                  | LangChain messages → `MessageDto` (the only UI-facing shape)     |
| `src/lib/agent/export.ts`                    | Markdown / checkpoint JSONL exports                              |

---
