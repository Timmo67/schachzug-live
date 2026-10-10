import { expect, test, type Page } from '@playwright/test';

async function move(page: Page, from: string, to: string) {
  await page.locator(`[data-square="${from}"]`).click();
  await page.locator(`[data-square="${to}"]`).click();
}

test('local game: scholar\'s mate ends the game', async ({ page }) => {
  await page.goto('/spielen');
  for (const [a, b] of [['e2', 'e4'], ['e7', 'e5'], ['f1', 'c4'], ['b8', 'c6'], ['d1', 'h5'], ['g8', 'f6'], ['h5', 'f7']]) {
    await move(page, a, b);
  }
  await expect(page.getByTestId('status')).toHaveText('Schachmatt – Weiß gewinnt');
  await expect(page.getByTestId('moves')).toContainText('Qxf7#');
  await expect(page.getByRole('button', { name: 'Aufgeben' })).toBeDisabled();
});

test('local game: promotion picker offers a knight', async ({ page }) => {
  await page.goto('/spielen');
  for (const [a, b] of [['h2', 'h4'], ['g7', 'g5'], ['h4', 'g5'], ['f8', 'g7'], ['g5', 'g6'], ['g8', 'f6'], ['g6', 'h7'], ['h8', 'g8'], ['h7', 'g8']]) {
    await move(page, a, b);
  }
  await page.getByRole('button', { name: 'Springer' }).click();
  await expect(page.getByTestId('moves')).toContainText('hxg8=N');
});

test('invite link asks a signed-out visitor to sign in', async ({ page }) => {
  await page.goto('/i/ABCD1234');
  await expect(page.getByRole('heading', { name: 'Du wurdest eingeladen' })).toBeVisible();
  await page.getByRole('link', { name: 'Jetzt anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('sz-pending-invite'))).toBe('ABCD1234');
});

test('no horizontal scrolling on the game screen', async ({ page }) => {
  await page.goto('/spielen');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
