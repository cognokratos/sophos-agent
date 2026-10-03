import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { ConversationDetail } from '$lib/chat';
import { getThreadState } from '$lib/agent';
import { getActiveRun } from '$lib/agent/runs';
import { getDatabase } from '$lib/agent/persistence/database';
import { getConversation } from '$lib/agent/persistence/conversations';
import { parseUuid } from '$lib/utils';

/**
 * Conversation metadata (SQLite) plus its messages, read from the latest
 * checkpoint of the conversation's LangGraph thread.
 */
export const GET: RequestHandler = async ({ params }) => {
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

	try {
		const { messages, next } = await getThreadState(conversationId);
		const detail: ConversationDetail = {
			conversation,
			messages,
			resumable: next.length > 0 && !getActiveRun(conversationId)
		};
		return json(detail);
	} catch (error) {
		console.error(`Error loading conversation ${conversationId}:`, error);
		return json(
			{ error: { code: 'LOAD_ERROR', message: 'Failed to load conversation' } },
			{ status: 500 }
		);
	}
};
