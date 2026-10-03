# **Σοφός Agent**: Local-First Agentic Chat System

**A Minimalist, Secure, Fully Local AI Agent Architecture (Educational Project)**

![](docs/bg.png)

---

## 📌 Overview

This repository is an **educational initiative** designed to teach you how to build a **local-first, agentic chat application** from first principles: local inference and local state by default, with explicit network access through configured tools.

Unlike cloud-dependent chatbot frameworks, this project prioritizes:

- **Local inference and local state** (Ollama, plain files under `data/`)
- **Maximum security & auditability**
- **Explicit agent control loops**
- **Minimal abstractions**
- **Zero SaaS dependencies**
- **Deep learner understanding over convenience**

By working through this repository, students will learn how modern agentic systems are actually constructed — not just how to call an API.

---

## 🎯 Learning Objectives

By the end of this project, you will understand how to:

- Design and implement an **agent loop** (observe → think → act → reflect)
- Build a **local chat system** without sending data to third-party services
- Reason about **security boundaries**, threat models, and attack surfaces
- Structure an AI system for **extensibility and long-term ownership**
- Operate AI software as **infrastructure**, not a toy demo

This project is intended for:

- Advanced beginners to intermediate developers
- Security-minded engineers
- AI practitioners who want full system ownership
- Students who want to understand _why_ frameworks work, not just _how_

---

## 🧠 Project Philosophy

### Local-First

Inference, memory, and orchestration run **on your machine**. The only network access is explicit: the Fetch MCP server, enabled in `mcp.json`, retrieves URLs the model asks for. Remove it and the agent has no tool-initiated network access.

### Minimalist

Every abstraction is justified. If something exists, it exists because:

- It is necessary
- It is inspectable
- It is teachable

### Agentic (Not Just Chat)

This is not a stateless chatbot. The system is built around:

- Persistent agent identity
- Explicit reasoning phases
- Tool invocation
- Memory and reflection loops

### Security-Driven

Security is not an afterthought. The repository explicitly documents:

- Trust boundaries
- Threat models
- Risk mitigations
- Non-functional requirements

---

## 🗂 Repository Structure

See [docs/architecture/source-tree.md](docs/architecture/source-tree.md) for a detailed overview.

---

## 📚 Documentation-First Design

This repository is intentionally **documentation-heavy**.

You are expected to **read the [architecture documents](docs/architecture/index.md) in order**:

### Recommended Reading Path

1. **Introduction** – What problem this system solves
2. **High-Level Architecture** – Component relationships
3. **Runtime Integration Details** – Execution model
4. **Core Workflows** – Agent lifecycle & message flow
5. **Security Posture** – Threat model and defenses
6. **Trade-Off Decisions** – Why certain choices were made
7. **Deployment Topology** – Local & containerized setups
8. **Monitoring & NFRs** – Observability without SaaS
9. **Roadmap** – Where the system is going
10. **Ownership Artifacts** – Long-term maintainability

This mirrors how real production systems are designed.

---

## 🧩 System Architecture (Conceptual)

At a high level, the system consists of:

- **Chat Interface Layer**
- **Agent Runtime**
- **Tool Invocation Layer**
- **Local Memory / State**
- **Model Execution (local inference)**
- **Control & Policy Enforcement**

There is a **clear separation** between:

- User input
- Agent reasoning
- Action execution
- State mutation

This separation is what enables security, testability, and extensibility.

---

## 🔁 Agent Lifecycle (Simplified)

1. **Input Reception**
2. **Context Assembly**
3. **Reasoning Phase**
4. **Tool Selection (if needed)**
5. **Action Execution**
6. **Reflection & Memory Update**
7. **Response Emission**

Each step is explicit and inspectable.

---

## 🔐 Security Model

The security posture is documented in detail under `docs/architecture/9-security-posture.md`.

Key principles include:

- No implicit network access (tool egress is explicit and configurable)
- Nothing published beyond `127.0.0.1` by default
- Explicit trust boundaries
- Local secrets management
- Defense-in-depth assumptions
- Human-readable policy decisions

Students are encouraged to **challenge and improve** the security model as an exercise.

---

## 🧪 Suggested Experiments

As you learn, try:

- Adding a new tool with strict input validation
- Introducing a memory summarization loop
- Implementing a sandboxed execution environment
- Creating a second agent with a different role
- Simulating adversarial prompts

These exercises will deepen your understanding of agentic systems.

---

## 🚧 Project Status

This is an **active educational architecture**, not a finished product.

The [roadmap](docs/architecture/11-roadmap-from-prd.md) separates what is implemented today from what is planned (checkpointing, human-in-the-loop approval, SQLite, observability, evals, guardrails). The architecture documents describe the current implementation.

Students are encouraged to fork, modify, and experiment.

---

## 🧠 Who This Project Is _Not_ For

This project is **not** ideal if you want:

- A plug-and-play chatbot
- Cloud-hosted convenience
- Hidden abstractions
- “Magic” agent frameworks

This project is about **learning, control, and ownership**.

---

## 📜 License & Ownership

This repository emphasizes **long-term ownership artifacts**:

- Clear documentation
- Explicit decisions
- Reproducible environments

You should be able to understand and operate this system **years from now**, without vendor lock-in.

---

## 🚀 Getting Started

Prerequisites: Node 24, Docker, and [Ollama](https://ollama.com) with the default model (`ollama pull qwen3`). For `pnpm dev` you also need `npx` and [`uv`](https://docs.astral.sh/uv/) (the MCP servers run as local stdio processes).

```sh
corepack enable                  # pnpm version comes from package.json#packageManager
pnpm install --frozen-lockfile

# Option A: local development
cp .env.example .env
pnpm dev

# Option B: Docker Compose (http://127.0.0.1:5173)
cp infra/.env.example infra/.env
make start                       # make inspector: also starts the MCP Inspector on 127.0.0.1:6274
make stop
```

Then:

1. Read `docs/architecture/1-introduction.md`
2. Follow the documentation sequentially
3. Modify the system intentionally
4. Break things
5. Learn deeply

---

## ✨ Final Note

This repository is not just code.
It is a **mental model for building secure, local, agentic systems**.

If you understand this project, you understand far more than how to “use” AI —
you understand how to **own it**.

Happy building.
