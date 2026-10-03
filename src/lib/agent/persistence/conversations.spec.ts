import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, type DB } from './database';
import {
	createConversation,
	finishRun,
	getConversation,
	listConversations,
	recoverInterruptedRuns,
	startRun,
	titleFromMessage
} from './conversations';

vi.mock('$env/dynamic/private', () => ({ env: process.env }));

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const t = (minute: number) => new Date(Date.UTC(2026, 9, 3, 12, minute));

describe('conversation persistence (SQLite)', () => {
	let dir: string;
	let dbPath: string;
	let db: DB;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'sophos-db-'));
		dbPath = join(dir, 'sophos.db');
		db = openDatabase(dbPath);
	});

	afterEach(() => {
		db.close();
		rmSync(dir, { recursive: true, force: true });
	});

	it('creates the schema once and records its version', () => {
		db.close();
		db = openDatabase(dbPath); // reopening must not re-run migrations

		expect(db.pragma('user_version', { simple: true })).toBe(1);
		const tables = db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
			.all()
			.map((r) => (r as { name: string }).name);
		expect(tables).toEqual(['conversations', 'runs']);
	});

	it('survives a new database connection', () => {
		createConversation(db, A, 'hello', t(0));
		db.close();
		db = openDatabase(dbPath);

		expect(getConversation(db, A)).toMatchObject({
			id: A,
			title: 'hello',
			messageCount: 0,
			status: null
		});
	});

	it('returns undefined for an unknown conversation', () => {
		expect(getConversation(db, B)).toBeUndefined();
	});

	it('derives the title from the first line of the first message, truncated', () => {
		expect(titleFromMessage('  Plan a trip\nto Rome  ')).toBe('Plan a trip');
		expect(titleFromMessage('A'.repeat(80))).toBe('A'.repeat(50) + '...');
	});

	it('tracks createdAt, updatedAt, messageCount and the latest run status', () => {
		createConversation(db, A, 'hello', t(0));

		startRun(db, A, 'run-1', t(1));
		expect(getConversation(db, A)).toMatchObject({
			status: 'running',
			updatedAt: t(1).toISOString()
		});

		finishRun(db, 'run-1', { status: 'completed', messageCount: 2 }, t(2));
		expect(getConversation(db, A)).toEqual({
			id: A,
			title: 'hello',
			createdAt: t(0).toISOString(),
			updatedAt: t(2).toISOString(),
			messageCount: 2,
			status: 'completed'
		});
	});

	it('reports the error of a failed latest run', () => {
		createConversation(db, A, 'hello', t(0));
		startRun(db, A, 'run-1', t(1));
		finishRun(db, 'run-1', { status: 'completed', messageCount: 2 }, t(2));
		startRun(db, A, 'run-2', t(3));
		finishRun(
			db,
			'run-2',
			{
				status: 'failed',
				messageCount: 3,
				error: { code: 'RECURSION_LIMIT', message: 'too many steps' }
			},
			t(4)
		);

		expect(getConversation(db, A)).toMatchObject({
			status: 'failed',
			messageCount: 3,
			error: { code: 'RECURSION_LIMIT', message: 'too many steps' }
		});
	});

	it('lists conversations most recently updated first', () => {
		createConversation(db, A, 'first', t(0));
		createConversation(db, B, 'second', t(1));
		expect(listConversations(db).map((c) => c.id)).toEqual([B, A]);

		startRun(db, A, 'run-1', t(2));
		expect(listConversations(db).map((c) => c.id)).toEqual([A, B]);
	});

	it('marks runs left running by a previous process as interrupted', () => {
		createConversation(db, A, 'hello', t(0));
		startRun(db, A, 'run-1', t(1));
		db.close();

		db = openDatabase(dbPath);
		expect(recoverInterruptedRuns(db, t(5))).toBe(1);
		expect(getConversation(db, A)?.status).toBe('interrupted');
	});
});
