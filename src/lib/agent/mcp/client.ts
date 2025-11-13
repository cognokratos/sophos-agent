import { MultiServerMCPClient, type ClientConfig } from '@langchain/mcp-adapters';
import type { Tool } from '@langchain/core/tools';
import { loadMCPConfig, type MCPServerConfig } from './config';

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
			const serverConfigs = loadMCPConfig();

			if (serverConfigs.length === 0) {
				console.log('No MCP servers configured, skipping initialization');
				this.initialized = true;
				return;
			}

			// Convert our config format to the format expected by MultiServerMCPClient
			const clientConfigs: ClientConfig[] = serverConfigs.map((config: MCPServerConfig) => {
				const transports = config.transports.map((transport) => {
					if (transport.type === 'stdio') {
						if (!transport.stdio) {
							throw new Error(`stdio transport configuration missing for server ${config.id}`);
						}
						return {
							type: 'stdio' as const,
							command: transport.stdio.command,
							args: transport.stdio.args || []
						};
					} else if (transport.type === 'sse') {
						if (!transport.sse) {
							throw new Error(`sse transport configuration missing for server ${config.id}`);
						}
						return {
							type: 'sse' as const,
							url: transport.sse.url
						};
					}
					throw new Error(`Unsupported transport type: ${transport.type}`);
				});

				return {
					id: config.id,
					name: config.name,
					transports
				};
			});

			// Initialize the MultiServerMCPClient
			this.client = new MultiServerMCPClient(clientConfigs);

			// Connect to all configured servers
			await this.client.connect();

			console.log(`MCPClientService initialized with ${serverConfigs.length} server(s)`);
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
	async getTools(): Promise<Tool[]> {
		if (!this.initialized || !this.client) {
			throw new Error('MCPClientService not initialized. Call initialize() first.');
		}

		try {
			// Get all tools from all connected servers
			const allTools = await this.client.listTools();
			return allTools;
		} catch (error) {
			console.error('Failed to retrieve tools from MCP servers:', error);
			throw error;
		}
	}

	/**
	 * Gets a specific tool by name from connected MCP servers
	 */
	async getToolByName(name: string): Promise<Tool | null> {
		if (!this.initialized || !this.client) {
			throw new Error('MCPClientService not initialized. Call initialize() first.');
		}

		try {
			// Find and return the specific tool
			const allTools = await this.client.listTools();
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
				await this.client.disconnect();
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
