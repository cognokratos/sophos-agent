# 7) Developer Experience (DX)

## 7.1 Monorepo Layout

```
src/        (SvelteKit + Agent)
infra/      (compose, Dockerfiles, profiles)
data/chat/  (Chat data)
scripts/    (DevOps)
docs/       (Documentation)
```

**Why:** simple onboarding; aligns with Team Fullstack workflow & templates.

## 7.2 One-Command Setup

`make start` → Start Agentic Chat and MCP servers.

## 7.3 Testing & QA

- **Unit:** Vitest for graph nodes & adapters.
- **Integration:** Playwright for chat flow.
- **Compose smoke:** Chat & MCP server health checks.

---
