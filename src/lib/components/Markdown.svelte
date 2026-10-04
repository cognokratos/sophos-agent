<script lang="ts">
	import { browser } from '$app/environment';
	import { renderMarkdown } from '$lib/markdown';

	const { content, testid } = $props<{ content: string; testid?: string }>();

	// Re-rendered on every streamed token; cheap at chat-message sizes.
	// On the server (no DOM for the sanitizer) the raw text is shown instead.
	const html = $derived(browser ? renderMarkdown(content) : null);
</script>

<div
	class="markdown prose prose-sm max-w-none break-words prose-invert prose-pre:overflow-x-auto prose-pre:bg-gray-900"
	data-testid={testid}
>
	{#if html !== null}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized by DOMPurify in renderMarkdown() -->
		{@html html}
	{:else}
		<p class="whitespace-pre-wrap">{content}</p>
	{/if}
</div>

<style>
	/* Tailwind Typography decorates inline code with backticks and blockquotes with
	   quotation marks; in a chat they read as part of the model's text, so drop them. */
	.markdown :global(:not(pre) > code) {
		border-radius: 0.25rem;
		background-color: rgb(17 24 39); /* gray-900 */
		padding: 0.1rem 0.3rem;
		font-weight: 400;
	}
	.markdown :global(:not(pre) > code::before),
	.markdown :global(:not(pre) > code::after),
	.markdown :global(blockquote p::before),
	.markdown :global(blockquote p::after) {
		content: none;
	}
	.markdown :global(blockquote) {
		border-left-color: rgb(107 114 128); /* gray-500 */
	}
</style>
