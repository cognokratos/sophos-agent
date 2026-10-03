import type { ChatOllamaInput } from '@langchain/ollama';
import { env } from '$env/dynamic/private';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Unset and empty variables both fall back to the defaults below (`||`, not `??`).

export function getModelConfig(): ChatOllamaInput & { model: string; baseUrl: string } {
	return {
		model: env.OLLAMA_MODEL || 'qwen3',
		baseUrl: env.OLLAMA_HOST || 'http://localhost:11434',
		think: env.OLLAMA_THINK?.toLowerCase() === 'true'
	};
}

export async function getSystemMessage() {
	const systemFilePath = join(env.CONFIG_DIR || 'config', 'system.md');
	const message = await readFile(systemFilePath, 'utf-8');
	if (!message) {
		return 'You are an AI assistant with access to MCP tools.';
	}
	return message;
}
