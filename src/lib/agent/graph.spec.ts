import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AIMessage, HumanMessage, type BaseMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { tool } from '@langchain/core/tools';
import { GraphRecursionError } from '@langchain/langgraph';
import { z } from 'zod';
import { agentNode, buildAgentGraph, threadConfig, type AgentModel } from './graph';
import { createCheckpointer, openDatabase, type DB } from './persistence/database';
import { toMessageDtos } from './messages';

vi.mock('$env/dynamic/private', () => ({ env: process.env }));

const THREAD = '6f9c1a52-3a0e-4c8e-9d4b-2a1f0c7e5b11';
const SYSTEM_PROMPT = 'You are a test assistant.';

/** A stand-in for ChatOllama: returns scripted replies and records every input. */
function scriptedModel(replies: (BaseMessage | Error)[]) {
	const calls: BaseMessage[][] = [];
	const model: AgentModel = {
		bindTools: () =>
			RunnableLambda.from(async (messages: BaseMessage[]) => {
				calls.push(messages);
				const reply = replies.shift();
				if (!reply) throw new Error('No scripted reply left');
				if (reply instanceof Error) throw reply;
				return reply;
			})
	};
	return { model, calls };
}

const echoCalls = vi.fn();
const echo = tool(
	async ({ text }) => {
		echoCalls(text);
		return `echo: ${text}`;
	},
	{ name: 'echo', description: 'Echo the text back', schema: z.object({ text: z.string() }) }
);

function toolCall(id: string, text: string) {
	return new AIMessage({ content: '', tool_calls: [{ id, name: 'echo', args: { text } }] });
}

