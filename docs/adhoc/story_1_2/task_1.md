# ✨ Task: Implement a two-phase, resumable chat streaming API with SSE

Modify these files:

* `src/routes/api/chat/+server.ts`
* `src/routes/+page.svelte`

Target framework versions: **Svelte 5** and **SvelteKit 2**.

The feature has two phases:

1. **Message submit** via `POST /api/chat` → returns `{ conv, session }`.
2. **Token stream** via `GET /api/chat?session=<id>` → opens **SSE** that streams tokens as `event: token`.

The implementation must be **resumable**: on page refresh, the UI discovers any in-progress session and **reattaches** to the SSE until it ends. The user must **not** be allowed to submit another message while a session is `"pending"` or `"streaming"`.

---

## 1) Server: `src/routes/api/chat/+server.ts`

### 1.1 General

* Implement both **POST** and **GET** handlers in this file.
* Keep everything compatible with SvelteKit v2 route handlers and the `RequestHandler` types.
* Do not rely on Node-specific APIs that would break in adapters (use Web Streams / standard web APIs that SvelteKit supports).

### 1.2 In-memory state (within this file; no external store)

Create in-memory Maps (module-level singletons) to track conversations and sessions:

* `conversations: Map<string, Array<{ role: 'user' | 'assistant'; content: string; ts: number }>>`
* `sessions: Map<string, { conv: string; status: 'pending' | 'streaming' | 'done' | 'error'; buffer: string; createdAt: number; updatedAt: number; error?: { code: string; message: string } }>`
* A helper `newId(prefix: string)` to create unique ids (`conv_...`, `sess_...`).

> This is **in-memory only**; no persistence required. Assume a single instance for now.

### 1.3 Integrate with the agent

* Expect an imported `runAgent` function from `$lib/agent`. If its signature differs from the one below, write a very small adapter inline.
* The server will feed the **full conversation history** into the agent and stream tokens as they arrive.

Expected behavior for the agent call:

* Input: the **entire conversation** (including the new user message). You may pass the array as-is or adapt to your `runAgent` signature.
* Output: an **async iterable** of `string` token chunks.

If the existing `runAgent` currently takes a single `message: string`, adapt by constructing the right call (e.g., join messages) but do not change external files. If necessary, write a small internal async generator that wraps the current `runAgent` into a token-yielding iterable (fake tokenization by splitting into small chunks).

### 1.4 POST `/api/chat`

**Purpose:** Start a new agent **session** for a user message. Returns session identifiers; **does not** stream.

**Request body (JSON, required fields):**

```json
{
  "message": "user text",
  "conv": "optional-conversation-id",
  "metadata": { "any": "optional" }
}
```

**Behavior:**

1. Validate `message` (non-empty string). If missing → `400` JSON `{ code: 'BAD_REQUEST', message: 'Message is required' }`.
2. Use provided `conv` or create a new `conv_...`. Initialize `conversations` if it doesn’t exist.
3. Append `{ role: 'user', content: message, ts: Date.now() }` to `conversations.get(conv)`.
4. Create a new `session` id `sess_...` with status `"pending"`, empty `buffer`, timestamps.
5. **Do not** start SSE here. **Do not** block waiting on the agent. Just store session state.
6. Return JSON:

   ```json
   { "conv": "<conv-id>", "session": "<session-id>" }
   ```

**Error handling:**

* For any unexpected error, return `500` JSON `{ code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' }`.

### 1.5 GET `/api/chat?session=<id>`

**Purpose:** Open an **SSE** stream that emits tokens for the given session.

**Headers:**

* `Content-Type: text/event-stream`
* `Cache-Control: no-cache, no-transform`
* `Connection: keep-alive`

**Event shapes:**

* Token chunk:

  ```
  event: token
  data: <string token>

  ```
* End:

  ```
  event: end
  data: {"conv":"<conv-id>","session":"<session-id>"}

  ```
* Error:

  ```
  event: error
  data: {"code":"...","message":"..."}

  ```
* Keepalive ping every 15 seconds:

  ```
  event: ping
  data:

  ```

**Behavior:**

1. Validate `session` query param. If missing or unknown → respond with `400` or `404` using SSE `event: error` and then close the stream.
2. Look up the session and its `conv`. Fetch the conversation history.
3. If `status === 'done'`:

    * Immediately replay the **entire buffered** assistant text as `token` events (split into reasonable chunks).
    * Then send `end` and close.
4. If `status === 'error'`:

    * Send `event: error` with the stored error JSON and close.
5. If `status === 'pending'` or `'streaming'`:

    * If `'pending'`, set status to `'streaming'` and start the agent run.
    * Stream tokens from the agent via `event: token`, append each token to `session.buffer`, and (if needed) append to the `conversations` as the assistant’s last message (create one if not present or still empty).
    * On normal completion:

        * Mark session `status = 'done'`.
        * Ensure the assistant’s final message is stored in `conversations`.
        * Send `event: end`, close.
    * On error:

        * Mark session `status = 'error'` and store `{ code, message }`.
        * Send `event: error` with structured JSON, close.
6. Implement a **keepalive ping** (`event: ping`) every 15 seconds while the connection is open.
7. On client disconnect (`controller.cancel`/`abort`), stop the agent and cleanup timers gracefully.

**Important concurrency and resumability details:**

* Only **one** live generator should run per `session`. If the client reconnects to a still-streaming session, **replay** the current buffer first (from `session.buffer`) and then continue streaming new tokens. (If you can’t queue two consumers to the same generator, prefer the model: one producer writing to the buffer; readers just read what’s available and then receive future writes. If that’s too complex here, allow only a single active SSE connection per session; reject additional GETs with a meaningful SSE error.)
* Do **not** allow new `POST` submissions against a `conv` if there exists a `session` for that `conv` whose status is `'pending'` or `'streaming'`. In that case, return `409` JSON `{ code: 'SESSION_IN_PROGRESS', message: 'Previous request still in progress', session: "<existing-session-id>" }`.

