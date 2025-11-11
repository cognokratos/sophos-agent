/**
 * A simple debounce function.
 * @param func The function to debounce.
 * @param delay The debounce delay in milliseconds.
 */
export function debounce<T extends (...args: any[]) => void>(func: T, delay: number): (...args: Parameters<T>) => void {
	let timeoutId: number | undefined;
	return (...args: Parameters<T>) => {
		clearTimeout(timeoutId);
		timeoutId = window.setTimeout(() => func(...args), delay);
	};
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

/**
 * Trims the messages array to a maximum size.
 * @param messages The array of messages.
 * @param max The maximum number of messages to keep.
 */
export function trimMessages<T>(messages: T[], max = 50): T[] {
	if (messages.length > max) {
		return messages.slice(messages.length - max);
	}
	return messages;
}
