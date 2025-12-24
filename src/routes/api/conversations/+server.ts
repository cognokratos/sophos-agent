import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const CHAT_DIR = env.CHAT_DIR ?? 'data/chat';

export const GET: RequestHandler = async () => {
	try {
		const files = await readdir(CHAT_DIR);

		// Filter for directories (conversation sessions) and get the most recent one
		const directories = (
			await Promise.all(
				files.map(async (file) => {
					const filePath = join(CHAT_DIR, file);
					const fileStat = await stat(filePath);
					return fileStat.isDirectory() ? { name: file, mtime: fileStat.mtime } : null;
				})
			)
		).filter(Boolean) as Array<{ name: string; mtime: Date }>;

		if (directories.length === 0) {
			return json({ conversationId: null });
		}

		// Sort by modification time (most recent first)
		const mostRecent = directories.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())[0];

		return json({ conversationId: mostRecent.name });
	} catch (error) {
		console.error('Error finding most recent conversation:', error);
		return json(
			{ error: { code: 'FIND_ERROR', message: 'Failed to find most recent conversation' } },
			{ status: 500 }
		);
	}
};