**SSE formatting correctness:**

* Every event must be followed by a blank line.
* For JSON payloads in `data:`, stringify exactly once; for raw token strings, send plain text.
* Never send a non-SSE response once headers declare `text/event-stream`.

---

## 2) Client: `src/routes/+page.svelte`

### 2.1 State and types (Svelte 5)

* Continue to use `$state` for:

    * `messages: Array<{ role: 'user' | 'assistant'; content: string }>`
    * `input: string`
    * `error: { code: string; message: string } | null`
    * `conv: string | null`
    * `session: string | null`
    * `isStreaming: boolean`
* Provide a **derived** UI state: the send button should be **disabled** when `isStreaming === true`.

### 2.2 Local persistence (resumability)

* Persist `{ conv, session, messages }` in `localStorage`:

    * Use keys like `chat:conv`, `chat:session`, `chat:messages`.
    * Update persistence whenever any of these change.
* On component mount:

    * Load persisted `conv`, `session`, and `messages` (if any).
    * If `session` exists, attempt to **resume** by opening the SSE GET to `/api/chat?session=<id>` and set `isStreaming = true`.
    * If no `session`, allow a new message submission.

### 2.3 Submitting a message (two-phase flow)

* On form submit:

    1. If `isStreaming` is `true`, prevent submitting and show a light inline hint: “Model is still responding…”.
    2. Read and trim `input`. If empty → return.
    3. Push `{ role: 'user', content: input }` into `messages`. Clear `input`.
    4. `fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conv, message: userText }) })`
    5. If response is **409** with `{ code: 'SESSION_IN_PROGRESS', session }`, set `session` from the payload and **resume** SSE instead of failing. Do not push duplicate user message.
    6. On 200, read `{ conv, session }` from the JSON. Save in state and localStorage.
    7. Immediately open SSE: `new EventSource(\`/api/chat?session=${session}`)`.
    8. Before opening SSE, push an empty assistant message `{ role: 'assistant', content: '' }` to collect tokens.
    9. Set `isStreaming = true`.

### 2.4 SSE handling

* On `event: token`: append `event.data` to the **last** assistant message.

    * If no assistant placeholder exists yet (e.g., resuming after a refresh), create `{ role: 'assistant', content: '' }` before appending.
* On `event: end`:

    * Close the EventSource, set `isStreaming = false`, set `session = null`, and persist updated state.
* On `event: error`:

    * Parse JSON and show a friendly inline error. Close SSE, set `isStreaming = false`, keep `session = null` (user can send a new message).
* On `event: ping`: do nothing.

**Cleanup:**

* Ensure the EventSource is closed on component destroy or route change.
* Guard against multiple concurrent EventSources: **only one** active instance.

### 2.5 UI behavior

* Keep your current layout/styling.
* The send button must be disabled while `isStreaming` is `true`.
* Show a small status text when streaming (e.g., “Responding…”); do this inline in the footer near the send button.
* Preserve existing error banner handling. Display any server error codes/messages.

### 2.6 Edge cases

* If resuming and the backend reports `status: done` by immediately sending buffered tokens then `end`, the UI should:

    * Append tokens to the assistant message buffer.
    * On `end`, clear `session` and re-enable submit.
* If the user navigates away and back, the component should resume the same way via localStorage.
* If localStorage has `session` but the server has no session (e.g., server restarted), the client should handle an SSE `error` and clear the stale `session`, leaving the messages intact.

---

## 3) Errors and response shapes

### JSON errors (POST)

* `400`: `{ code: 'BAD_REQUEST', message: 'Message is required' }`
* `409`: `{ code: 'SESSION_IN_PROGRESS', message: 'Previous request still in progress', session: "<id>" }`
* `500`: `{ code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' }`

### SSE errors (GET)

* Use `event: error` with JSON payload `{ code, message }` then **close** the stream.

---

## 4) Keepalive and connection stability

* Send `event: ping` every **15s** from the server while `status` is `'pending'` or `'streaming'`.
* The client should simply ignore `ping`.
* Ensure every SSE event ends with a blank line and do not send any non-SSE response once headers are set.

---

## 5) Concurrency rules

* For a given `conv`, only **one** session with status `'pending'` or `'streaming'` may exist.
* If the user attempts another `POST` while one is active:

    * Return `409 SESSION_IN_PROGRESS` with the existing `session` id.
* The client must then reattach to the stream (resume) instead of starting a new one.

---

## 6) Acceptance criteria

1. **POST then GET flow works:** Submitting a message returns `{ conv, session }`. Opening `GET /api/chat?session=...` streams `token` events, then `end`.
2. **Named SSE events:** Tokens use `event: token`; completion uses `event: end`; errors use `event: error`; keepalives use `event: ping`.
3. **Resumable:** If the page refreshes during a stream, the UI reattaches to the **same session** and continues appending tokens to the current assistant message until completion.
4. **No double-submit:** While a session is active, the send button is disabled; a new `POST` yields `409` with the same `session`, and the client resumes instead of queuing a new message.
5. **Buffered replay:** If the client reconnects mid-stream, previously generated tokens are replayed (using `session.buffer`) and then new tokens continue to arrive.
6. **Done state:** If a session is `done`, `GET` immediately streams the buffered text as `token` events, then sends `end`.
7. **Error state:** Agent failures are surfaced as `event: error` and the client unlocks the UI for a new submission.
8. **Svelte 5 / SvelteKit 2 compliant:** Uses `$state` in the page component; server uses SvelteKit route handlers with Web Streams and proper SSE headers.
