import { env } from '$env/dynamic/private';
import { ChatOllama, type ChatOllamaCallOptions } from '@langchain/ollama';
import { type AIMessageChunk, type BaseMessage } from '@langchain/core/messages';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import {
	StateGraph,
	START,
	END,
	MessagesAnnotation,
	Annotation,
	type Messages
} from '@langchain/langgraph';
import type { AgentEvent } from '$lib/chat';
import { getMCPClientService } from './mcp/client';
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import { type Runnable } from '@langchain/core/runnables';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { CompiledStateGraph } from '@langchain/langgraph';

type OllamaAgent = Runnable<BaseLanguageModelInput, AIMessageChunk, ChatOllamaCallOptions>;
const MessagesStateSchema = Annotation.Root({
	...MessagesAnnotation.spec,
	modelCalls: Annotation<number>({
		reducer: (x, y) => x + y,
		default: () => 0
	})
});
type MessagesState = typeof MessagesStateSchema.State;
type InState = { messages: BaseMessage[]; modelCalls: number };
type OutState = { messages?: Messages | undefined; modelCalls?: number | undefined };
const nodes = {
	AGENT: 'agent',
	TOOLS: 'tools'
};
type Edges = typeof START | typeof END | typeof nodes.AGENT | typeof nodes.TOOLS;

export function agentNode(agent: OllamaAgent) {
	return async function (state: MessagesState) {
		const { messages } = state;
		try {
			const response = await agent.invoke(messages);
			return {
				messages: [response],
				modelCalls: 1
			};
		} catch (error: unknown) {
			if (error instanceof Error && error.message.includes('model not found')) {
				throw new Error('MODEL_UNAVAILABLE');
			}
			throw error;
		}
	};
}

async function shouldContinue(state: MessagesState) {
	const lastMessage = state.messages.at(-1);
	if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
		return END;
	}

	if (lastMessage.tool_calls?.length) {
		return nodes.TOOLS;
	}

	return END;
}

async function initGraph() {
	const model = new ChatOllama({
		model: env.OLLAMA_MODEL ?? 'qwen3',
		baseUrl: env.OLLAMA_HOST ?? 'http://localhost:11434'
	});

	const client = getMCPClientService();
	if (!client.isInitialized()) {
		await client.initialize();
	}

	const tools = await client.getTools();
	const agent = model.bindTools(tools);

	const stateGraph = new StateGraph(MessagesStateSchema)
		.addNode(nodes.AGENT, agentNode(agent))
		.addNode(nodes.TOOLS, new ToolNode(tools))
		.addEdge(START, nodes.AGENT)
		.addConditionalEdges(nodes.AGENT, shouldContinue)
		.addEdge(nodes.TOOLS, nodes.AGENT);

	return stateGraph.compile();
}

let graph: CompiledStateGraph<InState, OutState, Edges> | null = null;

export async function* runAgent(message: string): AsyncGenerator<AgentEvent> {
	if (!graph) {
		graph = await initGraph();
	}
	const stream = await graph.stream(
		{ messages: [new HumanMessage(message)] },
		{ streamMode: 'messages', interruptBefore: [] }
	);

	let currentStep = -1;
	let currentNode = '';

	for await (const [msg, meta] of stream) {
		const nodeName = meta.langgraph_node;
		const step = meta.langgraph_step;

		// Handle node/step transitions
		if (step > currentStep) {
			if (currentNode && currentNode !== nodeName) {
				yield { type: 'trace', data: { node: currentNode, event: 'leave' } };
			}

			currentStep = step;
			currentNode = nodeName;

			yield { type: 'trace', data: { node: nodeName, event: 'enter' } };
		}

		if (nodeName === nodes.AGENT && AIMessage.isInstance(msg)) {
			if (msg.content) {
				yield {
					type: 'token',
					data: msg.content.toString()
				};
			}
			if (msg.tool_calls?.length) {
				console.log(msg);
				for (const toolCall of msg.tool_calls) {
					yield {
						type: 'trace',
						data: {
							node: 'tools',
							event: 'tool_call',
							data: {
								name: toolCall.name,
								arguments: toolCall.args,
								tool_call_id: toolCall.id
							}
						}
					};
				}
			}
		}

		if (nodeName === nodes.TOOLS && ToolMessage.isInstance(msg)) {
			if (msg.name && msg.tool_call_id) {
				console.log(msg);
				yield {
					type: 'trace',
					data: {
						node: 'tools',
						event: 'tool_result',
						data: {
							name: msg.name,
							tool_call_id: msg.tool_call_id,
							result: msg.content
						}
					}
				};
			}
		}
	}

	// Final leave + end
	if (currentNode) {
		yield { type: 'trace', data: { node: currentNode, event: 'leave' } };
	}

	yield { type: 'end' };
}
