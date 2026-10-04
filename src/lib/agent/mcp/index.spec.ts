import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPAdapter } from '@langchain/mcp-adapters';
import { MCPClientService, getMCPClientService } from './client';
import { loadMCPConfig } from './config';

const adapterMock = vi.hoisted(() => ({
	listTools: vi.fn(),
	close: vi.fn()
}));

vi.mock('@langchain/mcp-adapters', () => ({
	MCPAdapter: vi.fn().mockImplementation(() => adapterMock)
}));

vi.mock('./config', () => ({
	loadMCPConfig: vi.fn()
}));

const STDIO_CONFIG = {
	'test-server': {
		command: 'echo',
		args: ['hello']
	}
};

function tool(name: string) {
	return { name, description: `${name} tool`, schema: {}, invoke: vi.fn() };
}

describe('MCPClientService', () => {
	let mcpClientService: MCPClientService;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(loadMCPConfig).mockResolvedValue(STDIO_CONFIG);
		adapterMock.listTools.mockResolvedValue([]);
		adapterMock.close.mockResolvedValue(undefined);
		mcpClientService = new MCPClientService();
	});

	describe('initialization', () => {
		it('should successfully initialize with valid configuration', async () => {
			await expect(mcpClientService.initialize()).resolves.toBeUndefined();
			expect(mcpClientService.isInitialized()).toBe(true);
		});

		it('should pass configured servers to MCPAdapter with prefixed tool names', async () => {
			await mcpClientService.initialize();

			expect(MCPAdapter).toHaveBeenCalledWith({
				servers: STDIO_CONFIG,
				prefixToolNameWithServerName: true
			});
			// Discovery happens during initialization so connection errors surface early
			expect(adapterMock.listTools).toHaveBeenCalledTimes(1);
		});

		it('should handle case when no MCP servers are configured', async () => {
			vi.mocked(loadMCPConfig).mockResolvedValue({});

			await mcpClientService.initialize();

			expect(mcpClientService.isInitialized()).toBe(true);
			expect(MCPAdapter).not.toHaveBeenCalled();
			await expect(mcpClientService.listTools()).resolves.toEqual([]);
		});

		it('should throw error when configuration is invalid', async () => {
			vi.mocked(loadMCPConfig).mockRejectedValue(new Error('Invalid config'));

			await expect(mcpClientService.initialize()).rejects.toThrow('Invalid config');
			expect(mcpClientService.isInitialized()).toBe(false);
		});

		it('should close the adapter when discovery fails', async () => {
			adapterMock.listTools.mockRejectedValue(new Error('connection refused'));

			await expect(mcpClientService.initialize()).rejects.toThrow('connection refused');
			expect(adapterMock.close).toHaveBeenCalledTimes(1);
			expect(mcpClientService.isInitialized()).toBe(false);
		});

		it('should not initialize twice', async () => {
			await mcpClientService.initialize();
			await mcpClientService.initialize();

			expect(loadMCPConfig).toHaveBeenCalledTimes(1);
			expect(MCPAdapter).toHaveBeenCalledTimes(1);
		});
	});

	describe('listTools', () => {
		it('should retrieve tools after initialization', async () => {
			const mockTools = [tool('memory__read_graph'), tool('fetch__fetch')];
			adapterMock.listTools.mockResolvedValue(mockTools);

			await mcpClientService.initialize();
			const tools = await mcpClientService.listTools();

			expect(tools).toEqual(mockTools);
		});

		it('should throw error when not initialized', async () => {
			await expect(mcpClientService.listTools()).rejects.toThrow(
				'MCPClientService not initialized. Call initialize() first.'
			);
		});
	});

	describe('getToolByName', () => {
		it('should retrieve a specific tool by its prefixed name', async () => {
			const mockTools = [tool('a__search'), tool('b__search')];
			adapterMock.listTools.mockResolvedValue(mockTools);

			await mcpClientService.initialize();

			// Same tool name on two servers stays unambiguous thanks to the server prefix
			expect(await mcpClientService.getToolByName('b__search')).toBe(mockTools[1]);
		});

		it('should return null when tool is not found', async () => {
			adapterMock.listTools.mockResolvedValue([tool('test__tool')]);

			await mcpClientService.initialize();

			expect(await mcpClientService.getToolByName('non-existent-tool')).toBeNull();
		});

		it('should throw error when not initialized', async () => {
			await expect(mcpClientService.getToolByName('test-tool')).rejects.toThrow(
				'MCPClientService not initialized. Call initialize() first.'
			);
		});
	});

	describe('dispose', () => {
		it('should close the adapter and allow re-initialization', async () => {
			await mcpClientService.initialize();
			expect(mcpClientService.isInitialized()).toBe(true);

			await mcpClientService.dispose();
			expect(adapterMock.close).toHaveBeenCalledTimes(1);
			expect(mcpClientService.isInitialized()).toBe(false);

			await mcpClientService.initialize();
			expect(MCPAdapter).toHaveBeenCalledTimes(2);
		});

		it('should be a no-op when not initialized', async () => {
			await expect(mcpClientService.dispose()).resolves.toBeUndefined();
			expect(adapterMock.close).not.toHaveBeenCalled();
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
