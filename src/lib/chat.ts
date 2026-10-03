/**
 * API contract between the server and the Svelte UI.
 *
 * These are plain, serializable DTOs. LangChain message objects never cross
 * this boundary; `src/lib/agent/messages.ts` converts them.
 */

type ChatEvent = 'token' | 'trace' | 'end' | 'chat-error' | 'ping';
type GraphEvent = 'enter' | 'leave' | 'call' | 'result';

/** Lifecycle of one run (one execution of the graph on a conversation's thread). */
export type RunStatus = 'running' | 'interrupted' | 'completed' | 'failed';

export type ErrorCode =
	| 'BAD_REQUEST'
	| 'NOT_FOUND'
	| 'SESSION_IN_PROGRESS'
	| 'RUN_NOT_RESUMABLE'
	| 'MODEL_UNAVAILABLE'
	| 'RECURSION_LIMIT'
	| 'AGENT_FAILURE'
	| 'UNKNOWN_ERROR';

export interface ChatError {
	code: ErrorCode;
	message: string;
	conversation?: string;
}

export interface ToolCallDto {
	id?: string;
	name: string;
	args: Record<string, unknown>;
}

/** One message of a conversation, as shown in the UI. */
export interface MessageDto {
	id: string;
	role: 'user' | 'assistant' | 'tool';
	content: string;
	/** assistant only: tools the model asked to call */
	toolCalls?: ToolCallDto[];
	/** tool only: which tool produced this result, for which call */
	name?: string;
	toolCallId?: string;
	status?: 'success' | 'error';
}

/** Conversation metadata (SQLite `conversations` + latest `runs` row). */
export interface ConversationSummary {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
	messageCount: number;
	/** status of the latest run, or null if no run has started yet */
	status: RunStatus | null;
	error?: ChatError;
}

/** `GET /api/conversations/:id` */
export interface ConversationDetail {
	conversation: ConversationSummary;
	messages: MessageDto[];
	/** the thread has unfinished graph steps and no run is active: POST `{ resume: true }` continues it */
	resumable: boolean;
}

export type AgentEvent =
	| { type: 'trace'; data: TraceNote }
	| { type: 'token'; data: string }
	| { type: 'end' };

export interface TraceNote {
	node: string;
	name: string;
	/** LangGraph super-step within the thread (`langgraph_step`) */
	step: number;
	event: GraphEvent;
	data?: Record<string, unknown>;
}

export type Subscriber = (code: ChatEvent, data: unknown, id?: string) => void;

/**
 * Formats a chat event into its SSE wire representation.
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
