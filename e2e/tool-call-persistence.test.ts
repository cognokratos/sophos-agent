import { test, expect } from '@playwright/test';
import { rm, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const LOG_DIR = 'data/logs';

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
		// Clean up logs from the test run
		if (conversationId) {
			const sessionDir = join(LOG_DIR, conversationId);
			await rm(sessionDir, { recursive: true, force: true });
		}
	});

	test('should record tool calls in both trace.jsonl and markdown files', async ({ page }) => {
		// Send a message that will trigger a tool call (fetch URL)
		await page.getByTestId('chat-input').fill('Get the content from https://httpbin.org/get');
		await page.getByTestId('send-button').click();

		// Wait for the response to complete
		await expect(page.getByTestId('status-responding')).not.toBeVisible({
			timeout: 30000
		});

		// Get the conversation ID
		conversationId = await page.evaluate(() => localStorage.getItem('chat:conv'));
		expect(conversationId).not.toBeNull();

		const sessionDir = join(LOG_DIR, conversationId!);
		const files = await readdir(sessionDir);

		// Check for user message, assistant message, and trace log
		expect(files).toContain('0001.user.md');
		expect(files).toContain('0002.assistant.md');
		expect(files).toContain('trace.jsonl');

		// Read the trace file to verify tool call events
		const traceContent = await readFile(join(sessionDir, 'trace.jsonl'), 'utf-8');
		const traceLines = traceContent.trim().split('\n');

		// Filter for tool call events
		const toolCallEvents = traceLines
			.filter(line => line.trim() !== '')
			.map(line => JSON.parse(line))
			.filter(event => event.event === 'tool_call' || event.event === 'tool_result');

		// Verify that we have tool call and result events
		expect(toolCallEvents.length).toBeGreaterThan(0);
		
		// Check that we have both tool_call and tool_result events
		const hasToolCall = toolCallEvents.some(event => event.event === 'tool_call');
		const hasToolResult = toolCallEvents.some(event => event.event === 'tool_result');
		expect(hasToolCall).toBe(true);
		expect(hasToolResult).toBe(true);

		// For tool_call events, verify they contain name, arguments, and tool_call_id
		const toolCallEventsWithDetails = toolCallEvents.filter(event => event.event === 'tool_call');
		for (const event of toolCallEventsWithDetails) {
			expect(event).toHaveProperty('data');
			expect(event.data).toHaveProperty('name');
			expect(event.data).toHaveProperty('arguments');
			expect(event.data).toHaveProperty('tool_call_id');
		}

		// For tool_result events, verify they contain name, result, and tool_call_id
		const toolResultEventsWithDetails = toolCallEvents.filter(event => event.event === 'tool_result');
		for (const event of toolResultEventsWithDetails) {
			expect(event).toHaveProperty('data');
			expect(event.data).toHaveProperty('name');
			expect(event.data).toHaveProperty('result');
			expect(event.data).toHaveProperty('tool_call_id');
		}

		// Read the assistant message markdown to verify tool call information is included
		const assistantMsgContent = await readFile(join(sessionDir, '0002.assistant.md'), 'utf-8');
		
		// Verify that the markdown file contains tool call information
		expect(assistantMsgContent).toContain('TOOL CALL:');
		expect(assistantMsgContent).toContain('TOOL RESULT:');
		expect(assistantMsgContent).toContain('```json');
		
		// Verify that the tool call and result information is included in the markdown
		const hasToolCallInMarkdown = assistantMsgContent.includes('TOOL CALL:') || assistantMsgContent.includes('<!-- TOOL CALL:');
		const hasToolResultInMarkdown = assistantMsgContent.includes('TOOL RESULT:') || assistantMsgContent.includes('<!-- TOOL RESULT:');
		
		expect(hasToolCallInMarkdown).toBe(true);
		expect(hasToolResultInMarkdown).toBe(true);
	});
});