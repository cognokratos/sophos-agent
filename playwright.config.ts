import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command:
			'rm -rf data/test && pnpm run build && DATABASE_PATH="data/test/db/sophos.db" MEMORY_FILE_PATH="data/test/memory/memory.jsonl" pnpm run preview',
		port: 4173
	},
	testDir: 'e2e',
	workers: 1,
	timeout: 5 * 60 * 1000
});
