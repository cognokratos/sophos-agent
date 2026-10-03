import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadMCPConfig } from './config';

// Under Vitest `$env/dynamic/private` is a snapshot; read the live process.env so vi.stubEnv applies.
vi.mock('$env/dynamic/private', () => ({ env: process.env }));

const TEST_CONFIG_DIR = 'data/test/mcp-config';
const TEST_MEMORY_FILE = 'data/test/mcp-config/memory/memory.jsonl';

async function writeConfig(config: unknown) {
	await writeFile(join(TEST_CONFIG_DIR, 'mcp.json'), JSON.stringify(config), 'utf-8');
}

describe('loadMCPConfig', () => {
	beforeEach(async () => {
		await mkdir(TEST_CONFIG_DIR, { recursive: true });
		vi.stubEnv('CONFIG_DIR', TEST_CONFIG_DIR);
		vi.stubEnv('MEMORY_FILE_PATH', TEST_MEMORY_FILE);
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await rm(TEST_CONFIG_DIR, { recursive: true, force: true });
	});

	it('should load stdio and HTTP servers from mcp.json', async () => {
		const config = {
			local: { command: 'echo', args: ['hello'] },
			remote: { url: 'http://mcp-fetch:8080/mcp' }
		};
		await writeConfig(config);

		await expect(loadMCPConfig()).resolves.toEqual(config);
	});

	it('should expand ${MEMORY_FILE_PATH} to an absolute path', async () => {
		await writeConfig({
			memory: {
				command: 'npx',
				args: ['@modelcontextprotocol/server-memory'],
				env: { MEMORY_FILE_PATH: '${MEMORY_FILE_PATH}' }
			}
		});

		const servers = await loadMCPConfig();

		expect(servers.memory).toMatchObject({
			env: { MEMORY_FILE_PATH: resolve(TEST_MEMORY_FILE) }
		});
	});

	it('should reject a configuration that is not a map of server objects', async () => {
		await writeConfig({ memory: 'npx server-memory' });

		await expect(loadMCPConfig()).rejects.toThrow('must map server names to objects');
	});

	it('should report the file path when mcp.json is missing', async () => {
		await expect(loadMCPConfig()).rejects.toThrow(resolve(TEST_CONFIG_DIR, 'mcp.json'));
	});
});
