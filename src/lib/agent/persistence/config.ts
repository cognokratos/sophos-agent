import { env } from '$env/dynamic/private';

export function getChatDir(): string {
	return env.CHAT_DIR ?? 'data/chat';
}
