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
 * Writes a chat message to a Markdown file.
 *
 * @param sessionId - The session ID.
 * @param turn - The turn number in the conversation.
 * @param message - The chat message object.
 */
export async function writeMessageFile(
	sessionId: string,
	turn: number,
	message: ChatMessage
): Promise<void> {
	const sessionDir = await ensureSessionDir(sessionId);
	const turnStr = String(turn).padStart(4, '0');
	const role: ChatRole = message.role;
	const filePath = join(sessionDir, `${turnStr}.${role}.md`);
	await writeFile(filePath, message.content, 'utf-8');
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
