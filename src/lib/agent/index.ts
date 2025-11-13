import { ChatOllama } from '@langchain/ollama';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { StateGraph, START, END } from '@langchain/langgraph';
import { MessagesZodMeta } from '@langchain/langgraph';
import { registry } from '@langchain/langgraph/zod';
import * as z from 'zod';
import type { AgentEvent } from '$lib/chat';
import { getMCPClientService } from './mcp/client';

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

// Tool execution node
async function toolNode(state: z.infer<typeof MessagesState>) {
	const lastMessage = state.messages.at(-1);
	if (!AIMessage.isInstance(lastMessage) || !lastMessage.tool_calls) {
		return state;
	}

	// Get MCP client service to retrieve tools
	const mcpClientService = getMCPClientService();

	// Execute all tool calls in parallel
	const toolMessages = await Promise.all(
		lastMessage.tool_calls.map(async (toolCall) => {
			try {
				// Try to get the tool from MCP client
				const tool = await mcpClientService.getToolByName(toolCall.name);

				if (!tool) {
					console.error(`Tool not found: ${toolCall.name}`);
					return new ToolMessage({
						content: `Error: Tool not found: ${toolCall.name}`,
						tool_call_id: toolCall.id
					});
				}

				// Execute the tool with the provided arguments
				const result = await tool.invoke(toolCall.args);
				return new ToolMessage({
					content: typeof result === 'string' ? result : JSON.stringify(result),
					tool_call_id: toolCall.id
				});
			} catch (error) {
				console.error(`Error executing tool ${toolCall.name}:`, error);
				return new ToolMessage({
					content: `Error executing tool ${toolCall.name}: ${(error as Error).message}`,
					tool_call_id: toolCall.id
				});
			}
		})
	);

	return {
		messages: toolMessages
	};
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
	.addNode('toolNode', toolNode)
	.addEdge(START, 'agent')
	.addConditionalEdges('agent', shouldContinue)
	.addEdge('toolNode', 'agent');

const graph = workflow.compile();

export async function* runAgent(message: string): AsyncGenerator<AgentEvent> {
	// Initialize MCP client service if not already done
	const mcpClientService = getMCPClientService();
	if (!mcpClientService.isInitialized()) {
		await mcpClientService.initialize();
	}

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

		if (output.toolNode) {
			yield { type: 'trace', data: { node: 'toolNode', event: 'tools_executed' } };
		}

		yield { type: 'trace', data: { node: nodeName, event: 'leave' } };
	}
	yield { type: 'end' };
}
