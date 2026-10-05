# Case studies

Architecture decisions in Sophos, taken from its own history and current code. None of these are invented incidents: each one points at the code, the commit or the reference document it comes from.

## Markdown stopped being the database

> Human-readable export format ≠ authoritative application state.

**Before.** Until the durable-execution change (commit `fd03d45`, "durable LangGraph execution with SQLite checkpoints"), conversations were directories of files under `data/chat/{id}/`: `0001.user.md`, `0002.assistant.md`, … plus `trace.jsonl`. The chat route wrote the user's file before the run and appended each trace event to `trace.jsonl` as it streamed. The assistant's file was the **concatenation of the streamed tokens** (with `SHOW_TOOLS` on, formatted tool notes were spliced into that text too), written when the stream reached `end`. On the next turn, it read the files back, sorted them by turn number, converted them to LangChain messages and passed the whole list plus the system prompt to the agent. Conversation metadata came from the file system: the title from the first line of the first file, the timestamps from the directory's birth and modification times, the message count from the number of `.md` files.

**What went wrong with that shape:**

- **The presentation format was the runtime input.** Rebuilding the model's context meant parsing files written for humans. Only `user` and `assistant` text was rebuilt: tool calls and tool results lived in `trace.jsonl` and never went back to the model, so on the next turn the agent didn't know what its tools had returned.
- **The stream was the record.** Whatever the browser was shown became the stored answer, formatting artifacts included. There was no separate, structured result to store.
- **No run, no outcome.** A crash mid-run left a user file without an assistant file. Nothing recorded that a run had started, failed or could continue, and there was nothing to continue from.
- **Implicit metadata.** File-system timestamps and file counts are an index you don't control (copying the directory changes them).
- **Turn numbering from directory listings** made correctness depend on file names and on there being one writer.

**After.** The thread's checkpoints are authoritative (`src/lib/agent/persistence/database.ts`). Messages (including tool calls and results) are stored once, as the LangGraph state the graph actually runs on; a new turn passes only the new message. Markdown is generated on demand by `GET /api/conversations/:id/export` (`src/lib/agent/export.ts`), and the comment there says it plainly: _nothing here is read back by the application; deleting an export loses nothing._ The old `data/chat/` directory is neither read nor deleted, and there is no importer ([3a Legacy `data/chat/`](../architecture/3a-durable-execution-persistence.md#legacy-datachat)).

**Why export is one-way.** An export is a projection for a reader: lossy by design (no checkpoint structure, no pending writes, no step numbers) and free to change format. If it were ever read back, every format change would become a migration, and every hand edit a way to corrupt runtime state.

**Lesson:** pick the authoritative representation by what the runtime needs to resume work, then derive human-readable views from it, never the other way round. ([Lesson 03](03-design-durability-boundaries.md))

## Why Sophos added a `runs` table

> Framework abstractions do not necessarily model application semantics.

LangGraph's `SqliteSaver` gives every conversation a thread with a checkpoint after every step. That answers "what is the workflow's state, and what runs next?". The product needs different questions answered:

| Product question                                             | Needs                                   |             In LangGraph's checkpoints?              |
| ------------------------------------------------------------ | --------------------------------------- | :--------------------------------------------------: |
| Is the agent still working on this chat?                     | `running`                               |                          no                          |
| Did the last answer fail? With what error, to show the user? | `failed`, `error_code`, `error_message` | only as an `__error__` pending write, without a code |
| Was it cut short by a restart, and can I continue?           | `interrupted` + `next`                  |                     `next` only                      |
| When did it start and end?                                   | `started_at`, `finished_at`             |           checkpoint timestamps, per step            |
| What happened to the third message I sent?                   | one record per attempt                  |   no: checkpoints carry `{source, step, parents}`    |

So the `runs` table (`src/lib/agent/persistence/database.ts`) gives each attempt an identity and an outcome, and the application maintains it at the edges of the graph: `startRun()` before the graph runs, `finishRun()` after it stops, `recoverInterruptedRuns()` when a new process first opens the database. [Lesson 02](02-model-execution-state.md) shows four runs on one thread, one of which produced no new checkpoint at all.

