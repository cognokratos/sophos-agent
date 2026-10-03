# 10) Risks & Mitigations (excerpt)

- **Setup complexity:** one `make start`, healthcheck-gated. _Roadmap:_ a warmup step that pre-pulls images and the model.
- **Tool drift:** lockfiles for the app and MCP containers, exact versions for local stdio servers. _Roadmap:_ scheduled dependency bumps.
- **Accidental exposure:** loopback-only port bindings; MCP servers unpublished; Inspector opt-in (see [9)](./9-security-posture.md)).
- **Tool-driven egress / prompt injection:** documented in [9)](./9-security-posture.md). _Roadmap:_ human-in-the-loop approval and guardrails.
- **Educator onboarding:** ready-to-teach runbooks, screenshots.
- **Hardware variability:** choose a smaller model via `OLLAMA_MODEL`.

---
