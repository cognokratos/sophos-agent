import { MCPAdapter } from '@langchain/mcp-adapters';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import { loadMCPConfig } from './config';

/**
 * Owns the process-wide `MCPAdapter` (one adapter, many servers) and exposes
 * its tools as LangChain tools for the LangGraph `ToolNode`.
 *
 * Tool names are prefixed with the server name (`memory__read_graph`), so two
 * servers may expose a tool with the same name without colliding.
 */
export class MCPClientService {
	private adapter: MCPAdapter | null = null;
	private initialized = false;

	/**
	 * Loads `mcp.json`, connects to every configured server and discovers its tools.
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		const servers = await loadMCPConfig();
		const serverNames = Object.keys(servers);

		if (serverNames.length === 0) {
			console.info('No MCP servers configured; the agent will run without tools');
			this.initialized = true;
			return;
		}

		// Construction validates the config (Zod) but does not connect.
		const adapter = new MCPAdapter({ servers, prefixToolNameWithServerName: true });
		try {
			// Discovery opens the connections and caches the tool list.
			const tools = await adapter.listTools();
			console.info(`MCP: connected to ${serverNames.join(', ')} (${tools.length} tools)`);
		} catch (error) {
			await adapter.close();
			throw error;
		}

		this.adapter = adapter;
		this.initialized = true;
	}

	isInitialized(): boolean {
		return this.initialized;
	}

	/**
	 * Returns the tools of all connected servers (served from the adapter's cache).
	 */
	async listTools(): Promise<DynamicStructuredTool[]> {
		if (!this.initialized) {
			throw new Error('MCPClientService not initialized. Call initialize() first.');
		}
		return this.adapter ? this.adapter.listTools() : [];
	}

	async getToolByName(name: string): Promise<DynamicStructuredTool | null> {
		const tools = await this.listTools();
		return tools.find((tool) => tool.name === name) ?? null;
	}

	/**
	 * Closes all MCP connections (and stops stdio child processes).
	 * The service can be initialized again afterwards.
	 */
	async dispose(): Promise<void> {
		const adapter = this.adapter;
		this.adapter = null;
		this.initialized = false;
		if (adapter) {
			await adapter.close();
		}
	}
}

let mcpClientService: MCPClientService | null = null;

/**
 * Gets the singleton instance of MCPClientService
 */
export function getMCPClientService(): MCPClientService {
	if (!mcpClientService) {
		mcpClientService = new MCPClientService();
	}
	return mcpClientService;
}
