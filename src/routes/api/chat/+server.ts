import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import type { ChatRequest, ChatMessage } from '$lib/chat';
import { runAgent } from '$lib/agent';
import { writeMessageFile, writeTrace } from '$lib/agent/persistence';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { UUID } from 'crypto';

const LOG_DIR = env.LOG_DIR ?? 'data/logs';

interface Session {
	conv: string;
	status: 'pending' | 'streaming' | 'done' | 'error';
	createdAt: number;
	updatedAt: number;
	error?: { code: string; message: string };
	subscribers: Set<(ev: string, data: unknown, id?: string) => void>;
	events: string[];
	tokenIndex?: number;
}

const sessions = new Map<string, Session>();
const newId = (prefix: string) =>
	`${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

export const POST: RequestHandler = async ({ request }) => {
	const body: ChatRequest = await request.json();
	const { message, conv: convId } = body;

	if (!message || message.trim() === '') {
		return json(
			{ error: { code: 'BAD_REQUEST', message: 'Message is required' } },
			{ status: 400 }
		);
	}

	const conv = convId || newId('conv');

	for (const [sessionId, session] of sessions.entries()) {
		if (session.conv === conv && (session.status === 'pending' || session.status === 'streaming')) {
			return json(
				{
					error: {
						code: 'SESSION_IN_PROGRESS',
						message: 'Previous request still in progress'
					},
					session: sessionId
				},
				{ status: 409 }
			);
		}
	}

	const session = newId('sess');
	const sessionObj: Session = {
		conv,
		status: 'pending',
		createdAt: Date.now(),
		updatedAt: Date.now(),
		subscribers: new Set(),
		events: [],
		tokenIndex: 0
	};
	sessions.set(session, sessionObj);

	const messageId: UUID = crypto.randomUUID();
	const userMessage: ChatMessage = { conv, session, id: messageId, role: 'user', content: message };
	const turn = await getNextTurn(conv);
	await writeMessageFile(conv, turn, userMessage);

	startAgent(conv, session, sessionObj, userMessage);

	return json({ conv, session, messageId });
};

async function getNextTurn(sessionId: string): Promise<number> {
	try {
		const sessionDir = join(LOG_DIR, sessionId);
		const files = await readdir(sessionDir);
		return files.filter((f) => f.endsWith('.md')).length + 1;
	} catch {
		return 1; // Directory likely doesn't exist yet
	}
}

async function startAgent(
	conv: string,
	session: string,
	sessionObj: Session,
	userMessage: ChatMessage
) {
	try {
		sessionObj.status = 'streaming';
		sessionObj.updatedAt = Date.now();

		let assistantContent = '';
		const messageId: UUID = crypto.randomUUID();
		const assistantMessage: ChatMessage = {
			conv,
			session,
			id: messageId,
			role: 'assistant',
			content: ''
		};
		const toolCallTraces: import('$lib/chat').TraceNote[] = [];

		for await (const event of runAgent(userMessage.content)) {
			sessionObj.updatedAt = Date.now();
			const id = String(++sessionObj.tokenIndex!);

			switch (event.type) {
				case 'token': {
					assistantContent += event.data;
					const tokenEventStr = `id: ${id}\nevent: token\ndata: ${JSON.stringify(event.data)}\n\n`;
					sessionObj.events.push(tokenEventStr);
					for (const send of sessionObj.subscribers) {
						try {
							send('token', event.data, id);
						} catch {
							/* empty */
						}
					}
					break;
				}
				case 'trace': {
					await writeTrace(conv, event.data);

					// If this is a tool-related trace event, store it for markdown persistence
					if (event.data.event === 'tool_call' || event.data.event === 'tool_result') {
						toolCallTraces.push(event.data);
					}

					const traceEventStr = `id: ${id}\nevent: trace\ndata: ${JSON.stringify(event.data)}\n\n`;
					sessionObj.events.push(traceEventStr);
					for (const send of sessionObj.subscribers) {
						try {
							send('trace', event.data, id);
						} catch {
							/* empty */
						}
					}
					break;
				}

				case 'end': {
					sessionObj.status = 'done';
					assistantMessage.content = assistantContent;
					const nextTurn = await getNextTurn(conv);
					await writeMessageFile(conv, nextTurn, assistantMessage, toolCallTraces);

					const endEventStr = `id: ${id}\nevent: end\ndata: ${JSON.stringify({ conv, session })}\n\n`;
					sessionObj.events.push(endEventStr);
					for (const send of sessionObj.subscribers) {
						try {
							send('end', { conv, session }, id);
						} catch {
							/* empty */
						}
					}
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
		sessionObj.status = 'error';
		sessionObj.error = error;
		sessionObj.updatedAt = Date.now();
		const errId = String(++sessionObj.tokenIndex!);
		const errEvent = `id: ${errId}\nevent: server-error\ndata: ${JSON.stringify(error)}\n\n`;
		sessionObj.events.push(errEvent);
		for (const send of sessionObj.subscribers) {
			try {
				send('server-error', error);
			} catch {
				/* empty */
			}
		}
	}
}

export const GET: RequestHandler = ({ url, request }) => {
	const sessionId = url.searchParams.get('session');

	if (!sessionId || !sessions.has(sessionId)) {
		return new Response('event: error\ndata: {"code":"NOT_FOUND"}\n\n', {
			headers: { 'Content-Type': 'text/event-stream' }
		});
	}
	const session = sessions.get(sessionId);
	if (!session) {
		return new Response('event: error\ndata: {"code":"NOT_FOUND"}\n\n', {
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
				send('end', { conv: session.conv, session: sessionId }, String(session.tokenIndex ?? 0));
			} else if (session.status === 'error') {
				send(
					'server-error',
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
