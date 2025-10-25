# Epic 2: MCP Tools & Extensibility Basics

**Epic Goal**
Empower learners and developers to extend the system with new **MCP (Model Context Protocol)** tools — demonstrating how local agents can gain new capabilities by wiring custom adapters — without breaking reproducibility or privacy.

This proves the open, inspectable design of the Sofos Agent and establishes a pattern for safe, local-first extensibility.

---

## Motivation / Why Now

After Epic 1 delivers a working baseline chat and reasoning trace, the next value inflection is **customization**.
Educators and students must be able to:

- Create small local MCP tools (e.g., a file reader, JSON fetcher).
- Register them with the agent runtime.
- Observe how tool calls appear in the reasoning trace.

This supports the PRD’s learning goals: “Build your own tools,” “Inspect everything,” and “Reproduce agent behavior deterministically.”

---

## In Scope

- Support dynamic registration of new MCP tools through configuration or a simple UI panel.
- Include **two reference tools**:
  1. Local file inspector (read-only).
  2. HTTP fetcher (with safe allow-list).
- Extend reasoning trace to show **tool invocation steps**.
- Update markdown persistence to capture tool call metadata.
- Document developer workflow for adding a new MCP adapter.

---

## Out of Scope (Deferred)

- Third-party tool registry or remote tool loading.
- Full permissions/ACL framework (basic sandbox only).
- GUI-driven tool creation wizard (CLI + config suffice for now).

---

## Assumptions

- Core engine (LangGraph.js) already supports plugin nodes for MCP tools.
- Agents can call external tools through a defined adapter interface.
- All tools run locally with no external API keys required.

---

## Dependencies

- Completion of **Epic 1** (working compose setup + baseline chat).
- MCP protocol library and existing adapters (Memory, Fetch).
- Reasoning trace component extensible for tool call events.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-------------|
| Misconfigured or unsafe local tool | Enforce sandbox path & method restrictions. |
| Increased complexity for learners | Provide “Hello Tool” starter example and walkthrough. |
| Version mismatch between tool API and agent | Pin adapter API version; add validation check. |

---

## Acceptance Criteria (AC)

1. New MCP tools can be defined via config file or CLI command and loaded at startup.
2. At least two built-in example tools (File Inspector, Fetcher) verified working.
3. Reasoning trace shows when/why a tool was invoked and with what parameters.
4. Markdown transcript includes tool invocation metadata.
5. Documentation includes “Build Your First Tool” guide with working sample.
6. Local-only operation validated; no external network calls without explicit allow-list.

---

## Success Metrics

| Metric | Target |
|---------|--------|
| **Tool Creation Time** | ≤ 10 minutes following docs |
| **Learning Velocity** | ≥ 80 % of test users can build a tool unaided |
| **Reproducibility** | Deterministic replay of a session with tool calls |

---

## Stories

### Story 2.1 — Adapter Interface & Registry

**As a** developer
**I want** a clear API to define and register MCP tools
**so that** I can extend the agent’s abilities safely.

**Acceptance Criteria**
- Adapter interface documented with TS types.
- Registry loads tools at startup and validates schema.
- Unit tests for malformed tool definitions.

---

### Story 2.2 — Reference Tools: File Inspector & Fetcher

**As a** learner
**I want** ready-to-use examples
**so that** I can study how tools interact with the agent.

**Acceptance Criteria**
- File Inspector reads text files within allowed directory.
- Fetcher retrieves limited JSON/HTML data.
- Both tools visible in reasoning trace.

---

### Story 2.3 — Trace & Markdown Integration

**As a** student
**I want** to see and record tool calls
**so that** I can understand how reasoning leads to external actions.

**Acceptance Criteria**
- Tool invocations appear as steps in the trace.
- Markdown output includes tool call blocks with parameters/results.
- Visual style consistent with base trace component.

---

### Story 2.4 — Developer Documentation

**As an** educator or contributor
**I want** a simple “Hello Tool” tutorial
**so that** I can teach or demo how local tools extend the agent.

**Acceptance Criteria**
- New section in README or `/docs/tools.md`.
- Step-by-step example builds, registers, and invokes a sample tool.
- Screenshots or GIF showing it in action.

---

## Definition of Done

- All stories deliver tested, documented functionality.
- Two reference tools verified in local sandbox.
- Trace and markdown persistence updated.
- Developer documentation merged and reviewed.
- CI ensures new tools load without regressions.

---

## Notes for PO & SM

- This Epic establishes the extensibility pattern; future work (Epic 3+) will build on it for distributed tool registries or educator dashboards.
- Prioritize Story 2.1 first — adapter stability is critical before building examples.

---

**Epic Owner:** Product / Systems PM
**Contributors:** Fullstack + Tooling Team
**Status:** Draft ✅ Ready for refinement
