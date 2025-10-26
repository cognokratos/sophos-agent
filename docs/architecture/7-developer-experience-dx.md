# 7) Developer Experience (DX)

## 7.1 Monorepo Layout

```
src/ (SvelteKit + Agent)
infra/ (compose, Dockerfiles, profiles) • data/logs/ • scripts/ • docs/
```

**Why:** shared types, simple onboarding; aligns with Team Fullstack workflow & templates.

## 7.2 One-Command Setup

`make setup` → copy `.env`, pull images, **warm up** default model, start stack, open UI. **Profiles:** `warmup`, `publish`, `split`.

## 7.3 Testing & QA

* **Unit:** Vitest for graph nodes & adapters.
* **Integration:** Playwright for chat flow.
* **Compose smoke:** ping `/api/models`.
* **CI:** GitHub Actions; version pinning. (Education-grade, transparent.)

---