describe('agent graph with the SQLite checkpointer', () => {
	let dir: string;
	let dbPath: string;
	let db: DB;
	const tools = vi.fn(async () => [echo]);

	/** Simulates a process (re)start: new connection, new checkpointer, new compiled graph. */
	function start(model: AgentModel) {
		db?.close();
		db = openDatabase(dbPath);
		return buildAgentGraph({
			model,
			tools,
			systemPrompt: async () => SYSTEM_PROMPT,
			checkpointer: createCheckpointer(db)
		});
	}

	const run = (
		graph: ReturnType<typeof start>,
		input: { messages: BaseMessage[] } | null,
		limit?: number
	) => graph.invoke(input, { ...threadConfig(THREAD), durability: 'sync', recursionLimit: limit });

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'sophos-graph-'));
		dbPath = join(dir, 'sophos.db');
		echoCalls.mockClear();
		tools.mockClear();
	});

	afterEach(() => {
		db?.close();
		rmSync(dir, { recursive: true, force: true });
	});

	it('persists a conversation that a fresh graph instance can read back', async () => {
		const graph = start(scriptedModel([new AIMessage('Hi there!')]).model);
		await run(graph, { messages: [new HumanMessage('hello')] });

		const restarted = start(scriptedModel([]).model);
		const state = await restarted.getState(threadConfig(THREAD));

		expect(toMessageDtos(state.values.messages)).toMatchObject([
			{ role: 'user', content: 'hello' },
			{ role: 'assistant', content: 'Hi there!' }
		]);
		expect(state.next).toEqual([]);
	});

	it('gives the next run the prior context from the thread, not from the caller', async () => {
		const first = scriptedModel([new AIMessage('Nice to meet you, Alice.')]);
		await run(start(first.model), { messages: [new HumanMessage('My name is Alice.')] });

		// After a restart, the new run passes only the new message.
		const second = scriptedModel([new AIMessage('Your name is Alice.')]);
		await run(start(second.model), { messages: [new HumanMessage('What is my name?')] });

		const seen = second.calls[0].map((m) => [m.getType(), m.text]);
		expect(seen).toEqual([
			['system', SYSTEM_PROMPT],
			['human', 'My name is Alice.'],
			['ai', 'Nice to meet you, Alice.'],
			['human', 'What is my name?']
		]);
	});

	it('does not store the system prompt in the thread', async () => {
		const graph = start(scriptedModel([new AIMessage('ok')]).model);
		await run(graph, { messages: [new HumanMessage('hello')] });

		const state = await graph.getState(threadConfig(THREAD));
		expect(state.values.messages.map((m: BaseMessage) => m.getType())).toEqual(['human', 'ai']);
	});

	it('persists tool calls and tool results', async () => {
		const graph = start(scriptedModel([toolCall('call-1', 'ping'), new AIMessage('Done.')]).model);
		await run(graph, { messages: [new HumanMessage('Echo ping')] });

		const state = await start(scriptedModel([]).model).getState(threadConfig(THREAD));
		expect(toMessageDtos(state.values.messages)).toMatchObject([
			{ role: 'user', content: 'Echo ping' },
			{ role: 'assistant', toolCalls: [{ id: 'call-1', name: 'echo', args: { text: 'ping' } }] },
			{
				role: 'tool',
				name: 'echo',
				toolCallId: 'call-1',
				content: 'echo: ping',
				status: 'success'
			},
			{ role: 'assistant', content: 'Done.' }
		]);
	});

	it('resumes an interrupted run from its last checkpoint without repeating tool calls', async () => {
		// The model fails after the tool ran: the run stops mid-way.
		const crashing = start(
			scriptedModel([toolCall('call-1', 'once'), new Error('connection reset')]).model
		);
		await expect(run(crashing, { messages: [new HumanMessage('Echo once')] })).rejects.toThrow(
			'connection reset'
		);

		const restarted = start(scriptedModel([new AIMessage('Recovered.')]).model);
		expect((await restarted.getState(threadConfig(THREAD))).next).toEqual(['agent']);

		await run(restarted, null); // null input = continue from the checkpoint

		const state = await restarted.getState(threadConfig(THREAD));
		expect(state.next).toEqual([]);
		expect(state.values.messages.at(-1).text).toBe('Recovered.');
		expect(echoCalls).toHaveBeenCalledTimes(1);
	});

	it('stops an endless tool loop with the recursion limit', async () => {
		const looping = Array.from({ length: 20 }, (_, i) => toolCall(`call-${i}`, 'again'));
		const graph = start(scriptedModel(looping).model);

		await expect(run(graph, { messages: [new HumanMessage('loop')] }, 5)).rejects.toBeInstanceOf(
			GraphRecursionError
		);
		expect(echoCalls.mock.calls.length).toBeLessThan(5);
	});

	it('reads thread state without resolving tools or calling the model', async () => {
		const graph = start(scriptedModel([new AIMessage('ok')]).model);
		await run(graph, { messages: [new HumanMessage('hello')] });
		tools.mockClear();

		const { model, calls } = scriptedModel([]);
		await start(model).getState(threadConfig(THREAD));

		expect(tools).not.toHaveBeenCalled();
		expect(calls).toHaveLength(0);
	});

	it('keeps threads of different conversations apart', async () => {
		const graph = start(scriptedModel([new AIMessage('one'), new AIMessage('two')]).model);
		await run(graph, { messages: [new HumanMessage('first')] });
		await graph.invoke(
			{ messages: [new HumanMessage('second')] },
			threadConfig('0b8a3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d')
		);

		const state = await graph.getState(threadConfig(THREAD));
		expect(state.values.messages.map((m: BaseMessage) => m.text)).toEqual(['first', 'one']);
	});
});

describe('agentNode', () => {
	it('maps a missing Ollama model to MODEL_UNAVAILABLE', async () => {
		const { model } = scriptedModel([new Error("model 'qwen3' not found")]);
		const node = agentNode({ model, tools: async () => [], systemPrompt: async () => '' });

		await expect(node({ messages: [new HumanMessage('hi')] })).rejects.toThrow('MODEL_UNAVAILABLE');
	});
});
