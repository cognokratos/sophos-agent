import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listConversations } from '$lib/agent/persistence';

export const GET: RequestHandler = async () => {
	try {
		const sortedConversations = await listConversations();
		return json({ conversations: sortedConversations });
	} catch (error) {
		console.error('Error fetching conversations:', error);
		return json(
			{ error: { code: 'FETCH_ERROR', message: 'Failed to fetch conversations' } },
			{ status: 500 }
		);
	}
};
