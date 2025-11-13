# 5) Trade-off Decisions

| Topic         | Decision                        | Rationale                                                                  |
| ------------- | ------------------------------- | -------------------------------------------------------------------------- |
| Service shape | **Monolith (web+agent)** for v0 | Simplest workshops; can flip to split via profile with no contract change. |
| Streaming     | **SSE now**, WS later           | Minimal code & great for teaching; reliable fallback to non-stream JSON.   |
| Persistence   | **Markdown + JSONL**            | Human-readable learning artifacts; adapter seam for SQLite Phase 2.        |
| Tools         | **MCP: Memory & Fetch**         | Keep scope teachable; extensible via adapters.                             |
| Security      | **Local-only** default          | Avoid accidental exposure; “publish” profile is explicit.                  |
| Versions      | **Pinned**                      | Reduce tool drift across classrooms.                                       |

---
