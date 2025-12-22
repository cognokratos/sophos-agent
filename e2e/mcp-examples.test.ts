// mcp-examples.test.ts
import { expect, test, type Page } from '@playwright/test';

// Helpers
async function sendMessage(page: Page, text: string) {
	await test.step(`Send message: "${text}"`, async () => {
		await page.getByTestId('chat-input').fill(text);
		await page.getByTestId('send-button').click();
	});
}

async function expectLastAssistantReplyContains(page: Page, text: string, count: number) {
	await test.step(`Expect last assistant reply contains: "${text}"`, async () => {
		const replies = page.getByTestId('assistant-message');
		if ((await replies.count()) === count) {
			await expect(replies.last()).toContainText(text);
		}
	});
}

async function expandTraceAndExpectToolCall(page: Page) {
	await test.step('Expand reasoning trace and expect tool call', async () => {
		// <summary>Reasoning Trace</summary>
		const traceSummary = page.getByTestId('reasoning-summary');

		// Only do this if the trace is actually present
		if (await traceSummary.isVisible()) {
			await traceSummary.click();

			// Wait for the trace container to become visible
			const trace = page.getByTestId('reasoning-trace');
			await expect(trace).toBeVisible();
			await expect(trace).toContainText('tool');
		}
	});
}

// Suite
test.describe('MCP Examples Test', () => {
	test.beforeEach(async ({ page }) => {
		// Clear all browser storage for a completely clean state
		await page.addInitScript(() => {
			localStorage.clear();
			sessionStorage.clear();
		});

		await page.goto('/');
	});

	test('Memory MCP example works correctly and Tool calls appear in reasoning trace', async ({
		page
	}) => {
		// First message: store memory
		await sendMessage(page, 'Remember that my favorite color is blue.');
		await expectLastAssistantReplyContains(page, 'Remember', 1);

		// Second message: retrieve memory
		await sendMessage(page, 'What is my favorite color?');
		await expectLastAssistantReplyContains(page, 'blue', 2);

		// Now open the trace and ensure tool activity is visible
		await expandTraceAndExpectToolCall(page);
	});

	test('Fetch MCP example works correctly and Tool calls appear in reasoning trace', async ({
		page
	}) => {
		// Ask the agent to fetch content from a URL via MCP
		await sendMessage(page, 'Get the content from https://httpbin.org/get');

		// The assistant reply should contain something from httpbin's response
		// (e.g. the string "httpbin"). Playwright will auto-wait for this.
		await expectLastAssistantReplyContains(page, '"Host": "httpbin.org"', 1);
		await expectLastAssistantReplyContains(page, '"url": "https://httpbin.org/get"', 1);

		// Now open the trace and ensure tool activity is visible
		await expandTraceAndExpectToolCall(page);
	});
});
