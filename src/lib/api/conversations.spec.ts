import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET } from '../../../src/routes/api/conversations/+server';
import { stat, readdir, readFile } from 'node:fs/promises';

// Mock the file system operations
vi.mock('node:fs/promises', () => ({
	readdir: vi.fn(),
	stat: vi.fn(),
	readFile: vi.fn()
}));

describe('Conversations API', () => {
	const mockEnv = {
		CHAT_DIR: '/mock/chat/dir'
	};

	beforeEach(() => {
		// Reset all mocks
		vi.resetAllMocks();
		
		// Mock process.env
		vi.stubEnv('CHAT_DIR', mockEnv.CHAT_DIR);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('should return an empty list when no conversations exist', async () => {
		// Mock readdir to return an empty array
		(vi.mocked(readdir) as any).mockResolvedValueOnce([]);

		const request = new Request('http://localhost/api/conversations');
		const event = {
			params: {}
		} as any;

		const response = await GET({ request, params: {} } as any);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data).toEqual({ conversations: [] });
	});

	it('should return conversation metadata when conversations exist', async () => {
		// Mock readdir to return conversation directories
		(vi.mocked(readdir) as any).mockResolvedValueOnce(['conv1', 'conv2']);
		
		// Mock stat for first conversation
		(vi.mocked(stat) as any).mockResolvedValueOnce({
			isDirectory: () => true,
			mtime: new Date('2023-01-01T10:00:00Z'),
			birthtime: new Date('2023-01-01T09:00:00Z')
		});
		
		// Mock stat for second conversation
		(vi.mocked(stat) as any).mockResolvedValueOnce({
			isDirectory: () => true,
			mtime: new Date('2023-01-02T10:00:00Z'),
			birthtime: new Date('2023-01-02T09:00:00Z')
		});
		
		// Mock readdir for first conversation directory
		(vi.mocked(readdir) as any).mockResolvedValueOnce(['0001.user.md', '0002.assistant.md']);
		
		// Mock readFile for first message
		(vi.mocked(readFile) as any).mockResolvedValueOnce('Hello, how are you?');
		
		// Mock readdir for second conversation directory
		(vi.mocked(readdir) as any).mockResolvedValueOnce(['0001.user.md']);
		
		// Mock readFile for second conversation's first message
		(vi.mocked(readFile) as any).mockResolvedValueOnce('What is the meaning of life?');

		const request = new Request('http://localhost/api/conversations');
		const event = {
			params: {}
		} as any;

		const response = await GET({ request, params: {} } as any);

		expect(response.status).toBe(200);
		const data = await response.json();
		
		expect(data.conversations).toHaveLength(2);
		expect(data.conversations[0]).toMatchObject({
			id: 'conv2', // Should be sorted by most recent first
			title: 'What is the meaning of life?',
			messageCount: 1
		});
		expect(data.conversations[1]).toMatchObject({
			id: 'conv1',
			title: 'Hello, how are you?',
			messageCount: 2
		});
	});

	it('should handle errors gracefully', async () => {
		// Mock readdir to throw an error
		(vi.mocked(readdir) as any).mockRejectedValueOnce(new Error('Permission denied'));

		const request = new Request('http://localhost/api/conversations');
		const event = {
			params: {}
		} as any;

		const response = await GET({ request, params: {} } as any);

		expect(response.status).toBe(500);
		const data = await response.json();
		expect(data.error).toEqual({
			code: 'FETCH_ERROR',
			message: 'Failed to fetch conversations'
		});
	});

	it('should truncate long titles', async () => {
		const longTitle = 'A'.repeat(100); // 100 characters
		
		// Mock readdir to return one conversation
		(vi.mocked(readdir) as any).mockResolvedValueOnce(['conv1']);
		
		// Mock stat
		(vi.mocked(stat) as any).mockResolvedValueOnce({
			isDirectory: () => true,
			mtime: new Date('2023-01-01T10:00:00Z'),
			birthtime: new Date('2023-01-01T09:00:00Z')
		});
		
		// Mock readdir for conversation directory
		(vi.mocked(readdir) as any).mockResolvedValueOnce(['0001.user.md']);
		
		// Mock readFile with long content
		(vi.mocked(readFile) as any).mockResolvedValueOnce(longTitle);

		const request = new Request('http://localhost/api/conversations');
		const event = {
			params: {}
		} as any;

		const response = await GET({ request, params: {} } as any);

		expect(response.status).toBe(200);
		const data = await response.json();
		
		// Check that the title is truncated
		expect(data.conversations[0].title).toHaveLength(53); // 50 chars + '...'
		expect(data.conversations[0].title).toContain('...');
	});
});