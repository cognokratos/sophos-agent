import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import type { ChatRequest } from '$lib/chat';
import { runAgent } from '$lib/agent';

// In-memory state
const conversations = new Map<string, Array<{ role: 'user' | 'assistant'; content: string; ts: number }>>();
const sessions = new Map<string, {
	conv: string;
	status: 'pending' | 'streaming' | 'done' | 'error';
	buffer: string;
	createdAt: number;
	updatedAt: number;
	error?: { code: string; message: string };
}>();

const newId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Fake runAgent adapter to yield string tokens
async function* runAgentAdapter(convHistory: Array<{ role: 'user' | 'assistant'; content: string }>): AsyncIterable<string> {
	// This is a simplified adapter. In a real scenario, you'd pass the history to the agent.
	const lastUserMessage = convHistory.filter(m => m.role === 'user').pop();
	if (!lastUserMessage) return;

	// Assuming runAgent returns an async iterable of objects with a 'text' property.
	// If it returns strings directly, the mapping is not needed.
	for await (const chunk of runAgent(lastUserMessage.content)) {
		yield chunk.replaceAll('\n', '<br>');
	}
}


export const POST: RequestHandler = async ({ request }) => {
	console.log('POST /api/chat');
	const body: ChatRequest = await request.json();
	const { message, conv: convId } = body;

	if (!message || message.trim() === '') {
		console.error('POST /api/chat - 400: Message is required');
		return json({ error: { code: 'BAD_REQUEST', message: 'Message is required' } }, { status: 400 });
	}

	const conv = convId || newId('conv');
	if (!conversations.has(conv)) {
		console.log(`POST /api/chat - Creating new conversation: ${conv}`);
		conversations.set(conv, []);
	}

	// Check for an active session for this conversation
	for (const [sessionId, session] of sessions.entries()) {
		if (session.conv === conv && (session.status === 'pending' || session.status === 'streaming')) {
			console.warn(`POST /api/chat - 409: Session in progress: ${sessionId}`);
			return json({
				error: {
					code: 'SESSION_IN_PROGRESS',
					message: 'Previous request still in progress',
				},
				session: sessionId
			}, { status: 409 });
		}
	}

	conversations.get(conv)!.push({ role: 'user', content: message, ts: Date.now() });

	const session = newId('sess');
	sessions.set(session, {
		conv,
		status: 'pending',
		buffer: '',
		createdAt: Date.now(),
		updatedAt: Date.now()
	});
	console.log(`POST /api/chat - Created new session: ${session} for conv: ${conv}`);

	return json({ conv, session });
};

export const GET: RequestHandler = ({ url, request }) => {
	const sessionId = url.searchParams.get('session');
	console.log(`GET /api/chat?session=${sessionId}`);

	if (!sessionId) {
		console.error('GET /api/chat - 400: Session ID is required');
		return new Response('event: error\ndata: {"code":"BAD_REQUEST","message":"Session ID is required"}\n\n', {
			status: 400,
			headers: { 'Content-Type': 'text/event-stream' }
		});
	}

	const session = sessions.get(sessionId);

	if (!session) {
		console.error(`GET /api/chat - 404: Session not found: ${sessionId}`);
		return new Response('event: error\ndata: {"code":"NOT_FOUND","message":"Session not found"}\n\n', {
			status: 404,
			headers: { 'Content-Type': 'text/event-stream' }
		});
	}

	console.log(`GET /api/chat - Found session: ${sessionId}, status: ${session.status}`);

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			const send = (event: string, data: unknown) => {
				let payload = `event: ${event}\n`;
				if (typeof data === 'string') {
					payload += `data: ${data}\n\n`;
				} else {
					payload += `data: ${JSON.stringify(data)}\n\n`;
				}
				controller.enqueue(encoder.encode(payload));
			};

			const pingInterval = setInterval(() => {
				console.log(`GET /api/chat - PING for session: ${sessionId}`);
				send('ping', '');
			}, 15000);

			request.signal.addEventListener('abort', () => {
				console.log(`GET /api/chat - Client disconnected from session: ${sessionId}`);
				clearInterval(pingInterval);
				if (session.status === 'streaming') {
					// In a real scenario, you'd signal the agent to stop.
					// For now, we just mark it as done to prevent re-attachment to a broken stream.
					session.status = 'done';
					session.updatedAt = Date.now();
					console.log(`GET /api/chat - Marked session as 'done' on disconnect: ${sessionId}`);
				}
				controller.close();
			});

			if (session.status === 'error') {
				console.error(`GET /api/chat - Session has error: ${sessionId}`, session.error);
				send('error', session.error);
				clearInterval(pingInterval);
				controller.close();
				return;
			}

			if (session.status === 'done') {
				console.log(`GET /api/chat - Replaying 'done' session: ${sessionId}`);
				// Replay buffer
				const chunks = session.buffer.match(/.{1,20}/g) || [];
				for (const chunk of chunks) {
					send('token', chunk);
				}
				send('end', { conv: session.conv, session: sessionId });
				clearInterval(pingInterval);
				controller.close();
				return;
			}

			// For pending or streaming, replay buffer first
			if (session.buffer) {
				console.log(`GET /api/chat - Replaying buffer for session: ${sessionId}`);
				const chunks = session.buffer.match(/.{1,20}/g) || [];
				for (const chunk of chunks) {
					send('token', chunk);
				}
			}

			if (session.status === 'pending') {
				console.log(`GET /api/chat - Starting 'pending' session: ${sessionId}`);
				session.status = 'streaming';
				session.updatedAt = Date.now();

				try {
					const convHistory = conversations.get(session.conv)!;
					let assistantMessage = convHistory.find(m => m.role === 'assistant' && m.content === '');
					if (!assistantMessage) {
						assistantMessage = { role: 'assistant', content: '', ts: Date.now() };
						convHistory.push(assistantMessage);
					}

					console.log(`GET /api/chat - Running agent for session: ${sessionId}`);
					for await (const token of runAgentAdapter(convHistory)) {
						send('token', token);
						session.buffer += token;
						assistantMessage.content += token;
						session.updatedAt = Date.now();
					}

					session.status = 'done';
					session.updatedAt = Date.now();
					console.log(`GET /api/chat - Agent finished, session 'done': ${sessionId}`);
					send('end', { conv: session.conv, session: sessionId });

				} catch (e: unknown) {
					console.error(`GET /api/chat - Agent run failed for session: ${sessionId}`, e);
					const error = { code: 'AGENT_FAILURE', message: e instanceof Error ? e.message : 'Agent failed' };
					session.status = 'error';
					session.error = error;
					session.updatedAt = Date.now();
					send('error', error);
				} finally {
					clearInterval(pingInterval);
					controller.close();
				}
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			'Connection': 'keep-alive'
		}
	});
};
