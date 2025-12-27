import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getConversationMessages } from '$lib/agent/persistence';

export const GET: RequestHandler = async ({ params }) => {
	const { conversationId } = params;

	if (!conversationId) {
		return json(
			{ error: { code: 'BAD_REQUEST', message: 'Session ID is required' } },
			{ status: 400 }
		);
	}

	try {
		return json({ messages: await getConversationMessages(conversationId) });
	} catch (error) {
		console.error(`Error loading conversation for session ${conversationId}:`, error);
		return json(
			{ error: { code: 'LOAD_ERROR', message: 'Failed to load conversation' } },
			{ status: 500 }
		);
	}
};
