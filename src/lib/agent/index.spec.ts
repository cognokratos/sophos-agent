import { describe, it, expect, vi } from 'vitest';
import { callModel } from './index';
import { HumanMessage } from '@langchain/core/messages';
import { ChatOllama } from '@langchain/ollama';

vi.mock('@langchain/ollama');

describe('callModel', () => {
	it('should return a message from the model', async () => {
		const mockInvoke = vi.fn().mockResolvedValue({ content: 'test response' });
		const mockModel = new ChatOllama({});
		mockModel.invoke = mockInvoke;

		const state = { messages: [new HumanMessage('test message')] };
		const response = await callModel(state, mockModel);

		expect(mockInvoke).toHaveBeenCalledWith(state.messages);
		expect(response.messages).toEqual([{ content: 'test response' }]);
	});

	it('should throw MODEL_UNAVAILABLE error if model not found', async () => {
		const mockInvoke = vi.fn().mockRejectedValue(new Error('model not found'));
		const mockModel = new ChatOllama({});
		mockModel.invoke = mockInvoke;

		const state = { messages: [new HumanMessage('test message')] };

		await expect(callModel(state, mockModel)).rejects.toThrow('MODEL_UNAVAILABLE');
	});
});
