import Database from 'better-sqlite3';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { env } from '$env/dynamic/private';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { recoverInterruptedRuns } from './conversations';

export type DB = Database.Database;

/**
 * One SQLite file holds everything durable:
 *
 *   conversations, runs        application metadata (this file's schema)
 *   checkpoints, writes        LangGraph execution state (created by SqliteSaver)
 *
 * Both share one connection, so there is a single file to back up or delete.
 */
const MIGRATIONS: string[] = [
	// v1
	`
	CREATE TABLE conversations (
		id            TEXT PRIMARY KEY,            -- also the LangGraph thread_id
		title         TEXT NOT NULL,
		created_at    TEXT NOT NULL,               -- ISO-8601
		updated_at    TEXT NOT NULL,
		message_count INTEGER NOT NULL DEFAULT 0   -- messages in the thread after the last run
	);

	CREATE TABLE runs (
		id              TEXT PRIMARY KEY,
		conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
		status          TEXT NOT NULL CHECK (status IN ('running', 'interrupted', 'completed', 'failed')),
		error_code      TEXT,
		error_message   TEXT,
		started_at      TEXT NOT NULL,
		finished_at     TEXT
	);

	CREATE INDEX runs_by_conversation ON runs (conversation_id, started_at);
	`
];

/**
 * Opens (or creates) the database and applies pending migrations.
 * `PRAGMA user_version` records how many migrations have run, so start-up is
 * deterministic and needs no manual setup.
 */
export function openDatabase(path: string): DB {
	if (path !== ':memory:') {
		mkdirSync(dirname(resolve(path)), { recursive: true });
	}
	const db = new Database(path);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');

	const version = db.pragma('user_version', { simple: true }) as number;
	for (let v = version; v < MIGRATIONS.length; v++) {
		db.transaction(() => {
			db.exec(MIGRATIONS[v]);
			db.pragma(`user_version = ${v + 1}`);
		})();
	}
	return db;
}

/**
 * LangGraph's official SQLite checkpointer, on the same connection.
 * It creates its own `checkpoints` and `writes` tables on first use.
 */
export function createCheckpointer(db: DB): SqliteSaver {
	return new SqliteSaver(db);
}

let database: DB | null = null;

/**
 * The process-wide database (`DATABASE_PATH`, default `data/db/sophos.db`).
 * Runs left in `running` state by a previous process are marked `interrupted`.
 */
export function getDatabase(): DB {
	if (!database) {
		database = openDatabase(env.DATABASE_PATH || 'data/db/sophos.db');
		// RUNTIME-BOUNDARY: on this process's first database access, not at start-up.
		// Valid only while a single process owns the database.
		recoverInterruptedRuns(database);
	}
	return database;
}

export function closeDatabase(): void {
	database?.close();
	database = null;
}
