# 📘 Софос Agent — Project Brief (MIT Open-Source Educational Blueprint)

## 🎯 Purpose

**Софос Agent** is an **educational, open-source AI agent framework** designed as a practical **blueprint for production-grade AI applications**.
It provides students and developers a complete, reproducible environment to study **modern AI orchestration patterns** using **LangGraph.js**, **Ollama**, and **MCP adapters**, wrapped in a **SvelteKit + TailwindCSS** frontend.

All components are **open, local-first**, and run entirely in **Docker Compose**, promoting transparency, reproducibility, and platform independence.

---

## 🧠 Core Concept

Users chat in real time with an **AI Agent** that:

1. Accepts user messages,
2. Uses an **LLM (Ollama)** for reasoning,
3. Leverages **MCP servers** (Memory, Fetch, etc.) for tool-based capabilities,
4. Saves conversations as **Markdown transcripts**.

This simple interaction chain demonstrates the **LangGraph agent pattern** and **functional TypeScript orchestration** in an inspectable, hackable way.

---

## 🧩 Tech Stack

| Layer                | Technology                                             | Purpose                                                 |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| **Frontend**         | **SvelteKit + TailwindCSS**                            | Real-time chat UI, modular routes, componentized design |
| **Agent Engine**     | **LangGraph.js** (`@langchain/langgraph`)              | Defines LLM+tools interaction graph                     |
| **MCP Integration**  | **LangChain MCP Adapters** (`@langchain/mcp-adapters`) | Bridges to multiple tool servers via Docker             |
| **Language Model**   | **Ollama (Mistral)**                                   | Local LLM reasoning                                     |
| **Persistence**      | Markdown files on filesystem                           | Transparent, human-readable storage                     |
| **Containerization** | Docker (multi-stage Node 22 slim)                      | Lightweight, reproducible runtime                       |
| **Orchestration**    | **Docker Compose**                                     | Runs Софос app + MCP servers + Ollama                   |
| **Styling**          | TailwindCSS + TailwindUI                               | Fast UI iteration with prebuilt templates               |

---

## 🏗️ Architecture Overview

```
+---------------------------------------------------------------+
|                      Софос Agent (SvelteKit)                  |
|   - Chat UI (Svelte/Tailwind)                                 |
|   - API Endpoints (+server.ts)                                |
|   - File persistence (/data/conversations/*.md)               |
|   - LangGraph React Agent (Ollama + MCP Tools)                |
+--------------------|------------------|------------------------+
                     |                  |
                     v                  v
          +----------------+   +-------------------+
          | Ollama Server  |   | MCP Servers (via  |
          | (Mistral LLM)  |   | Docker Containers)|
          +----------------+   +-------------------+
                 |                     |
                 +------- Docker -------+
```

---

## 🐳 Docker Compose Setup

The **entire environment** is orchestrated with **Docker Compose**, allowing seamless multi-service startup for:

- **Софос Agent** (SvelteKit + Node runtime)
- **Ollama** (LLM service)
- **MCP Memory Server**
- **MCP Fetch Server**

### Example `docker-compose.yml`

```yaml
version: '3.9'
services:
  sophos:
    build: .
    container_name: sophos-agent
    ports:
      - '3000:3000'
    environment:
      - OLLAMA_HOST=http://ollama:11434
      - DATA_DIR=/app/data/conversations
    volumes:
      - ./data:/app/data
    depends_on:
      - ollama
      - mcp-memory
      - mcp-fetch

  ollama:
    image: ollama/ollama:latest
    ports:
      - '11434:11434'
    volumes:
      - ollama-data:/root/.ollama

  mcp-memory:
    image: mcp/memory
    command: ['run']
    volumes:
      - claude-memory:/app/dist

  mcp-fetch:
    image: mcp/fetch
    command: ['run']

volumes:
  ollama-data:
  claude-memory:
```

> 💡 This Compose configuration ensures students can bring up the **full AI stack** locally with a single command:
>
> ```bash
> docker compose up --build
> ```

---

## 🗂️ Key Features

- ✨ **Real-time Conversational Chat**
- 💬 **Markdown-based Persistent Conversations**
- 🧩 **Composable LangGraph Agent**
- 🔌 **MCP Server Tool Integration**
- 🧱 **Functional TypeScript Architecture**
- 🧠 **Local-First, Inspectable AI Orchestration**
- 🧰 **Reproducible Environment via Docker Compose**

---

## 📁 Project Directory (Simplified)

```
/src
  /lib
    /agent
    /domain
    /storage
    /util
  /routes
    /api
      /chat
      /new
      /list
      /get
  +page.svelte
Dockerfile
docker-compose.yml
tailwind.config.cjs
README.md
```

---

## 📚 Educational Objectives

Students will learn:

- How to integrate **LLMs with tool APIs** using **LangGraph**.
- How **MCP servers** expand model capabilities.
- How to design **functional, type-safe AI pipelines** in TypeScript.
- How to build and deploy **modular AI web apps** with SvelteKit.
- How to manage a **multi-container AI system** with Docker Compose.

---

## 🧾 License

MIT License — open and remixable for educational and research purposes.
