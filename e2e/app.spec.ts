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

async function dragMove(page: Page, from: string, to: string) {
  // Measure only once the layout is settled (web fonts loaded, board fully in view).
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('grid', { name: 'Schachbrett' }).scrollIntoViewIfNeeded();
  const a = (await page.locator(`[data-square="${from}"]`).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  const b = (await page.locator(`[data-square="${to}"]`).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

test('local game: pieces can be dragged, illegal drops are ignored', async ({ page }) => {
  await page.goto('/spielen');
  await dragMove(page, 'e2', 'e4');
  await expect(page.getByTestId('moves')).toContainText('e4');
  await dragMove(page, 'd7', 'd4'); // illegal
  await expect(page.getByTestId('status')).toHaveText('Schwarz am Zug');
  await dragMove(page, 'd7', 'd5');
  await expect(page.getByTestId('moves')).toContainText('d5');
  await move(page, 'e4', 'd5'); // tapping still works after a drag
  await expect(page.getByTestId('moves')).toContainText('exd5');
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

test('online game pages send signed-out visitors to the login', async ({ page }) => {
  for (const path of ['/partien', '/partie/00000000-0000-0000-0000-000000000000']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
  }
});

test('legal pages are linked from every page and fonts come from our own domain', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) external.push(r.url()); });
  await page.goto('/spielen');
  await page.getByRole('link', { name: 'Impressum' }).click();
  await expect(page.getByRole('heading', { name: 'Impressum' })).toBeVisible();
  await expect(page.getByText('Entwurf – der endgültige Text folgt.')).toBeVisible();
  for (const [link, heading] of [['Datenschutz', 'Datenschutzerklärung'], ['AGB', 'Allgemeine Geschäftsbedingungen'], ['Widerruf', 'Widerrufsbelehrung']]) {
    await page.getByRole('link', { name: link, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }
  expect(await page.evaluate(() => document.fonts.check('600 16px "Bricolage Grotesque"'))).toBe(true);
  expect(external).toEqual([]);
});
