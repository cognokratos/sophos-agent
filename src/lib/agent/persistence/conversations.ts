import type { ChatError, ConversationSummary, ErrorCode, RunStatus } from '$lib/chat';
import type { DB } from './database';

/**
 * Application metadata: conversations and their runs.
 *
 * Messages are NOT stored here. They live in the LangGraph thread
 * (checkpoints), whose thread_id is the conversation id.
 */

interface SummaryRow {
	id: string;
	title: string;
	created_at: string;
	updated_at: string;
	message_count: number;
	status: RunStatus | null;
	error_code: ErrorCode | null;
	error_message: string | null;
}

// Each conversation joined with its most recent run (if any).
const SUMMARY_SELECT = `
	SELECT c.id, c.title, c.created_at, c.updated_at, c.message_count,
	       r.status, r.error_code, r.error_message
	FROM conversations c
	LEFT JOIN runs r ON r.id = (
		SELECT id FROM runs WHERE conversation_id = c.id ORDER BY started_at DESC, rowid DESC LIMIT 1
	)`;

const TITLE_LENGTH = 50;

function toSummary(row: SummaryRow): ConversationSummary {
	const summary: ConversationSummary = {
		id: row.id,
		title: row.title,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		messageCount: row.message_count,
		status: row.status
	};
	if (row.error_code) {
		summary.error = { code: row.error_code, message: row.error_message ?? '' };
	}
	return summary;
}

export function titleFromMessage(message: string): string {
	const firstLine = message.trim().split('\n')[0] ?? '';
	return firstLine.length > TITLE_LENGTH ? firstLine.slice(0, TITLE_LENGTH) + '...' : firstLine;
}

export function createConversation(
	db: DB,
	id: string,
	firstMessage: string,
	now = new Date()
): ConversationSummary {
	const ts = now.toISOString();
	db.prepare(
		'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)'
	).run(id, titleFromMessage(firstMessage) || 'New Conversation', ts, ts);
	return getConversation(db, id)!;
}

export function getConversation(db: DB, id: string): ConversationSummary | undefined {
	const row = db.prepare(`${SUMMARY_SELECT} WHERE c.id = ?`).get(id) as SummaryRow | undefined;
	return row && toSummary(row);
}

/** Most recently updated first. */
export function listConversations(db: DB): ConversationSummary[] {
	const rows = db.prepare(`${SUMMARY_SELECT} ORDER BY c.updated_at DESC`).all() as SummaryRow[];
	return rows.map(toSummary);
}

/** Records a new run as `running` and bumps the conversation's `updated_at`. */
export function startRun(db: DB, conversationId: string, runId: string, now = new Date()): void {
	const ts = now.toISOString();
	db.transaction(() => {
		db.prepare(
			"INSERT INTO runs (id, conversation_id, status, started_at) VALUES (?, ?, 'running', ?)"
		).run(runId, conversationId, ts);
		db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(ts, conversationId);
	})();
}

/**
 * Records the outcome of a run and the thread's message count afterwards.
 */
export function finishRun(
	db: DB,
	runId: string,
	outcome: { status: Exclude<RunStatus, 'running'>; messageCount: number; error?: ChatError },
	now = new Date()
): void {
	const ts = now.toISOString();
	db.transaction(() => {
		db.prepare(
			'UPDATE runs SET status = ?, error_code = ?, error_message = ?, finished_at = ? WHERE id = ?'
		).run(outcome.status, outcome.error?.code ?? null, outcome.error?.message ?? null, ts, runId);
		db.prepare(
			`UPDATE conversations SET updated_at = ?, message_count = ?
			 WHERE id = (SELECT conversation_id FROM runs WHERE id = ?)`
		).run(ts, outcome.messageCount, runId);
	})();
}

/**
 * A run still marked `running` when the process starts was cut short by a
 * crash or restart. Its last checkpoint is intact, so it can be resumed.
 */
export function recoverInterruptedRuns(db: DB, now = new Date()): number {
	return db
		.prepare("UPDATE runs SET status = 'interrupted', finished_at = ? WHERE status = 'running'")
		.run(now.toISOString()).changes;
}
