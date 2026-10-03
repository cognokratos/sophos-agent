import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { GET as list } from './+server';
import { GET as detail } from './[conversationId]/+server';
import { GET as exportConversation } from './[conversationId]/export/+server';
import { POST as postChat } from '../chat/+server';
import { getGraph } from '$lib/agent';
import { threadConfig } from '$lib/agent/graph';
import { closeDatabase, getDatabase } from '$lib/agent/persistence/database';
import { createConversation, finishRun, startRun } from '$lib/agent/persistence/conversations';

vi.mock('$env/dynamic/private', () => ({ env: process.env }));

const WITH_MESSAGES = '33333333-3333-4333-8333-333333333333';
const EMPTY = '44444444-4444-4444-8444-444444444444';
const UNKNOWN = '55555555-5555-4555-8555-555555555555';

// The route handlers only use these fields of the SvelteKit event.
type Handler = (event: never) => Promise<Response> | Response;
const call = (handler: Handler, event: object) => handler(event as never);
const params = (conversationId: string) => ({
	params: { conversationId },
	url: new URL('http://localhost/')
});
const post = (body: unknown) =>
	call(postChat, {
		request: new Request('http://localhost/api/chat', {
			method: 'POST',
			body: typeof body === 'string' ? body : JSON.stringify(body)
		})
	});

describe('conversation API (durable state)', () => {
	let dir: string;

	beforeAll(async () => {
		dir = mkdtempSync(join(tmpdir(), 'sophos-api-'));
		process.env.DATABASE_PATH = join(dir, 'sophos.db');

		const db = getDatabase();
		createConversation(db, WITH_MESSAGES, 'Echo ping', new Date('2026-10-03T10:00:00Z'));
		createConversation(db, EMPTY, 'Nothing yet', new Date('2026-10-03T11:00:00Z'));

		// Write a thread directly through LangGraph, as a finished run would.
		await getGraph().updateState(
			threadConfig(WITH_MESSAGES),
			{
				messages: [
					new HumanMessage('Echo ping'),
					new AIMessage({
						content: '',
						tool_calls: [{ id: 'c1', name: 'echo', args: { text: 'ping' } }]
					}),
					new ToolMessage({ content: 'echo: ping', name: 'echo', tool_call_id: 'c1' }),
					new AIMessage('Done.')
				]
			},
			'agent'
		);
		startRun(db, WITH_MESSAGES, 'run-1', new Date('2026-10-03T12:00:00Z'));
		finishRun(
			db,
			'run-1',
			{ status: 'completed', messageCount: 4 },
			new Date('2026-10-03T12:01:00Z')
		);
	});

	afterAll(() => {
		closeDatabase();
		delete process.env.DATABASE_PATH;
		rmSync(dir, { recursive: true, force: true });
	});

	it('lists conversations with their metadata, most recent first', async () => {
		const response = await call(list, {});
		expect(response.status).toBe(200);

		const { conversations } = await response.json();
		expect(conversations).toEqual([
			{
				id: WITH_MESSAGES,
				title: 'Echo ping',
				createdAt: '2026-10-03T10:00:00.000Z',
				updatedAt: '2026-10-03T12:01:00.000Z',
				messageCount: 4,
				status: 'completed'
			},
			{
				id: EMPTY,
				title: 'Nothing yet',
				createdAt: '2026-10-03T11:00:00.000Z',
				updatedAt: '2026-10-03T11:00:00.000Z',
				messageCount: 0,
				status: null
			}
		]);
	});

	it('returns the messages of the thread, including tool calls and results', async () => {
		const response = await call(detail, params(WITH_MESSAGES));
		expect(response.status).toBe(200);

		const body = await response.json();
		expect(body.resumable).toBe(false);
		expect(body.conversation).toMatchObject({ id: WITH_MESSAGES, messageCount: 4 });
		expect(body.messages).toMatchObject([
			{ role: 'user', content: 'Echo ping' },
			{ role: 'assistant', toolCalls: [{ name: 'echo', args: { text: 'ping' } }] },
			{ role: 'tool', name: 'echo', toolCallId: 'c1', content: 'echo: ping' },
			{ role: 'assistant', content: 'Done.' }
		]);
		expect(body.messages).toHaveLength(body.conversation.messageCount);
	});

	it('returns an empty message list for a conversation without runs', async () => {
		const body = await (await call(detail, params(EMPTY))).json();
		expect(body.messages).toEqual([]);
		expect(body.resumable).toBe(false);
	});

	it('rejects invalid conversation ids', async () => {
		for (const id of ['not-a-uuid', '../../etc/passwd', '']) {
			const response = await call(detail, params(id));
			expect(response.status).toBe(400);
			expect((await response.json()).error.code).toBe('BAD_REQUEST');
		}
	});

	it('returns 404 for an unknown conversation', async () => {
		const response = await call(detail, params(UNKNOWN));
		expect(response.status).toBe(404);
		expect((await response.json()).error.code).toBe('NOT_FOUND');
	});

	it('exports the thread as Markdown', async () => {
		const response = await call(exportConversation, params(WITH_MESSAGES));
		expect(response.headers.get('content-type')).toContain('text/markdown');

		const markdown = await response.text();
		expect(markdown).toContain('# Echo ping');
		expect(markdown).toContain('**Tool call** `echo`');
		expect(markdown).toContain('echo: ping');
		expect(markdown).toContain('Done.');
	});

	it('exports the checkpoint history as JSON lines, oldest first', async () => {
		const response = await call(exportConversation, {
			params: { conversationId: WITH_MESSAGES },
			url: new URL('http://localhost/?format=jsonl')
		});
		const lines = (await response.text())
			.trim()
			.split('\n')
			.map((l) => JSON.parse(l));

		expect(lines.length).toBeGreaterThan(0);
		expect(lines.at(-1)).toMatchObject({
			message_count: 4,
			next: [],
			last_message: { content: 'Done.' }
		});
	});

	describe('POST /api/chat validation', () => {
		it('rejects a body that is not JSON', async () => {
			expect((await post('not json')).status).toBe(400);
		});

		it('requires a message unless resuming', async () => {
			expect((await post({ message: '   ' })).status).toBe(400);
		});

		it('rejects an invalid conversation id', async () => {
			const response = await post({ message: 'hi', conversation: '../secret' });
			expect(response.status).toBe(400);
		});

		it('returns 404 for an unknown conversation', async () => {
			const response = await post({ message: 'hi', conversation: UNKNOWN });
			expect(response.status).toBe(404);
		});

		it('refuses to resume a thread whose last run finished', async () => {
			const response = await post({ resume: true, conversation: WITH_MESSAGES });
			expect(response.status).toBe(409);
			expect((await response.json()).error.code).toBe('RUN_NOT_RESUMABLE');
		});
	});
});
