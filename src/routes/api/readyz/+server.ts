import { json } from '@sveltejs/kit';
import { getModelConfig } from '$lib/agent/config';

/**
 * Readiness: Ollama is reachable and the configured model has been pulled.
 * MCP servers are not checked here; they are connected on the first chat request.
 */
export async function GET() {
	const { baseUrl, model } = getModelConfig();

	try {
		const response = await fetch(`${baseUrl}/api/tags`);
		if (!response.ok) {
			const message = 'Ollama service not available';
			console.error(message);
			return json({ status: 'error', message }, { status: 503 });
		}

		const data: { models?: { name: string }[] } = await response.json();
		const hasModel = data.models?.some((m) => m.name.includes(model)) ?? false;

		if (hasModel) {
			return json({ status: 'ok' });
		}
		const message = `Ollama model "${model}" not available`;
		console.error(message);
		return json({ status: 'error', message }, { status: 503 });
	} catch (error) {
		console.error(error);
		return json({ status: 'error', message: 'Failed to connect to Ollama' }, { status: 503 });
	}
}
