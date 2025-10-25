# 12) Ownership & Artifacts

* **This document:** `docs/architecture.md` (update via Architect agent workflow).
* **PRD:** `docs/prd.md` remains requirements source.
* **Templates/agents:** BMAD Team Fullstack bundle governs workflow & standards.

---

## Appendix — Error Envelope (authoritative)

```ts
interface ApiError {
  error: {
    code: string;             // e.g., 'MODEL_UNAVAILABLE', 'TOOL_FAILURE'
    message: string;          // student-friendly
    details?: Record<string, any>;
    timestamp: string;
    requestId: string;
  };
}
```

Keep FE/BE handlers in sync with this contract.
