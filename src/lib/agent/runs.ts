import { randomUUID } from 'node:crypto';
import { GraphRecursionError } from '@langchain/langgraph';
import { formatEvent, type ChatError, type RunStatus, type Subscriber } from '$lib/chat';
import { runAgent, getThreadState, type RunInput } from '$lib/agent';
import { getDatabase } from './persistence/database';
import { finishRun, startRun as recordRunStart } from './persistence/conversations';

/**
 * Starting runs and streaming them to SSE subscribers.
 *
 *   durable    the `runs` row (SQLite) and the thread's checkpoints (LangGraph)
 *   transient  `ActiveRun`: the events of the run in progress, buffered so a
 *              late or reconnecting EventSource can catch up, plus the
 *              currently connected subscribers
 *
 * Losing the transient part (restart) loses only the live token stream; the
 * conversation, its messages and the run outcome are all in SQLite.
 */

export interface ActiveRun {
	runId: string;
	conversationId: string;
	events: { id: number; payload: string }[];
	subscribers: Set<Subscriber>;
}

const activeRuns = new Map<string, ActiveRun>();

export function getActiveRun(conversationId: string): ActiveRun | undefined {
	return activeRuns.get(conversationId);
}

/**
 * Records a new run and executes it in the background.
 * The caller must check `getActiveRun` first: one run per conversation at a time.
 */
export function startRun(conversationId: string, input: RunInput): ActiveRun {
	const run: ActiveRun = {
		runId: randomUUID(),
		conversationId,
		events: [],
		subscribers: new Set()
	};
	recordRunStart(getDatabase(), conversationId, run.runId);
	activeRuns.set(conversationId, run);
	void execute(run, input);
	return run;
}

async function execute(run: ActiveRun, input: RunInput): Promise<void> {
	let status: Exclude<RunStatus, 'running'> = 'completed';
	let error: ChatError | undefined;

	try {
		for await (const event of runAgent(run.conversationId, input)) {
			if (event.type === 'token' || event.type === 'trace') {
				publish(run, event.type, event.data);
			}
		}
	} catch (e: unknown) {
		console.error(`Run ${run.runId} failed (conversation ${run.conversationId})`, e);
		status = 'failed';
		error = toChatError(e, run.conversationId);
	}

	try {
		const { messages } = await getThreadState(run.conversationId);
		finishRun(getDatabase(), run.runId, { status, error, messageCount: messages.length });
	} catch (e: unknown) {
		console.error(`Failed to record the outcome of run ${run.runId}`, e);
	}

	// Persist first, then notify: a client that reloads on `end` sees the final state.
	if (error) {
		publish(run, 'chat-error', error);
	} else {
		publish(run, 'end', { conversation: run.conversationId, status });
	}
	activeRuns.delete(run.conversationId);
}

function publish(run: ActiveRun, code: Parameters<Subscriber>[0], data: unknown): void {
	const id = run.events.length + 1;
	run.events.push({ id, payload: formatEvent(code, data, String(id)) });
	for (const send of run.subscribers) {
		try {
			send(code, data, String(id));
		} catch {
			/* a broken subscriber must not stop the run */
		}
	}
}

/**
 * Replays buffered events after `lastEventId`, then delivers new ones.
 * Returns the unsubscribe function.
 */
export function subscribe(
	run: ActiveRun,
	lastEventId: number,
	replay: (payload: string) => void,
	subscriber: Subscriber
): () => void {
	for (const event of run.events) {
		if (event.id > lastEventId) {
			replay(event.payload);
		}
	}
	run.subscribers.add(subscriber);
	return () => run.subscribers.delete(subscriber);
}

export function toChatError(e: unknown, conversation: string): ChatError {
	if (e instanceof GraphRecursionError) {
		return {
			code: 'RECURSION_LIMIT',
			message: 'The agent reached its step limit (AGENT_RECURSION_LIMIT) without finishing.',
			conversation
		};
	}
	if (e instanceof Error && e.message === 'MODEL_UNAVAILABLE') {
		return {
			code: 'MODEL_UNAVAILABLE',
			message: 'The configured Ollama model is not available.',
			conversation
		};
	}
	return {
		code: 'AGENT_FAILURE',
		message: e instanceof Error ? e.message : 'Agent failed',
		conversation
	};
}
