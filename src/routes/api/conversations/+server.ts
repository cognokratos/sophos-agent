import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { readdir, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const CHAT_DIR = env.CHAT_DIR ?? 'data/chat';

interface ConversationMetadata {
	id: string; // Using string as conversation IDs might not be UUIDs
	title: string;
	createdAt: Date;
	updatedAt: Date;
	messageCount: number;
}

export const GET: RequestHandler = async () => {
	try {
		const files = await readdir(CHAT_DIR);

		// Filter for directories (conversation sessions) and get metadata
		const directories = (
			await Promise.all(
				files.map(async (file) => {
					const filePath = join(CHAT_DIR, file);
					const fileStat = await stat(filePath);

					if (fileStat.isDirectory()) {
						// Get conversation metadata
						const conversationDir = filePath;
						const messageFiles = await readdir(conversationDir);

						// Count message files and get the first message for title
						const messageFileCount = messageFiles.filter(f => f.endsWith('.md')).length;

						// Get the first message to use as title (if available)
						let firstMessageContent = 'New Conversation';
						const firstMessageFile = messageFiles
							.filter(f => f.endsWith('.md'))
							.sort((a, b) => {
								const turnA = parseInt(a.split('.')[0], 10);
								const turnB = parseInt(b.split('.')[0], 10);
								return turnA - turnB;
							})[0];

						if (firstMessageFile) {
							try {
								const firstMessagePath = join(conversationDir, firstMessageFile);
								const content = await readFile(firstMessagePath, 'utf-8');
								// Use the first few words of the message as the title
								const lines = content.split('\n').filter(line => line.trim() !== '');
								if (lines.length > 0) {
									const firstLine = lines[0];
									// If it's a user message, remove the "User:" prefix if present
									const cleanContent = firstLine.replace(/^User:\s*/, '').trim();
									// Truncate to first 50 characters if needed
									firstMessageContent = cleanContent.length > 50
										? cleanContent.substring(0, 50) + '...'
										: cleanContent;
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
		const sortedConversations = directories.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

		return json({ conversations: sortedConversations });
	} catch (error) {
		console.error('Error fetching conversations:', error);
		return json(
			{ error: { code: 'FETCH_ERROR', message: 'Failed to fetch conversations' } },
			{ status: 500 }
		);
	}
};
