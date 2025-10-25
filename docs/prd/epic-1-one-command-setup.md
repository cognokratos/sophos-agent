# Epic 1: One-Command Local Setup & First Agent Chat

**Epic Goal**
Enable newcomers to clone/pull, run a single command, open the app, and complete a first conversation with the agent—seeing reasoning traces and markdown persistence—all powered by local LLMs (Ollama + Mistral). This validates the core architecture end-to-end and fulfills the PRD’s “AI Systems Classroom in a Box” promise.

---

## Motivation / Why Now

This is the shortest path to value for students and educators: fast setup, a working chat, and visibly inspectable orchestration.
It directly supports PRD goals of:
- **Local-first sandbox**
- **Reproducibility**
- **Educational accessibility via Docker Compose**

and aligns with success metrics around setup speed and reasoning visibility.

---

## In Scope

- **Docker Compose** brings up all services (SvelteKit UI, LangGraph.js engine, MCP tool servers, Ollama runtime).
- **First-run model pull** with friendly UX if Mistral model missing.
- **Minimal chat UI** (SvelteKit + Tailwind) wired to agent engine.
- **Reasoning trace view** for each turn.
- **Markdown-based persistence** of conversations.

---

## Out of Scope (Deferred)

- Alternate LLMs beyond default Mistral.
- Advanced MCP adapters beyond Memory & Fetch.
- Educator dashboards, plugin registry, or community integrations.

---

## Assumptions

- Target systems have Docker installed (macOS, Linux, WSL2).
- Network available for first-run model and image pulls.
- Local-only defaults (no telemetry) per PRD privacy principle.

---

## Dependencies

- SvelteKit + Tailwind UI shell
- LangGraph.js orchestration
- Ollama runtime + Mistral model
- MCP Memory/Fetch adapters
- Docker Compose configuration

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-------------|
| Setup complexity on Windows/WSL2 | Add explicit WSL2 setup notes and preflight checks. |
| Version drift between components | Pin versions and document update flow. |
| Hardware constraints | Default to lightweight Mistral model; note resource tuning tips. |

---

## Acceptance Criteria (AC)

1. Running `docker compose up` launches all services successfully within ≤5 minutes on a clean system.
2. App guides users to pull Mistral model if missing.
3. User can send a message and receive a response from the **local** model.
4. Each conversation turn shows a **reasoning trace**.
5. Conversations persist as markdown files in the documented directory.
6. README Quickstart matches real startup flow.
7. Works across macOS, Linux, and WSL2 (document caveats).

---

## Success Metrics

| Metric | Target |
|---------|--------|
| **Setup Time** | ≤ 5 minutes from clone to first chat |
| **Learning Velocity** | User reports understanding reasoning trace within first session (qualitative measure) |

---

## Stories

### Story 1.1 — Docker Compose Baseline & Healthchecks

**As a** new user
**I want** to start everything with one command
**so that** I can run the system without manual wiring.

**Acceptance Criteria**
- Compose defines all services with pinned versions and healthchecks.
- README Quickstart includes copy-paste runnable example.
- Logs show all services healthy.

**Verification**
- UI ↔ Engine ↔ MCP ↔ Ollama connectivity confirmed.
- Boot time under 2 minutes on baseline machine.

---

### Story 1.2 — First Chat Path (UI ↔ Agent Engine ↔ Ollama)

**As a** learner
**I want** to send a message and get a model response
**so that** I know the local LLM is wired correctly.

**Acceptance Criteria**
- Minimal SvelteKit chat renders and streams tokens.
- If model missing, user prompted to pull it.
- Errors surfaced with actionable messages.

**Verification**
- Response proven to originate from local Ollama logs.
- Average latency ~2s for sample prompt.

---

### Story 1.3 — Reasoning Trace & Markdown Persistence

**As a** student
**I want** to see orchestration steps and have chats saved
**so that** I can study how agents reason and reproduce sessions.

**Acceptance Criteria**
- Trace of agent reasoning visible per turn.
- Conversation persisted to markdown file after each message.
- Local-only data storage confirmed (no telemetry).

**Verification**
- Trace matches LangGraph.js execution path.
- Markdown includes metadata (timestamp, model, reasoning summary).

---

## Definition of Done

- All ACs pass on macOS + Linux + WSL2.
- CI smoke test validates Compose startup and healthchecks.
- README fully aligned with real Quickstart flow.
- Screenshots or short demo GIF added to docs.
- PO approval and QA sign-off complete.

---

## Notes for PO & SM

- After approval, break down into Story 1.1–1.3 tickets in your sprint board.
- This Epic unlocks all downstream work: MCP tool expansion, educator UX, and distributed orchestration experiments.

---

**Epic Owner:** Product / Systems PM
**Contributors:** Fullstack Team (SvelteKit + LangGraph.js)
**Status:** Draft ✅ Ready for refinement
