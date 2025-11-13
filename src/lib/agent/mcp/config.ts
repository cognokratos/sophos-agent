import { z } from 'zod';

/**
 * Represents an MCP server configuration with its transport details
 */
export interface MCPTransportConfig {
	type: 'stdio' | 'sse';
	stdio?: {
		command: string;
		args?: string[];
	};
	sse?: {
		url: string;
	};
}

/**
 * Configuration for multiple MCP servers
 */
export interface MCPServerConfig {
	id: string;
	name: string;
	transports: MCPTransportConfig[];
}

/**
 * Validates MCP server configuration using Zod
 */
export const MCPTransportConfigSchema = z.object({
	type: z.enum(['stdio', 'sse']),
	stdio: z
		.object({
			command: z.string(),
			args: z.array(z.string()).optional()
		})
		.optional(),
	sse: z
		.object({
			url: z.string().url()
		})
		.optional()
});

export const MCPServerConfigSchema = z.object({
	id: z.string(),
	name: z.string(),
	transports: z.array(MCPTransportConfigSchema)
});

export const MCPConfigSchema = z.array(MCPServerConfigSchema);

/**
 * Loads MCP server configurations from environment variables
 */
export function loadMCPConfig(): MCPServerConfig[] {
	const mcpServersEnv = process.env.MCP_SERVERS;

	if (!mcpServersEnv) {
		console.log(
			'No MCP servers configured. Set MCP_SERVERS environment variable to configure MCP connections.'
		);
		return [];
	}

	try {
		const parsed = JSON.parse(mcpServersEnv) as unknown;
		const validated = MCPConfigSchema.parse(parsed);
		return validated;
	} catch (error) {
		console.error('Failed to parse MCP configuration:', error);
		throw new Error(`Invalid MCP configuration: ${(error as Error).message}`);
	}
}

/**
 * Alternative configuration loader that can read from a config file
 */
export async function loadMCPConfigFromFile(filePath: string): Promise<MCPServerConfig[]> {
	// This is a placeholder for potential future file-based configuration
	const fs = await import('node:fs/promises');
	const path = await import('node:path');

	try {
		const fullPath = path.resolve(filePath);
		const content = await fs.readFile(fullPath, 'utf-8');
		const parsed = JSON.parse(content) as unknown;
		const validated = MCPConfigSchema.parse(parsed);
		return validated;
	} catch (error) {
		console.error(`Failed to load MCP configuration from file ${filePath}:`, error);
		throw new Error(`Failed to load MCP configuration: ${(error as Error).message}`);
	}
}
