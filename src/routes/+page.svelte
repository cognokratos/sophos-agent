<script lang="ts">
	import { browser } from '$app/environment';
	import { debounce, safeJsonParse, trimMessages } from '$lib/chat-utils';
	import type { TraceNote } from '$lib/chat';

	// --- Types ---
	type Msg = {
		id: string;
		role: 'user' | 'assistant';
		content: string;
	};

	// --- State ---
	let messages = $state<Msg[]>([]);
	let traceNotes = $state<TraceNote[]>([]);
	let input = $state('');
	let error = $state<{ code: string; message: string } | null>(null);
	let conv = $state<string | null>(null);
	let session = $state<string | null>(null);
	let isStreaming = $state(false);

	let eventSource: EventSource | null = null;
	let chatContainer: HTMLElement;
	let isSseStarting = false;
	let initialized = false;

	// --- Derived state ---
	const isSubmitDisabled = $derived(isStreaming || input.trim() === '');

	// --- Persistence ---
	const CHAT_MESSAGES_KEY = 'chat:messages';
	const CHAT_CONV_KEY = 'chat:conv';
	const CHAT_SESSION_KEY = 'chat:session';

	function persistState() {
		if (!browser) return;
		console.log('persistState: Saving to localStorage', { conv, session, messagesCount: messages.length });
		const trimmed = trimMessages(messages, 50);
		localStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(trimmed));
		if (conv) localStorage.setItem(CHAT_CONV_KEY, conv);
		else localStorage.removeItem(CHAT_CONV_KEY);
		if (session) localStorage.setItem(CHAT_SESSION_KEY, session);
		else localStorage.removeItem(CHAT_SESSION_KEY);
	}

	const debouncedPersist = debounce(persistState, 400);

	function loadFromStorage() {
		if (!browser) return;
		console.log('loadFromStorage: Loading from localStorage...');
		messages = safeJsonParse<Msg[]>(localStorage.getItem(CHAT_MESSAGES_KEY), []);
		conv = localStorage.getItem(CHAT_CONV_KEY);
		session = localStorage.getItem(CHAT_SESSION_KEY);
		console.log('loadFromStorage: Loaded state:', { messagesCount: messages.length, conv, session });
	}

	// --- Effects ---
	$effect(() => {
		if (!browser || initialized) return;
		initialized = true;

		console.log('Effect: Component mounted. Initializing state from localStorage.');
		loadFromStorage();
		if (session) {
			console.log(`Effect: Found session ${session}, resuming.`);
			resumeSession(session);
		}

		return () => {
			console.log('Effect: Component destroying. Closing EventSource.');
			eventSource?.close();
		};
	});

	$effect(() => {
		// This effect will re-run whenever its dependencies (messages, conv, session) change.
		// We debounce the actual writing to localStorage to prevent thrashing.
		console.log('Effect: State changed, debouncing persistence.');
		debouncedPersist();
	});

	$effect(() => {
		if (chatContainer && messages.length) {
			console.log('Effect: Messages changed, auto-scrolling to bottom.');
			chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
		}
	});

	// --- SSE Handling ---
	function appendToken(token: string) {
		const last = messages.at(-1);
		console.log("append token:", token);
		if (last?.role === 'assistant') {
			last.content += token;
		}
	}

	function finalizeStream() {
		console.log('finalizeStream: Closing EventSource, resetting streaming state.');
		eventSource?.close();
		eventSource = null;
		session = null;
		isStreaming = false;
		isSseStarting = false;
		persistState(); // Ensure final state is saved
	}

	function stopStream() {
		console.log('stopStream: User initiated stop.');
		// User-initiated stop clears the session
		finalizeStream();
	}

	function startSse(sessionId: string) {
		if (isSseStarting || eventSource) {
			console.warn('startSse: SSE stream already starting or active. Aborting new start.');
			return;
		}

		isSseStarting = true;
		console.log(`startSse: Starting SSE for session ${sessionId}`);
		eventSource = new EventSource(`/api/chat?session=${encodeURIComponent(sessionId)}`);
		isStreaming = true;
		error = null;

		const lastMessage = messages.at(-1);
		if (!lastMessage || lastMessage.role !== 'assistant') {
			console.log('startSse: Adding new assistant message placeholder.');
			messages.push({ id: crypto.randomUUID(), role: 'assistant', content: '' });
		}

		eventSource.onopen = () => {
			console.log('SSE: Connection opened.');
			isSseStarting = false;
		};

		eventSource.addEventListener('token', e => {
			const data = safeJsonParse(e.data, null);
			if (data) {
				appendToken(data);
			}
		});

		eventSource.addEventListener('trace', (e) => {
			const traceData = safeJsonParse<TraceNote>(e.data, null);
			if (traceData) {
				traceNotes.push(traceData);
			}
		});

		eventSource.onmessage = (e) => {
			console.log('SSE event: message (fallback)', e.data);
			appendToken(e.data); // Fallback
		};

		eventSource.addEventListener('end', e => {
			console.log('SSE event: end. Finalizing stream.', e.lastEventId);
			finalizeStream();
		});

		eventSource.onerror = e => {
			console.error('SSE event: generic error', e);
			if (eventSource?.readyState === EventSource.CONNECTING) {
				console.warn('SSE: Browser is attempting to reconnect, ignoring transient error.');
				return;
			}
			error = { code: 'SSE_ERROR', message: 'Connection failed.' };
			finalizeStream();
		};

		eventSource.addEventListener('ping', () => {
			console.log('SSE event: ping');
		});
	}

	function resumeSession(sessionId: string) {
		console.log(`resumeSession: Attempting to resume session: ${sessionId}`);
		startSse(sessionId); // Last-Event-ID handled by the browser automatically
	}

	async function handleSubmit(event: Event) {
		event.preventDefault();
		if (isSubmitDisabled) {
			console.warn('handleSubmit: Submit blocked: streaming or input empty.');
			return;
		}

		traceNotes = []; // Clear previous traces
		const userMessageText = input.trim();
		const originalInput = input;
		input = '';

		console.log(`handleSubmit: Submitting message: "${userMessageText}" for conv: ${conv}`);
		messages.push({ id: crypto.randomUUID(), role: 'user', content: userMessageText });

		const controller = new AbortController();
		const timeoutId = setTimeout(() => {
			console.warn('handleSubmit: POST request timed out.');
			controller.abort();
		}, 30000);

		try {
			const response = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: userMessageText, conv: conv }),
				signal: controller.signal
			});
			clearTimeout(timeoutId);

			console.log('handleSubmit: POST /api/chat response status:', response.status);

			if (response.status === 409) {
				const data = await response.json();
				if (data.session) {
					console.log(`handleSubmit: Got 409, session ${data.session} already in progress. Resuming.`);
					session = data.session;
					resumeSession(data.session);
					return;
				}
			}

			if (!response.ok) {
				let errJson;
				try {
					errJson = await response.json();
					console.error('handleSubmit: POST error response JSON:', errJson);
				} catch (e) {
					console.error('handleSubmit: POST error response not JSON:', e);
					// Ignore if body is not JSON
				}
				error = errJson?.error || { code: `HTTP_${response.status}`, message: response.statusText };
				console.error('handleSubmit: Submit failed:', error);
				messages.pop();
				input = originalInput; // Restore input on error
				return;
			}

			const data = await response.json();
			console.log('handleSubmit: POST /api/chat successful, data:', data);
			conv = data.conv;
			session = data.session;
			startSse(data.session);
		} catch (e) {
			clearTimeout(timeoutId);
			console.error('handleSubmit: Fetch failed:', e);
			error = { code: 'FETCH_ERROR', message: 'Failed to connect to the server.' };
			messages.pop();
			input = originalInput; // Restore input on error
		}
	}
