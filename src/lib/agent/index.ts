import { ChatOllama } from '@langchain/ollama';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { StateGraph, START, END } from '@langchain/langgraph';
import { MessagesZodMeta } from '@langchain/langgraph';
import { registry } from '@langchain/langgraph/zod';
import * as z from 'zod';
import type { AgentEvent } from '$lib/chat';

const MessagesState = z.object({
	messages: z
		.array(z.custom<BaseMessage>())
		// @ts-expect-error see LangGraph docs
		.register(registry, MessagesZodMeta),
	modelCalls: z.number().optional()
});

const model = new ChatOllama({ model: 'mistral' });

export async function callModel(state: z.infer<typeof MessagesState>, model: ChatOllama) {
	const { messages } = state;
	try {
		const response = await model.invoke(messages);
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
}

async function shouldContinue(state: z.infer<typeof MessagesState>) {
	const lastMessage = state.messages.at(-1);
	if (lastMessage == null || !AIMessage.isInstance(lastMessage)) return END;

	if (lastMessage.tool_calls?.length) {
		return 'toolNode';
	}

	return END;
}

const workflow = new StateGraph(MessagesState)
	.addNode('agent', (state) => callModel(state, model))
	.addEdge(START, 'agent')
	.addConditionalEdges('agent', shouldContinue)
	.addEdge('agent', END);

const graph = workflow.compile();

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
		yield { type: 'trace', data: { node: nodeName, event: 'leave' } };
	}
	yield { type: 'end' };
}
