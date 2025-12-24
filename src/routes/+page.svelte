<script lang="ts">
	import { browser } from '$app/environment';
	import { safeJsonParse, parseUuid } from '$lib/utils';
	import { type TraceNote, formatTraceNote } from '$lib/chat';
	import type { UUID } from 'crypto';

	// --- Types ---
	type Msg = {
		id: string;
		role: 'user' | 'assistant';
		content: string;
	};

	// --- State ---
	let messages = $state<Msg[]>([]);
	let last = $derived(messages.at(-1));
	let traceNotes = $state<TraceNote[]>([]);
	let input = $state('');
	let error = $state<{ code: string; message: string } | null>(null);
	let conversation = $state<UUID | null>(null);
	let isStreaming = $state(false);
	let isLoadingHistory = $state(false);

	let eventSource: EventSource | null = null;
	let chatContainer: HTMLElement;
	let isSseStarting = false;
	let initialized = false;

	// --- Derived state ---
	const isSubmitDisabled = $derived(isStreaming || input.trim() === '');

	// --- Effects ---
	$effect(() => {
		if (!browser || initialized) return;
		initialized = true;

		console.log('Effect: Component mounted. Loading conversation history.');
		loadConversationHistory();

		return () => {
			console.log('Effect: Component destroying. Closing EventSource.');
			eventSource?.close();
		};
	});

	$effect(() => {
		if (chatContainer && messages.length) {
			console.log('Effect: Messages changed, auto-scrolling to bottom.');
			chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
		}
	});

	// --- Load conversation history ---
	async function loadConversationHistory() {
		if (!browser) return;

		console.log('loadConversationHistory: Attempting to load most recent conversation...');
		isLoadingHistory = true;

		try {
			// First, get the most recent conversation ID
			const recentResponse = await fetch('/api/conversations');
			if (!recentResponse.ok) {
				throw new Error(`Failed to get recent conversation: ${recentResponse.status}`);
			}

			const { conversationId } = await recentResponse.json();

			if (conversationId) {
				console.log(`loadConversationHistory: Found recent conversation: ${conversationId}`);

				// Load the messages from the conversation
				const messagesResponse = await fetch(
					`/api/conversations/${encodeURIComponent(conversationId)}`
				);
				if (!messagesResponse.ok) {
					throw new Error(`Failed to load conversation: ${messagesResponse.status}`);
				}

				const { messages: loadedMessages } = await messagesResponse.json();

				// Update state with loaded messages
				messages = loadedMessages.map((msg: Msg, index: number) => ({
					id: `message_${index}`,
					role: msg.role,
					content: msg.content
				}));

				conversation = parseUuid(conversationId);
				console.log(
					`loadConversationHistory: Loaded ${loadedMessages.length} messages from conversation: ${conversation}`
				);
				if (last?.role === 'user') {
					resumeSession(conversation);
				}
			} else {
				console.log('loadConversationHistory: No recent conversation found, starting fresh');
				messages = [];
				conversation = null;
			}
		} catch (err) {
			console.error('loadConversationHistory: Error loading conversation history:', err);
			error = { code: 'LOAD_HISTORY_ERROR', message: 'Failed to load conversation history' };
		} finally {
			isLoadingHistory = false;
		}
	}

	// --- SSE Handling ---
	function appendToken(token: string) {
		if (last?.role === 'assistant') {
			last.content += token;
		}
	}

	function finalizeStream() {
		console.log('finalizeStream: Closing EventSource, resetting streaming state.');
		eventSource?.close();
		eventSource = null;
		isStreaming = false;
		isSseStarting = false;
	}

	function stopStream() {
		console.log('stopStream: User initiated stop.');
		// User-initiated stop clears the session
		finalizeStream();
	}

	function startSse(conversationId: UUID) {
		if (isSseStarting || eventSource) {
			console.warn('startSse: SSE stream already starting or active. Aborting new start.');
			return;
		}

		isSseStarting = true;
		console.log(`startSse: Starting SSE for conversation ${conversationId}`);
		eventSource = new EventSource(`/api/chat?conversation=${encodeURIComponent(conversationId)}`);
		isStreaming = true;
		error = null;

		if (last?.role !== 'assistant') {
			console.log('startSse: Adding new assistant message placeholder.');
			messages.push({ id: `message_${messages.length}`, role: 'assistant', content: '' });
		}

		eventSource.onopen = () => {
			console.log('SSE: Connection opened.');
			isSseStarting = false;
		};

		eventSource.addEventListener('token', (e) => {
			const data = safeJsonParse(e.data, null);
			if (data) {
				appendToken(data);
			}
		});

		eventSource.addEventListener('trace', (e) => {
			const traceData = safeJsonParse<TraceNote | null>(e.data, null);
			if (!traceData) {
				return;
			}
			traceNotes.push(traceData);
			appendToken(formatTraceNote(traceData));
		});

		eventSource.onmessage = (e) => {
			console.log('SSE event: message (fallback)', e.data);
			appendToken(e.data); // Fallback
		};

		eventSource.addEventListener('end', (e) => {
			console.log('SSE event: end. Finalizing stream.', e.lastEventId);
			finalizeStream();
		});

		eventSource.onerror = (e) => {
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

	function resumeSession(conversationId: UUID) {
		console.log(`resumeSession: Attempting to resume conversation: ${conversationId}`);
		startSse(conversationId); // Last-Event-ID handled by the browser automatically
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

		console.log(
			`handleSubmit: Submitting message: "${userMessageText}" for conversation: "${conversation}"`
		);

		const controller = new AbortController();
		const timeoutId = setTimeout(() => {
			console.warn('handleSubmit: POST request timed out.');
			controller.abort();
		}, 30000);

		try {
			const response = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ conversation, message: userMessageText }),
				signal: controller.signal
			});
			clearTimeout(timeoutId);

			console.log('handleSubmit: POST /api/chat response status:', response.status);

			if (response.status === 409) {
				if (conversation) {
					console.log(
						`handleSubmit: Got 409, conversation ${conversation} already in progress. Resuming.`
					);
					resumeSession(conversation);
				}
				return;
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
			conversation = parseUuid(data.conversation);
			messages.push({ id: `message_${messages.length}`, role: 'user', content: userMessageText });

			startSse(conversation);
		} catch (e) {
			clearTimeout(timeoutId);
			console.error('handleSubmit: Fetch failed:', e);
			error = { code: 'FETCH_ERROR', message: 'Failed to connect to the server.' };
			messages.pop();
			input = originalInput; // Restore input on error
		}
	}

	async function startNewConversation() {
		console.log('startNewConversation: Initiating new conversation...');

		// Close any existing SSE connection
		if (eventSource) {
			console.log('startNewConversation: Closing existing SSE connection.');
			eventSource.close();
			eventSource = null;
		}

		// Clear the current chat state
		messages = [];
		traceNotes = [];
		input = '';
		error = null;
		isStreaming = false;
		isSseStarting = false;

		// Reset conversation to null to indicate a new, unsaved conversation
		conversation = null;

		console.log('startNewConversation: Conversation state reset. Ready for new conversation.');
	}
