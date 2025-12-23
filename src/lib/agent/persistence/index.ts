import { env } from '$env/dynamic/private';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type ChatMessage, type ChatRole, formatTraceNote, type TraceNote } from '$lib/chat';

function getLogDir(): string {
	return env.CHAT_DIR ?? 'data/chat';
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
 * Writes a chat message to a Markdown file, including any associated tool calls.
 *
 * @param sessionId - The session ID.
 * @param turn - The turn number in the conversation.
 * @param message - The chat message object.
 * @param traceNotes - Optional array of trace notes representing tool calls during this turn
 */
export async function writeMessageFile(
	sessionId: string,
	turn: number,
	message: ChatMessage,
	traceNotes?: TraceNote[]
): Promise<void> {
	const sessionDir = await ensureSessionDir(sessionId);
	const turnStr = String(turn).padStart(4, '0');
	const role: ChatRole = message.role;
	const filePath = join(sessionDir, `${turnStr}.${role}.md`);

	// If there are tool calls, format them and append to the message content
	let content = '';
	if (traceNotes && traceNotes.length > 0) {
		try {
			const toolCallMarkdown = traceNotes.map((traceNote) => formatTraceNote(traceNote));
			content += toolCallMarkdown.join('\n\n');
		} catch (error) {
			console.error('Error formatting tool calls for markdown:', error);
			// If there's an error formatting tool calls, continue with just the message content
		}
	}
	content += message.content;
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
