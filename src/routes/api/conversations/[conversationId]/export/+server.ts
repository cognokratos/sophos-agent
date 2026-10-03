import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getThreadState } from '$lib/agent';
import { checkpointHistoryJsonl, toMarkdown } from '$lib/agent/export';
import { getDatabase } from '$lib/agent/persistence/database';
import { getConversation } from '$lib/agent/persistence/conversations';
import { parseUuid } from '$lib/utils';

/**
 * Downloads a generated, read-only view of a conversation:
 *   ?format=md     (default) Markdown transcript
 *   ?format=jsonl  LangGraph checkpoint history, one line per checkpoint
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const conversationId = parseUuid(params.conversationId);
	if (!conversationId) {
		return json(
			{ error: { code: 'BAD_REQUEST', message: 'Invalid Conversation ID' } },
			{ status: 400 }
		);
	}
	const conversation = getConversation(getDatabase(), conversationId);
	if (!conversation) {
		return json(
			{ error: { code: 'NOT_FOUND', message: 'Conversation Not Found' } },
			{ status: 404 }
		);
	}

	if (url.searchParams.get('format') === 'jsonl') {
		return new Response(await checkpointHistoryJsonl(conversationId), {
			headers: {
				'Content-Type': 'application/x-ndjson; charset=utf-8',
				'Content-Disposition': `attachment; filename="${conversationId}.checkpoints.jsonl"`
			}
		});
	}

	const { messages } = await getThreadState(conversationId);
	return new Response(toMarkdown(conversation, messages), {
		headers: {
			'Content-Type': 'text/markdown; charset=utf-8',
			'Content-Disposition': `attachment; filename="${conversationId}.md"`
		}
	});
};
