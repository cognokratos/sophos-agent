<script lang="ts">
	import type { ApiError } from '$lib/error';

	let messages = $state<{ role: 'user' | 'assistant'; content: string }[]>([]);
	let input = $state('');
	let error = $state<ApiError | null>(null);

	async function handleSubmit(event: Event) {
		event.preventDefault();
		const userMessage = input;
		if (!userMessage) return;

		messages.push({ role: 'user', content: userMessage });
		input = '';
		error = null;

		const response = await fetch('/api/chat', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ message: userMessage })
		});

		if (!response.ok) {
			error = await response.json();
			return;
		}

		const eventSource = new EventSource('/api/chat');
		messages.push({ role: 'assistant', content: '' });

		eventSource.addEventListener('token', (event) => {
			const token = event.data;
			const lastMessage = messages[messages.length - 1];
			if (lastMessage && lastMessage.role === 'assistant') {
				lastMessage.content += token;
			}
		});

		eventSource.addEventListener('end', () => {
			eventSource.close();
		});

		eventSource.onerror = () => {
			error = { code: 'SSE_ERROR', message: 'An error occurred with the connection.' };
			eventSource.close();
		};
	}
</script>

<div class="flex h-screen flex-col bg-gray-900 text-white">
	<header class="bg-gray-800 p-4 shadow-md">
		<h1 class="text-2xl font-bold">Sophos Agent</h1>
	</header>

	<main class="flex-1 overflow-y-auto p-4">
		{#if error}
			<div class="mb-4 rounded-lg bg-red-500 p-4 text-white">
				<p class="font-bold">Error: {error.code}</p>
				{#if error.code === 'MODEL_UNAVAILABLE'}
					<p>
						The required model is not available. Please run the warmup/setup script to download the
						model.
					</p>
				{:else}
					<p>{error.message}</p>
				{/if}
			</div>
		{/if}
		<div class="space-y-4">
			{#each messages as message, i (`message_${i}`)}
				<div class={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
					<div
						class={`max-w-lg rounded-lg px-4 py-2 ${
							message.role === 'user' ? 'bg-blue-600' : 'bg-gray-700'
						}`}
					>
						{message.content}
					</div>
				</div>
			{/each}
		</div>
	</main>

	<footer class="bg-gray-800 p-4">
		<form onsubmit={handleSubmit} class="flex items-center">
			<input
				bind:value={input}
				type="text"
				placeholder="Type your message..."
				class="flex-1 rounded-l-lg bg-gray-700 p-2 focus:outline-none"
			/>
			<button type="submit" class="rounded-r-lg bg-blue-600 p-2 px-4 font-bold"> Send </button>
		</form>
	</footer>
</div>
