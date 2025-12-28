# 5) Trade-off Decisions

| Topic         | Decision                        | Rationale                                                                                  |
| ------------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| Service shape | **Monolith (web+agent)** for v0 | Simplest workshops; can flip to split via profile with no contract change.                 |
| Streaming     | **SSE now**, WS later           | Minimal code & great for teaching; reliable fallback to non-stream JSON.                   |
| Persistence   | **Markdown + JSONL**            | Human-readable learning artifacts; can be extended to SQLite later for indexing and scale. |
| Tools         | **MCP: Memory & Fetch**         | Keep scope teachable; extensible via configuration.                                        |
| Security      | **Local-only** default          | Avoid accidental exposure; data stays local and is not shared with external parties.       |
| Versions      | **Pinned**                      | Reduce tool drift across classrooms.                                                       |

---
