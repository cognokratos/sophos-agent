export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ChatMessage {
	role: ChatRole;
	content: string;
}

export interface ChatRequest {
	message: string;
	conv: string;
}

export interface TraceNote {
	node: string;
	event: 'enter' | 'tool' | 'leave' | 'stream' | 'error';
	data?: Record<string, unknown>;
}

export type AgentEvent =
	| { type: 'trace'; data: TraceNote }
	| { type: 'token'; data: string }
	| { type: 'end' };
