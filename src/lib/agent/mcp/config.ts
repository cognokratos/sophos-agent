import { env } from '$env/dynamic/private';
import { type MCPServers, parseMcpServers } from '$lib/agent/mcp/config/parser';
import path, { join } from 'node:path';

/**
 * Loads MCP server configurations from a config file
 */
export async function loadMCPConfig(): Promise<MCPServers> {
	// This is a placeholder for potential future file-based configuration
	const fs = await import('node:fs/promises');
	const path = await import('node:path');

	const filePath = getMcpConfigFile();
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

function getMcpConfigFile() {
	const configDir = process.env.CONFIG_DIR;
	if (!configDir) {
		return 'config/mcp.json';
	}
	return join(configDir, 'mcp.json');
}

function getMemoryFilePath() {
	const memoryDir = env.MEMORY_DIR;
	if (!memoryDir) {
		return '/tmp/data/memory/memory.jsonl';
	}
	const filePath = join(memoryDir, 'memory.jsonl');
	if (path.isAbsolute(filePath)) {
		return filePath;
	}
	return path.resolve(process.cwd(), filePath);
}
