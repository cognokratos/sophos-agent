import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeMessageFile, writeTrace } from './index';
import type { ChatMessage, TraceNote } from '$lib/chat';

const TEST_LOG_DIR = 'data/test-logs';

describe('Persistence Module', () => {
	beforeEach(async () => {
		// Set up a temporary log directory for tests
		process.env.LOG_DIR = TEST_LOG_DIR;
		await mkdir(TEST_LOG_DIR, { recursive: true });
	});

	afterEach(async () => {
		// Clean up the temporary log directory
		await rm(TEST_LOG_DIR, { recursive: true, force: true });
		delete process.env.LOG_DIR;
	});

	it('should write a user message to a markdown file', async () => {
		const sessionId = 'test-session-1';
		const turn = 1;
		const message: ChatMessage = { role: 'user', content: 'Hello, world!' };

		await writeMessageFile(sessionId, turn, message);

		const filePath = join(TEST_LOG_DIR, sessionId, '0001.user.md');
		const fileContent = await readFile(filePath, 'utf-8');

		expect(fileContent).toBe('Hello, world!');
	});

	it('should write an assistant message with correct padding', async () => {
		const sessionId = 'test-session-2';
		const turn = 12;
		const message: ChatMessage = { role: 'assistant', content: 'Hi there!' };

		await writeMessageFile(sessionId, turn, message);

		const filePath = join(TEST_LOG_DIR, sessionId, '0012.assistant.md');
		const fileContent = await readFile(filePath, 'utf-8');

		expect(fileContent).toBe('Hi there!');
	});

	it('should append a trace note to trace.jsonl', async () => {
		const sessionId = 'test-session-3';
		const traceNote: TraceNote = { node: 'agent', event: 'enter' };

		await writeTrace(sessionId, traceNote);

		const filePath = join(TEST_LOG_DIR, sessionId, 'trace.jsonl');
		const fileContent = await readFile(filePath, 'utf-8');
		const parsed = JSON.parse(fileContent);

		expect(parsed.node).toBe('agent');
		expect(parsed.event).toBe('enter');
		expect(parsed.ts).toBeDefined();
	});

	it('should append multiple trace notes to the same file', async () => {
		const sessionId = 'test-session-4';
		const traceNote1: TraceNote = { node: 'agent', event: 'enter' };
		const traceNote2: TraceNote = { node: 'agent', event: 'leave' };

		await writeTrace(sessionId, traceNote1);
		await writeTrace(sessionId, traceNote2);

		const filePath = join(TEST_LOG_DIR, sessionId, 'trace.jsonl');
		const fileContent = await readFile(filePath, 'utf-8');
		const lines = fileContent.trim().split('\n');
		
		expect(lines.length).toBe(2);

		const parsed1 = JSON.parse(lines[0]);
		const parsed2 = JSON.parse(lines[1]);

		expect(parsed1.event).toBe('enter');
		expect(parsed2.event).toBe('leave');
	});
});
