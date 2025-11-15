import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import { loadMCPConfig } from './config';

/**
 * Wrapper for the MultiServerMCPClient that handles initialization and tool retrieval
 */
export class MCPClientService {
	private client: MultiServerMCPClient | null = null;
	private initialized = false;

	constructor() {}

	/**
	 * Initializes the MultiServerMCPClient with configured server connections
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			console.warn('MCPClientService already initialized');
			return;
		}

		try {
			// Load configuration for MCP servers
			const serverConfigs = await loadMCPConfig();
			const toolNames = Object.keys(serverConfigs);

			if (toolNames.length === 0) {
				console.log('No MCP servers configured, skipping initialization');
				this.initialized = true;
				return;
			}

			// Initialize the MultiServerMCPClient
			this.client = new MultiServerMCPClient({
				mcpServers: serverConfigs
			});

			// Connect to all configured servers
			await this.client.initializeConnections();

			console.log(`MCPClientService initialized with ${toolNames.length} server(s)`);
			toolNames.forEach((toolName, i) => {
				console.log(`- tool ${i}: ${toolName}`);
			});
			this.initialized = true;
		} catch (error) {
			console.error('Failed to initialize MCPClientService:', error);
			throw error;
		}
	}

	/**
	 * Checks if the client has been initialized
	 */
	isInitialized(): boolean {
		return this.initialized;
	}

	/**
	 * Retrieves all available tools from connected MCP servers
	 */
	async getTools(): Promise<DynamicStructuredTool[]> {
		if (!this.initialized || !this.client) {
			throw new Error('MCPClientService not initialized. Call initialize() first.');
		}

		try {
			// Get all tools from all connected servers
			return await this.client.getTools();
		} catch (error) {
			console.error('Failed to retrieve tools from MCP servers:', error);
			throw error;
		}
	}

	/**
	 * Gets a specific tool by name from connected MCP servers
	 */
	async getToolByName(name: string): Promise<DynamicStructuredTool | null> {
		if (!this.initialized || !this.client) {
			throw new Error('MCPClientService not initialized. Call initialize() first.');
		}

		try {
			// Find and return the specific tool
			const allTools = await this.client.getTools();
			return allTools.find((tool) => tool.name === name) || null;
		} catch (error) {
			console.error(`Failed to retrieve tool '${name}' from MCP servers:`, error);
			throw error;
		}
	}

	/**
	 * Disconnects from all MCP servers and cleans up resources
	 */
	async dispose(): Promise<void> {
		if (this.client) {
			try {
				await this.client.close();
				console.log('MCPClientService disconnected from all servers');
			} catch (error) {
				console.error('Error disconnecting MCPClientService:', error);
			} finally {
				this.client = null;
				this.initialized = false;
			}
		}
	}
}

// Singleton instance of MCPClientService
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
