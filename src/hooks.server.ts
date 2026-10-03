import { closeAgent } from '$lib/agent';

// adapter-node emits `sveltekit:shutdown` after the HTTP server has stopped
// accepting requests (SIGINT/SIGTERM). Close MCP connections so stdio servers
// exit and HTTP sessions are released. Not emitted by `vite dev`.
process.on('sveltekit:shutdown', async (reason) => {
	try {
		await closeAgent();
	} catch (error) {
		console.error(`Failed to close MCP connections on shutdown (${reason})`, error);
	}
});
