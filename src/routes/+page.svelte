<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { safeJsonParse, parseUuid } from '$lib/utils';
	import type {
		ChatError,
		ConversationDetail,
		ConversationSummary,
		MessageDto,
		TraceNote
	} from '$lib/chat';
	import type { UUID } from 'crypto';
	import ConversationList from '$lib/components/ConversationList.svelte';
	import TraceNoteList from '$lib/components/TraceNoteList.svelte';

	import bg from '$lib/assets/bg.webp?enhanced';

	// --- State ---
	// `messages` mirrors the conversation's LangGraph thread (GET /api/conversations/:id).
	// While a run streams, tokens and tool results are appended locally; when the
	// run ends the conversation is reloaded, so the server stays the source of truth.
	let messages = $state<MessageDto[]>([]);
	let last = $derived(messages.at(-1));
	let traceNotes = $state<TraceNote[]>([]);
	let input = $state('');
	let error = $state<{ code: string; message: string } | null>(null);
	let conversation = $state<UUID | null>(null);
	let resumable = $state(false);
	let isStreaming = $state(false);
	let isLoadingHistory = $state(false);
	let conversations = $state<ConversationSummary[]>([]);
	let isLoadingConversations = $state(false);

	let eventSource: EventSource | null = null;
	let chatContainer: HTMLElement;
	let initialized = false;
	let liveId = 0;

	// --- Derived state ---
	const isSubmitDisabled = $derived(isStreaming || input.trim() === '');

	// --- Effects ---
	$effect(() => {
		if (!browser || initialized) return;
		initialized = true;

		loadConversationHistory();

		return () => {
			eventSource?.close();
		};
	});

	$effect(() => {
		if (chatContainer && messages.length) {
			chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
		}
	});

	// --- Load conversation list ---
	async function loadConversations(): Promise<ConversationSummary[]> {
		if (!browser) return [];
		isLoadingConversations = true;
		try {
			const response = await fetch('/api/conversations');
			if (!response.ok) {
				throw new Error(`Failed to get conversations: ${response.status}`);
			}
			conversations = (await response.json()).conversations;
		} catch (err) {
			console.error('loadConversations:', err);
			error = { code: 'LOAD_CONVERSATIONS_ERROR', message: 'Failed to load conversations' };
		} finally {
			isLoadingConversations = false;
		}
		return conversations;
	}

	// --- Open the most recent conversation on start ---
	async function loadConversationHistory() {
		const list = await loadConversations();
		const mostRecent = parseUuid(list[0]?.id ?? null);
		if (mostRecent) {
			await loadConversation(mostRecent);
		}
	}

	// --- Load a conversation from durable state ---
	async function loadConversation(conversationId: UUID) {
		if (!browser) return;
		isLoadingHistory = true;
		try {
			const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`);
			if (!response.ok) {
				throw new Error(`Failed to load conversation: ${response.status}`);
			}
			const detail: ConversationDetail = await response.json();
			messages = detail.messages;
			conversation = conversationId;
			resumable = detail.resumable;
			if (detail.conversation.status === 'failed' && detail.conversation.error) {
				error = detail.conversation.error;
			}
			if (detail.conversation.status === 'running') {
				startSse(conversationId); // a run is in progress: attach to its stream
			}
		} catch (err) {
			console.error('loadConversation:', err);
			error = { code: 'LOAD_CONVERSATION_ERROR', message: 'Failed to load conversation' };
		} finally {
			isLoadingHistory = false;
		}
	}

	// --- Live updates while a run streams ---
	function appendToken(token: string) {
		if (last?.role === 'assistant' && !last.toolCalls?.length) {
			last.content += token;
		} else {
			messages.push({ id: `live_${++liveId}`, role: 'assistant', content: token });
		}
	}

	function onTrace(note: TraceNote) {
		traceNotes.push(note);
		const data = note.data ?? {};
		if (note.event === 'call') {
			const call = { id: String(data.tool_call_id ?? ''), name: String(data.name), args: {} };
			if (last?.role === 'assistant') {
				last.toolCalls = [...(last.toolCalls ?? []), call];
			} else {
				messages.push({
					id: `live_${++liveId}`,
					role: 'assistant',
					content: '',
					toolCalls: [call]
				});
			}
		} else if (note.event === 'result') {
			messages.push({
				id: `live_${++liveId}`,
				role: 'tool',
				name: String(data.name),
				toolCallId: String(data.tool_call_id),
				content: String(data.result ?? '')
			});
		}
	}

	function closeStream() {
		eventSource?.close();
		eventSource = null;
		isStreaming = false;
	}

	/** The run finished (or failed): reload the authoritative conversation state. */
	async function finishStream() {
		closeStream();
		await loadConversations();
		if (conversation) {
			await loadConversation(conversation);
		}
	}

	function startSse(conversationId: UUID) {
		if (eventSource) return;

		eventSource = new EventSource(`/api/chat?conversation=${encodeURIComponent(conversationId)}`);
		isStreaming = true;
		resumable = false;
		error = null;

		eventSource.addEventListener('token', (e) => {
			const data = safeJsonParse<string>(e.data, '');
			if (data) appendToken(data);
		});

		eventSource.addEventListener('trace', (e) => {
			const note = safeJsonParse<TraceNote | null>(e.data, null);
			if (note) onTrace(note);
		});

		eventSource.addEventListener('end', () => {
			finishStream();
		});

		eventSource.addEventListener('chat-error', (e) => {
			error = safeJsonParse<ChatError | null>(e.data, null) ?? {
				code: 'UNKNOWN_ERROR',
				message: 'Unknown error.'
			};
			finishStream();
		});

		eventSource.onerror = () => {
			if (eventSource?.readyState === EventSource.CONNECTING) {
				return; // the browser reconnects and resumes with Last-Event-ID
			}
			error = { code: 'SSE_ERROR', message: 'Connection failed.' };
			closeStream();
		};
	}

	// --- Start a run ---
	async function postRun(body: { message?: string; resume?: boolean }): Promise<boolean> {
		const response = await fetch('/api/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ conversation, ...body })
		});
		const data = await response.json().catch(() => null);

		if (!response.ok) {
			if (data?.error?.code === 'SESSION_IN_PROGRESS' && conversation) {
				startSse(conversation);
				return false;
			}
			error = data?.error ?? { code: `HTTP_${response.status}`, message: response.statusText };
			return false;
		}

		conversation = parseUuid(data.conversation);
		await loadConversations();
		return true;
	}

	async function handleSubmit(event: Event) {
		event.preventDefault();
		if (isSubmitDisabled) return;

		traceNotes = [];
		const text = input.trim();
		input = '';
		error = null;

		try {
			if (await postRun({ message: text })) {
				messages.push({ id: `live_${++liveId}`, role: 'user', content: text });
				if (conversation) startSse(conversation);
			} else {
				input = text; // restore input on error
			}
		} catch (e) {
			console.error('handleSubmit:', e);
			error = { code: 'FETCH_ERROR', message: 'Failed to connect to the server.' };
			input = text;
		}
	}

	async function resumeRun() {
		traceNotes = [];
		error = null;
		try {
			if ((await postRun({ resume: true })) && conversation) {
				startSse(conversation);
			}
		} catch (e) {
			console.error('resumeRun:', e);
			error = { code: 'FETCH_ERROR', message: 'Failed to connect to the server.' };
		}
	}

	async function startNewConversation() {
		clearChatState();
		conversation = null;
		await loadConversations();
	}

	function handleConversationSelect(id: string) {
		clearChatState();
		const conversationId = parseUuid(id);
		if (conversationId) {
			loadConversation(conversationId);
		}
	}

	function clearChatState() {
		closeStream();
		messages = [];
		traceNotes = [];
		input = '';
		error = null;
		resumable = false;
	}
</script>

<div class="flex h-screen bg-[#010b18] text-white">
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
		<header class="bg-gray-800 p-5 shadow-md">
			<div class="flex items-center justify-between">
				<h1 class="text-2xl font-bold">Σοφός Agent</h1>
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
					{#if conversation}
						<a
							class="ml-2 underline hover:text-gray-200"
							href={resolve('/api/conversations/[conversationId]/export', {
								conversationId: conversation
							})}
							data-testid="export-link">Export</a
						>
					{/if}
				</h2>
			</div>
		</header>

		<main bind:this={chatContainer} class="relative flex-1 overflow-y-auto p-4">
			<!-- background layer -->
			<div class="absolute inset-0 z-0 h-full">
				<enhanced:img
					src={bg}
					alt="Sophos Agent Background"
					aria-hidden="true"
					sizes="100vw"
					class="h-full w-full object-cover"
				/>
				<!-- optional dark overlay for readability -->
				<div class="absolute inset-0 bg-black/70"></div>
			</div>

			<!-- foreground content -->
			<div class="relative z-10">
				<!-- everything that was already inside main goes here -->
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
					{#if resumable && !isStreaming}
						<div
							class="mb-4 flex items-center justify-between rounded-lg bg-amber-700 p-4"
							data-testid="resume-banner"
						>
							<p>The last run stopped before it finished. Its progress is saved.</p>
							<button
								type="button"
								onclick={resumeRun}
								class="ml-4 rounded bg-amber-500 px-3 py-1 font-bold hover:bg-amber-400"
								data-testid="resume-button">Resume</button
							>
						</div>
					{/if}
					<div class="space-y-4">
						{#each messages as message (message.id)}
							{#if message.role === 'tool'}
								<details
									class="w-fit max-w-5/6 rounded-lg border border-gray-600 bg-gray-800/80 px-3 py-1 text-sm text-gray-300"
									data-testid="tool-message"
								>
									<summary class="cursor-pointer font-mono"
										>{message.status === 'error' ? '⚠' : '🔧'} {message.name}</summary
									>
									<pre
										class="mt-1 max-h-64 overflow-auto font-mono text-xs whitespace-pre-wrap">{message.content}</pre>
								</details>
							{:else if message.content || message.toolCalls?.length}
								<div class={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
									<div
										class={`w-fit max-w-5/6 rounded-lg px-4 py-2 ${
											message.role === 'user' ? 'bg-blue-600 text-right' : 'bg-gray-700'
										}`}
									>
										{#if message.content}
											<p
												class="font-sans whitespace-pre-wrap"
												data-testid={message.role === 'user' ? 'user-message' : 'assistant-message'}
											>
												{message.content.trim().replaceAll('<br>', '\n')}
											</p>
										{/if}
										{#each message.toolCalls ?? [] as call, i (`${message.id}_${i}`)}
											<p class="font-mono text-xs text-gray-300" data-testid="tool-call">
												→ {call.name}
											</p>
										{/each}
									</div>
								</div>
							{/if}
						{/each}
						{#if isStreaming && last?.role !== 'assistant'}
							<div
								class="flex w-fit items-center justify-start space-x-1 rounded-lg bg-gray-700 px-4 py-2"
								data-testid="assistant-pending"
							>
								<span class="h-2 w-2 animate-pulse rounded-full bg-blue-500"></span>
								<span class="h-2 w-2 animate-pulse rounded-full bg-blue-500 [animation-delay:0.2s]"
								></span>
								<span class="h-2 w-2 animate-pulse rounded-full bg-blue-500 [animation-delay:0.4s]"
								></span>
							</div>
						{/if}
					</div>
				{/if}
			</div>
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
						onclick={closeStream}
						class="rounded-r-lg bg-red-600 p-2 px-4 font-bold hover:bg-red-700"
						aria-label="Stop following the response (the run continues on the server)"
						title="Stops following the response. The run itself continues on the server."
					>
						Detach
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
