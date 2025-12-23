import { test, expect } from '@playwright/test';
import { rm, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const CHAT_DIR = 'data/chat';
const TEST_MESSAGE = 'Get the content from https://httpbin.org/get';

test.describe('Tool Call Persistence', () => {
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
		// Clean up chat from the test run
		if (conversationId) {
			const sessionDir = join(CHAT_DIR, conversationId);
			await rm(sessionDir, { recursive: true, force: true });
		}
	});

	test('should record tool calls in both trace.jsonl and markdown files', async ({ page }) => {
		// 1. Send a message that will trigger a tool call (fetch URL)
		await page.getByTestId('chat-input').fill(TEST_MESSAGE);
		await page.getByTestId('send-button').click();

		// Wait for the response to complete
		const chatResponse = await page.waitForResponse((r) => {
			return r.request().method() === 'POST' && r.url().includes('/api/chat') && r.ok();
		});
		const { conversation } = await chatResponse.json();

		expect(conversation).toBeTruthy();
		conversationId = conversation;
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

		// 3. Wait for the response to complete
		// Status text "Responding..." should disappear once the response is done.
		await expect(page.getByTestId('status-responding')).not.toBeVisible({
			timeout: 500_000
		});

		await expect(trace).toContainText('tools');
		await expect(trace).toContainText('TOOL_RESULT');
		await expect(trace).toContainText('LEAVE');

		// 4. Verify log files were created
		const sessionDir = join(CHAT_DIR, conversationId!);
		const files = await readdir(sessionDir);

		// Check for user message, assistant message, and trace log
		expect(files).toContain('0001.user.md');
		expect(files).toContain('0002.assistant.md');
		expect(files).toContain('trace.jsonl');

		// 5. Verify file contents

		// User message
		const userMsgContent = await readFile(join(sessionDir, '0001.user.md'), 'utf-8');
		expect(userMsgContent).toBe(TEST_MESSAGE);

		// Trace log
		const traceContent = await readFile(join(sessionDir, 'trace.jsonl'), 'utf-8');
		const traceEntries = traceContent
			.trim()
			.split('\n')
			.filter((line) => line.trim() !== '')
			.map((line) => JSON.parse(line));
		expect(traceEntries.length).toBe(7);

		expect(traceEntries[0]['node']).toBe('agent');
		expect(traceEntries[0]['event']).toBe('enter');
		expect(traceEntries[1]['node']).toBe('agent');
		expect(traceEntries[1]['event']).toBe('leave');
		expect(traceEntries[2]['node']).toBe('tools');
		expect(traceEntries[2]['event']).toBe('enter');
		expect(traceEntries[3]['node']).toBe('tools');
		expect(traceEntries[3]['event']).toBe('tool_result');
		expect(traceEntries[4]['node']).toBe('tools');
		expect(traceEntries[4]['event']).toBe('leave');
		expect(traceEntries[5]['node']).toBe('agent');
		expect(traceEntries[5]['event']).toBe('enter');
		expect(traceEntries[6]['node']).toBe('agent');
		expect(traceEntries[6]['event']).toBe('leave');

		const entry = traceEntries[3];
		expect(entry).toHaveProperty('data');
		expect(entry.data).toHaveProperty('name');
		expect(entry.data).toHaveProperty('result');
		expect(entry.data).toHaveProperty('tool_call_id');
		expect(entry.data.name).toBe('fetch');

		// Read the assistant message markdown to verify tool call information is included
		const assistantMsgContent = await readFile(join(sessionDir, '0002.assistant.md'), 'utf-8');

		// Verify that the markdown file contains tool call information
		expect(assistantMsgContent).toContain('<!-- TOOL RESULT: fetch -->');
	});
});
