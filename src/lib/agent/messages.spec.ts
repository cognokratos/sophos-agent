import { describe, it, expect } from 'vitest';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { toMessageDto, toMessageDtos } from './messages';

describe('toMessageDto', () => {
	it('maps human and AI messages to user and assistant', () => {
		expect(toMessageDto(new HumanMessage({ id: 'h1', content: 'hi' }))).toEqual({
			id: 'h1',
			role: 'user',
			content: 'hi'
		});
		expect(toMessageDto(new AIMessage({ id: 'a1', content: 'hello' }))).toEqual({
			id: 'a1',
			role: 'assistant',
			content: 'hello'
		});
	});

	it('keeps tool calls and tool results', () => {
		const call = new AIMessage({
			id: 'a2',
			content: '',
			tool_calls: [{ id: 'c1', name: 'fetch__fetch', args: { url: 'https://example.com' } }]
		});
		const result = new ToolMessage({
			id: 't1',
			content: 'page',
			name: 'fetch__fetch',
			tool_call_id: 'c1',
			status: 'error'
		});

		expect(toMessageDto(call)).toEqual({
			id: 'a2',
			role: 'assistant',
			content: '',
			toolCalls: [{ id: 'c1', name: 'fetch__fetch', args: { url: 'https://example.com' } }]
		});
		expect(toMessageDto(result)).toEqual({
			id: 't1',
			role: 'tool',
			content: 'page',
			name: 'fetch__fetch',
			toolCallId: 'c1',
			status: 'error'
		});
	});

	it('flattens multi-part content to text', () => {
		const message = new AIMessage({
			id: 'a3',
			content: [
				{ type: 'text', text: 'Hello ' },
				{ type: 'text', text: 'world' }
			]
		});
		expect(toMessageDto(message)?.content).toBe('Hello world');
	});

	it('drops message types the UI does not show', () => {
		expect(toMessageDtos([new SystemMessage('rules'), new HumanMessage('hi')])).toHaveLength(1);
	});
});
