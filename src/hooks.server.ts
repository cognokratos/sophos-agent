import { closeAgent } from '$lib/agent';
import { closeDatabase } from '$lib/agent/persistence/database';

// adapter-node emits `sveltekit:shutdown` after the HTTP server has stopped
// accepting requests (SIGINT/SIGTERM). Close MCP connections so stdio servers
// exit and HTTP sessions are released, then close SQLite (checkpointing WAL).
// Not emitted by `vite dev`.
// RESOURCE-OWNERSHIP: this closes the runs' dependencies, not the runs. A run
// still executing can reach the closed database and fail (docs/runtime/01).
process.on('sveltekit:shutdown', async (reason) => {
	try {
		await closeAgent();
	} catch (error) {
		console.error(`Failed to close MCP connections on shutdown (${reason})`, error);
	}
	closeDatabase();
});
