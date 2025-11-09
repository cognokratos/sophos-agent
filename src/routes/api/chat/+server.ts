import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import type { ChatRequest } from '$lib/chat';
import { runAgent } from '$lib/agent';
import type { ApiError } from '$lib/error';

const handleChat = (message: string | null) => {
	if (!message) {
		return json({ code: 'BAD_REQUEST', message: 'Message is required' } as ApiError, { status: 400 });
	}

	const stream = new ReadableStream({
		async start(controller) {
			try {
				for await (const chunk of runAgent(message)) {
					controller.enqueue(`data: ${JSON.stringify(chunk)}\n\n`);
				}
				controller.enqueue('event: end\n\n');
			} catch (error: unknown) {
				console.error(error);
				let apiError: ApiError;
				if (error instanceof Error && error.message === 'MODEL_UNAVAILABLE') {
					apiError = { code: 'MODEL_UNAVAILABLE', message: 'Model not available' };
				} else {
					apiError = { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' };
				}
				controller.enqueue(`data: ${JSON.stringify(apiError)}\n\n`);
				controller.enqueue('event: error\n\n');
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};

export const GET: RequestHandler = async ({ url }) => {
	const message = url.searchParams.get('message');
	return handleChat(message);
};

export const POST: RequestHandler = async ({ request }) => {
	const body: ChatRequest = await request.json();
	const message = body.message;
	return handleChat(message);
};
