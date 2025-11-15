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

| Risk                                        | Mitigation                                            |
| ------------------------------------------- | ----------------------------------------------------- |
| Misconfigured or unsafe local tool          | Enforce sandbox path & method restrictions.           |
| Increased complexity for learners           | Provide “Hello Tool” starter example and walkthrough. |
| Version mismatch between tool API and agent | Pin adapter API version; add validation check.        |

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

| Metric                 | Target                                            |
| ---------------------- | ------------------------------------------------- |
| **Tool Creation Time** | ≤ 10 minutes following docs                       |
| **Learning Velocity**  | ≥ 80 % of test users can build a tool unaided     |
| **Reproducibility**    | Deterministic replay of a session with tool calls |

---

## Stories

### Story 2.1 — Integrate LangChain MCP Adapters

**As a** developer
**I want** to integrate the `@langchain/mcp-adapters` library,  
**so that** the agent can connect to and utilize external MCP tools.

**Acceptance Criteria**

1. The `@langchain/mcp-adapters` library is installed and configured.
2. A `MultiServerMCPClient` instance is initialized at agent startup, connecting to specified MCP servers.
3. The agent can retrieve and utilize tools exposed by the `MultiServerMCPClient`.
4. Unit tests confirm successful client initialization and tool retrieval.

---

### Story 2.2 — Reference Examples: Memory & Fetch MCP

**As a** learner
**I want** working examples of how the agent uses existing MCP tools
**so that** I can understand tool invocation and how external capabilities integrate with reasoning.

**Acceptance Criteria**

1. The **Memory MCP** is demonstrated as a reference tool:
   - Example interactions show reading/writing memory entries.
   - Tool calls appear clearly in the reasoning trace.
2. The **Fetch MCP** is demonstrated as a reference tool:
   - Example interactions show performing safe HTTP GET requests using the existing MCP adapter.
3. No new MCP tools are introduced or implemented.
4. Documentation includes:
   - A short “Using the Memory MCP” example.
   - A short “Using the Fetch MCP” example.
   - Both examples visible in the reasoning trace.

---

### Story 2.3 — Trace & Markdown Integration

**As a** student
**I want** to see and record tool calls
**so that** I can understand how reasoning leads to external actions.

**Acceptance Criteria**

1. Tool invocations appear as steps in the trace.
2. Markdown persistence captures the tool invocation blocks

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
