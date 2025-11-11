import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import type { ChatRequest } from '$lib/chat';
import { runAgent } from '$lib/agent';

interface Conversation {
	role: 'user' | 'assistant';
	content: string;
	ts: number;
}
interface Session {
	conv: string;
	status: 'pending' | 'streaming' | 'done' | 'error';
	buffer: string;
	createdAt: number;
	updatedAt: number;
	error?: { code: string; message: string };
	subscribers: Set<(ev: string, data: unknown, id?: string) => void>;
	events: string[];
	tokenIndex?: number;
}

// In-memory state
const conversations = new Map<string, Array<Conversation>>();
const sessions = new Map<string, Session>();

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
	const sessionObj: Session = {
		conv,
		status: 'pending',
		buffer: '',
		createdAt: Date.now(),
		updatedAt: Date.now(),
		subscribers: new Set(),
		events: [],
		tokenIndex: 0,
	};
	sessions.set(session, sessionObj);

	// Start the agent in the background (fire-and-forget)
	startAgent(conv, session, sessionObj);

	return json({ conv, session });
};

async function startAgent(conv: string, session: string, sessionObj: Session) {
	try {
		const convHistory = conversations.get(conv)!;
		let assistantMessage = convHistory.find(m => m.role === 'assistant' && m.content === '');
		if (!assistantMessage) {
			assistantMessage = { role: 'assistant', content: '', ts: Date.now() };
			convHistory.push(assistantMessage);
		}

		sessionObj.status = 'streaming';
		sessionObj.updatedAt = Date.now();

		for await (const token of runAgentAdapter(convHistory)) {
			sessionObj.buffer += token;
			assistantMessage.content += token;
			sessionObj.updatedAt = Date.now();

			// Construct SSE payload
			const id = String(++sessionObj.tokenIndex!);
			const eventStr = `id: ${id}\nevent: token\ndata: ${token}\n\n`;
			sessionObj.events.push(eventStr);
			if (sessionObj.events.length > 5000) sessionObj.events.shift();


			// Fan out live
			for (const send of sessionObj.subscribers) {
				try { send('token', token, id); } catch { /* empty */ }
			}
		}

		sessionObj.status = 'done';
		sessionObj.updatedAt = Date.now();
		const endId = String(++sessionObj.tokenIndex!);
		const endEvent = `id: ${endId}\nevent: end\ndata: ${JSON.stringify({ conv, session })}\n\n`;
		sessionObj.events.push(endEvent);
		for (const send of sessionObj.subscribers) {
			try { send('end', { conv, session }, endId); } catch { /* empty */ }
		}
	} catch (e: unknown) {
		console.error(`POST /api/chat - Agent failure for session: ${session}`, e);
		const error = { code: 'AGENT_FAILURE', message: e instanceof Error ? e.message : 'Agent failed' };
		sessionObj.status = 'error';
		sessionObj.error = error;
		sessionObj.updatedAt = Date.now();
		const errId = String(++sessionObj.tokenIndex!);
		const errEvent = `id: ${errId}\nevent: server-error\ndata: ${JSON.stringify(error)}\n\n`;
		sessionObj.events.push(errEvent);
		for (const send of sessionObj.subscribers) {
			try { send('server-error', error); } catch { /* empty */ }
		}
	}
}

export const GET: RequestHandler = ({ url, request }) => {
	const sessionId = url.searchParams.get('session');
	console.log(`GET /api/chat?session=${sessionId}`);

	if (!sessionId || !sessions.has(sessionId)) {
		return new Response('event: error\ndata: {"code":"NOT_FOUND"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
	}
	const session = sessions.get(sessionId);
	if (!session) {
		return new Response('event: error\ndata: {"code":"NOT_FOUND"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
	}
	console.log(`GET /api/chat - Found session: ${sessionId}, status: ${session.status}`);

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			let closed = false;
			const send = (event: string, data: unknown, id?: string) => {
				if (closed) return;
				let payload = '';
				if (id) payload += `id: ${id}\n`;
				payload += `event: ${event}\n`;
				payload += `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;
				try { controller.enqueue(encoder.encode(payload)); } catch { closed = true; }
			};

			const pingInterval = setInterval(() => {
				console.log(`GET /api/chat - PING for session: ${sessionId}`);
				send('ping', '');
			}, 15000);

			request.signal.addEventListener('abort', () => {
				console.log(`GET /api/chat - Client disconnected from session: ${sessionId}`);
				clearInterval(pingInterval);
				session.subscribers.delete(sink);
				closed = true;
			});

			const lastEventId = request.headers.get('last-event-id'); // 👈 native SSE resume header

			// Determine resume index
			let lastIndex = 0;
			if (lastEventId) {
				const parsed = Number(lastEventId);
				if (!Number.isNaN(parsed)) lastIndex = parsed;
				console.log(`GET /api/chat - Resuming after id ${lastIndex} for session ${sessionId}`);
			}

			// Replay all events with ID greater than lastEventId
			for (const eventStr of session.events) {
				// Extract numeric id (we encoded "id: X" on first line)
				const match = eventStr.match(/^id:\s*(\d+)/m);
				const idNum = match ? Number(match[1]) : 0;
				if (idNum > lastIndex) try { controller.enqueue(encoder.encode(eventStr)); } catch { /* ignore */ }
			}

			const sink = (event: string, data: unknown, id?: string) => send(event, data, id);

			// Subscribe for future live tokens
			if (session.status === 'streaming' || session.status === 'pending') {
				session.subscribers.add(sink);
			} else if (session.status === 'done') {
				send('end', { conv: session.conv, session: sessionId }, String(session.tokenIndex ?? 0));
			} else if (session.status === 'error') {
				send('server-error', session.error || { code: 'UNKNOWN', message: 'Unknown error' }, String(session.tokenIndex ?? 0));
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


