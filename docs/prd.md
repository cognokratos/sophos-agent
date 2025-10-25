# 📘 Product Requirements Document — Софос Agent
**Version:** 1.0
**License:** MIT
**Context Source:** _Софос Agent Project Brief (Open-Source Educational Blueprint)_
**Created via:** BMAD Method – PM Agent Interactive Workflow

---

## 1. Product Overview
**Софос Agent** is an open-source educational blueprint for local AI systems.
It empowers students and developers to study and build orchestrated AI agents through a hands-on environment combining **LangGraph.js**, **Ollama**, and **MCP adapters** within a **SvelteKit** interface.
Entirely reproducible and Docker-based, it offers a transparent lab for learning how modern LLM agents reason, use tools, and persist memory—bridging theory and production-level practice.

---

## 2. Goals and Objectives
**Primary Goal**
Deliver an **AI Systems Classroom in a Box** — an open-source, hands-on platform for learning and experimenting with AI orchestration in a reproducible, transparent environment.

**Core Objectives**
1. Provide a **local-first sandbox** for exploring LangGraph.js-based AI orchestration with MCP and Ollama.
2. Teach **functional TypeScript architecture** and modular design patterns.
3. Support **easy extension** for new tools, LLMs, or adapters.
4. Promote **educational accessibility** through Docker Compose deployment.
5. Foster a **community ecosystem** for remixing, sharing, and collaborative learning.

**Success Outcome**
Софос Agent becomes a go-to open-source learning environment for universities, bootcamps, and self-learners wanting to understand how AI agents are structured and deployed in practice.

---

## 3. Key Features & Functionality
1. Real-Time Conversational Interface (SvelteKit + TailwindCSS).
2. Local LLM Integration (Ollama + Mistral).
3. LangGraph.js orchestration with transparent, inspectable reasoning.
4. MCP Tool Integration (Memory, Fetch, extensible adapters).
5. Markdown-based persistence for reproducibility.
6. Full Docker Compose environment for one-command startup.
7. Modular architecture for extension and experimentation.
8. Built-in educational tooling and examples.

---

## 4. System Architecture Overview
Layered, modular design:

1. **Frontend Layer:** Chat UI built in SvelteKit.
2. **Agent Engine:** LangGraph.js reasoning core.
3. **Language Model Layer:** Ollama runtime for local inference.
4. **MCP Integration Layer:** Modular MCP tool servers (Memory, Fetch).
5. **Persistence Layer:** Markdown-based conversation logging.
6. **Containerization:** Docker Compose orchestrates all services.

---

## 5. Success Metrics
**Educational Impact**
- ≥ 80 % of students can interpret or modify reasoning graphs after 2 hours.
- “Learning Velocity Index (LVI)” measures setup-to-insight speed.
- ≥ 3 institutional adoptions in first year.

**Technical Performance**
- ≤ 5-minute Docker setup across OS.
- Full visibility of reasoning traces.
- MCP integration within 1 hour by contributors.

**Community Ecosystem**
- ≥ 10 community PRs in 6 months.
- Quarterly releases.
- “Open Classroom Health Score” (engagement + diversity).

**Risk Mitigation**
- Simplified setup guides, version pinning, and educational onboarding.

---

## 6. Target Users & Use Cases
**Users**
- AI/ML Students
- Educators & Academic Institutions
- Independent Developers

**Primary Use Cases**
1. Educational lab deployments.
2. Self-guided exploration.
3. Curriculum integration.
4. Community experimentation.
5. Research sandbox for explainable AI.

---

## 7. Functional Requirements
Defines capabilities for:
- Chat interface, reasoning engine, MCP tools, local LLM runtime, persistence, containerization, configuration, and extensibility.
Each function supports inspectability, reproducibility, and modular design for learning.

---

## 8. Non-Functional Requirements
- **Performance:** < 5 min setup, 2 s avg latency, traceable LangGraph nodes.
- **Security:** Local-only by default, Docker isolation.
- **Reliability:** 99 % startup success, recovery and persistence.
- **Maintainability:** Functional TypeScript, semantic versioning, CI tests.
- **Usability:** Accessible, documented, minimal UI.
- **Portability:** macOS/Linux/WSL2 supported.
- **Transparency & Ethics:** 100 % visible reasoning, no telemetry.

---

## 9. Dependencies & Integrations
| Layer | Tool | Purpose |
|:------|:-----|:---------|
| Frontend | SvelteKit + TailwindCSS | Real-time chat |
| Agent Engine | LangGraph.js | Orchestration graph |
| LLM | Ollama (Mistral) | Local inference |
| MCP Servers | Memory, Fetch | Extendable tools |
| Adapters | @langchain/mcp-adapters | Tool bridging |
| Containerization | Docker Compose | Multi-service orchestration |
| Persistence | Markdown | Transparent data logs |

**Optional Future Integrations** — Custom MCPs, alternate LLMs, educational dashboards.

---

## 10. Risks & Mitigations
| Risk | Likelihood | Impact | Mitigation |
|:------|:------------|:--------|:------------|
| Setup complexity | Medium | High | Prebuilt images & setup scripts |
| Tool drift | High | Medium | Version pinning & maintenance schedule |
| Educator adoption | Medium | High | Ready-to-teach modules |
| Hardware constraints | Medium | Medium | Lightweight model support |
| Community fragmentation | Medium | Medium | Clear contribution standards |

---

## 11. Roadmap & Milestones
**Phase 1 — Foundation (Months 1–2)**
Core architecture, chat interface, Docker Compose setup.

**Phase 2 — Educational Release (Months 3–4)**
Tutorials, educator onboarding, v1.0.0 release.

**Phase 3 — Community Expansion (Months 5–8)**
Plugin registry, contribution system, community events.

**Phase 4 — Sustainability & Research (Months 9–12)**
Academic partnerships, research publication, expanded LLM support.

---

### ✅ PRD Completion Summary
**Document Created By:** PM Agent (BMAD Team Fullstack)
**Workflow:** `/pm *create-prd` interactive elicitation
**Context:** Derived from “Софос Agent — Project Brief”
**Status:** Draft PRD Complete (v1.0)
