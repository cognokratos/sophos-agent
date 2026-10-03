import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import type { MessageDto } from '$lib/chat';

/**
 * Adapter at the API boundary: LangChain messages (as stored in the
 * LangGraph thread) -> plain DTOs for the UI.
 *
 * System messages are never part of the thread (the agent node prepends the
 * system prompt on each model call), so only human, AI and tool messages occur.
 */
export function toMessageDto(message: BaseMessage): MessageDto | null {
	const id = message.id ?? '';

	if (HumanMessage.isInstance(message)) {
		return { id, role: 'user', content: message.text };
	}

	if (AIMessage.isInstance(message)) {
		const dto: MessageDto = { id, role: 'assistant', content: message.text };
		if (message.tool_calls?.length) {
			dto.toolCalls = message.tool_calls.map((call) => ({
				id: call.id,
				name: call.name,
				args: call.args
			}));
		}
		return dto;
	}

	if (ToolMessage.isInstance(message)) {
		return {
			id,
			role: 'tool',
			content: message.text,
			name: message.name,
			toolCallId: message.tool_call_id,
			status: message.status
		};
	}

	return null;
}

export function toMessageDtos(messages: BaseMessage[]): MessageDto[] {
	return messages.map(toMessageDto).filter((m) => m !== null);
}
