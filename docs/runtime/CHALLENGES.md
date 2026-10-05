# Challenges

Design problems that test whether the [runtime learning path](../RUNTIME-LEARNING-PATH.md) stuck. None of them are implemented in Sophos; all of them are **future design**. Each one starts from the current code, lists the questions a good design must answer, and gives no solution.

Work them in writing first: a state diagram, a table of what is durable and who owns it, and a failure walk-through ("the process dies here; what happens?"). Implement one only if you want to; if you do, the existing tests (`src/lib/agent/graph.spec.ts` drives the real graph with a scripted model and a real SQLite file) show how to test durable behaviour without Ollama.

## Challenge 1 — Cancellation semantics

Users can't stop a run today: no API, no status, no signal ([roadmap](../architecture/11-roadmap-from-prd.md)).

**Starting point:** `execute()` in `src/lib/agent/runs.ts` is a background promise nobody holds; `runs.status` allows four values; `graph.stream()` accepts an `AbortSignal` in its config.

Design it:

- **New run state?** Is `cancelled` a fifth status, or `failed` with a code? What does the sidebar show? Can a cancelled run be resumed, and should it?
- **How to signal the graph?** Where does the `AbortController` live, who can reach it, and what does it abort: the model call, the tool call, the step loop?
- **What if a tool is running?** The `tools` node is one task for all calls of a turn. Is "cancel" allowed to interrupt a mutation halfway ([lesson 07](07-side-effects-and-idempotency.md))? If not, what does the user see while it finishes?
- **What is checkpointed?** After cancellation, what is `next`? If it's non-empty, `resumable` becomes `true`: is that what you want?
- **What happens after restart?** A cancel request accepted just before a crash: does the run come back `interrupted` or `cancelled`? Where would you have to record the request for the answer to be `cancelled`?
- **Races:** cancel arrives after the last step finished but before `finishRun()`. What wins?

## Challenge 2 — Durable HITL

