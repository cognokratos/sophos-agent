<script lang="ts">
	import logo from '$lib/assets/logo.webp?enhanced';

	type Conversation = {
		id: string;
		title: string;
		updatedAt: string | number | Date;
		messageCount: number;
	};

	const {
		conversations = [],
		currentConversation = null,
		loading = false,
		onItemClick = () => {},
		onNewConversation = () => {}
	} = $props<{
		conversations?: Conversation[];
		currentConversation?: string | null;
		loading?: boolean;
		onItemClick?: (id: string) => void;
		onNewConversation?: () => void;
	}>();

	function normalizeDate(value: Conversation['updatedAt']): Date | null {
		if (value instanceof Date) {
			return isNaN(value.getTime()) ? null : value;
		}

		const d = new Date(value);
		return isNaN(d.getTime()) ? null : d;
	}

	function formatDate(date: Date): string {
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays === 0) {
			return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		} else if (diffDays === 1) {
			return 'Yesterday';
		} else if (diffDays < 7) {
			return date.toLocaleDateString([], { weekday: 'short' });
		} else {
			return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
		}
	}

	function handleSelect(id: string) {
		onItemClick(id);
	}

	function handleNewConversation() {
		onNewConversation();
	}
</script>

<div class="flex h-full flex-col" data-testid="conversation-sidebar">
	<div class="border-b border-gray-700 p-4">
		<button
			type="button"
			onclick={handleNewConversation}
			class="flex w-full items-center justify-center rounded bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
			aria-label="Start new conversation"
			data-testid="new-chat-button"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mr-2 h-5 w-5"
				viewBox="0 0 20 20"
				fill="currentColor"
				aria-hidden="true"
			>
				<path
					fill-rule="evenodd"
					d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
					clip-rule="evenodd"
				/>
			</svg>
			New Chat
		</button>
	</div>
	<div class="p-2">
		<enhanced:img src={logo} alt="Sophos Agent logo" class="rounded-2xl shadow shadow-black" />
	</div>
	<div class="flex-1 overflow-y-auto" aria-busy={loading}>
		{#if loading}
			<div class="p-4" role="status" aria-live="polite">
				<div class="flex items-center justify-center space-x-2">
					<div class="h-2 w-2 animate-pulse rounded-full bg-blue-500"></div>
					<div class="h-2 w-2 animate-pulse rounded-full bg-blue-500 [animation-delay:0.2s]"></div>
					<div class="h-2 w-2 animate-pulse rounded-full bg-blue-500 [animation-delay:0.4s]"></div>
				</div>
				<p class="mt-2 text-center text-gray-300">Loading…</p>
			</div>
		{:else if conversations.length === 0}
			<div class="p-4 text-center text-gray-400">
				<p>No conversations yet</p>
			</div>
		{:else}
			<ul class="divide-y divide-gray-700">
				{#each conversations as conversation (conversation.id)}
					{@const updated = normalizeDate(conversation.updatedAt)}
					{@const updatedLabel = updated ? formatDate(updated) : ''}

					<li>
						<button
							type="button"
							onclick={() => handleSelect(conversation.id)}
							class="flex w-full items-start justify-between p-3 text-left transition-colors duration-150 hover:bg-gray-700 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
							class:bg-gray-700={currentConversation === conversation.id}
							aria-current={currentConversation === conversation.id ? 'true' : undefined}
							data-testid="conversation-item"
						>
							<div class="min-w-0 flex-1">
								<div class="truncate font-medium">{conversation.title}</div>
								<div class="mt-1 flex justify-between text-xs text-gray-400">
									<span>{updatedLabel}</span>
									<span>{conversation.messageCount} messages</span>
								</div>
							</div>

							{#if currentConversation === conversation.id}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="ml-2 h-5 w-5 flex-shrink-0 text-green-500"
									viewBox="0 0 20 20"
									fill="currentColor"
									aria-label="Active conversation"
								>
									<path
										fill-rule="evenodd"
										d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.707a1 1 0 00-1.414-1.414L9 10.172 7.707 8.879a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
										clip-rule="evenodd"
									/>
								</svg>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
