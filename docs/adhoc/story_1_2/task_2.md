Here’s a ready-to-paste **Gemini CLI** prompt you can use to generate a clean patch.

---

**SYSTEM / INSTRUCTIONS FOR GEMINI**

You are editing a SvelteKit page that streams assistant tokens over SSE. Fix the reliability, UX, and data-integrity issues below and return a **unified diff** patch for `src/routes/+page.svelte` (and any new helper files you add), plus a brief changelog. Keep changes self-contained.

### Context

File to edit: `src/routes/+page.svelte` (Svelte 5 runes).
Current behaviors:

- Streams assistant tokens via SSE (`/api/chat?session=...`).
- Persists `messages`, `conv`, and `session` to `localStorage`.
- Shows chat bubbles; input disabled while streaming.

### Goals

Address all issues below in one pass, produce production-safe code, and keep the UI/logic simple.

### Required fixes & implementation details

1. **Throttle localStorage writes during streaming**
   - Problem: persistence runs on every token; causes jank/quota risk.
   - Do: create a 300–500ms debounced `persistState()` used by the storage `$effect`. Additionally call `persistState()` on SSE `end` and `error`.
   - Ensure no writes when `!browser`.
2. **Robust SSE error handling**
   - Native `EventSource` `error` has no `e.data`.
   - Do: remove JSON parse of `e.data` in the generic `'error'` listener. Detect transient reconnects via `eventSource.readyState === EventSource.CONNECTING` and ignore once if desired.
   - If server emits structured errors, listen on a **distinct** event name, e.g. `'server-error'`, and parse safely in a try/catch.
3. **Fallback to default `message` events**
   - Add `eventSource.onmessage = (e) => appendToken(e.data)` to handle servers that don’t name events `'token'`.
   - Keep existing `'token'` handler too.
4. **Encode session in URL**
   - Use `encodeURIComponent(sessionId)` when building the SSE URL.
5. **Stable keys for `{#each}`**
   - Add `id: string` to message objects (use `crypto.randomUUID()`).
   - Key the loop with `(message.id)`, not the array index.
6. **Safe JSON parsing for localStorage**
   - Wrap `JSON.parse` with `safeParse<T>(s, fallback)`.
   - On parse failure, fall back to defaults and clear corrupted keys.
7. **Prevent double SSE starts / race conditions**
   - If a stream is active or starting, close the old `EventSource` and null it before opening a new one. Guard `startSse` with a simple flag.
   - Ensure the POST 409-resume path returns early (it currently does—keep that invariant).
8. **Session clearing semantics**
   - On `'end'`: close, set `isStreaming=false`, **keep** `conv`, set `session=null`.
   - Option (implemented): keep the last `session` in storage for a short grace period? **Skip** for now; just make sure resuming only happens on mount if `session` exists.
   - On `'error'`: clear `session`, and if trailing assistant message is empty, remove it.
9. **UI/UX improvements**
   - Auto-scroll chat to bottom when messages change or tokens append.
   - Add `aria-label` to input/button.
   - Add a “Stop” button shown during streaming to manually `close()` the `EventSource` and finalize the assistant message.
   - Preserve last typed `input` on submit error (don’t lose it).
10. **Cap localStorage size growth**
    - Only keep the **last 50 messages** when persisting.
    - Extract a helper `trimMessages(messages, max=50)`.
11. **Network robustness for POST**
    - Wrap `await response.json()` in try/catch—handle non-JSON error pages.
    - Optionally add `AbortController` timeout (e.g., 30s) for the POST.
12. **Consistent assistant placeholder logic**
    - Ensure a placeholder is added **only** when last message isn’t assistant.
    - If an error occurs before any tokens, remove the empty assistant message.
13. **Class & style nits**
    - Keep Tailwind but clean up class logic where easy.
    - No visual redesign beyond adding the Stop button and auto-scroll.
14. **Type safety**
    - Define a `type Msg = { id: string; role: 'user'|'assistant'; content: string }`.
    - Update state types accordingly.

### Acceptance criteria

- No parsing crashes on corrupted `localStorage`.
- Storage updates during streaming are throttled and also flushed on end/error.
- SSE works with either named `'token'` events or default `message`.
- Clicking **Stop** halts streaming without leaving a stuck session.
- The chat auto-scrolls while tokens stream.
- Messages are keyed by stable IDs; no DOM reuse glitches.
- Session query param is URL-safe.
- Only last N (50) messages are persisted.
- POST handles non-JSON errors gracefully.
- Empty trailing assistant is removed on error.
- Code compiles and runs under SvelteKit with runes.

### Patch format

Return a **single unified diff** for:

- `src/routes/+page.svelte`
- Any **new** helper file you add (e.g., `src/lib/chat-utils.ts`)—keep helpers minimal. If you add one, also include its `import` changes in `+page.svelte`.

### Notes

- Do **not** introduce external deps.
- Keep the component API and server endpoints unchanged.
- Keep behavior of `/api/chat` 409 resume intact.
