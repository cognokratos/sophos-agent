import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/agent/persistence/database';
import { listConversations } from '$lib/agent/persistence/conversations';

export const GET: RequestHandler = async () => {
	try {
		return json({ conversations: listConversations(getDatabase()) });
	} catch (error) {
		console.error('Error fetching conversations:', error);
		return json(
			{ error: { code: 'FETCH_ERROR', message: 'Failed to fetch conversations' } },
			{ status: 500 }
		);
	}
};
