import { z } from 'zod';
import type { ClientConfig } from '@langchain/mcp-adapters';

/**
 * Reuse types from @langchain/mcp-adapters
 * ClientConfig is documented here:
 * https://v03.api.js.langchain.com/types/_langchain_mcp_adapters.ClientConfig.html
 */

// Map of server name -> server config
export type MCPServers = ClientConfig['mcpServers'];

// Single server config type (union of stdio vs http/sse)
export type MCPServer = MCPServers[string];

/* -----------------------------------------------------------
 *  SHARED SUB-SCHEMAS (typed from MCPServer)
 * ----------------------------------------------------------- */

// @ts-expect-error restart exists
type Restart = NonNullable<MCPServer['restart']>;
type OutputHandling = NonNullable<MCPServer['outputHandling']>; // shared for both variants

const RestartSchema: z.ZodType<Restart> = z.object({
	delayMs: z.number().optional(),
	enabled: z.boolean().optional(),
	maxAttempts: z.number().optional()
});

const OutputHandlingSchema: z.ZodType<OutputHandling> = z.union([
	z.literal('content'),
	z.literal('artifact'),
	z.object({
		audio: z.union([z.literal('content'), z.literal('artifact')]).optional(),
		image: z.union([z.literal('content'), z.literal('artifact')]).optional(),
		resource: z.union([z.literal('content'), z.literal('artifact')]).optional(),
		text: z.union([z.literal('content'), z.literal('artifact')]).optional()
	})
]);

/* -----------------------------------------------------------
 *  STDIO SERVER VARIANT (typed from MCPServer)
 * ----------------------------------------------------------- */

type StdioServer = Extract<
	MCPServer,
	{ command: string } & { transport?: 'stdio'; type?: 'stdio' }
>;

const StdioServerSchema: z.ZodType<StdioServer> = z
	.object({
		// core stdio fields
		args: z.array(z.string()),
		command: z.string(),
		cwd: z.string().optional(),
		encoding: z.string().optional(),
		env: z.record(z.string(), z.string()).optional(),
		restart: RestartSchema.optional(),
		stderr: z.enum(['overlapped', 'pipe', 'ignore', 'inherit']).optional(),
		transport: z.literal('stdio').optional(),
		type: z.literal('stdio').optional()
	})
	.and(
		z.object({
			defaultToolTimeout: z.number().optional(),
			outputHandling: OutputHandlingSchema.optional()
		})
	);

/* -----------------------------------------------------------
 *  HTTP / SSE SERVER VARIANT (typed from MCPServer)
 * ----------------------------------------------------------- */

type HttpOrSseServer = Extract<MCPServer, { url: string }>;

const HttpOrSseServerSchema: z.ZodType<HttpOrSseServer> = z
	.object({
		url: z.url(),
		authProvider: z.any().optional(), // OAuthClientProvider - leave as any at runtime
		automaticSSEFallback: z.boolean().optional(),
		headers: z.record(z.string(), z.string()).optional(),
		reconnect: RestartSchema.optional(),
		transport: z.enum(['http', 'sse']).optional(),
		type: z.enum(['http', 'sse']).optional()
	})
	.and(
		z.object({
			defaultToolTimeout: z.number().optional(),
			outputHandling: OutputHandlingSchema.optional()
		})
	);

/* -----------------------------------------------------------
 *  UNION + TOP-LEVEL CONFIG (MCPServers)
 * ----------------------------------------------------------- */

export const MCPServerSchema: z.ZodType<MCPServer> = z.union([
	StdioServerSchema,
	HttpOrSseServerSchema
]);

export const MCPServersSchema: z.ZodType<MCPServers> = z.record(z.string(), MCPServerSchema);

export function parseMcpServers(input: unknown): MCPServers {
	return MCPServersSchema.parse(input);
}
