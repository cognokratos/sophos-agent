import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export async function GET() {
	const ollamaHost = env.OLLAMA_HOST || 'http://localhost:11434';
	const ollamaModel = env.OLLAMA_MODEL || 'mistral';

	try {
		const response = await fetch(`${ollamaHost}/api/tags`);
		if (!response.ok) {
			const message = 'Ollama service not available';
			console.error(message);
			return json({ status: 'error', message: message }, { status: 503 });
		}

		const data = await response.json();
		const hasMistral = data.models.some((model: { name: string }) =>
			model.name.includes(ollamaModel)
		);

		if (hasMistral) {
			return json({ status: 'ok' });
		} else {
			const message = `Ollama model "${ollamaModel}" not available`;
			console.error(message);
			return json({ status: 'error', message: message }, { status: 553 });
		}
	} catch (error) {
		console.error(error);
		return json({ status: 'error', message: 'Failed to connect to Ollama' }, { status: 500 });
	}
}