</script>

<div class="flex h-screen flex-col bg-gray-900 text-white">
	<header class="bg-gray-800 p-4 shadow-md">
		<h1 class="text-2xl font-bold">Sophos Agent</h1>
	</header>

	<main bind:this={chatContainer} class="flex-1 overflow-y-auto p-4">
		{#if error}
			<div class="mb-4 rounded-lg bg-red-500 p-4 text-white">
				<p class="font-bold">Error: {error.code}</p>
				<p>{error.message}</p>
			</div>
		{/if}
		<div class="space-y-4">
			{#each messages as message (message.id)}
				<div class={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
					<div
						class={`max-w-5/6 w-fit rounded-lg px-4 py-2 ${
							message.role === 'user' ? 'bg-blue-600 text-right' : 'bg-gray-700'
						}`}
					>
						<pre class="whitespace-pre-wrap font-sans">{message.content.replaceAll('<br>', '\n')}</pre>
					</div>
				</div>
			{/each}
		</div>
	</main>

	{#if traceNotes.length > 0}
		<div class="border-t border-gray-700 bg-gray-800 p-4">
			<details>
				<summary class="cursor-pointer font-bold">Reasoning Trace</summary>
				<div class="mt-2 space-y-1 text-sm text-gray-400">
					{#each traceNotes as note}
						<div>
							<span class="font-mono rounded bg-gray-700 px-1 py-0.5 text-xs">{note.event.toUpperCase()}</span>
							<span class="ml-2 font-semibold">{note.node}</span>
						</div>
					{/each}
				</div>
			</details>
		</div>
	{/if}

	<footer class="bg-gray-800 p-4">
		<form onsubmit={handleSubmit} class="flex items-center">
			<input
				bind:value={input}
				type="text"
				placeholder="Type your message..."
				class="flex-1 rounded-l-lg bg-gray-700 p-2 focus:outline-none disabled:opacity-50"
				disabled={isStreaming}
				aria-label="Chat input"
			/>
			{#if isStreaming}
				<button
					type="button"
					onclick={stopStream}
					class="rounded-r-lg bg-red-600 p-2 px-4 font-bold hover:bg-red-700"
					aria-label="Stop generating response"
				>
					Stop
				</button>
			{:else}
				<button
					type="submit"
					class="rounded-r-lg bg-blue-600 p-2 px-4 font-bold disabled:bg-gray-500"
					disabled={isSubmitDisabled}
					aria-label="Send message"
				>
					Send
				</button>
			{/if}
		</form>
		{#if isStreaming}
			<p class="pt-2 text-center text-sm text-gray-400">Responding...</p>
		{/if}
	</footer>
</div>
