import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const LOG_DIR = env.LOG_DIR ?? 'data/logs';

interface ParsedMessage {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	turn: number;
}

export const GET: RequestHandler = async ({ params }) => {
	const { sessionId } = params;

	if (!sessionId) {
		return json(
			{ error: { code: 'BAD_REQUEST', message: 'Session ID is required' } },
			{ status: 400 }
		);
	}

	try {
		const sessionDir = join(LOG_DIR, sessionId);
		const files = await readdir(sessionDir);

		// Filter for markdown files and sort by turn number
		const messageFiles = files
			.filter((file) => file.endsWith('.md'))
			.sort((a, b) => {
				// Extract turn number from filename (e.g., '0001.user.md' -> 1)
				const turnA = parseInt(a.split('.')[0], 10);
				const turnB = parseInt(b.split('.')[0], 10);
				return turnA - turnB;
			});

		if (messageFiles.length === 0) {
			return json({ messages: [] });
		}

		// Read and parse each message file
		const messages: ParsedMessage[] = [];
		for (const file of messageFiles) {
			const filePath = join(sessionDir, file);
			const content = await readFile(filePath, 'utf-8');

			// Extract turn number and role from filename
			const parts = file.split('.');
			const turn = parseInt(parts[0], 10);
			const role = parts[1] as 'user' | 'assistant';

			// Generate a unique ID for the message
			const id = `${role}_${turn}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

			messages.push({
				id,
				role,
				content,
				turn
			});
		}

		return json({ messages: messages.sort((a, b) => a.turn - b.turn) });
	} catch (error) {
		console.error(`Error loading conversation for session ${sessionId}:`, error);
		return json(
			{ error: { code: 'LOAD_ERROR', message: 'Failed to load conversation' } },
			{ status: 500 }
		);
	}
};
