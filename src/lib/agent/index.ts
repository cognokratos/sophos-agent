import { ChatOllama } from '@langchain/ollama';
import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import type { AgentEvent, MessageDto, TraceNote } from '$lib/chat';
import { getMCPClientService } from './mcp/client';
import { getModelConfig, getRecursionLimit, getSystemMessage } from './config';
import { buildAgentGraph, nodes, threadConfig, type AgentGraph } from './graph';
import { createCheckpointer, getDatabase } from './persistence/database';
import { toMessageDtos } from './messages';

/**
 * Agent runtime: one compiled graph per process, backed by the SQLite
 * checkpointer. Each conversation is a LangGraph thread; each call to
 * `runAgent` is one run on that thread.
 */

let graph: AgentGraph | null = null;
let mcpReady: Promise<void> | null = null;

/** Connects to the MCP servers on first use (shared by concurrent runs). */
async function loadTools() {
	const mcp = getMCPClientService();
	mcpReady ??= mcp.initialize().catch((error) => {
		mcpReady = null; // allow a retry on the next run
		throw error;
	});
	await mcpReady;
	return mcp.listTools();
}

export function getGraph(): AgentGraph {
	graph ??= buildAgentGraph({
		model: new ChatOllama(getModelConfig()),
		tools: loadTools,
		systemPrompt: getSystemMessage,
		checkpointer: createCheckpointer(getDatabase())
	});
	return graph;
}

/** What a run starts from: a new user message, or the thread's last checkpoint. */
export type RunInput = { message: string } | { resume: true };

/**
 * Executes one run on the conversation's thread and yields UI events.
 *
 * - `{ message }` appends a user message; the checkpointer supplies the
 *   earlier history, so nothing is reconstructed here.
 * - `{ resume: true }` passes `null` input, which continues from the last
 *   checkpoint (e.g. after a crash) without repeating completed steps.
 *
 * `durability: 'sync'` writes each checkpoint before the next step starts,
 * so a crash loses at most the step in progress.
 */
export async function* runAgent(
	conversationId: string,
	input: RunInput
): AsyncGenerator<AgentEvent> {
	const graphInput = 'message' in input ? { messages: [new HumanMessage(input.message)] } : null;
	const stream = await getGraph().stream(graphInput, {
		...threadConfig(conversationId),
		streamMode: 'messages',
		durability: 'sync',
		recursionLimit: getRecursionLimit()
	});

	let currentStep = -1;
	let currentNode = '';
	let currentName = '';
	const trace = (event: TraceNote['event'], extra: Partial<TraceNote> = {}): AgentEvent => ({
		type: 'trace',
		data: { step: currentStep, name: currentName, node: currentNode, event, ...extra }
	});

	for await (const [msg, meta] of stream) {
		const node: string = meta.langgraph_node;
		const step: number = meta.langgraph_step;

		// Handle node/step transitions
		if (step > currentStep) {
			if (currentNode && currentNode !== node) {
				yield trace('leave');
			}
			currentStep = step;
			currentNode = node;
			currentName = getName(msg, meta);
			yield trace('enter');
		}

		if (node === nodes.AGENT && AIMessage.isInstance(msg)) {
			if (msg.text) {
				yield { type: 'token', data: msg.text };
			}
			for (const toolCall of msg.tool_calls ?? []) {
				yield trace('call', {
					node: nodes.TOOLS,
					data: { name: toolCall.name, arguments: toolCall.args, tool_call_id: toolCall.id }
				});
			}
		}

		if (node === nodes.TOOLS && ToolMessage.isInstance(msg) && msg.name && msg.tool_call_id) {
			yield trace('result', {
				node: nodes.TOOLS,
				data: { name: msg.name, tool_call_id: msg.tool_call_id, result: msg.text }
			});
		}
	}

	if (currentNode) {
		yield trace('leave');
	}
	yield { type: 'end' };
}

export interface ThreadState {
	messages: MessageDto[];
	/** Nodes scheduled to run next. Non-empty after a crash or failure: the run can be resumed. */
	next: string[];
}

/** Reads the latest checkpoint of a conversation's thread (no model or MCP involved). */
export async function getThreadState(conversationId: string): Promise<ThreadState> {
	const snapshot = await getGraph().getState(threadConfig(conversationId));
	const messages: BaseMessage[] = snapshot.values.messages ?? [];
	return { messages: toMessageDtos(messages), next: [...snapshot.next] };
}

/**
 * Closes all MCP connections. Called on server shutdown (see `src/hooks.server.ts`).
 */
export async function closeAgent(): Promise<void> {
	graph = null;
	mcpReady = null;
	await getMCPClientService().dispose();
}

function getName(msg: BaseMessage, meta: Record<string, unknown>): string {
	if (AIMessage.isInstance(msg)) {
		return meta.ls_model_name as string;
	}
	if (ToolMessage.isInstance(msg)) {
		return msg.name ?? '';
	}
	return '';
}
