<script lang="ts">
	import { browser } from '$app/environment';
	import { safeJsonParse, parseUuid } from '$lib/utils';
	import { type ChatError, type TraceNote } from '$lib/chat';
	import type { UUID } from 'crypto';
	import ConversationList from '$lib/components/ConversationList.svelte';
	import type { ConversationMetadata } from '$lib/agent/persistence';
	import TraceNoteList from '$lib/components/TraceNoteList.svelte';

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
	let conversations = $state<ConversationMetadata[]>([]);
	let isLoadingConversations = $state(false);

	let eventSource: EventSource | null = null;
	let chatContainer: HTMLElement;
	let isSseStarting = $state(false);
	let initialized = false;

	// --- Derived state ---
	const isSubmitDisabled = $derived(isStreaming || input.trim() === '');

	// --- Effects ---
	$effect(() => {
		if (!browser || initialized) return;
		initialized = true;

		console.log('Effect: Component mounted. Loading conversation history.');
		loadConversations();
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

	// Update conversation list when new conversation is created
	$effect(() => {
		if (conversation && !conversations.some((c) => c.id === conversation)) {
			// If this is a new conversation not in the list, reload the list
			loadConversations();
		}
	});

	// --- Load conversation list ---
	async function loadConversations() {
		if (!browser) return;

		console.log('loadConversations: Attempting to load conversation list...');
		isLoadingConversations = true;

		try {
			const response = await fetch('/api/conversations');
			if (!response.ok) {
				throw new Error(`Failed to get conversations: ${response.status}`);
			}

			const { conversations: convList } = await response.json();
			conversations = convList.map((conv: ConversationMetadata) => ({
				...conv,
				updatedAt: new Date(conv.updatedAt)
			}));

			console.log(`loadConversations: Loaded ${conversations.length} conversations`);
		} catch (err) {
			console.error('loadConversations: Error loading conversations:', err);
			error = { code: 'LOAD_CONVERSATIONS_ERROR', message: 'Failed to load conversations' };
		} finally {
			isLoadingConversations = false;
		}
	}

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

			const { conversations: convList } = await recentResponse.json();
			const mostRecent = convList.length > 0 ? convList[0] : null;

			if (mostRecent) {
				console.log(`loadConversationHistory: Found most recent conversation: ${mostRecent.id}`);

				// Load the messages from the conversation
				await loadConversation(mostRecent.id);
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

	// --- Load specific conversation ---
	async function loadConversation(conversationId: UUID) {
		if (!browser) return;

		console.log(`loadConversation: Loading conversation: ${conversationId}`);
		isLoadingHistory = true;

		try {
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
				`loadConversation: Loaded ${loadedMessages.length} messages from conversation: ${conversation}`
			);
			if (conversation && last?.role === 'user') {
				resumeSession(conversation);
			}
		} catch (err) {
			console.error('loadConversation: Error loading conversation:', err);
			error = { code: 'LOAD_CONVERSATION_ERROR', message: 'Failed to load conversation' };
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
		loadConversations();
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
			const data = safeJsonParse<string>(e.data, '');
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
		});

		eventSource.onmessage = (e) => {
			console.log('SSE event: message (fallback)', e.data);
			appendToken(e.data); // Fallback
		};

		eventSource.addEventListener('end', (e) => {
			console.log('SSE event: end. Finalizing stream.', e.lastEventId);
			finalizeStream();
		});

		eventSource.addEventListener('chat-error', (e) => {
			console.error('SSE event: chat error', e);
			const err = safeJsonParse<ChatError | null>(e.data, null);
			error = err ?? { code: 'UNKNOWN_ERROR', message: 'Unknown error.' };
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

			// Add the user message to the conversation
			messages.push({ id: `message_${messages.length}`, role: 'user', content: userMessageText });

			// Update conversation list to reflect the new conversation
			await loadConversations();
			if (conversation) {
				startSse(conversation);
			}
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

		clearChatState();

		// Reset conversation to null to indicate a new, unsaved conversation
		conversation = null;

		// Reload the conversation list to update UI
		await loadConversations();

		console.log('startNewConversation: Conversation state reset. Ready for new conversation.');
	}

	// Handle conversation selection
	function handleConversationSelect(id: string) {
		console.log(`handleConversationSelect: Selected conversation: ${id}`);
		clearChatState();
		const conversationId = parseUuid(id);
		if (conversationId) {
			loadConversation(conversationId);
		}
	}

	function clearChatState() {
		console.log('clearChatState: Clearing chat state.');

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
	}
</script>

<div class="flex h-screen bg-gray-900 text-white">
	<!-- Conversation List Sidebar -->
	<div class="flex w-64 flex-col border-r border-gray-700 bg-gray-800">
		<ConversationList
			{conversations}
			currentConversation={conversation}
			loading={isLoadingConversations}
			onItemClick={handleConversationSelect}
			onNewConversation={startNewConversation}
		/>

		{#if traceNotes.length > 0}
			<TraceNoteList {traceNotes} />
		{/if}
	</div>

	<!-- Main Chat Area -->
	<div class="flex flex-1 flex-col">
		<header class="bg-gray-800 p-4 shadow-md">
			<div class="flex items-center justify-between">
				<h1 class="text-2xl font-bold">Sophos Agent</h1>
				{#if isStreaming}
					<h3 class="pt-2 text-center text-sm text-gray-200" data-testid="status-responding">
						Responding...
					</h3>
				{/if}
				<h2 class="text-sm text-gray-400">
					{conversation
						? 'Current: ' +
							(conversations.find((c) => c.id === conversation)?.title || conversation)
						: 'New conversation'}
				</h2>
			</div>
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
					<p class="text-gray-400">Loading conversation...</p>
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
		</footer>
	</div>
</div>
