import type { UUID } from 'crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Parses a UUID from a string.
 *
 * @param input The string to parse.
 * @param input
 */
export function parseUuid(input: string | null): UUID {
	const s = input?.trim() ?? '';
	if (!UUID_REGEX.test(s)) {
		throw new TypeError(`Invalid UUID: "${input}"`);
	}
	// Optionally normalize casing:
	return s.toLowerCase() as UUID;
}

/**
 * Safely parses a JSON string.
 * @param str The JSON string to parse.
 * @param fallback The fallback value if parsing fails.
 */
export function safeJsonParse<T>(str: string | null, fallback: T): T {
	if (!str) return fallback;
	try {
		return JSON.parse(str) as T;
	} catch (e) {
		console.error('Failed to parse JSON from localStorage', e);
		return fallback;
	}
}
