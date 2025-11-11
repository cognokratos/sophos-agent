import { test, expect } from '@playwright/test';
import { rm, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const LOG_DIR = 'data/logs';
const TEST_MESSAGE = 'Hello, this is an E2E test.';

test.describe('Story 1.3: Reasoning Trace & Persistence', () => {
	let conversationId: string | null = null;

	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		// Clear local storage to ensure a clean session
		await page.evaluate(() => localStorage.clear());
		await page.goto('/');
	});

	test.afterAll(async () => {
		// Clean up logs from the test run
		if (conversationId) {
			const sessionDir = join(LOG_DIR, conversationId);
			await rm(sessionDir, { recursive: true, force: true });
		}
	});

	test('should display real-time reasoning trace and create log files', async ({ page }) => {
		// 1. Send a message
		await page.fill('input[aria-label="Chat input"]', TEST_MESSAGE);
		await page.click('button[aria-label="Send message"]');

		// 2. Verify the reasoning trace UI appears and populates
		const traceDetails = page.locator('details:has-text("Reasoning Trace")');
		await expect(traceDetails).toBeVisible({ timeout: 10000 });

		// Check for specific trace events
		await expect(page.locator('div:has-text("ENTER")').first()).toBeVisible();
		await expect(page.locator('div:has-text("agent")').first()).toBeVisible();
		await expect(page.locator('div:has-text("LEAVE")').first()).toBeVisible();

		// 3. Wait for the response to complete
		await expect(page.locator('p:has-text("Responding...")')).not.toBeVisible({ timeout: 20000 });

		// 4. Verify log files were created
		// We need to get the conversation ID. We can grab it from localStorage after the fact.
		conversationId = await page.evaluate(() => localStorage.getItem('chat:conv'));
		expect(conversationId).not.toBeNull();

		const sessionDir = join(LOG_DIR, conversationId!); 
		const files = await readdir(sessionDir);

		// Check for user message, assistant message, and trace log
		expect(files).toContain('0001.user.md');
		expect(files).toContain('0002.assistant.md');
		expect(files).toContain('trace.jsonl');

		// 5. Verify file contents
		const userMsgContent = await readFile(join(sessionDir, '0001.user.md'), 'utf-8');
		expect(userMsgContent).toBe(TEST_MESSAGE);

		const assistantMsgContent = await readFile(join(sessionDir, '0002.assistant.md'), 'utf-8');
		expect(assistantMsgContent.length).toBeGreaterThan(0);

		const traceContent = await readFile(join(sessionDir, 'trace.jsonl'), 'utf-8');
		const traceLines = traceContent.trim().split('\n');
		expect(traceLines.length).toBeGreaterThanOrEqual(2); // at least enter and leave

		const firstTrace = JSON.parse(traceLines[0]);
		expect(firstTrace).toHaveProperty('ts');
		expect(firstTrace).toHaveProperty('node');
		expect(firstTrace).toHaveProperty('event', 'enter');
	});
});
