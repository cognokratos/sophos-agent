import { type MCPServers, parseMcpServers } from '$lib/agent/mcp/config/parser';

/**
 * Loads MCP server configurations from a config file
 */
export async function loadMCPConfig(): Promise<MCPServers> {
	// This is a placeholder for potential future file-based configuration
	const fs = await import('node:fs/promises');
	const path = await import('node:path');

	const filePath = getConfigFile();

	try {
		const fullPath = path.resolve(filePath);
		const content = await fs.readFile(fullPath, 'utf-8');
		const parsed = JSON.parse(content) as unknown;
		return parseMcpServers(parsed);
	} catch (error) {
		console.error(`Failed to load MCP configuration from file ${filePath}:`, error);
		throw new Error(`Failed to load MCP configuration: ${(error as Error).message}`);
	}
}

function getConfigFile() {
	return process.env.MCP_CONFIG_FILE ?? 'config/mcp.json';
}