</script>

<div class="flex h-screen flex-col bg-gray-900 text-white">
	<header class="bg-gray-800 p-4 shadow-md">
		<div class="flex justify-between items-center">
			<h1 class="text-2xl font-bold">Sophos Agent</h1>
			<button
				onclick={startNewConversation}
				class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
				aria-label="Start new conversation"
				data-testid="new-chat-button"
			>
				New Chat
			</button>
		</div>
		<p data-testid="conversation-id">{conversation ?? 'New conversation'}</p>
	</header>

	<main bind:this={chatContainer} class="flex-1 overflow-y-auto p-4">
		{#if isLoadingHistory}
			<div class="flex h-full flex-col items-center justify-center">
				<div class="mb-4 flex items-center justify-center space-x-2">
					<span class="h-3 w-3 animate-pulse rounded-full bg-blue-500"></span>
					<span class="h-3 w-3 animate-pulse rounded-full bg-blue-500 [animation-delay:0.2s]"
					></span>
					<span class="h-3 w-3 animate-pulse rounded-full bg-blue-500 [animation-delay:0.4s]"
					></span>
				</div>
				<p class="text-gray-400">Loading your conversation history...</p>
			</div>
		{:else}
			{#if error}
				<div class="mb-4 rounded-lg bg-red-500 p-4 text-white">
					<p class="font-bold">Error: {error.code}</p>
					<p>{error.message}</p>
				</div>
			{/if}
			<div class="space-y-4">
				{#each messages as message (message.id)}
					{#if message.content}
						<div class={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
							<div
								class={`w-fit max-w-5/6 rounded-lg px-4 py-2 ${
									message.role === 'user' ? 'bg-blue-600 text-right' : 'bg-gray-700'
								}`}
							>
								<p
									class="font-sans whitespace-pre-wrap"
									data-testid={message.role === 'user' ? 'user-message' : 'assistant-message'}
								>
									{message.content.trim().replaceAll('<br>', '\n')}
								</p>
							</div>
						</div>
					{:else}
						<div
							class="flex w-fit items-center justify-start space-x-1 rounded-lg bg-gray-700 px-4 py-2"
						>
							<span class="h-2 w-2 animate-pulse rounded-full bg-blue-500"></span>
							<span class="h-2 w-2 animate-pulse rounded-full bg-blue-500 [animation-delay:0.2s]"
							></span>
							<span class="h-2 w-2 animate-pulse rounded-full bg-blue-500 [animation-delay:0.4s]"
							></span>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</main>

	{#if traceNotes.length > 0}
		<div class="border-t border-gray-700 bg-gray-800 p-4">
			<details>
				<summary class="cursor-pointer font-bold" data-testid="reasoning-summary"
					>Reasoning Trace</summary
				>
				<div class="mt-2 space-y-1 text-sm text-gray-400" data-testid="reasoning-trace">
					{#each traceNotes as note, i (`note_${i}`)}
						<div>
							<span class="rounded bg-gray-700 px-1 py-0.5 font-mono text-xs"
								>{note.event.toUpperCase()}</span
							>
							<span class="ml-2 font-semibold">{note.node}</span>
							{#each Object.entries(note.data ?? {}) as [key, value], i (`note_entry_${key}_${i}`)}
								{#if String(value).length < 10}
									<span>[{key}: {value}]</span>
								{/if}
							{/each}
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
				data-testid="chat-input"
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
					data-testid="send-button"
				>
					Send
				</button>
			{/if}
		</form>
		{#if isStreaming}
			<p class="pt-2 text-center text-sm text-gray-400" data-testid="status-responding">
				Responding...
			</p>
		{/if}
	</footer>
</div>
