import { ChatOllama, type ChatOllamaCallOptions } from '@langchain/ollama';
import { type AIMessageChunk, type BaseMessage } from '@langchain/core/messages';
import { SystemMessage, AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import {
	StateGraph,
	START,
	END,
	MessagesAnnotation,
	Annotation,
	type Messages
} from '@langchain/langgraph';
import type { AgentEvent, ChatMessage } from '$lib/chat';
import { getMCPClientService } from './mcp/client';
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import { type Runnable } from '@langchain/core/runnables';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { CompiledStateGraph } from '@langchain/langgraph';
import { getModelConfig, getSystemMessage } from '$lib/agent/config';
import type { ConversationMessage } from '$lib/agent/persistence';

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
	const model = new ChatOllama(getModelConfig());

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

function convertMessage(message: ConversationMessage): HumanMessage | AIMessage | null {
	switch (message.role) {
		case 'user':
			return new HumanMessage(message.content);
		case 'assistant':
			return new AIMessage(message.content);
		default:
			return null;
	}
}

export async function* runAgent(
	currentTurn: number,
	message: ChatMessage,
	messages: ConversationMessage[]
): AsyncGenerator<AgentEvent> {
	if (!graph) {
		graph = await initGraph();
	}
	const systemMessage = new SystemMessage(await getSystemMessage());
	const chatHistory = messages.map(convertMessage).filter(Boolean);
	const userMessage = new HumanMessage(message.content);
	const stream = await graph.stream(
		{ messages: [systemMessage, ...chatHistory, userMessage] },
		{ streamMode: 'messages', interruptBefore: [] }
	);

	let currentStep = -1;
	let currentNode = '';
	let currentName = '';

	for await (const [msg, meta] of stream) {
		const node: string = meta.langgraph_node;
		const step: number = meta.langgraph_step;
		const name: string = getName(msg, meta);

		// Handle node/step transitions
		if (step > currentStep) {
			if (currentNode && currentNode !== node) {
				yield {
					type: 'trace',
					data: { turn: currentTurn, name: currentName, node: currentNode, event: 'leave' }
				};
			}

			currentStep = step;
			currentNode = node;
			currentName = name;

			yield {
				type: 'trace',
				data: { turn: currentTurn, name: currentName, node: currentNode, event: 'enter' }
			};
		}

		if (node === nodes.AGENT && AIMessage.isInstance(msg)) {
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
							turn: currentTurn,
							name: currentName,
							node: 'tools',
							event: 'call',
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

		if (node === nodes.TOOLS && ToolMessage.isInstance(msg)) {
			if (msg.name && msg.tool_call_id) {
				yield {
					type: 'trace',
					data: {
						turn: currentTurn,
						name: currentName,
						node: 'tools',
						event: 'result',
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
		yield {
			type: 'trace',
			data: { turn: currentTurn, name: currentName, node: currentNode, event: 'leave' }
		};
	}

	yield { type: 'end' };
}

function getName(msg: BaseMessage, meta: Record<string, unknown>): string {
	if (AIMessage.isInstance(msg)) {
		return meta.ls_model_name as string;
	}
	if (ToolMessage.isInstance(msg)) {
		return msg.name!;
	}
	return '';
}
