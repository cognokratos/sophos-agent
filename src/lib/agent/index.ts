import { env } from '$env/dynamic/private';
import { ChatOllama, type ChatOllamaCallOptions } from '@langchain/ollama';
import { type AIMessageChunk, type BaseMessage } from '@langchain/core/messages';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { END, MessagesZodMeta, START, StateGraph } from '@langchain/langgraph';
import { registry } from '@langchain/langgraph/zod';
import * as z from 'zod';
import type { AgentEvent } from '$lib/chat';
import { getMCPClientService } from './mcp/client';
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import { type Runnable } from '@langchain/core/runnables';
import { ToolNode } from '@langchain/langgraph/prebuilt';

const MessagesStateSchema = z.object({
	messages: z
		.array(z.custom<BaseMessage>())
		// @ts-expect-error see LangGraph docs
		.register(registry, MessagesZodMeta),
	modelCalls: z.number().optional()
});
type MessagesState = z.infer<typeof MessagesStateSchema>;
type OllamaAgent = Runnable<BaseLanguageModelInput, AIMessageChunk, ChatOllamaCallOptions>;

export function agentNode(agent: OllamaAgent) {
	return async function (state: MessagesState) {
		const { messages } = state;
		try {
			const response = await agent.invoke(messages);
			return {
				messages: [response],
				modelCalls: (state.modelCalls ?? 0) + 1
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
	if (lastMessage == null || !AIMessage.isInstance(lastMessage)) return END;

	if (lastMessage.tool_calls?.length) {
		return 'tools';
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

	const workflow = new StateGraph(MessagesStateSchema)
		.addNode('agent', agentNode(agent))
		.addNode('tools', new ToolNode(tools))
		.addEdge(START, 'agent')
		.addEdge('tools', 'agent')
		.addConditionalEdges('agent', shouldContinue);

	return workflow.compile();
}

const graph = await initGraph();

export async function* runAgent(message: string): AsyncGenerator<AgentEvent> {
	const stream = await graph.stream(
		{ messages: [new HumanMessage(message)] },
		{ streamMode: 'messages' }
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

		if (nodeName === 'agent' && msg.content) {
			yield {
				type: 'token',
				data: msg.content.toString()
			};
		}

		if (nodeName === 'tools' && msg.name) {
			console.log(meta, msg);
			yield {
				type: 'trace',
				data: {
					node: 'tools',
					event: 'tool',
					data: { name: msg.name }
				}
			};
		}
	}

	// Final leave + end
	if (currentNode) {
		yield { type: 'trace', data: { node: currentNode, event: 'leave' } };
	}

	yield { type: 'end' };
}
