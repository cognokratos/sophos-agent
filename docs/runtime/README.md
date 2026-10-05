# Agent runtime engineering with Sophos

Educational material: the _why_, the experiments and the failure modes. The precise _what_ and _how_ live in the [architecture reference](../architecture/index.md).

| I want to…                                                                                 | Go to                                                                                                                         |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Learn production agent fundamentals (loops, tools, MCP, guardrails, evals, HITL, security) | [simple-agent-template — Learning path](https://github.com/cognokratos/simple-agent-template/blob/main/docs/LEARNING-PATH.md) |
| Understand durable execution and runtime state                                             | [Runtime learning path](../RUNTIME-LEARNING-PATH.md)                                                                          |
| Follow one run end to end                                                                  | [Run lifecycle walkthrough](RUN-LIFECYCLE-WALKTHROUGH.md)                                                                     |
| See how the architecture evolved, and why                                                  | [Case studies](CASE-STUDIES.md)                                                                                               |
| Test myself                                                                                | [Challenges](CHALLENGES.md)                                                                                                   |
| Look up exact implementation details                                                       | [Architecture reference](../architecture/index.md)                                                                            |
| Set up the labs                                                                            | [Lab environment](../RUNTIME-LEARNING-PATH.md#lab-environment)                                                                |

## Lessons

1. [Own the process](01-own-the-process.md) — every resource has a creator, an owner and a closer
2. [Model execution state](02-model-execution-state.md) — conversation, thread, run, checkpoint
3. [Design durability boundaries](03-design-durability-boundaries.md) — persist semantics, not everything
4. [Streaming is not persistence](04-streaming-is-not-persistence.md) — transport vs truth
5. [Memory is not one thing](05-memory-is-not-one-thing.md) — six responsibilities, six owners
6. [Failure, restart and resume](06-failure-restart-and-resume.md) — recovery as part of the model
7. [Side effects and idempotency](07-side-effects-and-idempotency.md) — what checkpointing does not solve
8. [Local-first and runtime ownership](08-local-first-and-runtime-ownership.md) — data flows, not labels

## Lesson structure

Each lesson follows the same shape, so you can skip to the part you need:

```text
Objective → Why it matters → Mental model → Where it lives in Sophos
  → Experiment (predict, break, inspect, recover)
  → Why the system behaves this way → What this does NOT guarantee
  → Takeaway → Go deeper
```

Predict before you inspect. The point of each lab is the gap between what you expected and what the runtime did.

## Ground rules

- **Disposable state only.** Labs use `data/lab/` ([lab environment](../RUNTIME-LEARNING-PATH.md#lab-environment)). Nothing in this curriculum asks you to delete `data/db/` or `data/memory/`.
- **Current code only.** Everything described as behaviour is implemented on `main`. Lab results were observed while writing the labs; a few edge cases are read from the code, and the lessons say so. Anything that is not implemented is labelled _challenge_ or _future design_.
- **Model output is observed, not guaranteed.** Tool choice and wording vary between models and runs. Runtime behaviour does not.
