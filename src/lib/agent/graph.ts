import { AIMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import type { Runnable } from '@langchain/core/runnables';
import type { StructuredToolInterface } from '@langchain/core/tools';
import {
	StateGraph,
	START,
	END,
	MessagesAnnotation,
	type BaseCheckpointSaver
} from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';

/**
 * The agent graph:
 *
 *   START → agent ─┬─ no tool calls ─→ END
 *                  └─ tool calls ────→ tools → agent
 *
 * State is just the message list (`MessagesAnnotation`). With a checkpointer,
 * that list is persisted after every step under the run's `thread_id`, so a
 * new run only needs to pass the new user message.
 */

export const nodes = {
	AGENT: 'agent',
	TOOLS: 'tools'
} as const;

type MessagesState = typeof MessagesAnnotation.State;

/** A chat model that can be bound to tools (ChatOllama in production, a stub in tests). */
export interface AgentModel {
	bindTools(tools: StructuredToolInterface[]): Runnable<BaseMessage[], BaseMessage>;
}

export interface AgentGraphOptions {
	model: AgentModel;
	/** Resolved when a node runs, not when the graph is built: reading a thread never needs MCP. */
	tools: () => Promise<StructuredToolInterface[]>;
	/** Read on every model call, so edits to system.md apply without a restart. */
	systemPrompt: () => Promise<string>;
	checkpointer: BaseCheckpointSaver;
}

export function agentNode(options: Pick<AgentGraphOptions, 'model' | 'tools' | 'systemPrompt'>) {
	return async function agent(state: MessagesState) {
		const model = options.model.bindTools(await options.tools());
		const system = new SystemMessage(await options.systemPrompt());
		try {
			// The system prompt is sent to the model but never stored in the thread.
			const response = await model.invoke([system, ...state.messages]);
			return { messages: [response] };
		} catch (error: unknown) {
			// Ollama answers 404 with "model '<name>' not found"
			if (error instanceof Error && /model .* not found/i.test(error.message)) {
				throw new Error('MODEL_UNAVAILABLE', { cause: error });
			}
			throw error;
		}
	};
}

export function toolsNode(options: Pick<AgentGraphOptions, 'tools'>) {
	return async function tools(state: MessagesState) {
		return new ToolNode(await options.tools()).invoke(state);
	};
}

export function routeAfterAgent(state: MessagesState) {
	const last = state.messages.at(-1);
	if (last && AIMessage.isInstance(last) && last.tool_calls?.length) {
		return nodes.TOOLS;
	}
	return END;
}

export function buildAgentGraph(options: AgentGraphOptions) {
	return new StateGraph(MessagesAnnotation)
		.addNode(nodes.AGENT, agentNode(options))
		.addNode(nodes.TOOLS, toolsNode(options))
		.addEdge(START, nodes.AGENT)
		.addConditionalEdges(nodes.AGENT, routeAfterAgent, [nodes.TOOLS, END])
		.addEdge(nodes.TOOLS, nodes.AGENT)
		.compile({ checkpointer: options.checkpointer });
}

export type AgentGraph = ReturnType<typeof buildAgentGraph>;

/** LangGraph run config for a conversation: the conversation id is the thread id. */
export function threadConfig(conversationId: string) {
	return { configurable: { thread_id: conversationId } };
}
