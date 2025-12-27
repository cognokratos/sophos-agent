import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { type ChatMessage, formatTraceNote } from '$lib/chat';
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

type EventCode = 'token' | 'trace' | 'end' | 'error';

interface Session {
	conversation: UUID;
	status: 'pending' | 'streaming' | 'done' | 'error';
	createdAt: number;
	updatedAt: number;
	error?: { code: string; message: string };
	subscribers: Set<(ev: string, data: unknown, id?: string) => void>;
	events: string[];
	tokenIndex?: number;
}

const sessions = new Map<UUID, Session>();

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();

	const message = body.message;
	if (!message || typeof message !== 'string' || message.trim() === '') {
		return json(
			{ error: { code: 'BAD_REQUEST', message: 'Message is required' } },
			{ status: 400 }
		);
	}

	const conversationStr = body.conversation;
	if (conversationStr && typeof conversationStr !== 'string') {
		return json(
			{ error: { code: 'BAD_REQUEST', message: 'Invalid Conversation ID' } },
			{ status: 400 }
		);
	}
	const conversationId = conversationStr ? parseUuid(conversationStr) : crypto.randomUUID();

	const session = sessions.get(conversationId);

	if (session?.status === 'pending' || session?.status === 'streaming') {
		return json(
			{
				error: {
					code: 'SESSION_IN_PROGRESS',
					message: 'Previous request still in progress'
				}
			},
			{ status: 409 }
		);
	}

	const newSession: Session = {
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

async function startAgent(conversationId: UUID, session: Session, message: string) {
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
				case 'token': {
					assistantMessage.content += event.data;
					sendEvent('token', id, event.data, session);
					break;
				}
				case 'trace': {
					await writeTrace(conversationId, event.data);

					// If this is a tool-related trace event, store it for Markdown persistence
					if (SHOW_TOOLS) {
						const noteMessage = formatTraceNote(event.data);
						assistantMessage.content += noteMessage;
						sendEvent('token', id, noteMessage, session);
					}

					sendEvent('trace', id, event.data, session);
					break;
				}

				case 'end': {
					session.status = 'done';
					await writeMessageFile(conversationId, assistantTurn, assistantMessage);

					sendEvent('end', id, { conversation: conversationId, session }, session);
					break;
				}
			}
		}
	} catch (e: unknown) {
		console.error(`Agent failure for session: ${session}`, e);
		const error = {
			code: 'AGENT_FAILURE',
			message: e instanceof Error ? e.message : 'Agent failed'
		};
		session.status = 'error';
		session.error = error;
		session.updatedAt = Date.now();
		const errId = String(++session.tokenIndex!);
		sendEvent('error', errId, error, session);
	}
}

function sendEvent(code: EventCode, id: string, data: unknown, session: Session) {
	const eventStr = `id: ${id}\nevent: ${code}\ndata: ${JSON.stringify(data)}\n\n`;
	session.events.push(eventStr);
	for (const send of session.subscribers) {
		try {
			send(code, data, id);
		} catch {
			/* ignore */
		}
	}
}

export const GET: RequestHandler = ({ url, request }) => {
	const conversationStr = url.searchParams.get('conversation');
	const conversationId = parseUuid(conversationStr);

	const session = sessions.get(conversationId);
	if (!session) {
		return new Response('event: error\ndata: {"code":"NOT_FOUND"}\n\n', {
			headers: { 'Content-Type': 'text/event-stream' }
		});
	}
	if (session.status === 'done') {
		return new Response(`event: end\ndata: ${JSON.stringify(session)}\n\n`, {
			headers: { 'Content-Type': 'text/event-stream' }
		});
	}
	if (session.status === 'error') {
		return new Response(`event: error\ndata: ${JSON.stringify(session.error)}\n\n`, {
			headers: { 'Content-Type': 'text/event-stream' }
		});
	}

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			let closed = false;
			const send = (event: string, data: unknown, id?: string) => {
				if (closed) return;
				let payload = '';
				if (id) payload += `id: ${id}\n`;
				payload += `event: ${event}\n`;
				payload += `data: ${JSON.stringify(data)}\n\n`;
				try {
					controller.enqueue(encoder.encode(payload));
				} catch {
					closed = true;
				}
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

			const sink = (event: string, data: unknown, id?: string) => send(event, data, id);

			if (session.status === 'streaming' || session.status === 'pending') {
				session.subscribers.add(sink);
			} else if (session.status === 'done') {
				send('end', session, String(session.tokenIndex ?? 0));
			} else if (session.status === 'error') {
				send(
					'error',
					session.error || { code: 'UNKNOWN', message: 'Unknown error' },
					String(session.tokenIndex ?? 0)
				);
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
