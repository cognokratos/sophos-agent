import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import {
	type ChatError,
	type ChatMessage,
	type ChatSession,
	formatEvent,
	formatTraceNote,
	sendEvent,
	type Subscriber
} from '$lib/chat';
import { runAgent } from '$lib/agent';
import {
	getConversationMessages,
	getNextTurn,
	writeMessageFile,
	writeTrace
} from '$lib/agent/persistence';
import type { UUID } from 'crypto';
import { parseUuid } from '$lib/utils';

const SHOW_TOOLS = env.SHOW_TOOLS?.toLowerCase() === 'true';

const sessions = new Map<UUID, ChatSession>();

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();

	const message = body.message;
	if (!message || typeof message !== 'string' || message.trim() === '') {
		const error: ChatError = {
			code: 'BAD_REQUEST',
			message: 'Message is required'
		};
		return json({ error }, { status: 400 });
	}

	const conversationStr = body.conversation;
	if (conversationStr && typeof conversationStr !== 'string') {
		const error: ChatError = { code: 'BAD_REQUEST', message: 'Invalid Conversation ID' };
		return json({ error }, { status: 400 });
	}
	const conversationId = parseUuid(conversationStr) ?? crypto.randomUUID();

	const session = sessions.get(conversationId);

	if (session?.status === 'pending' || session?.status === 'streaming') {
		const error: ChatError = {
			code: 'SESSION_IN_PROGRESS',
			message: 'Previous request still in progress'
		};
		return json({ error }, { status: 409 });
	}

	const newSession: ChatSession = {
		conversation: conversationId,
		status: 'pending',
		createdAt: Date.now(),
		updatedAt: Date.now(),
		subscribers: new Set(),
		events: [],
		tokenIndex: 0
	};
	sessions.set(conversationId, newSession);

	startAgent(conversationId, newSession, message);

	return json({ conversation: conversationId, session: newSession });
};

async function startAgent(conversationId: UUID, session: ChatSession, message: string) {
	try {
		const chatHistory = await getConversationMessages(conversationId);
		const userTurn = await getNextTurn(conversationId);
		const userMessage: ChatMessage = {
			conversation: conversationId,
			id: crypto.randomUUID(),
			role: 'user',
			content: message
		};
		await writeMessageFile(conversationId, userTurn, userMessage);

		session.status = 'streaming';
		session.updatedAt = Date.now();

		const assistantTurn = await getNextTurn(conversationId);
		const assistantMessage: ChatMessage = {
			conversation: conversationId,
			id: crypto.randomUUID(),
			role: 'assistant',
			content: ''
		};

		for await (const event of runAgent(assistantTurn, userMessage, chatHistory)) {
			session.updatedAt = Date.now();
			const id = String(++session.tokenIndex!);

			switch (event.type) {
				case 'token':
					assistantMessage.content += event.data;
					sendEvent('token', id, event.data, session);
					break;
				case 'trace':
					await writeTrace(conversationId, event.data);

					if (SHOW_TOOLS) {
						const noteMessage = formatTraceNote(event.data);
						assistantMessage.content += noteMessage;
						sendEvent('token', id, noteMessage, session);
					}

					sendEvent('trace', id, event.data, session);
					break;
				case 'end':
					session.status = 'done';
					await writeMessageFile(conversationId, assistantTurn, assistantMessage);

					sendEvent('end', id, session, session);
					break;
			}
		}
	} catch (e: unknown) {
		console.error(`Agent failure for session: ${session}`, e);
		const error: ChatError = {
			code: 'AGENT_FAILURE',
			message: e instanceof Error ? e.message : 'Agent failed',
			conversation: conversationId
		};
		session.status = 'error';
		session.error = error;
		session.updatedAt = Date.now();
		const errId = String(++session.tokenIndex!);
		sendEvent('chat-error', errId, error, session);
	}
}

const EVENT_STREAM_HEADER = {
	headers: { 'Content-Type': 'text/event-stream' }
};

export const GET: RequestHandler = ({ url, request }) => {
	const conversationStr = url.searchParams.get('conversation');
	const conversationId = parseUuid(conversationStr);
	if (!conversationId) {
		const error: ChatError = {
			code: 'BAD_REQUEST',
			message: 'Invalid Conversation ID'
		};
		return new Response(formatEvent('chat-error', error), EVENT_STREAM_HEADER);
	}
	const session = sessions.get(conversationId);
	if (!session) {
		const error: ChatError = {
			code: 'NOT_FOUND',
			message: 'Conversation Not Found',
			conversation: conversationId
		};
		return new Response(formatEvent('chat-error', error), EVENT_STREAM_HEADER);
	}
	if (session.status === 'done') {
		return new Response(formatEvent('end', session), EVENT_STREAM_HEADER);
	}
	if (session.status === 'error') {
		return new Response(formatEvent('chat-error', session.error), EVENT_STREAM_HEADER);
	}

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			let closed = false;
			const send: Subscriber = (code, data, id) => {
				if (closed) {
					return;
				}
				try {
					const payload = formatEvent(code, data, id);
					controller.enqueue(encoder.encode(payload));
				} catch {
					closed = true;
				}
			};
			const sink: Subscriber = (code, data, id) => {
				send(code, data, id);
			};

			const pingInterval = setInterval(() => {
				send('ping', '');
			}, 15000);

			request.signal.addEventListener('abort', () => {
				clearInterval(pingInterval);
				session.subscribers.delete(sink);
				closed = true;
			});

			const lastEventId = request.headers.get('last-event-id');

			let lastIndex = 0;
			if (lastEventId) {
				const parsed = Number(lastEventId);
				if (!Number.isNaN(parsed)) lastIndex = parsed;
			}

			for (const eventStr of session.events) {
				const match = eventStr.match(/^id:\s*(\d+)/m);
				const idNum = match ? Number(match[1]) : 0;
				if (idNum > lastIndex)
					try {
						controller.enqueue(encoder.encode(eventStr));
					} catch {
						/* ignore */
					}
			}

			switch (session.status) {
				case 'streaming':
				case 'pending':
					session.subscribers.add(sink);
					break;
				case 'done':
					send('end', session, String(session.tokenIndex ?? 0));
					break;
				case 'error': {
					const error: ChatError = session.error ?? {
						code: 'UNKNOWN_ERROR',
						message: 'Unknown error'
					};
					send('chat-error', error, String(session.tokenIndex ?? 0));
				}
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive'
		}
	});
};
