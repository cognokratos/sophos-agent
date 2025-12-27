import type { UUID } from 'crypto';

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ChatMessage {
	conversation: UUID;
	id: UUID;
	role: ChatRole;
	content: string;
}

export interface TraceNote {
	node: string;
	name: string;
	turn: number;
	event: 'enter' | 'leave' | 'stream' | 'error' | 'tool' | 'call' | 'result';
	data?: Record<string, unknown>;
}

export type AgentEvent =
	| { type: 'trace'; data: TraceNote }
	| { type: 'token'; data: string }
	| { type: 'end' };

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
