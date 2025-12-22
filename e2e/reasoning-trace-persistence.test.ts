import { test, expect } from '@playwright/test';
import { rm, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const LOG_DIR = 'data/logs';
const TEST_MESSAGE = 'Hello, this is an E2E test.';

test.describe('Reasoning Trace & Persistence', () => {
	let conversationId: string | null = null;

	test.beforeEach(async ({ page }) => {
		// Clear all browser storage for a completely clean state
		await page.addInitScript(() => {
			localStorage.clear();
			sessionStorage.clear();
		});

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
		await page.getByTestId('chat-input').fill(TEST_MESSAGE);
		await page.getByTestId('send-button').click();

		// Wait for the response to complete
		const chatResponse = await page.waitForResponse((r) => {
			return r.request().method() === 'POST' && r.url().includes('/api/chat') && r.ok();
		});
		const { conv } = await chatResponse.json();

		expect(conv).toBeTruthy();
		conversationId = conv;
		expect(conversationId).not.toBeNull();

		// 2. Verify the reasoning trace UI appears and populates
		// <summary>Reasoning Trace</summary>
		const traceSummary = page.getByTestId('reasoning-summary');

		await expect(traceSummary).toBeVisible({
			timeout: 30_000
		});

		await traceSummary.click();

		// Wait for the trace container to become visible
		const trace = page.getByTestId('reasoning-trace');
		await expect(trace).toBeVisible();
		// Check for specific events inside the scoped trace container
		await expect(trace).toContainText('ENTER');
		await expect(trace).toContainText('agent');
		await expect(trace).toContainText('LEAVE');

		// 3. Wait for the response to complete
		// Status text "Responding..." should disappear once the response is done.
		await expect(page.getByTestId('status-responding')).not.toBeVisible({
			timeout: 50_000
		});

		// 4. Verify log files were created
		const sessionDir = join(LOG_DIR, conversationId!);
		const files = await readdir(sessionDir);

		// Check for user message, assistant message, and trace log
		expect(files).toContain('0001.user.md');
		expect(files).toContain('0002.assistant.md');
		expect(files).toContain('trace.jsonl');

		// 5. Verify file contents

		// User message
		const userMsgContent = await readFile(join(sessionDir, '0001.user.md'), 'utf-8');
		expect(userMsgContent).toBe(TEST_MESSAGE);

		// Assistant message
		const assistantMsgContent = await readFile(join(sessionDir, '0002.assistant.md'), 'utf-8');
		expect(assistantMsgContent.length).toBeGreaterThan(0);

		// Trace log
		const traceContent = await readFile(join(sessionDir, 'trace.jsonl'), 'utf-8');
		const traceLines = traceContent.trim().split('\n');
		expect(traceLines.length).toBeGreaterThanOrEqual(2); // at least enter and leave

		const firstTrace = JSON.parse(traceLines[0]);
		expect(firstTrace).toHaveProperty('ts');
		expect(firstTrace).toHaveProperty('node');
		expect(firstTrace).toHaveProperty('event', 'enter');
	});
});
