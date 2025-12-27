import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeMessageFile, writeTrace } from './index';
import type { ChatMessage, TraceNote } from '$lib/chat';

const TEST_CHAT_DIR = 'data/test/chat';
const TEST_SHOW_NOTES = 'true';

describe('Persistence Module', () => {
	beforeEach(async () => {
		// Set up a temporary log directory for tests
		process.env.CHAT_DIR = TEST_CHAT_DIR;
		process.env.SHOW_TOOLS = TEST_SHOW_NOTES;
		await mkdir(TEST_CHAT_DIR, { recursive: true });
	});

	afterEach(async () => {
		// Clean up the temporary log directory
		await rm(TEST_CHAT_DIR, { recursive: true, force: true });
		delete process.env.CHAT_DIR;
		delete process.env.SHOW_TOOLS;
	});

	it('should write a user message to a Markdown file', async () => {
		const conversationId = 'test-conversation-1';
		const turn = 1;
		const message: ChatMessage = {
			conversation: '8c62ae3d-cc0a-4740-b904-0f405f632ace',
			id: 'e850c9ab-7ffa-4eef-b503-5db0481b57e5',
			role: 'user',
			content: 'Hello, world!'
		};

		await writeMessageFile(conversationId, turn, message);

		const filePath = join(TEST_CHAT_DIR, conversationId, '0001.user.md');
		const fileContent = await readFile(filePath, 'utf-8');

		expect(fileContent).toBe('Hello, world!');
	});

	it('should write an assistant message with correct padding', async () => {
		const conversationId = 'test-conversation-2';
		const turn = 12;
		const message: ChatMessage = {
			conversation: '8c62ae3d-cc0a-4740-b904-0f405f632ace',
			id: 'e850c9ab-7ffa-4eef-b503-5db0481b57e5',
			role: 'assistant',
			content: 'Hi there!'
		};

		await writeMessageFile(conversationId, turn, message);

		const filePath = join(TEST_CHAT_DIR, conversationId, '0012.assistant.md');
		const fileContent = await readFile(filePath, 'utf-8');

		expect(fileContent).toBe('Hi there!');
	});

	it('should write a message with tool call information to Markdown', async () => {
		const conversationId = 'test-conversation-3';
		const turn = 5;
		const message: ChatMessage = {
			conversation: '8c62ae3d-cc0a-4740-b904-0f405f632ace',
			id: 'e850c9ab-7ffa-4eef-b503-5db0481b57e5',
			role: 'assistant',
			content: 'I will fetch the data for you.'
		};

		await writeMessageFile(conversationId, turn, message);

		const filePath = join(TEST_CHAT_DIR, conversationId, '0005.assistant.md');
		const fileContent = await readFile(filePath, 'utf-8');

		expect(fileContent).toContain('I will fetch the data for you.');
	});

	it('should append a trace note to trace.jsonl', async () => {
		const conversationId = 'test-conversation-3';
		const traceNote: TraceNote = { name: 'qwen3', turn: 2, node: 'agent', event: 'enter' };

		await writeTrace(conversationId, traceNote);

		const filePath = join(TEST_CHAT_DIR, conversationId, 'trace.jsonl');
		const fileContent = await readFile(filePath, 'utf-8');
		const parsed = JSON.parse(fileContent);

		expect(parsed.name).toBe('qwen3');
		expect(parsed.turn).toBe(2);
		expect(parsed.node).toBe('agent');
		expect(parsed.event).toBe('enter');
		expect(parsed.ts).toBeDefined();
	});

	it('should append multiple trace notes to the same file', async () => {
		const conversationId = 'test-conversation-4';
		const traceNote1: TraceNote = { name: 'qwen3', turn: 2, node: 'agent', event: 'enter' };
		const traceNote2: TraceNote = { name: 'qwen3', turn: 4, node: 'agent', event: 'leave' };

		await writeTrace(conversationId, traceNote1);
		await writeTrace(conversationId, traceNote2);

		const filePath = join(TEST_CHAT_DIR, conversationId, 'trace.jsonl');
		const fileContent = await readFile(filePath, 'utf-8');
		const lines = fileContent.trim().split('\n');

		expect(lines.length).toBe(2);

		const parsed1 = JSON.parse(lines[0]);
		const parsed2 = JSON.parse(lines[1]);

		expect(parsed1.event).toBe('enter');
		expect(parsed1.node).toBe('agent');
		expect(parsed1.turn).toBe(2);
		expect(parsed1.name).toBe('qwen3');
		expect(parsed2.event).toBe('leave');
		expect(parsed2.node).toBe('agent');
		expect(parsed2.turn).toBe(4);
		expect(parsed2.name).toBe('qwen3');
	});
});
