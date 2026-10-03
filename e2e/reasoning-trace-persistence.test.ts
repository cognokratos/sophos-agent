import { test, expect } from '@playwright/test';

// The test database (data/test/db) is reset by the webServer command in playwright.config.ts.
const TEST_MESSAGE = 'Hello, this is an E2E test.';

test.describe('Reasoning Trace & Persistence', () => {
	test.beforeEach(async ({ page }) => {
		// Clear all browser storage for a completely clean state
		await page.addInitScript(() => {
			localStorage.clear();
			sessionStorage.clear();
		});

		await page.goto('/');
	});

	test('should display the reasoning trace and persist the conversation durably', async ({
		page
	}) => {
		// 1. Send a message
		await page.getByTestId('new-chat-button').click();
		await page.getByTestId('chat-input').fill(TEST_MESSAGE);
		await page.getByTestId('send-button').click();

		const chatResponse = await page.waitForResponse((r) => {
			return r.request().method() === 'POST' && r.url().includes('/api/chat') && r.ok();
		});
		const { conversation } = await chatResponse.json();
		expect(conversation).toBeTruthy();

		// 2. Verify the reasoning trace UI appears and populates
		const traceSummary = page.getByTestId('reasoning-summary');
		await expect(traceSummary).toBeVisible({ timeout: 30_000 });
		await traceSummary.click();

		const trace = page.getByTestId('reasoning-trace');
		await expect(trace).toBeVisible();
		await expect(trace).toContainText('ENTER');
		await expect(trace).toContainText('agent');
		await expect(trace).toContainText('LEAVE', { timeout: 500_000 });

		// 3. Wait for the run to complete
		await expect(page.getByTestId('status-responding')).not.toBeVisible({ timeout: 500_000 });

		// 4. The conversation is read back from SQLite + the LangGraph thread
		const detail = await (await page.request.get(`/api/conversations/${conversation}`)).json();
		expect(detail.conversation).toMatchObject({ id: conversation, status: 'completed' });
		expect(detail.messages[0]).toMatchObject({ role: 'user', content: TEST_MESSAGE });
		expect(detail.messages.at(-1).role).toBe('assistant');
		expect(detail.messages.at(-1).content.length).toBeGreaterThan(0);
		expect(detail.conversation.messageCount).toBe(detail.messages.length);

		// 5. It survives a page reload
		await page.reload();
		await expect(page.getByTestId('user-message').filter({ hasText: TEST_MESSAGE })).toBeVisible();

		// 6. The checkpoint history is exported as JSON lines
		const history = await (
			await page.request.get(`/api/conversations/${conversation}/export?format=jsonl`)
		).text();
		const checkpoints = history
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line));
		expect(checkpoints.length).toBeGreaterThanOrEqual(2);
		expect(checkpoints.at(-1)).toMatchObject({ next: [], message_count: detail.messages.length });
	});
});
