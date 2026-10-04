import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GraphRecursionError } from '@langchain/langgraph';
import type { AgentEvent } from '$lib/chat';
import { runAgent, getThreadState } from '$lib/agent';
import { getActiveRun, startRun, subscribe } from './runs';
import { closeDatabase, getDatabase } from './persistence/database';
import { createConversation, getConversation } from './persistence/conversations';

vi.mock('$env/dynamic/private', () => ({ env: process.env }));
vi.mock('$lib/agent', () => ({ runAgent: vi.fn(), getThreadState: vi.fn() }));

const ID = '66666666-6666-4666-8666-666666666666';

function scriptedRun(events: AgentEvent[], error?: Error) {
	vi.mocked(runAgent).mockImplementation(async function* () {
		for (const event of events) {
			await Promise.resolve();
			yield event;
		}
		if (error) throw error;
	});
}

async function finished() {
	await vi.waitFor(() => expect(getActiveRun(ID)).toBeUndefined());
}

describe('runs', () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'sophos-runs-'));
		process.env.DATABASE_PATH = join(dir, 'sophos.db');
		createConversation(getDatabase(), ID, 'hello');
		vi.mocked(getThreadState).mockResolvedValue({
			messages: [
				{ id: '1', role: 'user', content: 'hello' },
				{ id: '2', role: 'assistant', content: 'Hi!' }
			],
			next: []
		});
	});

	afterEach(() => {
		closeDatabase();
		delete process.env.DATABASE_PATH;
		rmSync(dir, { recursive: true, force: true });
	});

	it('streams events to subscribers and records a completed run', async () => {
		scriptedRun([{ type: 'token', data: 'Hi' }, { type: 'token', data: '!' }, { type: 'end' }]);

		const run = startRun(ID, { message: 'hello' });
		expect(getConversation(getDatabase(), ID)?.status).toBe('running');

		const received: string[] = [];
		subscribe(
			run,
			0,
			() => {},
			(code, data) => received.push(`${code}:${JSON.stringify(data)}`)
		);
		await finished();

		expect(received).toEqual([
			'token:"Hi"',
			'token:"!"',
			`end:${JSON.stringify({ conversation: ID, status: 'completed' })}`
		]);
		expect(getConversation(getDatabase(), ID)).toMatchObject({
			status: 'completed',
			messageCount: 2
		});
	});

	it('replays buffered events after Last-Event-ID to a late subscriber', async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		vi.mocked(runAgent).mockImplementation(async function* () {
			yield { type: 'token', data: 'a' } as AgentEvent;
			yield { type: 'token', data: 'b' } as AgentEvent;
			await gate;
			yield { type: 'end' } as AgentEvent;
		});

		const run = startRun(ID, { message: 'hello' });
		await vi.waitFor(() => expect(run.events).toHaveLength(2));

		const replayed: string[] = [];
		subscribe(
			run,
			1,
			(payload) => replayed.push(payload),
			() => {}
		);
		expect(replayed).toHaveLength(1);
		expect(replayed[0]).toContain('id: 2');

		release();
		await finished();
	});

	it('records a failed run with a stable error code', async () => {
		scriptedRun(
			[{ type: 'token', data: 'thinking' }],
			new GraphRecursionError('Recursion limit of 25 reached')
		);

		const run = startRun(ID, { message: 'loop forever' });
		const codes: string[] = [];
		subscribe(
			run,
			0,
			() => {},
			(code) => codes.push(code)
		);
		await finished();

		expect(codes.at(-1)).toBe('chat-error');
		expect(getConversation(getDatabase(), ID)).toMatchObject({
			status: 'failed',
			error: { code: 'RECURSION_LIMIT' }
		});
	});

	it('passes resume requests through to the agent', async () => {
		scriptedRun([{ type: 'end' }]);

		startRun(ID, { resume: true });
		await finished();

		expect(runAgent).toHaveBeenLastCalledWith(ID, { resume: true });
	});
});
