# Follow one run

> An agent run is a workflow, not a request.

[simple-agent-template follows one request](https://github.com/cognokratos/simple-agent-template/blob/main/docs/tutorials/REQUEST-WALKTHROUGH.md) through gateway, guardrails, model and tools. This page follows one **run**: what is created, written, streamed and closed between the moment a user presses Enter and the moment the UI shows the answer from durable state. Then it follows the same run when the process dies halfway.

Every value below comes from a real run on the [lab environment](../RUNTIME-LEARNING-PATH.md#lab-environment) with `qwen3` (8B) and `OLLAMA_THINK=true`. Ids are shortened. Your model may choose different tools; the runtime mechanics don't change.

The prompt:

> Fetch https://example.com and summarize it in one sentence. Then save that sentence to your knowledge graph as an observation on an entity named "example.com" (entityType: website).

It exercises conversation creation, three model calls with tool calls, both MCP servers, a tool error the model recovers from, and a final answer: eight messages and nine checkpoints.

**How to read the tables.** _Stored where_ is where the stage leaves its result. _Owner_ is who writes it: the application (Sophos code), LangGraph, SQLite, an MCP service or the browser transport. _Replayable_ answers: if the process died right after this stage, would resuming repeat it?

## The whole path

```text
Browser            SvelteKit route          runs.ts / index.ts         LangGraph + SqliteSaver        MCP / Ollama
───────            ───────────────          ──────────────────         ───────────────────────        ────────────
POST /api/chat ──► validate, create conv ─► startRun: runs=running
       ◄── {conversation, run}              void execute() ─────────► stream(input, thread_id)
GET /api/chat ───► subscribe (SSE)                                     input checkpoint (step -1)
                                                                       loop checkpoint  (step 0)
                                                                       agent ───────────────────────► Ollama
   ◄── token/trace ◄──────────────────────── publish ◄─────────────── checkpoint (1): tool call
                                                                       tools ───────────────────────► Fetch MCP
                                                                       checkpoint (2): tool result
                                                                       agent → tools (Memory) × 2 …
                                                                       agent: final answer
                                                                       checkpoint (7): next = []
                                             finishRun: completed
   ◄── end ◄────────────────────────────────  publish end, delete ActiveRun
GET /api/conversations/:id ──► getThreadState (latest checkpoint) → render
```

## Part 1: The run that completes

### 1. `POST /api/chat`

The UI sends `{ "message": "Fetch https://example.com …" }` with no `conversation`, because this is a new chat. `src/routes/api/chat/+server.ts` handles it.

### 2. Validate input

The body must be JSON; `message` must be a non-empty string unless `resume` is `true`; a `conversation`, if present, must be a UUID that exists (`400` / `404` otherwise). This is the only input validation: there are no guardrails ([roadmap](../architecture/11-roadmap-from-prd.md)).

### 3. Create or reuse the conversation

No `conversation` was given, so the route generates `c0e26e99…` and calls `createConversation()`: one `conversations` row with the title cut from the first line (`Fetch https://example.com and summarize it in one ...`).

| Stage            | Stored where?         | Durable? | Owner       | Replayable? |
| ---------------- | --------------------- | :------: | ----------- | :---------: |
| conversation row | `conversations` table |   yes    | application |     no      |

### 4. Create the run row: `running`

The route checks `getActiveRun()` (`409 SESSION_IN_PROGRESS` if another run is active on this conversation), then `startRun()` in `src/lib/agent/runs.ts`:

1. generates a run id (`randomUUID()`);
2. inserts `runs` row `status = running` and bumps `updated_at`, in one transaction (`persistence/conversations.ts`);
3. registers an `ActiveRun` in `activeRuns` (empty event buffer, no subscribers);
4. starts `execute()` **without awaiting it**, and the route returns `{conversation, run}`.

The HTTP request is now over. The run is not.

| Stage                  | Stored where?      | Durable? | Owner       | Replayable? |
| ---------------------- | ------------------ | :------: | ----------- | :---------: |
| `runs` row (`running`) | `runs` table       |   yes    | application |     no      |
| `ActiveRun`            | `activeRuns` (RAM) |    no    | application |     no      |

The UI now opens `EventSource('/api/chat?conversation=c0e26e99…')`. `GET` finds the `ActiveRun`, replays any buffered events (none yet, or a few if the browser was slow), adds itself as a subscriber and starts a 15 s `ping`.

### 5. Invoke the LangGraph thread

`runAgent()` in `src/lib/agent/index.ts` calls:

```ts
getGraph().stream(
	{ messages: [new HumanMessage(message)] },
	{
		configurable: { thread_id: conversationId },
		streamMode: 'messages',
		durability: 'sync',
		recursionLimit
	}
);
```

`getGraph()` compiles the graph on first use (with the SQLite checkpointer on the shared connection). Only the **new** message is passed. The history, if any, comes from the thread's latest checkpoint.

### 6. Checkpoint the user input

LangGraph writes two checkpoints before any node runs:

| Step | Source  | `next`          | Messages | What it captures                        |
| ---: | ------- | --------------- | -------: | --------------------------------------- |
|   −1 | `input` | `["__start__"]` |        0 | the input, not yet applied              |
|    0 | `loop`  | `["agent"]`     |        1 | the user message appended to the thread |

| Stage             | Stored where?           | Durable? | Owner     | Replayable? |
| ----------------- | ----------------------- | :------: | --------- | :---------: |
| input checkpoints | `checkpoints`, `writes` |   yes    | LangGraph |     no      |

### 7. The `agent` node executes

`agentNode()` in `src/lib/agent/graph.ts`:

1. `await options.tools()` → `loadTools()`. On this process's first run, `MCPClientService.initialize()` reads `config/mcp.json`, starts the Memory (`npx`) and Fetch (`uvx`) children, discovers 10 tools and keeps the adapter. Later runs reuse it.
2. reads `config/system.md` (every call; never stored);
3. calls Ollama with `[system, ...state.messages]` and the bound tools.

The model streams tokens; `runAgent()` turns each into a `token` event, and each step change into a `trace` event (`enter`, `leave`, plus `call` for each requested tool). `publish()` numbers them, buffers them in `ActiveRun.events` and sends them to the subscriber.

With `OLLAMA_THINK=true`, the streamed tokens of this step were the model's **reasoning** ("Okay, let me tackle this user query step by step…"), and its persisted message content is empty: the model went straight to a tool call. The reasoning is in the checkpoint (`additional_kwargs.reasoning_content`), but `GET /api/conversations/:id` returns only message text. Across the run's three agent steps the stream carried 2,682 `token` events that the reloaded conversation in stage 18 does not show. The stream and the record are different projections of the same execution ([lesson 04](04-streaming-is-not-persistence.md)).

| Stage                     | Stored where?                 | Durable? | Owner             |                     Replayable?                      |
| ------------------------- | ----------------------------- | :------: | ----------------- | :--------------------------------------------------: |
| MCP connections, children | `MCPAdapter` (RAM, processes) |    no    | application       |                 re-created on demand                 |
| model call, tokens        | Ollama → SSE buffer (RAM)     |    no    | browser transport | **yes**: a crash here re-runs the call, a new sample |

### 8. Checkpoint the agent step

The step's output, an assistant message with one tool call (`fetch__fetch {"url": "https://example.com"}`), becomes **step 1**, `next: ["tools"]`. `durability: 'sync'` means this write completes before `tools` starts. The tool call, its arguments and its `tool_call_id` are now fixed.

| Stage                         | Stored where? | Durable? | Owner     | Replayable? |
| ----------------------------- | ------------- | :------: | --------- | :---------: |
| assistant message + tool call | `checkpoints` |   yes    | LangGraph |     no      |

### 9. The MCP tool executes

`toolsNode()` runs a `ToolNode` with the same tool list. It calls `fetch__fetch`; the adapter sends the call to the Fetch server's stdio pipe (or, under Compose, to `http://mcp-fetch:8080/mcp`); the Fetch server makes an outbound HTTP GET to `example.com`. The result streams to the browser as a `trace` `result` event.

| Stage        | Stored where? | Durable? | Owner       |                     Replayable?                     |
| ------------ | ------------- | :------: | ----------- | :-------------------------------------------------: |
| outbound GET | the internet  |    —     | MCP service | **yes**: a crash before step 10 repeats the request |

### 10. Checkpoint the tool result

Step 2: the `ToolMessage` (`status: success`, the page text) is appended; `next: ["agent"]`. The fetched page is now part of the durable thread.

| Stage       | Stored where? | Durable? | Owner     | Replayable? |
| ----------- | ------------- | :------: | --------- | :---------: |
| tool result | `checkpoints` |   yes    | LangGraph |     no      |

### 11. A second (and third) tool

Same mechanics, twice:

| Step | Node    | What happened                                                                                            |
| ---: | ------- | -------------------------------------------------------------------------------------------------------- |
|    3 | `agent` | the model called `memory__add_observations` on `example.com`                                             |
|    4 | `tools` | the Memory server answered **with an error**: `Entity with name example.com not found` (`status: error`) |
|    5 | `agent` | the model read the error and called `memory__create_entities` with the entity and the observation        |
|    6 | `tools` | success: `memory.jsonl` now holds the entity                                                             |

A tool error is a message, not a failure: the run carried on. The write to `memory.jsonl` at step 6 is the run's only change to state outside SQLite.

| Stage                | Stored where?         | Durable? | Owner       |                                                 Replayable?                                                 |
| -------------------- | --------------------- | :------: | ----------- | :---------------------------------------------------------------------------------------------------------: |
| `memory.jsonl` write | `data/…/memory.jsonl` |   yes    | MCP service | **yes**, before step 6's checkpoint; deduplicated by entity name ([07](07-side-effects-and-idempotency.md)) |
| tool error / result  | `checkpoints`         |   yes    | LangGraph   |                                                     no                                                      |

### 12. Checkpoint

Steps 4 and 6 are the checkpoints after the two `tools` steps; step 5 is the one between them.

### 13. The agent generates the final message

Step 7: the model answers without tool calls. `routeAfterAgent()` returns `END`.

### 14. Final checkpoint

Step 7 is saved with `next: []` and eight messages: `user`, `assistant` (fetch call), `tool`, `assistant` (add_observations call), `tool` (error), `assistant` (create_entities call), `tool`, `assistant` (answer).

| Stage            | Stored where? | Durable? | Owner     | Replayable? |
| ---------------- | ------------- | :------: | --------- | :---------: |
| final checkpoint | `checkpoints` |   yes    | LangGraph |     no      |

### 15. The run is marked `completed`

The stream loop ends; `execute()` reads the thread (`getThreadState()`, 8 messages) and calls `finishRun()`: `status = completed`, `finished_at`, and the conversation's `message_count = 8`, in one transaction.

### 16. Conversation metadata updated

That same transaction set `conversations.updated_at`, which moves the chat to the top of the sidebar.

| Stage                      | Stored where?           | Durable? | Owner       | Replayable? |
| -------------------------- | ----------------------- | :------: | ----------- | :---------: |
| run outcome, message count | `runs`, `conversations` |   yes    | application |     no      |

### 17. SSE `end`

Only **after** the outcome is recorded (or recording it failed and was logged), `execute()` publishes `end` (`{conversation, status: "completed"}`) and deletes the `ActiveRun`. The route closes the stream on `end`. The buffer of ~2,700 events is now unreachable.

| Stage                       | Stored where? | Durable? | Owner             | Replayable? |
| --------------------------- | ------------- | :------: | ----------------- | :---------: |
| `end` event, buffer deleted | RAM           |    no    | browser transport |     no      |

### 18. The UI reloads durable state

`finishStream()` in `src/routes/+page.svelte` closes the `EventSource`, reloads the conversation list, and calls `GET /api/conversations/c0e26e99…`. That reads the latest checkpoint (no model, no MCP involved) and converts LangChain messages to `MessageDto`s (`src/lib/agent/messages.ts`). What the user now sees is the thread, not the tokens they watched; in this run, the reasoning they watched scroll by is gone from the screen.

Check it yourself:

```sh
curl -s "$B/api/conversations/$C/export?format=jsonl" | jq -c '{step, source, next, message_count, role: .last_message.role}'
sqlite3 -header -column $DB "SELECT status, started_at, finished_at FROM runs WHERE conversation_id = '$C'"
```

### What lived where, in one picture

```text
                       during the run                     after the run
SQLite                 conversations, runs(running),      conversations, runs(completed),
                       checkpoints −1…7, writes           checkpoints −1…7, writes
memory.jsonl           entity "example.com"               entity "example.com"
RAM (Sophos)           ActiveRun{events, subscribers},    graph, MCP adapter (kept for the next run)
                       graph, MCP adapter
OS processes           npx/uvx MCP children               npx/uvx MCP children
Browser                EventSource, local token buffer    rendered thread from GET /api/conversations/:id
```

## Part 2: The same run, cut short

Same shape, but the process is killed after the fetch result (this is [lesson 06, scenario C](06-failure-restart-and-resume.md#scenario-c-process-crash-after-a-tool-result), observed with a longer summary prompt).

```text
same run shape
    ↓
steps −1, 0, 1 (agent: fetch call), 2 (tools: fetch result) checkpointed
    ↓
agent step 3 streaming tokens … kill -9
    ↓
restart
    ↓
runs row still "running" ── first DB access ──► "interrupted"
    ↓
GET /api/conversations/:id → resumable: true, 3 messages (user, assistant, tool)
    ↓
POST {resume: true} → new runs row "running" → graph.stream(null, thread)
    ↓
agent step 3 (again, from scratch) → next = [] → new run "completed"
```

| Stage                             | Stored where?       | Durable? | Owner             |                  Replayable?                   |
| --------------------------------- | ------------------- | :------: | ----------------- | :--------------------------------------------: |
| checkpoints up to step 2          | `checkpoints`       |   yes    | LangGraph         |          no (not repeated on resume)           |
| step 3 tokens already streamed    | SSE buffer, browser |    no    | browser transport |       lost; step 3 re-runs from scratch        |
| `ActiveRun`, subscribers          | RAM                 |    no    | application       |            lost; nothing to restore            |
| MCP children                      | OS                  |    no    | application       | exited with the parent; restarted on first use |
| run row `running` → `interrupted` | `runs`              |   yes    | application       |            relabelled once, lazily             |
| resume run row                    | `runs`              |   yes    | application       |          a **new** row, a new run id           |
| `fetch__fetch`                    | —                   |    —     | MCP service       | **not** called again: its result is in step 2  |

If the kill had landed **during** step 2 (after the Fetch server sent its request, before the checkpoint), a resume would have run the `tools` step again and fetched the page a second time. For a GET, harmless. For a write, that is [lesson 07](07-side-effects-and-idempotency.md).

If the process had been stopped **gracefully** instead, the outcome would depend on timing, because Sophos has no run-drain policy. In the observed case with no browser attached, the run ended `failed` with `The database connection is not open` and the thread was in the same resumable state ([lesson 01, part 4](01-own-the-process.md#part-4-shut-down-while-a-run-is-in-flight)).

## What to take away

- The request that starts a run is over in milliseconds; the run is a background workflow with its own identity (`runs.id`), its own outcome and its own failure modes.
- Four stores take part, with four owners: SQLite app tables (Sophos), checkpoints (LangGraph), `memory.jsonl` (the Memory MCP server) and the SSE buffer (Sophos, RAM only).
- Exactly one of them is the conversation: the latest checkpoint.
- A resume repeats at most the interrupted step. Everything before it is read, not redone.
- Whether there is anything to resume is decided by the thread's `next`, not by `runs.status`: a crash after the final checkpoint but before `completed` is recorded leaves an `interrupted` run with a finished thread.

## Go deeper

- Reference: [3a A run, step by step](../architecture/3a-durable-execution-persistence.md#a-run-step-by-step), [6.1 Happy Path](../architecture/6-core-workflows.md#61-happy-path--chat--llm--tools--response).
- The lessons behind each section: [01](01-own-the-process.md) (who owns the run), [02](02-model-execution-state.md) (run vs thread), [04](04-streaming-is-not-persistence.md) (stream vs reload), [06](06-failure-restart-and-resume.md) (resume), [07](07-side-effects-and-idempotency.md) (replayed tools).
