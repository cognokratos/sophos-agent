import { test, expect } from '@playwright/test';
import { rm } from 'node:fs/promises';

const CHAT_DIR = 'data/test/chat';

test.describe('Conversation Browsing', () => {
	test.beforeEach(async ({ page }) => {
		await rm(CHAT_DIR, { recursive: true, force: true });
		await page.goto('/');
	});

	test.afterAll(async () => {
		await rm(CHAT_DIR, { recursive: true, force: true });
	});

	test('should display conversation list sidebar', async ({ page }) => {
		// Check that the sidebar is visible
		const sidebar = page.locator('[data-testid="conversation-sidebar"]');
		await expect(sidebar).toBeVisible();

		// Check that the "New Chat" button is visible in the sidebar
		const newChatButton = page.locator('[data-testid="new-chat-button"]');
		await expect(newChatButton).toBeVisible();
	});

	test('should create a new conversation and add it to the list', async ({ page }) => {
		// Create a new conversation
		const newChatButton = page.locator('[data-testid="new-chat-button"]');
		await newChatButton.click();

		// Start a new conversation by sending a message
		const input = page.locator('input[data-testid="chat-input"]');
		await input.fill('Hello, this is a test message');
		await input.press('Enter');

		// Wait for the response
		await page.waitForSelector('[data-testid="assistant-message"]', { state: 'visible' });

		// Reload the page to verify the conversation is saved
		await page.reload();

		// Check that the conversation appears in the sidebar
		const conversationItem = page
			.locator('[data-testid="conversation-item"]')
			.filter({ hasText: 'Hello, this is a test message' });
		await expect(conversationItem).toBeVisible();
	});

	test('should allow selecting a conversation from the list', async ({ page }) => {
		// First, create a conversation
		const input = page.locator('input[data-testid="chat-input"]');
		await input.fill('First message');
		await input.press('Enter');

		// Wait for the response
		await page.waitForSelector('[data-testid="assistant-message"]', { state: 'visible' });

		// Create another conversation
		const newChatButton = page.locator('[data-testid="new-chat-button"]');
		await newChatButton.click();

		// Send a message in the new conversation
		await input.fill('Second message');
		await input.press('Enter');

		// Wait for the response
		await page.waitForSelector('[data-testid="assistant-message"]', { state: 'visible' });

		// Go back to the first conversation
		const firstConversation = page
			.locator('[data-testid="conversation-item"]')
			.filter({ hasText: 'First message' });
		await firstConversation.click();

		// Wait for the conversation to load
		await page.waitForTimeout(500);

		// Check that the first conversation's messages are displayed
		await expect(
			page.locator('[data-testid="user-message"]', { hasText: 'First message' })
		).toBeVisible();
	});

	test('should highlight the currently active conversation', async ({ page }) => {
		// Create a conversation
		const input = page.locator('input[data-testid="chat-input"]');
		await input.fill('Test message');
		await input.press('Enter');

		// Wait for the response
		await page.waitForSelector('[data-testid="assistant-message"]', { state: 'visible' });

		// Find the conversation item in the sidebar
		const conversationItem = page
			.locator('[data-testid="conversation-item"]')
			.filter({ hasText: 'Test message' });

		// Check that the conversation item has an active state indicator
		await expect(conversationItem.locator('svg[aria-label="Active conversation"]')).toBeVisible(); // The active indicator is a checkmark SVG
	});
});
