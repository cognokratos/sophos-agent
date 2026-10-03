# 5) Trade-off Decisions

| Topic         | Decision                                  | Rationale                                                                                                        |
| ------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Service shape | **Monolith (web+agent)** for v0           | Simplest workshops; the agent is a library inside the SvelteKit server.                                          |
| Orchestration | **Explicit `StateGraph`**                 | The agent loop is two named nodes and one conditional edge, readable in one file; no prebuilt agent factory.     |
| Streaming     | **SSE now**, WS later                     | Minimal code & great for teaching; reconnects replay buffered events by `Last-Event-ID`.                         |
| Persistence   | **Markdown + JSONL**                      | Human-readable learning artifacts; can be extended to SQLite later for indexing and scale.                       |
| Tools         | **MCP: Memory & Fetch**, one `MCPAdapter` | Keep scope teachable; new servers are added in `mcp.json`, not in code. Tool names carry the server prefix.      |
| Security      | **Loopback-only default**                 | Nothing is published beyond `127.0.0.1`; MCP servers stay on the internal network. Fetch is the explicit egress. |
| Versions      | **Pinned + locked**                       | Lockfiles for the app and both MCP containers; exact versions for local stdio servers. Reduces tool drift.       |
| Base images   | **Major-version tags, no digests**        | Security patches flow in on rebuild; digests would need a bump process this project does not have yet.           |

---
