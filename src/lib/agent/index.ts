import { ChatOllama } from '@langchain/ollama';
import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { StateGraph, END } from '@langchain/langgraph';

const model = new ChatOllama({ model: 'mistral' });

interface AgentState {
	messages: BaseMessage[];
}

export async function callModel(state: AgentState, model: ChatOllama) {
	try {
		const { messages } = state;
		const response = await model.invoke(messages);
		return { messages: [response] };
	} catch (error: any) {
		if (error.message.includes('model not found')) {
			throw new Error('MODEL_UNAVAILABLE');
		}
		throw error;
	}
}

const workflow = new StateGraph<AgentState>({
	channels: {
		messages: {
			value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
			default: () => []
		}
	}
});

workflow.addNode('agent', (state) => callModel(state, model));
workflow.setEntryPoint('agent');
workflow.addConditionalEdges('agent', (state: AgentState) => {
	return END;
});

const graph = workflow.compile();

export async function* runAgent(message: string) {
	const stream = await graph.stream({ messages: [new HumanMessage(message)] });

	for await (const output of stream) {
		for (const message of output.agent.messages) {
			yield message.content;
		}
	}
}
