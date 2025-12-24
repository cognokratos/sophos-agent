import { page } from '@vitest/browser/context';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('/+page.svelte', () => {
	it('should render h1', async () => {
		render(Page);

		const heading = page.getByRole('heading', { level: 1 });
		await expect.element(heading).toBeInTheDocument();
	});

	it('should render new chat button', async () => {
		render(Page);

		const newChatButton = page.getByTestId('new-chat-button');
		await expect.element(newChatButton).toBeInTheDocument();
		expect(newChatButton).toHaveTextContent('New Chat');
	});

	it('should have correct accessibility attributes for new chat button', async () => {
		render(Page);

		const newChatButton = page.getByTestId('new-chat-button');
		await expect.element(newChatButton).toHaveAttribute('aria-label', 'Start new conversation');
	});
});
