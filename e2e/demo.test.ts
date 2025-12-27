import { expect, test } from '@playwright/test';

test('home page has expected h1', async ({ page }) => {
	await page.goto('/');
	const title = page.locator('h1');
	await expect(title).toBeVisible();
	await expect(title).toHaveText('Sophos Agent');
});
