# 5) Trade-off Decisions

> _Learn:_ [case studies](../runtime/CASE-STUDIES.md) (why Markdown stopped being the database, why a `runs` table, why the monolith).

| Topic          | Decision                                  | Rationale                                                                                                        |
| -------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Service shape  | **Monolith (web+agent)** for v0           | Simplest workshops; the agent is a library inside the SvelteKit server.                                          |
| Orchestration  | **Explicit `StateGraph`**                 | The agent loop is two named nodes and one conditional edge, readable in one file; no prebuilt agent factory.     |
| Streaming      | **SSE now**, WS later                     | Minimal code & great for teaching; reconnects replay buffered events by `Last-Event-ID`.                         |
| Persistence    | **SQLite + LangGraph checkpoints**        | Durable, resumable runs with the official `SqliteSaver`; one local file. Markdown/JSONL are generated exports.   |
| SQLite driver  | **`better-sqlite3`**                      | Required by the official checkpointer; reused for the app tables instead of adding `node:sqlite` or an ORM.      |
| Database files | **One file** (`data/db/sophos.db`)        | App tables and checkpoint tables share a connection: one thing to back up or delete.                             |
| Tools          | **MCP: Memory & Fetch**, one `MCPAdapter` | Keep scope teachable; new servers are added in `mcp.json`, not in code. Tool names carry the server prefix.      |
| Security       | **Loopback-only default**                 | Nothing is published beyond `127.0.0.1`; MCP servers stay on the internal network. Fetch is the explicit egress. |
| Versions       | **Pinned + locked**                       | Lockfiles for the app and both MCP containers; exact versions for local stdio servers. Reduces tool drift.       |
| Base images    | **Major-version tags, no digests**        | Security patches flow in on rebuild; digests would need a bump process this project does not have yet.           |

---
