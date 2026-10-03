import type { ConversationSummary, MessageDto } from '$lib/chat';
import type { BaseMessage } from '@langchain/core/messages';
import { getGraph } from '$lib/agent';
import { threadConfig } from './graph';
import { toMessageDto } from './messages';

/**
 * Human-readable exports, generated on demand from durable state.
 * Nothing here is read back by the application: deleting an export loses nothing.
 */

/** The conversation as a Markdown transcript (user, assistant, tool calls and results). */
export function toMarkdown(conversation: ConversationSummary, messages: MessageDto[]): string {
	const lines = [
		`# ${conversation.title}`,
		'',
		`- Conversation / thread_id: \`${conversation.id}\``,
		`- Created: ${conversation.createdAt}`,
		`- Updated: ${conversation.updatedAt}`,
		''
	];
	for (const message of messages) {
		if (message.role === 'user') {
			lines.push('## User', '', message.content, '');
		} else if (message.role === 'assistant') {
			lines.push('## Assistant', '');
			if (message.content) lines.push(message.content, '');
			for (const call of message.toolCalls ?? []) {
				lines.push(`> **Tool call** \`${call.name}\` (${call.id ?? '?'})`, '>', '> ```json');
				lines.push(
					...JSON.stringify(call.args, null, 2)
						.split('\n')
						.map((l) => `> ${l}`)
				);
				lines.push('> ```', '');
			}
		} else {
			lines.push(
				`### Tool result: \`${message.name ?? '?'}\` (${message.status ?? 'success'})`,
				''
			);
			lines.push('```', message.content, '```', '');
		}
	}
	return lines.join('\n');
}

/**
 * One JSON line per checkpoint of the thread, oldest first: what LangGraph
 * persisted after each step of each run.
 */
export async function checkpointHistoryJsonl(conversationId: string): Promise<string> {
	const lines: string[] = [];
	for await (const snapshot of getGraph().getStateHistory(threadConfig(conversationId))) {
		const messages: BaseMessage[] = snapshot.values.messages ?? [];
		const last = messages.at(-1);
		lines.push(
			JSON.stringify({
				checkpoint_id: snapshot.config.configurable?.checkpoint_id,
				created_at: snapshot.createdAt,
				step: snapshot.metadata?.step,
				source: snapshot.metadata?.source,
				next: snapshot.next,
				message_count: messages.length,
				last_message: last ? toMessageDto(last) : null
			})
		);
	}
	return lines.reverse().join('\n') + '\n';
}
