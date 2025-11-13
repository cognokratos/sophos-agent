# 4. System Architecture Overview

Layered, modular design:

1. **Frontend Layer:** Chat UI built in SvelteKit.
2. **Agent Engine:** LangGraph.js reasoning core.
3. **Language Model Layer:** Ollama runtime for local inference.
4. **MCP Integration Layer:** Modular MCP tool servers (Memory, Fetch).
5. **Persistence Layer:** Markdown-based conversation logging.
6. **Containerization:** Docker Compose orchestrates all services.

---
