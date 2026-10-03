import { env } from '$env/dynamic/private';
import type { Connection } from '@langchain/mcp-adapters';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/**
 * Map of server name -> connection settings, exactly as `MCPAdapter` expects
 * under its `servers` key. The server name becomes the tool-name prefix
 * (e.g. `memory` + `read_graph` -> `memory__read_graph`).
 */
export type MCPServers = Record<string, Connection>;

/** Placeholder that `config/mcp.json` may use inside a stdio server's `env`. */
const MEMORY_FILE_PATH_PLACEHOLDER = '${MEMORY_FILE_PATH}';

/**
 * Loads MCP server configurations from `$CONFIG_DIR/mcp.json`.
 *
 * Only the JSON shape is checked here. The full schema (stdio vs. HTTP,
 * allowed options per transport) is validated with Zod by `MCPAdapter`
 * when it is constructed, so there is a single source of truth.
 */
export async function loadMCPConfig(): Promise<MCPServers> {
	const filePath = resolve(env.CONFIG_DIR || 'config', 'mcp.json');

	let config: unknown;
	try {
		config = JSON.parse(await readFile(filePath, 'utf-8'));
	} catch (error) {
		throw new Error(`Failed to load MCP configuration from ${filePath}`, { cause: error });
	}

	if (!isRecord(config) || !Object.values(config).every(isRecord)) {
		throw new Error(`MCP configuration in ${filePath} must map server names to objects`);
	}

	const servers = config as MCPServers;
	for (const server of Object.values(servers)) {
		if ('env' in server && server.env) {
			await expandMemoryFilePath(server.env);
		}
	}
	return servers;
}

/**
 * Replaces `${MEMORY_FILE_PATH}` with an absolute path and makes sure its
 * directory exists. A stdio child process does not inherit arbitrary
 * environment variables, so the value has to be passed explicitly, and the
 * Memory server resolves relative paths against its own install directory.
 */
async function expandMemoryFilePath(serverEnv: Record<string, string>): Promise<void> {
	for (const [key, value] of Object.entries(serverEnv)) {
		if (!value.includes(MEMORY_FILE_PATH_PLACEHOLDER)) {
			continue;
		}
		const memoryFilePath = resolve(env.MEMORY_FILE_PATH || join('data', 'memory', 'memory.jsonl'));
		await mkdir(dirname(memoryFilePath), { recursive: true });
		serverEnv[key] = value.replaceAll(MEMORY_FILE_PATH_PLACEHOLDER, memoryFilePath);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
