import { ChatOllama, type ChatOllamaCallOptions } from '@langchain/ollama';
import { AIMessageChunk, type BaseMessage } from '@langchain/core/messages';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { END, MessagesZodMeta, START, StateGraph } from '@langchain/langgraph';
import { registry } from '@langchain/langgraph/zod';
import * as z from 'zod';
import type { AgentEvent } from '$lib/chat';
import { getMCPClientService } from './mcp/client';
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import { Runnable } from '@langchain/core/runnables';
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
	const model = new ChatOllama({ model: 'qwen3' });

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
		{ streamMode: 'updates' }
	);

	for await (const output of stream) {
		const nodeName = Object.keys(output)[0];
		yield { type: 'trace', data: { node: nodeName, event: 'enter' } };

		if (output.agent) {
			for (const msg of output.agent.messages) {
				if (msg.content) {
					const content = msg.content as string;
					yield { type: 'token', data: content };
				}
			}
		}

		if (output.tools) {
			yield { type: 'trace', data: { node: 'tools', event: 'tool' } };
		}

		yield { type: 'trace', data: { node: nodeName, event: 'leave' } };
	}
	yield { type: 'end' };
}
