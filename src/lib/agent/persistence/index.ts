import { env } from '$env/dynamic/private';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ChatMessage, ChatRole, TraceNote } from '$lib/chat';

function getLogDir(): string {
	return env.LOG_DIR ?? 'data/logs';
}

/**
 * Ensures a directory exists for a given session ID.
 * @param sessionId The unique identifier for the session.
 * @returns The path to the session's log directory.
 */
async function ensureSessionDir(sessionId: string): Promise<string> {
	const sessionDir = join(getLogDir(), sessionId);
	await mkdir(sessionDir, { recursive: true });
	return sessionDir;
}

/**
 * Formats tool call information into a markdown representation.
 */
function formatToolCall(traceNote: TraceNote): string {
	if (traceNote.event === 'tool_call') {
		const { name, arguments: args, tool_call_id } = traceNote.data || {};
		const toolName = name || 'unknown';
		const toolArgs = args !== undefined ? args : {};
		const callId = tool_call_id || 'unknown';

		return `\n<!-- TOOL CALL: ${toolName} -->\n\`\`\`json\n{\n  "name": "${toolName}",\n  "arguments": ${JSON.stringify(toolArgs, null, 2)},\n  "tool_call_id": "${callId}"\n}\n\`\`\`\n`;
	} else if (traceNote.event === 'tool_result') {
		const { name, result, tool_call_id } = traceNote.data || {};
		const toolName = name || 'unknown';
		const callId = tool_call_id || 'unknown';
		const toolResult = result !== undefined ? result : null;

		return `\n<!-- TOOL RESULT: ${toolName} -->\n\`\`\`json\n{\n  "name": "${toolName}",\n  "tool_call_id": "${callId}",\n  "result": ${typeof toolResult === 'string' ? JSON.stringify(toolResult) : JSON.stringify(toolResult, null, 2)}\n}\n\`\`\`\n`;
	}
	return '';
}

/**
 * Writes a chat message to a Markdown file, including any associated tool calls.
 *
 * @param sessionId - The session ID.
 * @param turn - The turn number in the conversation.
 * @param message - The chat message object.
 * @param toolCalls - Optional array of trace notes representing tool calls during this turn
 */
export async function writeMessageFile(
	sessionId: string,
	turn: number,
	message: ChatMessage,
	toolCalls?: TraceNote[]
): Promise<void> {
	const sessionDir = await ensureSessionDir(sessionId);
	const turnStr = String(turn).padStart(4, '0');
	const role: ChatRole = message.role;
	const filePath = join(sessionDir, `${turnStr}.${role}.md`);

	// If there are tool calls, format them and append to the message content
	let content = message.content;
	if (toolCalls && toolCalls.length > 0) {
		try {
			const toolCallMarkdown = toolCalls.map((traceNote) => formatToolCall(traceNote)).join('\n');
			content += toolCallMarkdown;
		} catch (error) {
			console.error('Error formatting tool calls for markdown:', error);
			// If there's an error formatting tool calls, continue with just the message content
		}
	}

	await writeFile(filePath, content, 'utf-8');
}

/**
 * Appends a trace event to the session's trace log.
 *
 * @param sessionId - The session ID.
 * @param traceNote - The trace note object to append.
 */
export async function writeTrace(sessionId: string, traceNote: TraceNote): Promise<void> {
	const sessionDir = await ensureSessionDir(sessionId);
	const filePath = join(sessionDir, 'trace.jsonl');
	const logEntry = JSON.stringify({
		ts: new Date().toISOString(),
		...traceNote
	});
	await appendFile(filePath, logEntry + '\n', 'utf-8');
}
