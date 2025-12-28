import { appendFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type ChatMessage, type TraceNote } from '$lib/chat';
import { getChatDir } from '$lib/agent/persistence/config';

export interface ConversationMetadata {
	id: string; // Using string as conversation IDs might not be UUIDs
	title: string;
	createdAt: Date;
	updatedAt: Date;
	messageCount: number;
}

export interface ConversationMessage {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	turn: number;
}

/**
 * List conversations
 * @returns An array of objects containing metadata for each
 */
export async function listConversations(): Promise<ConversationMetadata[]> {
	try {
		const files = await readdir(getChatDir());

		// Filter for directories (conversation sessions) and get metadata
		const directories = (
			await Promise.all(
				files.map(async (file) => {
					const filePath = join(getChatDir(), file);
					const fileStat = await stat(filePath);

					if (fileStat.isDirectory()) {
						// Get conversation metadata
						const conversationDir = filePath;
						const allFiles = await readdir(conversationDir);
						const messageFiles = allFiles.filter((f) => f.endsWith('.md'));

						// Count message files and get the first message for title
						const messageFileCount = messageFiles.length;

						// Get the first message to use as title (if available)
						let firstMessageContent = 'New Conversation';
						if (messageFileCount) {
							const [firstMessageFile] = messageFiles.sort(compareMessageFiles);
							try {
								const firstMessagePath = join(conversationDir, firstMessageFile);
								const content = await readFile(firstMessagePath, 'utf-8');
								// Use the first few words of the message as the title
								const lines = content.split('\n').filter((line) => line.trim() !== '');
								if (lines.length > 0) {
									const firstLine = lines[0];
									// If it's a user message, remove the "User:" prefix if present
									const cleanContent = firstLine.replace(/^User:\s*/, '').trim();
									// Truncate to first 50 characters if needed
									firstMessageContent =
										cleanContent.length > 50 ? cleanContent.substring(0, 50) + '...' : cleanContent;
								}
							} catch (e) {
								console.error(`Error reading first message from ${firstMessageFile}:`, e);
							}
						}

						return {
							id: file,
							title: firstMessageContent,
							createdAt: fileStat.birthtime,
							updatedAt: fileStat.mtime,
							messageCount: messageFileCount
						};
					}
					return null;
				})
			)
		).filter(Boolean) as ConversationMetadata[];

		// Sort by modification time (most recent first)
		return directories.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error) {
			if (error.code === 'ENOENT') {
				return [];
			}
		}
		throw error;
	}
}

function compareMessageFiles(a: string, b: string) {
	const turnA = parseInt(a.split('.')[0], 10);
	const turnB = parseInt(b.split('.')[0], 10);
	return turnA - turnB;
}

/**
 * Read conversation for a given conversation ID and return all messages.
 * @param conversationId The unique identifier for the conversation.
 * @returns An array of all messages in the conversation.
 */
export async function getConversationMessages(
	conversationId: string
): Promise<ConversationMessage[]> {
	try {
		const sessionDir = join(getChatDir(), conversationId);
		const files = await readdir(sessionDir);

		// Filter for Markdown files and sort by turn number
		const messageFiles = files
			.filter((file) => file.endsWith('.md'))
			.sort((a, b) => {
				// Extract turn number from filename (e.g., '0001.user.md' -> 1)
				const turnA = parseInt(a.split('.')[0], 10);
				const turnB = parseInt(b.split('.')[0], 10);
				return turnA - turnB;
			});

		if (messageFiles.length === 0) {
			return [];
		}

		// Read and parse each message file
		const messages: ConversationMessage[] = [];
		for (const file of messageFiles) {
			const filePath = join(sessionDir, file);
			const content = await readFile(filePath, 'utf-8');

			// Extract turn number and role from filename
			const parts = file.split('.');
			const turn = parseInt(parts[0], 10);
			const role = parts[1] as 'user' | 'assistant';

			// Generate a unique ID for the message
			const id = `${conversationId}_${role}_${turn}}`;

			messages.push({
				id,
				role,
				content,
				turn
			});
		}
		return messages.sort((a, b) => a.turn - b.turn);
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error) {
			if (error.code === 'ENOENT') {
				return [];
			}
		}
		throw error;
	}
}

/**
 * Gets the next turn number for a conversation.
 * @param conversationId The unique identifier for the conversation.
 */
export async function getNextTurn(conversationId: string): Promise<number> {
	try {
		const chatDir = join(getChatDir(), conversationId);
		const files = await readdir(chatDir);
		return files.filter((f) => f.endsWith('.md')).length + 1;
	} catch {
		return 1; // Directory likely doesn't exist yet
	}
}

/**
 * Ensures a directory exists for a given conversation ID.
 * @param conversationId The unique identifier for the conversation.
 * @returns The path to the conversation's log directory.
 */
async function ensureConversationDir(conversationId: string): Promise<string> {
	const conversationDir = join(getChatDir(), conversationId);
	await mkdir(conversationDir, { recursive: true });
	return conversationDir;
}

/**
 * Writes a chat message to a Markdown file, including any associated tool calls.
 *
 * @param conversationId - The conversation ID.
 * @param turn - The turn number in the conversation.
 * @param message - The chat message object.
 */
export async function writeMessageFile(
	conversationId: string,
	turn: number,
	message: ChatMessage
): Promise<void> {
	const conversationDir = await ensureConversationDir(conversationId);
	const turnStr = String(turn).padStart(4, '0');
	const role = message.role;
	const filePath = join(conversationDir, `${turnStr}.${role}.md`);
	await writeFile(filePath, message.content, 'utf-8');
}

/**
 * Appends a trace event to the conversation's trace log.
 *
 * @param conversationId - The conversation ID.
 * @param traceNote - The trace note object to append.
 */
export async function writeTrace(conversationId: string, traceNote: TraceNote): Promise<void> {
	const conversationDir = await ensureConversationDir(conversationId);
	const filePath = join(conversationDir, 'trace.jsonl');
	const logEntry = JSON.stringify({
		ts: new Date().toISOString(),
		...traceNote
	});
	await appendFile(filePath, logEntry + '\n', 'utf-8');
}
