import { ChatOllama } from '@langchain/ollama';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { StateGraph, START, END } from '@langchain/langgraph';
import { MessagesZodMeta } from "@langchain/langgraph";
import { registry } from "@langchain/langgraph/zod";
import * as z from "zod";


const MessagesState = z.object({
	messages: z
		.array(z.custom<BaseMessage>())
		// @ts-expect-error see LangGraph docs
		.register(registry, MessagesZodMeta),
	modelCalls: z.number().optional(),
});

const model = new ChatOllama({ model: 'mistral' });

export async function callModel(state: z.infer<typeof MessagesState>, model: ChatOllama) {
	const { messages } = state;
	try {
		const response = await model.invoke(messages);
		return {
			messages: [response],
			modelCalls: (state.modelCalls ?? 0) + 1,
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

	// If the LLM makes a tool call, then perform an action
	if (lastMessage.tool_calls?.length) {
		return "toolNode";
	}

	// Otherwise, we stop (reply to the user)
	return END;
}

const workflow = new StateGraph(MessagesState)
	.addNode('agent', (state) => callModel(state, model))
	.addEdge(START, 'agent')
	.addConditionalEdges('agent', shouldContinue)
	.addEdge('agent', END);

const graph = workflow.compile();

export async function* runAgent(message: string) {
	console.log("# Run Agent with message:")
	console.log("```\n", message, "\n```")
	const stream = await graph.stream({ messages: [new HumanMessage(message)] });
	for await (const output of stream) {
		if (!output.agent) continue;
		for (const msg of output.agent.messages) {
			console.log("## Agent message:")
			console.log("```\n", msg.content, "\n```")
			yield msg.content as string;
		}
	}
}
