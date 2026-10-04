import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { type ChatError, formatEvent, type Subscriber } from '$lib/chat';
import { getThreadState } from '$lib/agent';
import { getActiveRun, startRun, subscribe } from '$lib/agent/runs';
import { getDatabase } from '$lib/agent/persistence/database';
import { createConversation, getConversation } from '$lib/agent/persistence/conversations';
import { parseUuid } from '$lib/utils';

function badRequest(message: string, status = 400, code: ChatError['code'] = 'BAD_REQUEST') {
	const error: ChatError = { code, message };
	return json({ error }, { status });
}

/**
 * Starts a run.
 *
 *   { message }                 new conversation
 *   { message, conversation }   next turn of an existing conversation
 *   { resume: true, conversation }  continue an interrupted/failed run from its last checkpoint
 *
 * Returns immediately; output is streamed by `GET /api/chat?conversation=…`.
 */
export const POST: RequestHandler = async ({ request }) => {
	let body: { message?: unknown; conversation?: unknown; resume?: unknown };
	try {
		body = await request.json();
	} catch {
		return badRequest('Request body must be JSON');
	}

	const resume = body.resume === true;
	const message = typeof body.message === 'string' ? body.message.trim() : '';
	if (!resume && !message) {
		return badRequest('Message is required');
	}

	const db = getDatabase();
	let conversationId: string;

	if (body.conversation === undefined || body.conversation === null) {
		if (resume) {
			return badRequest('A conversation is required to resume');
		}
		conversationId = randomUUID();
		createConversation(db, conversationId, message);
	} else {
		const parsed = typeof body.conversation === 'string' ? parseUuid(body.conversation) : null;
		if (!parsed) {
			return badRequest('Invalid Conversation ID');
		}
		if (!getConversation(db, parsed)) {
			return badRequest('Conversation Not Found', 404, 'NOT_FOUND');
		}
		conversationId = parsed;
	}

	if (getActiveRun(conversationId)) {
		return badRequest('Previous request still in progress', 409, 'SESSION_IN_PROGRESS');
	}

	if (resume) {
		const { next } = await getThreadState(conversationId);
		if (next.length === 0) {
			return badRequest('Nothing to resume: the last run finished', 409, 'RUN_NOT_RESUMABLE');
		}
	}

	const run = startRun(conversationId, resume ? { resume: true } : { message });
	return json({ conversation: conversationId, run: run.runId });
};

const EVENT_STREAM_HEADERS = {
	'Content-Type': 'text/event-stream',
	'Cache-Control': 'no-cache, no-transform',
	Connection: 'keep-alive'
};

function singleEvent(code: Parameters<Subscriber>[0], data: unknown) {
	return new Response(formatEvent(code, data), { headers: EVENT_STREAM_HEADERS });
}

/**
 * SSE stream of the conversation's active run. If no run is active, the
 * durable state answers: `end` (with the last run's status) or `chat-error`.
 */
export const GET: RequestHandler = ({ url, request }) => {
	const conversationId = parseUuid(url.searchParams.get('conversation'));
	if (!conversationId) {
		return singleEvent('chat-error', { code: 'BAD_REQUEST', message: 'Invalid Conversation ID' });
	}

	const run = getActiveRun(conversationId);
	if (!run) {
		const conversation = getConversation(getDatabase(), conversationId);
		if (!conversation) {
			const error: ChatError = {
				code: 'NOT_FOUND',
				message: 'Conversation Not Found',
				conversation: conversationId
			};
			return singleEvent('chat-error', error);
		}
		return singleEvent('end', { conversation: conversationId, status: conversation.status });
	}

	const lastEventId = Number(request.headers.get('last-event-id') ?? 0) || 0;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			let closed = false;

			const close = () => {
				if (closed) return;
				closed = true;
				clearInterval(pingInterval);
				unsubscribe();
				try {
					controller.close();
				} catch {
					/* already closed */
				}
			};
			const write = (payload: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(payload));
				} catch {
					close();
				}
			};

			const pingInterval = setInterval(() => write(formatEvent('ping', '')), 15000);
			const unsubscribe = subscribe(run, lastEventId, write, (code, data, id) => {
				write(formatEvent(code, data, id));
				if (code === 'end' || code === 'chat-error') {
					close();
				}
			});
			request.signal.addEventListener('abort', close);
		}
	});

	return new Response(stream, { headers: EVENT_STREAM_HEADERS });
};
