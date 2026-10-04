import { test, expect } from '@playwright/test';

// The test database (data/test/db) is reset by the webServer command in playwright.config.ts.
const TEST_MESSAGE = 'Get the content from https://httpbin.org/get';

test.describe('Tool Call Persistence', () => {
	test.beforeEach(async ({ page }) => {
		// Clear all browser storage for a completely clean state
		await page.addInitScript(() => {
			localStorage.clear();
			sessionStorage.clear();
		});

		await page.goto('/');
	});

	test('should persist tool calls and results in the LangGraph thread', async ({ page }) => {
		// 1. Send a message that will trigger a tool call (fetch URL)
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
		await expect(traceSummary).toBeVisible({ timeout: 50_000 });
		await traceSummary.click();

		const trace = page.getByTestId('reasoning-trace');
		await expect(trace).toBeVisible();
		await expect(trace).toContainText('ENTER');
		await expect(trace).toContainText('agent');
		await expect(trace).toContainText('qwen3');

		// 3. Wait for the run to complete
		await expect(page.getByTestId('status-responding')).not.toBeVisible({ timeout: 500_000 });

		// 4. Tool calls and results are part of the persisted thread
		const detail = await (await page.request.get(`/api/conversations/${conversation}`)).json();
		const callMessage = detail.messages.find(
			(m: { role: string; toolCalls?: unknown[] }) => m.role === 'assistant' && m.toolCalls?.length
		);
		const toolMessage = detail.messages.find((m: { role: string }) => m.role === 'tool');

		expect(callMessage.toolCalls[0].name).toBe('fetch__fetch');
		expect(toolMessage).toMatchObject({
			name: 'fetch__fetch',
			toolCallId: callMessage.toolCalls[0].id
		});
		expect(toolMessage.content).toContain('httpbin.org');

		// 5. ...and shown again after a reload
		await page.reload();
		await expect(page.getByTestId('tool-message').first()).toContainText('fetch__fetch');

		// 6. The Markdown export is generated from that state
		const markdown = await (
			await page.request.get(`/api/conversations/${conversation}/export`)
		).text();
		expect(markdown).toContain('**Tool call** `fetch__fetch`');
		expect(markdown).toContain('### Tool result: `fetch__fetch`');
	});
});
