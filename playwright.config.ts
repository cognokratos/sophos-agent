import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'npm run build && CHAT_DIR="data/test/chat" MCP_MEMORY_DIR="data/test/memory" npm run preview',
		port: 4173
	},
	testDir: 'e2e',
	workers: 1,
	timeout: 5 * 60 * 1000
});
