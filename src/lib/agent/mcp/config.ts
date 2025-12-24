import { env } from '$env/dynamic/private';
import { type MCPServers, parseMcpServers } from '$lib/agent/mcp/config/parser';
import path from 'node:path';

/**
 * Loads MCP server configurations from a config file
 */
export async function loadMCPConfig(): Promise<MCPServers> {
	// This is a placeholder for potential future file-based configuration
	const fs = await import('node:fs/promises');
	const path = await import('node:path');

	const filePath = getConfigFile();
	const memoryPath = getMemoryFilePath();

	try {
		const fullPath = path.resolve(filePath);
		const content = await fs.readFile(fullPath, 'utf-8');
		const settings = content.replace('$MEMORY_FILE_PATH', memoryPath);
		const config = JSON.parse(settings) as unknown;
		return parseMcpServers(config);
	} catch (error) {
		console.error(`Failed to load MCP configuration from file ${filePath}:`, error);
		throw new Error(`Failed to load MCP configuration: ${(error as Error).message}`);
	}
}

function getConfigFile() {
	return env.MCP_CONFIG_FILE ?? 'config/mcp.json';
}

function getMemoryFilePath() {
	const filePath = env.MCP_MEMORY_FILE_PATH;
	if (!filePath) {
		return '/tmp/data/memory/memory.jsonl';
	}
	if (path.isAbsolute(filePath)) {
		return filePath;
	}
	return path.resolve(process.cwd(), filePath);
}