**The cost.** Two sources of truth that must agree. They usually do because the run row brackets the graph, but not always: in one observed graceful shutdown, a run was recorded `failed` while its thread was perfectly resumable ([lesson 01, part 4](01-own-the-process.md#part-4-shut-down-while-a-run-is-in-flight)). The rule Sophos follows: `next` decides whether there is work left; `runs` records what the user was told.

**Lesson:** use the framework's state for what the framework does (execute and resume steps), and model your product's concepts yourself.

## Why SSE replay isn't persistence

> Browser reconnect and server restart are different failures.

Sophos's SSE stream has a replay mechanism: every event has an id, the active run's events are buffered, and a reconnecting `EventSource` sends `Last-Event-ID` and receives exactly what it missed (`subscribe()` in `src/lib/agent/runs.ts`). It is tempting to call that "durable streaming". It isn't, and the code says so in the comment at the top of `runs.ts`.

| Failure                                | What recovers it                       | What is lost                                                        |
| -------------------------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| Browser loses the connection for 5 s   | the in-memory buffer (`Last-Event-ID`) | nothing                                                             |
| Browser reconnects after the run ended | the `runs` table (one `end` event)     | the token-by-token view; the UI reloads the thread instead          |
| Server restarts mid-run                | the checkpoints                        | the buffer, the subscribers, the partial output of the current step |

The design keeps the two mechanisms separate on purpose: the buffer is cheap, complete for one run's lifetime, and thrown away; the checkpoints are the record. The UI always ends a stream by reloading from the record (`finishStream()` in `src/routes/+page.svelte`). Persisting the stream would have bought nothing a reload doesn't already provide, and would have created a second, token-level copy of every message that must agree with the first ([lesson 04](04-streaming-is-not-persistence.md)).

**Lesson:** recovery mechanisms are scoped to a failure. Name the failure before you call something durable.

## Why long-term memory isn't chat history

> Two stores, two owners, two lifetimes.

Sophos has two things a user might call "memory":

|            | Thread checkpoints                                       | Memory MCP knowledge graph                   |
| ---------- | -------------------------------------------------------- | -------------------------------------------- |
| Holds      | everything said and done in one conversation             | entities, relations, observations            |
| Scope      | one conversation                                         | every conversation                           |
| Written    | automatically, after every step                          | only when the model calls a `memory__*` tool |
| Read       | automatically, as the prompt context of every model call | only when the model calls a `memory__*` tool |
| Owner      | LangGraph, in Sophos's SQLite file                       | the Memory MCP server, in `memory.jsonl`     |
| Deleted by | deleting the database                                    | deleting the file, or `memory__delete_*`     |

Keeping them separate is what lets the curriculum answer "what does the agent know about me?" with a file you can read, and "what did we talk about?" with a thread you can export. It also has a cost [lesson 05](05-memory-is-not-one-thing.md) makes visible: a fact read from the knowledge graph is copied into the thread as a tool result, so deleting the graph doesn't delete every copy, and nothing links a graph entry back to the conversation that wrote it.

The alternative designs each conflate something: "memory = full history in every prompt" makes context unbounded and memory per-conversation; "memory = automatic summaries written by the runtime" moves decisions about what to keep from an explicit tool call into hidden code. Sophos keeps the decision visible in the reasoning trace, at the cost of depending on the model to make it.

**Lesson:** decide which component owns each kind of memory before you decide how to store it.

## Why the monolith is deliberate

> Distribution should follow real boundaries, not fashion.

UI, HTTP API, agent graph and run registry are one SvelteKit process (`web`). The [trade-off record](../architecture/5-trade-off-decisions.md) gives the reason: simplest workshops; the agent is a library inside the server. The things that _are_ separated are separated for a reason:

- **Ollama** runs outside, because model serving has its own hardware, lifecycle and many other clients.
- **MCP servers** run as separate processes (children or containers), because the tool boundary is a capability boundary and a crash boundary, and because MCP servers are written in other languages (`mcp-server-fetch` is Python).
- **State** lives in files, because it must outlive every process.

What the monolith buys, concretely: `activeRuns` is a `Map`; the "one run per conversation" rule is a `Map.get`; replay is an array scan; run bookkeeping and graph execution share one SQLite connection; shutdown is one hook. Every one of those becomes a distributed-systems problem the moment the agent moves to another process ([challenge 4](CHALLENGES.md#challenge-4--separate-worker-process)).

Conditions that would justify a split later, none of which hold today:

- Runs must outlive web deployments (deploy the UI without interrupting agents).
- More than one machine must execute runs, or runs need isolation from each other (CPU, memory, crash blast radius).
- Many users, and the HTTP tier must scale independently of long-running workflows.
- Untrusted tool code needs a sandbox the web process must not share.

And the cost each brings: a run registry in shared storage, an ownership lease per run, cross-process event delivery for SSE, a shutdown protocol between processes, and the end of "the database has exactly one writer".

**Lesson:** a process boundary is a failure boundary and a consistency boundary. Draw one when you need those properties, not before.
