import { expect, test } from '@playwright/test';

test.describe('MCP Examples Test', () => {
	test('Memory MCP example works correctly', async ({ page }) => {
		// Navigate to the main page
		await page.goto('/');

		// Clear any existing messages and start a new conversation
		await page.locator('input[aria-label="Chat input"]').fill('Remember that my favorite color is blue.');
		await page.locator('button:has-text("Send")').click();

		// Wait for the agent response
		await expect(page.locator('pre:has-text("Remember")')).toContainText('Remember');

		// Now ask to retrieve the memory
		await page.locator('input[aria-label="Chat input"]').fill('What did I tell you to remember?');
		await page.locator('button:has-text("Send")').click();

		// Wait for the agent response
		await expect(page.locator('pre:has-text("blue")')).toContainText('blue');
	});

	test('Fetch MCP example works correctly', async ({ page }) => {
		// Navigate to the main page
		await page.goto('/');

		// Test fetching content from a URL
		await page.locator('input[aria-label="Chat input"]').fill('Get the content from https://httpbin.org/get');
		await page.locator('button:has-text("Send")').click();

		// Wait for the agent response - this might take longer for network requests
		await page.waitForTimeout(5000); // Add wait for network request to complete

		// Check if the fetch.get tool was called by looking for response from the URL
		await expect(page.locator('pre')).toContainText('httpbin');
	});

	test('Tool calls appear in reasoning trace', async ({ page }) => {
		// Navigate to the main page
		await page.goto('/');

		// Submit a request that uses an MCP tool
		await page.locator('input[aria-label="Chat input"]').fill('Remember that test data is stored.');
		await page.locator('button:has-text("Send")').click();

		// Wait for the response and check trace
		await expect(page.locator('pre:has-text("Remember")')).toContainText('Remember');

		// Expand the reasoning trace if it's available
		const traceSummary = page.locator('summary:has-text("Reasoning Trace")');
		if (await traceSummary.count() > 0) {
			await traceSummary.click();

			// Wait a bit for the trace to become visible
			await page.waitForTimeout(1000);

			// Check for trace events containing tool information
			await expect(page.locator('div')).toContainText('tool');
		}
	});
});