Generic human-in-the-loop mechanics (who may approve, signed approvals, policy at the point of mutation, audit) are taught upstream: [simple-agent-template — Human-in-the-loop](https://github.com/cognokratos/simple-agent-template/blob/main/docs/concepts/08-human-in-the-loop.md) and [lab 09 — Add human approval](https://github.com/cognokratos/simple-agent-template/blob/main/docs/tutorials/09-add-human-approval.md). This challenge is about **persistence**: an approval that waits for days and survives restarts.

**Starting point:** Sophos already runs LangGraph with a checkpointer, which is what LangGraph interrupts need. MCP elicitation already arrives as a LangGraph interrupt, but resuming one with a decision is not implemented ([3.7](../architecture/3-runtime-integration-details.md#37-mcp-integration)).

Design an approval flow for a tool call:

```text
run interrupted   →   decision persisted   →   user returns later   →   resume with decision
```

- **Where does the graph stop?** Before the `tools` node for selected tools (a static interrupt), or inside a node (a dynamic `interrupt()`)? What does the checkpoint contain at that point?
- **Run status.** Is "waiting for approval" `interrupted`, or a new status? How do you keep `recoverInterruptedRuns()` from confusing it with a crash?
- **The decision.** Where is it persisted, by whom, and in which transaction relative to the resume? What if the process dies between "decision recorded" and "graph resumed"?
- **Resume input.** Today a resume is `graph.stream(null, thread)`. What does it become, and how does `POST /api/chat` validate that the decision matches the pending tool call (same `tool_call_id`, same arguments)?
- **Staleness.** The user approves a week later. What has changed (memory, config, the external system), and what must be re-checked before the mutation?
- **Two tabs.** Two approvals for the same pending call arrive at once. What makes the second one a no-op?

## Challenge 3 — Replay-safe mutating tool

Design (or build, against a disposable store) a state-changing MCP tool that remains correct under resume and retry. [Lesson 07](07-side-effects-and-idempotency.md) has the failure window and the vocabulary.

Your design must specify:

- the **idempotency key**: what it is derived from, who supplies it (model, runtime, server) and why it is stable across a replayed `tools` step but different for a new tool call;
- how the key reaches the server, given that the MCP adapter sends only name and arguments;
- the server's **atomicity**: key and effect in one transaction;
- the **response on a repeat**: the original result, so the resumed `agent` step sees what really happened;
- behaviour on **timeout**, **lost response** and **key reuse with different arguments**;
- how long keys are kept, and what happens after that;
- a test: a crash injected between the server's commit and the checkpoint, followed by a resume, that proves one effect.

## Challenge 4 — Separate worker process

Imagine moving LangGraph execution out of SvelteKit into a worker process (or several).

**Starting point:** [Why the monolith is deliberate](CASE-STUDIES.md#why-the-monolith-is-deliberate) lists what the monolith gives you for free.

- **State and API contracts.** What does `POST /api/chat` do now: write a job row, call the worker over HTTP, publish to a queue? What does it return, and when is the run "accepted"?
- **Who owns `activeRuns`?** The "one active run per conversation" rule is a `Map.get` today. What enforces it across processes: a unique constraint, a lease, an advisory lock?
- **How is SSE delivered?** The buffer and the subscribers are in the process that runs the graph. A browser connects to the web process. Choose a path for events (worker → broker → web, worker pushes to web, browser connects to the worker) and say what `Last-Event-ID` means now.
- **Shutdown.** The worker gets SIGTERM mid-run. Drain, checkpoint-and-exit, or hand over? How does a run left behind get detected, now that "a new process started" no longer means "the old one is dead"? (Hint: `recoverInterruptedRuns()` becomes wrong.)
- **MCP.** One adapter per worker? Shared tool servers? Who restarts them?
- **Boundaries.** Which failures become easier to isolate, and which consistency guarantees do you lose?

## Challenge 5 — PostgreSQL migration

Conceptually move from one local SQLite file to PostgreSQL shared by several Sophos processes.

- **Invariants.** List the ones that hold today only because there is one process and one connection: one active run per conversation; "`running` at start-up means dead"; `message_count` matching the thread; migrations applied once (`PRAGMA user_version`). How does each become a database-enforced or protocol-enforced invariant?
- **Concurrency.** Two processes start a run on the same conversation at the same moment. Two runs append to the same thread. What does the checkpointer do with concurrent writers on one `thread_id`, and what should the application prevent before it gets there?
- **Run ownership.** Replace "the process that created it" with something you can check after a crash: an owner id plus a heartbeat or lease. Who marks expired runs `interrupted`?
- **Checkpoints.** LangGraph has a Postgres checkpointer. What changes about backup, retention (nothing is pruned today) and inspection (today: `sqlite3 data/db/sophos.db`)?
- **Local-first.** With a database server, what does "local-first" now mean? Which data flows from [lesson 08](08-local-first-and-runtime-ownership.md) change, and which ownership properties survive if the database runs on the same machine, on the LAN, or as a managed service?

## Challenge 6 — Multiple concurrent users

Sophos is local-first and single-user: no authentication, one shared knowledge graph, every conversation visible to anyone who can reach the listener ([9) Security Posture](../architecture/9-security-posture.md)).

Identity, session handling and trust boundaries are taught upstream: [simple-agent-template — Security and trust boundaries](https://github.com/cognokratos/simple-agent-template/blob/main/docs/concepts/07-security-and-trust-boundaries.md). Assume a gateway gives you an authenticated user id, and design what must change in the **runtime**:

- **Conversation ownership.** Where does the owner live, and which queries must filter by it (`listConversations()`, `getConversation()`, `getThreadState()`, the export)? What stops a user from resuming someone else's thread by id?
- **Long-term memory.** One `memory.jsonl` for everyone leaks facts across users. One Memory server per user, one file per user, or a server that takes a user scope? Who passes the scope, given that the model must not choose it?
- **MCP credentials.** Tools that act on a user's behalf need that user's credentials. The `MCPAdapter` is process-wide today. What becomes per-user, and what is the lifecycle of a per-user connection ([lesson 01](01-own-the-process.md))?
- **Data isolation at rest.** Per-user databases, row-level ownership, or both? How does a user delete everything about themselves ([lesson 05](05-memory-is-not-one-thing.md))?
- **Resource limits.** One Ollama for all users: per-user concurrent runs, step budgets (`AGENT_RECURSION_LIMIT` is global), queueing, fairness.
- **Concurrency.** Two tabs of the same user on the same conversation; two users writing the knowledge graph at once (the Memory server rewrites the whole file per operation).
