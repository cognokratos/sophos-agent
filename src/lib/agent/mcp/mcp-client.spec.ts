import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MCPClientService, getMCPClientService } from './client';
import { loadMCPConfig } from './config';

// Mock the @langchain/mcp-adapters module properly
vi.mock('@langchain/mcp-adapters', async () => {
	const actual = await vi.importActual('@langchain/mcp-adapters');
	return {
		...actual,
		MultiServerMCPClient: vi.fn().mockImplementation(() => ({
			initializeConnections: vi.fn().mockResolvedValue(undefined),
			close: vi.fn().mockResolvedValue(undefined),
			getTools: vi.fn().mockResolvedValue([])
		}))
	};
});

// Mock the config module
vi.mock('./config', () => ({
	loadMCPConfig: vi.fn().mockReturnValue([])
}));

describe('MCPClientService', () => {
	let mcpClientService: MCPClientService;

	beforeEach(() => {
		// Clear the singleton instance before each test
		vi.clearAllMocks();

		// Mock the global mcpClientService to be null so we can create a new instance each time
		const mockMcpService = vi.hoisted(() => ({ current: null }));
		vi.mock('./client', async (importOriginal) => {
			const mod = await importOriginal();
			return {
				...mod,
				mcpClientService: mockMcpService.current
			};
		});

		mcpClientService = new MCPClientService();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('initialization', () => {
		it('should successfully initialize with valid configuration', async () => {
			// Mock configuration with a server
			const mockConfig = {
				'test-server': {
					transport: 'stdio',
					command: 'echo',
					args: ['hello']
				}
			};
			(loadMCPConfig as vi.Mock).mockReturnValue(mockConfig);

			await expect(mcpClientService.initialize()).resolves.not.toThrow();
			expect(mcpClientService.isInitialized()).toBe(true);
		});

		it('should handle case when no MCP servers are configured', async () => {
			// Mock empty configuration
			(loadMCPConfig as vi.Mock).mockReturnValue({});

			await mcpClientService.initialize();
			expect(mcpClientService.isInitialized()).toBe(true);
		});

		it('should throw error when configuration is invalid', async () => {
			(loadMCPConfig as vi.Mock).mockImplementation(() => {
				throw new Error('Invalid config');
			});

			await expect(mcpClientService.initialize()).rejects.toThrow('Invalid config');
			expect(mcpClientService.isInitialized()).toBe(false);
		});

		it('should not initialize twice', async () => {
			const mockConfig = {
				'test-server': {
					transport: 'stdio',
					command: 'echo',
					args: ['hello']
				}
			};
			(loadMCPConfig as vi.Mock).mockReturnValue(mockConfig);

			await mcpClientService.initialize();
			const initialCallCount = vi.mocked(loadMCPConfig).mock.calls.length;

			// Try to initialize again
			await mcpClientService.initialize();

			// The config should only be loaded once
			expect(vi.mocked(loadMCPConfig).mock.calls.length).toBe(initialCallCount);
		});
	});

	describe('getTools', () => {
		it('should retrieve tools after initialization', async () => {
			const mockTools = [
				{
					name: 'test-tool',
					description: 'A test tool',
					schema: {},
					invoke: vi.fn()
				}
			];

			(loadMCPConfig as vi.Mock).mockReturnValue({
				'test-server': {
					transport: 'stdio',
					command: 'echo',
					args: ['hello']
				}
			});

			await mcpClientService.initialize();

			// Get the mocked client instance to set up our mock for listTools
			// @ts-expect-error only for testing
			const clientInstance = mcpClientService.client;
			if (clientInstance) {
				// @ts-expect-error only for testing
				vi.spyOn(clientInstance, 'getTools').mockResolvedValue(mockTools);
			}

			const tools = await mcpClientService.getTools();

			expect(tools).toEqual(mockTools);
		});

		it('should throw error when not initialized', async () => {
			await expect(mcpClientService.getTools()).rejects.toThrow(
				'MCPClientService not initialized. Call initialize() first.'
			);
		});
	});

	describe('getToolByName', () => {
		it('should retrieve a specific tool by name', async () => {
			const mockTools = [
				{
					name: 'test-tool-1',
					description: 'First test tool',
					schema: {},
					invoke: vi.fn()
				},
				{
					name: 'test-tool-2',
					description: 'Second test tool',
					schema: {},
					invoke: vi.fn()
				}
			];

			(loadMCPConfig as vi.Mock).mockReturnValue({
				'test-server': {
					transport: 'stdio',
					command: 'echo',
					args: ['hello']
				}
			});

			await mcpClientService.initialize();

			// Get the mocked client instance to set up our mock for listTools
			// @ts-expect-error only for testing
			const clientInstance = mcpClientService.client;
			if (clientInstance) {
				// @ts-expect-error only for testing
				vi.spyOn(clientInstance, 'getTools').mockResolvedValue(mockTools);
			}

			const tool = await mcpClientService.getToolByName('test-tool-1');

			expect(tool).toEqual(mockTools[0]);
		});

		it('should return null when tool is not found', async () => {
			const mockTools = [
				{
					name: 'test-tool-1',
					description: 'First test tool',
					schema: {},
					invoke: vi.fn()
				}
			];

			(loadMCPConfig as vi.Mock).mockReturnValue({
				'test-server': {
					transport: 'stdio',
					command: 'echo',
					args: ['hello']
				}
			});

			await mcpClientService.initialize();

			// Get the mocked client instance to set up our mock for listTools
			// @ts-expect-error only for testing
			const clientInstance = mcpClientService.client;
			if (clientInstance) {
				// @ts-expect-error only for testing
				vi.spyOn(clientInstance, 'getTools').mockResolvedValue(mockTools);
			}

			const tool = await mcpClientService.getToolByName('non-existent-tool');

			expect(tool).toBeNull();
		});

		it('should throw error when not initialized', async () => {
			await expect(mcpClientService.getToolByName('test-tool')).rejects.toThrow(
				'MCPClientService not initialized. Call initialize() first.'
			);
		});
	});

	describe('dispose', () => {
		it('should disconnect and clean up resources', async () => {
			(loadMCPConfig as vi.Mock).mockReturnValue({
				'test-server': {
					transport: 'stdio',
					command: 'echo',
					args: ['hello']
				}
			});

			await mcpClientService.initialize();
			expect(mcpClientService.isInitialized()).toBe(true);

			await mcpClientService.dispose();
			expect(mcpClientService.isInitialized()).toBe(false);
		});
	});
});

describe('getMCPClientService', () => {
	it('should return singleton instance', () => {
		const instance1 = getMCPClientService();
		const instance2 = getMCPClientService();

		expect(instance1).toBe(instance2);
	});
});
