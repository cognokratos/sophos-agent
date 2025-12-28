import type { UUID } from 'crypto';

type ChatRole = 'user' | 'assistant';
type ChatEvent = 'token' | 'trace' | 'end' | 'chat-error' | 'ping';
type GraphEvent = 'enter' | 'leave' | 'call' | 'result';
type SessionStatus = 'pending' | 'streaming' | 'done' | 'error';
type ErrorCode =
	| 'BAD_REQUEST'
	| 'NOT_FOUND'
	| 'SESSION_IN_PROGRESS'
	| 'MODEL_UNAVAILABLE'
	| 'AGENT_FAILURE'
	| 'UNKNOWN_ERROR';

export type AgentEvent =
	| { type: 'trace'; data: TraceNote }
	| { type: 'token'; data: string }
	| { type: 'end' };

export type Subscriber = (code: ChatEvent, data: unknown, id?: string) => void;

export interface ChatMessage {
	conversation: UUID;
	id: UUID;
	role: ChatRole;
	content: string;
}

export interface ChatSession {
	conversation: UUID;
	status: SessionStatus;
	createdAt: number;
	updatedAt: number;
	error?: ChatError;
	subscribers: Set<Subscriber>;
	events: string[];
	tokenIndex?: number;
}

export interface ChatError {
	code: ErrorCode;
	message: string;
	conversation?: UUID;
}

export interface TraceNote {
	node: string;
	name: string;
	turn: number;
	event: GraphEvent;
	data?: Record<string, unknown>;
}

/**
 * Send a chat event to all subscribers.
 * @param code
 * @param id
 * @param data
 * @param session
 */
export function sendEvent(code: ChatEvent, id: string, data: unknown, session: ChatSession) {
	const eventStr = formatEvent(code, data, id);
	session.events.push(eventStr);
	for (const send of session.subscribers) {
		try {
			send(code, data, id);
		} catch {
			/* ignore */
		}
	}
}

/**
 * Formats a chat event information into an SSE representation.
 * @param code
 * @param data
 * @param id
 */
export function formatEvent(code: ChatEvent, data: unknown, id?: string) {
	const eventStr = [];
	if (id) {
		eventStr.push(`id: ${id}`);
	}
	eventStr.push(`event: ${code}`);
	eventStr.push(`data: ${JSON.stringify(data)}`);
	eventStr.push('\n');
	return eventStr.join('\n');
}

/**
 * Formats TraceNote information into a Markdown representation.
 */
export function formatTraceNote(traceNote: TraceNote): string {
	if (traceNote.event === 'call') {
		const { name, tool_call_id, arguments: args } = traceNote.data || {};
		const toolName = name || 'unknown';
		const callId = tool_call_id || 'unknown';
		const toolArgs = Object.entries(args ?? {});
		let message = '';
		for (const [key, val] of toolArgs) {
			message += ` > ${key}: ${val}  \n`;
		}
		return `---\n > # Call: ${toolName} (${callId})\n > ${message}\n---\n\n`;
	}
	if (traceNote.event === 'result') {
		const { name, tool_call_id, result } = traceNote.data || {};
		const toolName = name || 'unknown';
		const callId = tool_call_id || 'unknown';
		const toolResult = result ?? '';
		const message = toolResult.toString().replaceAll('\n', '  \n > ');

		return `---\n > # Tool: ${toolName} (${callId})\n > ${message}\n---\n\n`;
	}
	return '';
}
